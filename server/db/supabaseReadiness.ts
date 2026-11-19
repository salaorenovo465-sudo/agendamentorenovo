import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import '../loadEnv';
import { withTransientRetry } from './retryHelper';
import { DEFAULT_TENANT_SLUG, normalizeTenantSlug } from './workbench/workbenchHelpers';

export const SUPABASE_SCHEMA_TABLES = [
  'bookings',
  'whatsapp_threads',
  'whatsapp_messages',
  'availability_rules',
  'clients',
  'leads',
  'services_catalog',
  'professionals',
  'financial_entries',
  'reviews',
  'tasks',
  'automations',
  'app_settings',
  'whatsapp_conversation_meta',
  'whatsapp_internal_notes',
  'whatsapp_sync_state',
  'whatsapp_contact_map',
  'whatsapp_conversation_map',
] as const;

export const SUPABASE_CRITICAL_COLUMNS: Record<string, readonly string[]> = {
  bookings: ['id', 'tenant_slug', 'status', 'payment_status', 'completed_at', 'service_items', 'date', 'time'],
  financial_entries: ['id', 'tenant_slug', 'booking_id', 'amount', 'status', 'due_date', 'paid_at'],
  clients: ['id', 'tenant_slug', 'phone', 'status'],
  leads: ['id', 'tenant_slug', 'stage', 'phone'],
  tasks: ['id', 'tenant_slug', 'status', 'due_date'],
  availability_rules: ['id', 'tenant_slug', 'weekday', 'active'],
  services_catalog: ['id', 'tenant_slug', 'price', 'active'],
  professionals: ['id', 'tenant_slug', 'active'],
  reviews: ['id', 'tenant_slug', 'score'],
  automations: ['id', 'tenant_slug', 'active'],
};

export type SupabaseMissingColumn = {
  table: string;
  column: string;
  reason: string;
};

export type SupabaseReadinessReport = {
  checkedAt: string;
  configured: boolean;
  connected: boolean;
  latencyMs: number;
  projectRef: string | null;
  hasDirectDbUrl: boolean;
  expectedTenantSlug: string;
  tenantRegistered: boolean;
  readyForProduction: boolean;
  tablesChecked: number;
  tablesReady: number;
  tableCounts: Record<string, number | null>;
  missingTables: string[];
  missingColumns: SupabaseMissingColumn[];
  pendingMigrations: string[];
  notes: string[];
};

const resolveSupabaseConfig = () => {
  const projectRef = (process.env.SUPABASE_PROJECT_REF || '').trim() || null;
  const supabaseUrl =
    (process.env.SUPABASE_URL || '').trim() || (projectRef ? `https://${projectRef}.supabase.co` : '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const hasDirectDbUrl = Boolean((process.env.SUPABASE_DB_URL || '').trim());

  let inferredProjectRef = projectRef;
  if (!inferredProjectRef && supabaseUrl) {
    const match = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
    if (match?.[1]) {
      inferredProjectRef = match[1];
    }
  }

  return {
    projectRef: inferredProjectRef,
    supabaseUrl,
    serviceRoleKey,
    hasDirectDbUrl,
    configured: Boolean(supabaseUrl && serviceRoleKey),
  };
};

const isMissingRelationError = (message: string, code?: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    normalized.includes('does not exist') ||
    normalized.includes('could not find the table') ||
    normalized.includes('schema cache')
  );
};

export const checkSupabaseReadiness = async (
  existingClient?: SupabaseClient | null,
  tenantSlug?: string | null,
): Promise<SupabaseReadinessReport> => {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const config = resolveSupabaseConfig();
  const expectedTenantSlug = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;
  const tableCounts: Record<string, number | null> = {};
  const missingTables: string[] = [];
  const missingColumns: SupabaseMissingColumn[] = [];
  const notes: string[] = [];

  if (!existingClient && !config.configured) {
    return {
      checkedAt,
      configured: false,
      connected: false,
      latencyMs: Date.now() - startedAt,
      projectRef: config.projectRef,
      hasDirectDbUrl: config.hasDirectDbUrl,
      expectedTenantSlug,
      tenantRegistered: false,
      readyForProduction: false,
      tablesChecked: SUPABASE_SCHEMA_TABLES.length,
      tablesReady: 0,
      tableCounts,
      missingTables: [...SUPABASE_SCHEMA_TABLES],
      missingColumns,
      pendingMigrations: ['supabase/schema.sql', '20261117201500_complete_supabase_sync_and_dashboard_indexes.sql'],
      notes: ['Configure SUPABASE_URL (ou SUPABASE_PROJECT_REF) e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.'],
    };
  }

  const supabase =
    existingClient ||
    createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false },
    });

  let reachableCount = 0;

  const tableChecks = await Promise.all(
    SUPABASE_SCHEMA_TABLES.map(async (table) => {
      try {
        const result = await withTransientRetry(async () =>
          supabase.from(table).select('*', { count: 'exact', head: true }),
        );
        return { table, result };
      } catch (err) {
        return {
          table,
          result: {
            count: null,
            error: { message: err instanceof Error ? err.message : String(err), code: 'NETWORK' },
          },
        };
      }
    }),
  );

  for (const { table, result } of tableChecks) {
    if (result.error) {
      tableCounts[table] = null;
      if (isMissingRelationError(result.error.message || '', result.error.code)) {
        missingTables.push(table);
      } else {
        notes.push(`Falha ao consultar tabela ${table}: ${result.error.message}`);
      }
      continue;
    }

    reachableCount += 1;
    tableCounts[table] = typeof result.count === 'number' ? result.count : 0;
  }

  const connected = reachableCount > 0;
  const missingSet = new Set(missingTables);

  const columnEntries = Object.entries(SUPABASE_CRITICAL_COLUMNS).filter(([table]) => !missingSet.has(table));
  await Promise.all(
    columnEntries.map(async ([table, columns]) => {
      const bulk = await withTransientRetry(async () =>
        supabase.from(table).select(columns.join(',')).limit(1),
      ).catch(() => ({ error: { message: 'network error' } }));

      if (!bulk.error) {
        return;
      }

      for (const column of columns) {
        const colResult = await withTransientRetry(async () =>
          supabase.from(table).select(column).limit(1),
        ).catch((err) => ({
          error: { message: err instanceof Error ? err.message : String(err), code: 'NETWORK' },
        }));

        if (colResult.error) {
          missingColumns.push({
            table,
            column,
            reason: colResult.error.message || colResult.error.code || 'coluna indisponivel',
          });
        }
      }
    }),
  );

  let tenantRegistered = false;
  if (!missingSet.has('app_settings') && connected) {
    const registryRes = await withTransientRetry(async () =>
      supabase.from('app_settings').select('value_json').eq('key', 'tenants_registry').maybeSingle(),
    ).catch(() => null);

    if (registryRes && !registryRes.error && registryRes.data?.value_json && typeof registryRes.data.value_json === 'object') {
      const registry = registryRes.data.value_json as { tenants?: Array<{ slug?: string }> };
      const tenants = Array.isArray(registry.tenants) ? registry.tenants : [];
      tenantRegistered = tenants.some((item) => String(item.slug || '').trim().toLowerCase() === expectedTenantSlug);
    }
  }

  const pendingMigrations: string[] = [];
  if (missingTables.length > 0 || missingColumns.length > 0) {
    pendingMigrations.push('20261117201500_complete_supabase_sync_and_dashboard_indexes.sql');
    notes.push(
      'Aplique supabase/migrations/20261117201500_complete_supabase_sync_and_dashboard_indexes.sql no SQL Editor do Supabase (ou via supabase db push).',
    );
  }

  if (!config.hasDirectDbUrl) {
    notes.push('SUPABASE_DB_URL nao definido: integracao funciona via HTTPS/REST, mas comandos diretos psql/CLI usam a DB URL.');
  }

  if (connected && !tenantRegistered) {
    notes.push(`Tenant "${expectedTenantSlug}" ainda sera inicializado em app_settings.tenants_registry na primeira gravacao administrativa.`);
  }

  const readyForProduction =
    config.configured &&
    connected &&
    missingTables.length === 0 &&
    missingColumns.length === 0;

  return {
    checkedAt,
    configured: config.configured,
    connected,
    latencyMs: Date.now() - startedAt,
    projectRef: config.projectRef,
    hasDirectDbUrl: config.hasDirectDbUrl,
    expectedTenantSlug,
    tenantRegistered,
    readyForProduction,
    tablesChecked: SUPABASE_SCHEMA_TABLES.length,
    tablesReady: SUPABASE_SCHEMA_TABLES.length - missingTables.length,
    tableCounts,
    missingTables,
    missingColumns,
    pendingMigrations,
    notes,
  };
};
