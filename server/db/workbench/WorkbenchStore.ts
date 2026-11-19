import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import '../../loadEnv';
import { bookingStore } from '../bookingStore';
import { normalizeWhatsappPhoneWithPlus } from '../../utils/phone';

import type {
  WorkbenchEntity,
  OverviewData,
  TenantRecord,
  ClientStatus,
  ClientTone,
  ClientInsight,
  ClientBoardItem,
  ClientsWorkspaceQuery,
  ClientsWorkspaceColumnSlice,
  ClientsWorkspaceResponse,
  DashboardFinanceEntryRow,
  DashboardFinanceGroupBy,
  DashboardFinanceResponse,
  DashboardFinanceStatusFilter,
} from './workbenchTypes';
import { ENTITY_CONFIG } from './workbenchTypes';
import { aggregateFinanceSeriesWithScale, computeFinanceSummary, filterFinanceEntriesForTable } from './dashboardHelpers';
import { checkSupabaseReadiness, type SupabaseReadinessReport } from '../supabaseReadiness';
import { withTransientRetry } from '../retryHelper';
import {
  TENANT_REGISTRY_KEY,
  LEGACY_SETTINGS_KEY,
  DEFAULT_TENANT_SLUG,
  DEFAULT_TENANT_NAME,
  TENANT_SETTINGS_PREFIX,
  normalizeTenantSlug,
  normalizeTenantName,
  toIsoNow,
  mapTenantRegistry,
  toTenantRegistryValue,
  settingsKeyForTenant,
} from './workbenchHelpers';

const CLIENT_STATUSES: ClientStatus[] = ['novo', 'ativo', 'recorrente', 'VIP', 'em risco', 'inativo'];
const CLIENT_STATUS_SET = new Set<ClientStatus>(CLIENT_STATUSES);
const DAY_MS = 1000 * 60 * 60 * 24;

const parseMoneyValue = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || !value.trim()) return 0;
  const normalized = value.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrencyBR = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateShortBR = (value: string): string => {
  const [y, m, d] = String(value || '').split('-');
  if (!y || !m || !d) return value || '--';
  return `${d}/${m}/${y}`;
};

const normalizeStatusValue = (value: unknown): ClientStatus => {
  const raw = String(value || '').trim() as ClientStatus;
  return CLIENT_STATUS_SET.has(raw) ? raw : 'novo';
};

const normalizeDigits = (value: unknown): string => String(value || '').replace(/\D/g, '');

const nowLocalIsoMinute = (): string => {
  const current = new Date();
  const y = current.getFullYear();
  const m = String(current.getMonth() + 1).padStart(2, '0');
  const d = String(current.getDate()).padStart(2, '0');
  const h = String(current.getHours()).padStart(2, '0');
  const min = String(current.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
};

const parseDateMs = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const computeDaysSince = (value: string | null): number | null => {
  const ms = parseDateMs(value);
  if (!ms) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));
};

type LightweightBookingRow = {
  phone: string;
  date: string;
  status: string;
  service: string;
  servicePrice: string | null;
  serviceItems: unknown;
};

type LightweightAgentRule = {
  id: string;
  clientId: number;
  enabled: boolean;
  sendAt: string;
};

class WorkbenchStore {
  private supabase: SupabaseClient | null;
  private workspaceCache: {
    tenantKey: string;
    expiresAt: number;
    boardItems: ClientBoardItem[];
  } | null = null;


  constructor() {
    const supabaseProjectRef = process.env.SUPABASE_PROJECT_REF;
    const supabaseUrl = process.env.SUPABASE_URL || (supabaseProjectRef ? `https://${supabaseProjectRef}.supabase.co` : undefined);
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      this.supabase = null;
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }

  isEnabled(): boolean {
    return Boolean(this.supabase);
  }

  private getSupabase(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('Modulo workbench indisponivel: configure SUPABASE_URL/SUPABASE_PROJECT_REF e SUPABASE_SERVICE_ROLE_KEY.');
    }

    return this.supabase;
  }

  invalidateClientsWorkspaceCache(): void {
    this.workspaceCache = null;
  }

  async checkSupabaseHealth(tenantSlug?: string | null): Promise<SupabaseReadinessReport> {
    return checkSupabaseReadiness(this.supabase, tenantSlug);
  }

  private async withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    return withTransientRetry(fn, maxAttempts);
  }

  private async deleteAllFromTable(table: string): Promise<number> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase.from(table).delete().gte('id', 0).select('id');
    if (error) {
      throw error;
    }
    return (data || []).length;
  }

  private sanitizePayload(entity: WorkbenchEntity, payload: Record<string, unknown>, includeDefaults: boolean): Record<string, unknown> {
    const config = ENTITY_CONFIG[entity];
    const sanitized: Record<string, unknown> = {};

    for (const key of config.fields) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        sanitized[key] = payload[key];
      }
    }

    if (includeDefaults && config.defaults) {
      for (const [key, value] of Object.entries(config.defaults)) {
        if (sanitized[key] === undefined) {
          sanitized[key] = value;
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'price')) {
      sanitized.price = Number(sanitized.price || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'amount')) {
      sanitized.amount = Number(sanitized.amount || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'base_commission')) {
      sanitized.base_commission = Number(sanitized.base_commission || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'score')) {
      sanitized.score = Math.max(1, Math.min(5, Number(sanitized.score || 1)));
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'duration_min')) {
      sanitized.duration_min = Number(sanitized.duration_min || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'limit_per_day')) {
      sanitized.limit_per_day = Number(sanitized.limit_per_day || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'active')) {
      sanitized.active = Boolean(sanitized.active);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'phone')) {
      const normalizedPhone = normalizeWhatsappPhoneWithPlus(String(sanitized.phone || ''));
      sanitized.phone = normalizedPhone || String(sanitized.phone || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'commission_profile') && !Array.isArray(sanitized.commission_profile)) {
      sanitized.commission_profile = [];
    }

    return sanitized;
  }

  async list(entity: WorkbenchEntity, tenantSlug?: string | null): Promise<Record<string, unknown>[]> {
    const supabase = this.getSupabase();
    const config = ENTITY_CONFIG[entity];
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;

    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from(config.table)
        .select('*')
        .eq('tenant_slug', effectiveTenant)
        .order(config.orderBy, { ascending: config.orderAscending ?? false });

      if (error) {
        throw error;
      }

      return (data || []) as Record<string, unknown>[];
    });
  }

  async create(entity: WorkbenchEntity, payload: Record<string, unknown>, tenantSlug?: string | null): Promise<Record<string, unknown>> {
    const supabase = this.getSupabase();
    const config = ENTITY_CONFIG[entity];
    const sanitized = this.sanitizePayload(entity, payload, true);
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;
    sanitized.tenant_slug = effectiveTenant;

    return this.withRetry(async () => {
      const { data, error } = await supabase.from(config.table).insert(sanitized).select('*').single();
      if (error) {
        throw error;
      }

      if (entity === 'clients') {
        this.invalidateClientsWorkspaceCache();
      }
      return data as Record<string, unknown>;
    });
  }

  async update(
    entity: WorkbenchEntity,
    id: number,
    payload: Record<string, unknown>,
    tenantSlug?: string | null,
  ): Promise<Record<string, unknown> | null> {
    const supabase = this.getSupabase();
    const config = ENTITY_CONFIG[entity];
    const sanitized = this.sanitizePayload(entity, payload, false);
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;

    if (Object.keys(sanitized).length === 0) {
      return null;
    }

    sanitized.updated_at = new Date().toISOString();

    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from(config.table)
        .update(sanitized)
        .eq('id', id)
        .eq('tenant_slug', effectiveTenant)
        .select('*')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (entity === 'clients') {
        this.invalidateClientsWorkspaceCache();
      }
      return (data as Record<string, unknown> | null) || null;
    });
  }

  async remove(entity: WorkbenchEntity, id: number, tenantSlug?: string | null): Promise<void> {
    const supabase = this.getSupabase();
    const config = ENTITY_CONFIG[entity];
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;

    await this.withRetry(async () => {
      const { error } = await supabase.from(config.table).delete().eq('id', id).eq('tenant_slug', effectiveTenant);

      if (error) {
        throw error;
      }
    });

    if (entity === 'clients') {
      this.invalidateClientsWorkspaceCache();
    }
  }

  async convertLeadToClient(
    leadId: number,
    tenantSlug?: string | null,
  ): Promise<{ lead: Record<string, unknown>; client: Record<string, unknown> }> {
    const supabase = this.getSupabase();
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;

    return this.withRetry(async () => {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('tenant_slug', effectiveTenant)
        .maybeSingle();

      if (leadError) {
        throw leadError;
      }

      if (!lead) {
        throw new Error('Lead não encontrado.');
      }

      const clientPayload = {
        tenant_slug: String(lead.tenant_slug || effectiveTenant),
        name: lead.name,
        phone: lead.phone,
        notes: lead.notes,
        status: 'ativo',
        tags: 'convertido-do-lead',
      };

      const { data: client, error: clientError } = await supabase.from('clients').insert(clientPayload).select('*').single();
      if (clientError) {
        throw clientError;
      }

      const { data: updatedLead, error: updateLeadError } = await supabase
        .from('leads')
        .update({ stage: 'convertido', updated_at: new Date().toISOString() })
        .eq('id', leadId)
        .eq('tenant_slug', effectiveTenant)
        .select('*')
        .single();

      if (updateLeadError) {
        throw updateLeadError;
      }

      this.invalidateClientsWorkspaceCache();
      return {
        lead: updatedLead as Record<string, unknown>,
        client: client as Record<string, unknown>,
      };
    });
  }

  async markFinancePaid(
    financeId: number,
    paymentMethod?: string,
    tenantSlug?: string | null,
  ): Promise<Record<string, unknown> | null> {
    const supabase = this.getSupabase();
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;
    const updates: Record<string, unknown> = {
      status: 'pago',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (paymentMethod) {
      updates.payment_method = paymentMethod;
    }

    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('financial_entries')
        .update(updates)
        .eq('id', financeId)
        .eq('tenant_slug', effectiveTenant)
        .select('*')
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data as Record<string, unknown> | null) || null;
    });
  }

  async findClientByPhone(phone: string, tenantSlug?: string | null): Promise<Record<string, unknown> | null> {
    const supabase = this.getSupabase();
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;

    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('tenant_slug', effectiveTenant)
        .like('phone', `%${digits.slice(-9)}%`)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data as Record<string, unknown> | null) || null;
    });
  }

  async confirmBookingPayment(
    bookingId: number,
    paymentMethod: string,
    tenantSlug?: string | null,
  ): Promise<Record<string, unknown>> {
    const supabase = this.getSupabase();
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;

    return this.withRetry(async () => {
      const { data: existing, error: findError } = await supabase
        .from('financial_entries')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('tenant_slug', effectiveTenant)
        .maybeSingle();

      if (findError) throw findError;

      const now = new Date().toISOString();

      if (existing) {
        const { data, error } = await supabase
          .from('financial_entries')
          .update({
            status: 'pago',
            payment_method: paymentMethod,
            paid_at: now,
            updated_at: now,
          })
          .eq('id', (existing as Record<string, unknown>).id)
          .eq('tenant_slug', effectiveTenant)
          .select('*')
          .single();

        if (error) throw error;
        return data as Record<string, unknown>;
      }

      throw new Error('Entrada financeira não encontrada para este agendamento. Confirme o agendamento primeiro.');
    });
  }

  private async fetchAppSettingByKey(key: string): Promise<Record<string, unknown> | null> {
    const supabase = this.getSupabase();
    return this.withRetry(async () => {
      const { data, error } = await supabase.from('app_settings').select('*').eq('key', key).maybeSingle();

      if (error) {
        throw error;
      }

      return (data as Record<string, unknown> | null) || null;
    });
  }

  private async upsertAppSettingByKey(key: string, value: Record<string, unknown>): Promise<Record<string, unknown>> {
    const supabase = this.getSupabase();
    const payload = {
      key,
      value_json: value,
      updated_at: new Date().toISOString(),
    };

    return this.withRetry(async () => {
      const { data, error } = await supabase.from('app_settings').upsert(payload, { onConflict: 'key' }).select('*').single();

      if (error) {
        throw error;
      }

      this.invalidateClientsWorkspaceCache();
      return (data as Record<string, unknown>) || {};
    });
  }

  private async ensureTenantBootstrap(): Promise<TenantRecord[]> {
    const registryRow = await this.fetchAppSettingByKey(TENANT_REGISTRY_KEY);
    const parsedRegistry = mapTenantRegistry(registryRow?.value_json);
    if (parsedRegistry.length > 0) {
      return parsedRegistry;
    }

    const legacySettingsRow = await this.fetchAppSettingByKey(LEGACY_SETTINGS_KEY);
    const legacySettings = (legacySettingsRow?.value_json as Record<string, unknown>) || {};
    const defaultSlug = normalizeTenantSlug(DEFAULT_TENANT_SLUG) || 'renovo';
    const defaultName = normalizeTenantName(
      (legacySettings.companyName as string | undefined) ||
        (legacySettings.salonName as string | undefined) ||
        DEFAULT_TENANT_NAME,
    );
    const now = toIsoNow();

    const defaultTenant: TenantRecord = {
      slug: defaultSlug,
      name: defaultName,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.upsertAppSettingByKey(TENANT_REGISTRY_KEY, toTenantRegistryValue([defaultTenant]) as Record<string, unknown>);

    const tenantSettingsKey = settingsKeyForTenant(defaultSlug);
    const tenantSettingsRow = await this.fetchAppSettingByKey(tenantSettingsKey);
    if (!tenantSettingsRow && Object.keys(legacySettings).length > 0) {
      await this.upsertAppSettingByKey(tenantSettingsKey, legacySettings);
    }

    return [defaultTenant];
  }

  async listTenants(): Promise<TenantRecord[]> {
    const tenants = await this.ensureTenantBootstrap();
    return [...tenants].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async createTenant(input: { slug: string; name: string; active?: boolean }): Promise<TenantRecord> {
    const slug = normalizeTenantSlug(input.slug);
    if (!slug) {
      throw new Error('Slug do tenant invalido. Use letras minusculas, numeros e hifen.');
    }

    const tenants = await this.ensureTenantBootstrap();
    if (tenants.some((tenant) => tenant.slug === slug)) {
      throw new Error('Ja existe uma empresa com este slug.');
    }

    const now = toIsoNow();
    const created: TenantRecord = {
      slug,
      name: normalizeTenantName(input.name),
      active: input.active !== false,
      createdAt: now,
      updatedAt: now,
    };

    const nextTenants = [...tenants, created];
    await this.upsertAppSettingByKey(TENANT_REGISTRY_KEY, toTenantRegistryValue(nextTenants) as Record<string, unknown>);
    await this.upsertAppSettingByKey(settingsKeyForTenant(slug), {});
    return created;
  }

  async updateTenant(slug: string, patch: { name?: string; active?: boolean }): Promise<TenantRecord | null> {
    const normalizedSlug = normalizeTenantSlug(slug);
    if (!normalizedSlug) {
      return null;
    }

    const tenants = await this.ensureTenantBootstrap();
    const index = tenants.findIndex((tenant) => tenant.slug === normalizedSlug);
    if (index === -1) {
      return null;
    }

    const current = tenants[index];
    const updated: TenantRecord = {
      ...current,
      name: patch.name ? normalizeTenantName(patch.name) : current.name,
      active: typeof patch.active === 'boolean' ? patch.active : current.active,
      updatedAt: toIsoNow(),
    };

    const nextTenants = [...tenants];
    nextTenants[index] = updated;
    await this.upsertAppSettingByKey(TENANT_REGISTRY_KEY, toTenantRegistryValue(nextTenants) as Record<string, unknown>);
    return updated;
  }

  async getSettings(tenantSlug?: string): Promise<Record<string, unknown>> {
    await this.ensureTenantBootstrap();

    const key = settingsKeyForTenant(tenantSlug || null);
    const row = await this.fetchAppSettingByKey(key);

    if (row?.value_json) {
      return row.value_json as Record<string, unknown>;
    }

    if (key !== LEGACY_SETTINGS_KEY) {
      const legacyRow = await this.fetchAppSettingByKey(LEGACY_SETTINGS_KEY);
      if (legacyRow?.value_json) {
        return legacyRow.value_json as Record<string, unknown>;
      }
    }

    return {};
  }

  async saveSettings(value: Record<string, unknown>, tenantSlug?: string): Promise<Record<string, unknown>> {
    await this.ensureTenantBootstrap();

    const key = settingsKeyForTenant(tenantSlug || null);
    const data = await this.upsertAppSettingByKey(key, value);
    return (data?.value_json as Record<string, unknown>) || {};
  }

  private buildScopedSettingKey(scope: string, tenantSlug?: string): string {
    const normalizedScope = String(scope || '').trim().toLowerCase();
    if (!normalizedScope) {
      throw new Error('Escopo de app_settings invalido.');
    }

    const normalizedTenant = normalizeTenantSlug(tenantSlug || null);
    return normalizedTenant
      ? `${TENANT_SETTINGS_PREFIX}${normalizedTenant}:${normalizedScope}`
      : `${LEGACY_SETTINGS_KEY}:${normalizedScope}`;
  }

  async getScopedSetting(scope: string, tenantSlug?: string): Promise<Record<string, unknown>> {
    await this.ensureTenantBootstrap();

    const row = await this.fetchAppSettingByKey(this.buildScopedSettingKey(scope, tenantSlug));
    return (row?.value_json as Record<string, unknown>) || {};
  }

  async saveScopedSetting(scope: string, value: Record<string, unknown>, tenantSlug?: string): Promise<Record<string, unknown>> {
    await this.ensureTenantBootstrap();

    const data = await this.upsertAppSettingByKey(this.buildScopedSettingKey(scope, tenantSlug), value);
    return (data?.value_json as Record<string, unknown>) || {};
  }

  async resetFinance(date?: string, tenantSlug?: string): Promise<number> {
    const supabase = this.getSupabase();
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;
    let query = supabase
      .from('financial_entries')
      .delete()
      .eq('tenant_slug', effectiveTenant);

    if (date) {
      query = query.eq('due_date', date);
    } else {
      query = query.gte('id', 0);
    }
    const { data, error } = await query.select('id');
    if (error) throw error;
    return (data || []).length;
  }

  async resetBookingLinkedFinance(tenantSlug?: string): Promise<number> {
    const supabase = this.getSupabase();
    const effectiveTenant = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;
    const { data, error } = await supabase
      .from('financial_entries')
      .delete()
      .eq('tenant_slug', effectiveTenant)
      .not('booking_id', 'is', null)
      .select('id');

    if (error) {
      throw error;
    }

    return (data || []).length;
  }

  async resetAnalyticsHistory(): Promise<{
    finance: number;
    leads: number;
    reviews: number;
    tasks: number;
  }> {
    const [finance, leads, reviews, tasks] = await Promise.all([
      this.deleteAllFromTable('financial_entries'),
      this.deleteAllFromTable('leads'),
      this.deleteAllFromTable('reviews'),
      this.deleteAllFromTable('tasks'),
    ]);

    return {
      finance,
      leads,
      reviews,
      tasks,
    };
  }

  async getOverview(filters?: { startDate?: string; endDate?: string; tenantSlug?: string }): Promise<OverviewData> {
    const supabase = this.getSupabase();
    const effectiveTenant = normalizeTenantSlug(filters?.tenantSlug || null) || DEFAULT_TENANT_SLUG;
    const startDate = filters?.startDate?.trim() || null;
    const endDate = filters?.endDate?.trim() || null;

    return this.withRetry(async () => {
      const statsPromise = bookingStore.getBookingStats({
        startDate,
        endDate,
        tenantSlug: effectiveTenant,
      });

      const leadsPromise = supabase
        .from('leads')
        .select('stage')
        .eq('tenant_slug', effectiveTenant);

      const tasksPromise = supabase
        .from('tasks')
        .select('status')
        .eq('tenant_slug', effectiveTenant);

      let financeQuery = supabase
        .from('financial_entries')
        .select('amount,status,due_date')
        .eq('tenant_slug', effectiveTenant);

      if (startDate) {
        financeQuery = financeQuery.gte('due_date', startDate).lte('due_date', endDate || startDate);
      }

      const [stats, leadsRes, tasksRes, financeRes] = await Promise.all([
        statsPromise,
        leadsPromise,
        tasksPromise,
        financeQuery,
      ]);

      if (leadsRes.error) {
        throw leadsRes.error;
      }
      if (tasksRes.error) {
        throw tasksRes.error;
      }
      if (financeRes.error) {
        throw financeRes.error;
      }

      const bookingStats = {
        total: stats.total,
        pending: stats.pending,
        confirmed: stats.confirmed,
        completed: stats.completed,
        rejected: stats.rejected,
      };

      const leadsRows = leadsRes.data || [];
      const leadsByStage: Record<string, number> = {};
      leadsRows.forEach((lead) => {
        const stage = String((lead as { stage?: string }).stage || 'novo');
        leadsByStage[stage] = (leadsByStage[stage] || 0) + 1;
      });

      const taskRows = tasksRes.data || [];
      const pendingTasks = taskRows.filter((task) => String((task as { status?: string }).status || '') !== 'concluida').length;

      const normalizedFinanceRows = (financeRes.data || []).map((row) => ({
        amount: Number((row as { amount?: unknown }).amount || 0),
        status: String((row as { status?: unknown }).status || '').trim().toLowerCase() === 'pago'
          ? ('pago' as const)
          : ('pendente' as const),
      }));
      const financeSummary = computeFinanceSummary(normalizedFinanceRows);

      return {
        date: startDate || 'all',
        tenantSlug: effectiveTenant,
        bookingStats,
        leads: {
          total: leadsRows.length,
          byStage: leadsByStage,
          filteredByPeriod: false,
        },
        tasks: {
          total: taskRows.length,
          pending: pendingTasks,
          done: taskRows.length - pendingTasks,
          filteredByPeriod: false,
        },
        finance: {
          expected: financeSummary.expected,
          received: financeSummary.received,
          pending: financeSummary.pending,
          totalCount: financeSummary.totalCount,
          paidCount: financeSummary.paidCount,
          pendingCount: financeSummary.pendingCount,
          temporalBasis: 'due_date',
        },
      };
    });
  }

  async getDashboardFinance(filters?: {
    scope?: 'all' | 'range';
    startDate?: string | null;
    endDate?: string | null;
    groupBy?: DashboardFinanceGroupBy | 'auto';
    tenantSlug?: string | null;
    entryStatus?: DashboardFinanceStatusFilter;
    search?: string | null;
    page?: number;
    limit?: number;
  }): Promise<DashboardFinanceResponse> {
    const supabase = this.getSupabase();
    const effectiveTenant = normalizeTenantSlug(filters?.tenantSlug || null) || DEFAULT_TENANT_SLUG;
    const scope = filters?.scope === 'range' && filters?.startDate ? 'range' : 'all';
    const startDate = scope === 'range' && filters?.startDate ? filters.startDate.trim() : null;
    const endDate = scope === 'range' ? (filters?.endDate?.trim() || startDate) : null;
    const requestedGroupBy = filters?.groupBy || 'auto';
    const entryStatus: DashboardFinanceStatusFilter =
      filters?.entryStatus === 'pago' || filters?.entryStatus === 'pendente' ? filters.entryStatus : 'all';
    const search = (filters?.search || '').trim();
    const page = Math.max(1, Number(filters?.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(filters?.limit) || 10));

    return this.withRetry(async () => {
      const pageSize = 1000;
      let offset = 0;
      const rawRows: Record<string, unknown>[] = [];

      while (true) {
        let query = supabase
          .from('financial_entries')
          .select('id,booking_id,client_name,service_name,amount,payment_method,status,due_date,paid_at,created_at')
          .eq('tenant_slug', effectiveTenant)
          .order('due_date', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (scope === 'range' && startDate) {
          query = query.gte('due_date', startDate).lte('due_date', endDate || startDate);
        }

        const { data, error } = await query;
        if (error) {
          throw error;
        }
        const batch = (data || []) as Record<string, unknown>[];
        rawRows.push(...batch);
        if (batch.length < pageSize) {
          break;
        }
        offset += pageSize;
      }

      const normalizedEntries: DashboardFinanceEntryRow[] = rawRows.map((row) => ({
        id: Number(row.id || 0),
        bookingId: row.booking_id !== null && row.booking_id !== undefined && Number(row.booking_id) > 0 ? Number(row.booking_id) : null,
        clientName: typeof row.client_name === 'string' && row.client_name.trim() ? row.client_name.trim() : 'Cliente não informado',
        serviceName: typeof row.service_name === 'string' && row.service_name.trim() ? row.service_name.trim() : 'Serviço não especificado',
        amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0,
        paymentMethod: typeof row.payment_method === 'string' && row.payment_method.trim() ? row.payment_method.trim() : null,
        status: String(row.status || '').trim().toLowerCase() === 'pago' ? 'pago' : 'pendente',
        dueDate: typeof row.due_date === 'string' && row.due_date.trim() ? row.due_date.trim().slice(0, 10) : null,
        paidAt: typeof row.paid_at === 'string' && row.paid_at.trim() ? row.paid_at.trim() : null,
        createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      }));

      const summary = computeFinanceSummary(normalizedEntries);
      const seriesResult = aggregateFinanceSeriesWithScale(
        normalizedEntries,
        requestedGroupBy,
        startDate,
        endDate,
      );

      const filteredTableEntries = filterFinanceEntriesForTable(normalizedEntries, {
        entryStatus,
        search,
      });

      const total = filteredTableEntries.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const startIndex = (safePage - 1) * limit;
      const pagedEntries = filteredTableEntries.slice(startIndex, startIndex + limit);

      return {
        tenantSlug: effectiveTenant,
        scope,
        startDate,
        endDate,
        temporalBasis: 'due_date',
        groupBy: seriesResult.groupBy,
        autoAdjustedGroupBy: seriesResult.autoAdjusted,
        tableFilters: {
          entryStatus,
          search,
        },
        summary,
        series: seriesResult.series,
        entries: pagedEntries,
        pagination: {
          page: safePage,
          limit,
          total,
          totalPages,
          hasMore: startIndex + pagedEntries.length < total,
        },
      };
    });
  }

  async getActiveAvailabilityRules(weekday?: number): Promise<Record<string, unknown>[]> {
    try {
      const supabase = this.getSupabase();
      let query = supabase
        .from('availability_rules')
        .select('*')
        .eq('active', true);

      if (weekday !== undefined) {
        query = query.eq('weekday', weekday);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  async getServiceDuration(serviceName: string): Promise<number | null> {
    try {
      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from('services_catalog')
        .select('duration_min')
        .ilike('name', serviceName)
        .eq('active', true)
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      const duration = Number(data.duration_min);
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    } catch {
      return null;
    }
  }

  private async loadConsolidatedClientBoardItems(tenantSlug?: string): Promise<ClientBoardItem[]> {
    const tenantKey = normalizeTenantSlug(tenantSlug || null) || DEFAULT_TENANT_SLUG;
    const now = Date.now();
    if (this.workspaceCache && this.workspaceCache.tenantKey === tenantKey && this.workspaceCache.expiresAt > now) {
      return this.workspaceCache.boardItems;
    }

    const supabase = this.getSupabase();

    const [clientsRows, bookingRows, settings] = await Promise.all([
      this.list('clients'),
      this.withRetry(async () => {
        const { data, error } = await supabase
          .from('bookings')
          .select('phone,date,status,service,service_price,service_items')
          .in('status', ['confirmed', 'completed']);
        if (error) throw error;
        return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
          phone: String(row.phone || ''),
          date: String(row.date || ''),
          status: String(row.status || ''),
          service: String(row.service || ''),
          servicePrice: row.service_price ? String(row.service_price) : null,
          serviceItems: row.service_items,
        }));
      }),
      this.getSettings(tenantSlug).catch(() => ({} as Record<string, unknown>)),
    ]);

    const bookingsByPhone = new Map<string, LightweightBookingRow[]>();
    for (const booking of bookingRows) {
      const phoneKey = normalizeDigits(booking.phone);
      if (!phoneKey) continue;
      const existing = bookingsByPhone.get(phoneKey) || [];
      existing.push(booking);
      bookingsByPhone.set(phoneKey, existing);
    }

    const rawRules = Array.isArray(settings.clientAgentRules) ? settings.clientAgentRules : [];
    const rulesByClientId = new Map<number, LightweightAgentRule[]>();
    for (const raw of rawRules) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const clientId = Number(r.clientId || 0);
      if (!Number.isFinite(clientId) || clientId <= 0) continue;
      const rule: LightweightAgentRule = {
        id: String(r.id || ''),
        clientId,
        enabled: r.enabled !== false,
        sendAt: String(r.sendAt || ''),
      };
      const existing = rulesByClientId.get(clientId) || [];
      existing.push(rule);
      rulesByClientId.set(clientId, existing);
    }

    const nowMinute = nowLocalIsoMinute();

    const boardItems: ClientBoardItem[] = clientsRows.map((client) => {
      const phoneKey = normalizeDigits(client.phone);
      const confirmedBookings = phoneKey ? bookingsByPhone.get(phoneKey) || [] : [];

      const serviceCounts = new Map<string, { count: number; lastDate: string | null }>();
      let totalSpent = 0;

      for (const booking of confirmedBookings) {
        let bookingTotal = 0;
        let serviceNames: string[] = [];

        if (booking.serviceItems) {
          try {
            const parsed = typeof booking.serviceItems === 'string'
              ? JSON.parse(booking.serviceItems)
              : booking.serviceItems;
            if (Array.isArray(parsed) && parsed.length > 0) {
              for (const item of parsed) {
                if (item && typeof item === 'object') {
                  const itemObj = item as Record<string, unknown>;
                  const itemName = String(itemObj.name || '').trim();
                  if (itemName) serviceNames.push(itemName);
                  bookingTotal += parseMoneyValue(itemObj.price);
                }
              }
            }
          } catch {
            // fallback to service / servicePrice
          }
        }

        if (serviceNames.length === 0 && booking.service.trim()) {
          serviceNames = [booking.service.trim()];
        }
        if (bookingTotal === 0 && booking.servicePrice) {
          bookingTotal = parseMoneyValue(booking.servicePrice);
        }

        totalSpent += bookingTotal;

        for (const name of serviceNames) {
          const current = serviceCounts.get(name);
          serviceCounts.set(name, {
            count: (current?.count || 0) + 1,
            lastDate: !current?.lastDate || booking.date > current.lastDate ? booking.date : current.lastDate,
          });
        }
      }

      const sortedServices = Array.from(serviceCounts.entries())
        .map(([name, val]) => ({ name, count: val.count, lastDate: val.lastDate }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));

      const visitCount = confirmedBookings.length;
      const avgTicket = visitCount > 0 ? totalSpent / visitCount : 0;
      const lastVisit = confirmedBookings.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.date || null;
      const dormancyDays = computeDaysSince(lastVisit);

      const clientId = Number(client.id || 0);
      const clientRules = clientId > 0 ? rulesByClientId.get(clientId) || [] : [];
      const enabledRules = clientRules.filter((r) => r.enabled);
      const nextReminder = enabledRules
        .slice()
        .sort((a, b) => a.sendAt.localeCompare(b.sendAt))[0]?.sendAt.slice(0, 10) || null;
      const overdueRuleCount = enabledRules.filter((r) => r.sendAt && r.sendAt <= nowMinute).length;
      const status = normalizeStatusValue(client.status);
      const preferredService = String(client.preferred_service || '').trim();
      const topService = sortedServices[0]?.name || preferredService || 'Nao definido';

      let tone: ClientTone = 'neutral';
      let toneLabel = 'Em observação';
      let attentionLine = nextReminder ? `Próximo aviso em ${formatDateShortBR(nextReminder)}` : 'Sem agenda de retorno ativa';

      if (status === 'VIP' || totalSpent >= 1200) {
        tone = 'vip';
        toneLabel = 'Alto valor';
        attentionLine = totalSpent > 0 ? `Carteira acumulada ${formatCurrencyBR(totalSpent)}` : 'Cliente VIP sem histórico consolidado';
      } else if (status === 'em risco' || status === 'inativo' || overdueRuleCount > 0 || (dormancyDays !== null && dormancyDays >= 75)) {
        tone = 'risk';
        toneLabel = 'Pedir reativação';
        attentionLine = overdueRuleCount > 0
          ? `${overdueRuleCount} aviso${overdueRuleCount === 1 ? '' : 's'} vencido${overdueRuleCount === 1 ? '' : 's'}`
          : dormancyDays !== null
            ? `Sem retorno há ${dormancyDays} dias`
            : 'Sem retorno recente mapeado';
      } else if (status === 'recorrente' || status === 'ativo' || enabledRules.length > 0) {
        tone = 'active';
        toneLabel = 'Ciclo ativo';
        attentionLine = nextReminder
          ? `Retorno programado para ${formatDateShortBR(nextReminder)}`
          : `Serviço âncora: ${sortedServices[0]?.name || preferredService || 'não definido'}`;
      }

      const insight: ClientInsight = {
        totalSpent,
        visitCount,
        avgTicket,
        topService,
        lastVisit,
        nextReminder,
        activeRuleCount: enabledRules.length,
        overdueRuleCount,
        dormancyDays,
        tone,
        toneLabel,
        attentionLine,
      };

      return {
        client: {
          ...client,
          status,
        },
        insight,
      };
    });

    this.workspaceCache = {
      tenantKey,
      expiresAt: now + 4500,
      boardItems,
    };

    return boardItems;
  }

  async getClientsWorkspace(query: ClientsWorkspaceQuery): Promise<ClientsWorkspaceResponse> {
    const boardItems = await this.loadConsolidatedClientBoardItems(query.tenantSlug);

    const totalRevenue = boardItems.reduce((sum, item) => sum + item.insight.totalSpent, 0);
    const totalVisits = boardItems.reduce((sum, item) => sum + item.insight.visitCount, 0);
    const upcoming = boardItems.filter((item) => item.insight.nextReminder).length;
    const vip = boardItems.filter((item) => normalizeStatusValue(item.client.status) === 'VIP').length;
    const risk = boardItems.filter((item) => item.insight.tone === 'risk').length;
    const active = boardItems.filter((item) => ['ativo', 'recorrente', 'VIP'].includes(normalizeStatusValue(item.client.status))).length;

    const overview = {
      total: boardItems.length,
      active,
      upcoming,
      vip,
      risk,
      totalRevenue,
      averageTicket: totalVisits > 0 ? totalRevenue / totalVisits : 0,
    };

    const upcomingRadar = boardItems
      .filter((item) => item.insight.nextReminder)
      .slice()
      .sort((a, b) => parseDateMs(a.insight.nextReminder) - parseDateMs(b.insight.nextReminder))
      .slice(0, 6);

    const hotList = boardItems
      .filter((item) => item.insight.totalSpent > 0 || normalizeStatusValue(item.client.status) === 'VIP')
      .slice()
      .sort((a, b) => b.insight.totalSpent - a.insight.totalSpent)
      .slice(0, 6);

    const term = String(query.search || '').trim().toLowerCase();
    const statusFilter = query.status && query.status !== 'todos' && CLIENT_STATUS_SET.has(query.status)
      ? query.status
      : 'todos';
    const focusFilter = query.focus || 'todos';
    const sortMode = query.sort || 'proximo-aviso';

    // Filter without status first so columnCounts reflects how many items exist in each stage for the current search + focus!
    const searchAndFocusMatched = boardItems.filter(({ client, insight }) => {
      const name = String(client.name || '').toLowerCase();
      const phone = String(client.phone || '').toLowerCase();
      const email = String(client.email || '').toLowerCase();
      const status = String(client.status || '').toLowerCase();
      const preferredService = String(client.preferred_service || '').toLowerCase();
      const notes = String(client.notes || '').toLowerCase();
      const topService = insight.topService.toLowerCase();
      const idStr = String(client.id || '');

      const searchOk =
        !term ||
        name.includes(term) ||
        phone.includes(term) ||
        email.includes(term) ||
        status.includes(term) ||
        preferredService.includes(term) ||
        notes.includes(term) ||
        topService.includes(term) ||
        idStr === term.replace(/^#/, '');

      const normStatus = normalizeStatusValue(client.status);
      const focusOk =
        focusFilter === 'todos' ||
        (focusFilter === 'com-agente' && insight.activeRuleCount > 0) ||
        (focusFilter === 'reativacao' && (insight.tone === 'risk' || normStatus === 'inativo')) ||
        (focusFilter === 'alto-valor' && (normStatus === 'VIP' || insight.totalSpent >= 1200)) ||
        (focusFilter === 'sem-retorno' && insight.dormancyDays !== null && insight.dormancyDays >= 60);

      return searchOk && focusOk;
    });

    const sortItems = (items: ClientBoardItem[]): ClientBoardItem[] =>
      items.slice().sort((left, right) => {
        if (sortMode === 'valor') {
          if (right.insight.totalSpent !== left.insight.totalSpent) {
            return right.insight.totalSpent - left.insight.totalSpent;
          }
        } else if (sortMode === 'ultima-visita') {
          const diff = parseDateMs(right.insight.lastVisit) - parseDateMs(left.insight.lastVisit);
          if (diff !== 0) return diff;
        } else if (sortMode === 'nome') {
          const cmp = String(left.client.name || '').localeCompare(String(right.client.name || ''), 'pt-BR');
          if (cmp !== 0) return cmp;
        } else {
          const leftReminder = left.insight.nextReminder ? parseDateMs(left.insight.nextReminder) : Number.MAX_SAFE_INTEGER;
          const rightReminder = right.insight.nextReminder ? parseDateMs(right.insight.nextReminder) : Number.MAX_SAFE_INTEGER;
          if (leftReminder !== rightReminder) {
            return leftReminder - rightReminder;
          }
          if (right.insight.totalSpent !== left.insight.totalSpent) {
            return right.insight.totalSpent - left.insight.totalSpent;
          }
        }
        return Number(right.client.id || 0) - Number(left.client.id || 0);
      });

    const sortedSearchAndFocus = sortItems(searchAndFocusMatched);

    const columnCounts: Record<ClientStatus, number> = {
      novo: 0,
      ativo: 0,
      recorrente: 0,
      VIP: 0,
      'em risco': 0,
      inativo: 0,
    };

    const groupedByColumn = new Map<ClientStatus, ClientBoardItem[]>();
    for (const status of CLIENT_STATUSES) {
      groupedByColumn.set(status, []);
    }

    for (const item of sortedSearchAndFocus) {
      const st = normalizeStatusValue(item.client.status);
      columnCounts[st] = (columnCounts[st] || 0) + 1;
      if (statusFilter === 'todos' || statusFilter === st) {
        groupedByColumn.get(st)?.push(item);
      }
    }

    const filteredItems = statusFilter === 'todos'
      ? sortedSearchAndFocus
      : sortedSearchAndFocus.filter((item) => normalizeStatusValue(item.client.status) === statusFilter);

    const baseColumnLimit = Math.max(1, Math.min(100, Number(query.columnLimit || 20)));
    const columns = {} as Record<ClientStatus, ClientsWorkspaceColumnSlice>;
    for (const status of CLIENT_STATUSES) {
      const fullList = groupedByColumn.get(status) || [];
      const customLimit = query.columnLimits?.[status];
      const effectiveLimit = customLimit
        ? Math.max(1, Math.min(500, Number(customLimit)))
        : baseColumnLimit;
      const sliced = fullList.slice(0, effectiveLimit);
      columns[status] = {
        status,
        items: sliced,
        total: fullList.length,
        limit: effectiveLimit,
        hasMore: fullList.length > sliced.length,
      };
    }

    const dirLimit = Math.max(1, Math.min(100, Number(query.limit || 20)));
    const totalFiltered = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / dirLimit));
    const dirPage = Math.max(1, Math.min(totalPages, Number(query.page || 1)));
    const dirOffset = (dirPage - 1) * dirLimit;
    const directoryItems = filteredItems.slice(dirOffset, dirOffset + dirLimit);

    return {
      mode: query.mode === 'directory' ? 'directory' : 'kanban',
      overview,
      radar: {
        upcoming: upcomingRadar,
        hotList,
      },
      filteredTotal: totalFiltered,
      columnCounts,
      columns,
      directory: {
        items: directoryItems,
        total: totalFiltered,
        overallTotal: boardItems.length,
        page: dirPage,
        limit: dirLimit,
        totalPages,
        hasMore: dirOffset + directoryItems.length < totalFiltered,
      },
    };
  }
}

export const workbenchStore = new WorkbenchStore();
