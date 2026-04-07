import { workbenchStore } from '../db/workbenchStore';
import { resolveTenantBridgeConfig } from './chatwootEvolutionBridge';
import { type GenericObject, asObject, asArray, getString } from '../utils/helpers';

export type EvolutionInstanceConnectionState =
  | 'missing'
  | 'connecting'
  | 'open'
  | 'close'
  | 'disconnected'
  | 'unknown';

export type EvolutionInstanceStatus = {
  tenantSlug: string;
  companyName: string;
  configured: boolean;
  instanceName: string;
  exists: boolean;
  connectionState: EvolutionInstanceConnectionState;
  connected: boolean;
  qrDataUrl: string | null;
  lastError: string | null;
};

type ResolvedEvolutionConfig = {
  tenantSlug: string;
  settings: Record<string, unknown>;
  companyName: string;
  instanceName: string;
  evolutionUrl: string;
  evolutionApiKey: string;
};

const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();


const normalizeTenantSlug = (value: string | undefined): string => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized || DEFAULT_TENANT_SLUG;
};

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const buildInstanceName = (companyName: string, tenantSlug: string): string => {
  const companySlug = slugify(companyName || 'empresa');
  const tenantPart = slugify(tenantSlug || DEFAULT_TENANT_SLUG) || DEFAULT_TENANT_SLUG;
  const base = `${companySlug || 'empresa'}-${tenantPart}`;
  return base.slice(0, 64);
};

const toBaseUrl = (value: string): string => {
  const raw = value.trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
};

const inferCompanyName = async (tenantSlug: string, settings: Record<string, unknown>): Promise<string> => {
  const fromSettings = getString(settings.companyName) || getString(settings.salonName);
  if (fromSettings) {
    return fromSettings;
  }

  try {
    const tenants = await workbenchStore.listTenants();
    const found = tenants.find((tenant) => tenant.slug === tenantSlug);
    if (found?.name) {
      return found.name;
    }
  } catch (err) {
    console.warn('Erro ao inferir nome da empresa:', err);
  }

  return 'Empresa de estetica';
};

const saveInstanceNameToSettings = async (
  tenantSlug: string,
  settings: Record<string, unknown>,
  instanceName: string,
): Promise<void> => {
  if (getString(settings.evolutionInstance) === instanceName) {
    return;
  }

  const nextSettings: Record<string, unknown> = {
    ...settings,
    evolutionInstance: instanceName,
  };

  await workbenchStore.saveSettings(nextSettings, tenantSlug);
};

const resolveEvolutionConfig = async (
  tenantSlugRaw?: string,
  preferredInstanceName?: string,
): Promise<ResolvedEvolutionConfig | null> => {
  const tenantSlug = normalizeTenantSlug(tenantSlugRaw);
  const settings = await workbenchStore.getSettings(tenantSlug);
  const companyName = await inferCompanyName(tenantSlug, settings);

  const computedInstanceName =
    getString(settings.evolutionInstance) || getString(preferredInstanceName) || buildInstanceName(companyName, tenantSlug);

  const resolved = resolveTenantBridgeConfig(
    tenantSlug,
    {
      ...settings,
      evolutionInstance: computedInstanceName,
    },
    'evolution',
  );

  if (resolved.ok === false) {
    return null;
  }

  await saveInstanceNameToSettings(tenantSlug, settings, computedInstanceName);

  return {
    tenantSlug,
    settings,
    companyName,
    instanceName: computedInstanceName,
    evolutionUrl: resolved.config.evolutionUrl,
    evolutionApiKey: resolved.config.evolutionApiKey,
  };
};

const evolutionRequest = async (
  config: ResolvedEvolutionConfig,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<unknown> => {
  const response = await fetch(`${toBaseUrl(config.evolutionUrl)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: config.evolutionApiKey,
      Authorization: `Bearer ${config.evolutionApiKey}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let payload: unknown = {};
  try {
    payload = raw ? (JSON.parse(raw) as unknown) : {};
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`Evolution ${method} ${path} -> ${response.status}: ${message || 'erro desconhecido'}`);
  }

  return payload;
};

const parseConnectionState = (value: unknown): EvolutionInstanceConnectionState => {
  const normalized = getString(value).toLowerCase();
  if (normalized === 'open') return 'open';
  if (normalized === 'connecting' || normalized === 'starting') return 'connecting';
  if (normalized === 'close' || normalized === 'closed') return 'close';
  if (normalized === 'disconnected') return 'disconnected';
  if (normalized === 'missing') return 'missing';
  return 'unknown';
};

const extractQrDataUrl = (payload: unknown): string | null => {
  const root = asObject(payload);
  if (!root) return null;

  const direct = getString(root.base64) || getString(root.qrcode) || getString(root.qr) || getString(root.qrCode);
  if (direct) return direct;

  const instanceNode = asObject(root.instance);
  const nested =
    getString(instanceNode?.base64) ||
    getString(instanceNode?.qrcode) ||
    getString(instanceNode?.qr) ||
    getString(instanceNode?.qrCode);

  return nested || null;
};

const listEvolutionInstances = async (config: ResolvedEvolutionConfig): Promise<GenericObject[]> => {
  const payload = await evolutionRequest(config, 'GET', '/instance/fetchInstances');
  return asArray(payload)
    .map((row) => asObject(row))
    .filter((row): row is GenericObject => Boolean(row));
};

const findInstanceRow = (rows: GenericObject[], instanceName: string): GenericObject | null => {
  const target = instanceName.trim().toLowerCase();
  if (!target) return null;

  return rows.find((row) => getString(row.name).toLowerCase() === target) || null;
};

const readInstanceState = async (config: ResolvedEvolutionConfig): Promise<EvolutionInstanceConnectionState> => {
  try {
    const payload = await evolutionRequest(config, 'GET', `/instance/connectionState/${encodeURIComponent(config.instanceName)}`);
    const instance = asObject(asObject(payload)?.instance);
    return parseConnectionState(instance?.state);
  } catch {
    return 'unknown';
  }
};

const toStatusPayload = (
  config: ResolvedEvolutionConfig,
  params: {
    exists: boolean;
    connectionState: EvolutionInstanceConnectionState;
    qrDataUrl?: string | null;
    lastError?: string | null;
  },
): EvolutionInstanceStatus => ({
  tenantSlug: config.tenantSlug,
  companyName: config.companyName,
  configured: true,
  instanceName: config.instanceName,
  exists: params.exists,
  connectionState: params.connectionState,
  connected: params.connectionState === 'open',
  qrDataUrl: params.qrDataUrl || null,
  lastError: params.lastError || null,
});

const missingConfigStatus = async (tenantSlugRaw?: string): Promise<EvolutionInstanceStatus> => {
  const tenantSlug = normalizeTenantSlug(tenantSlugRaw);
  const settings = await workbenchStore.getSettings(tenantSlug);
  const companyName = await inferCompanyName(tenantSlug, settings);
  const instanceName = getString(settings.evolutionInstance) || buildInstanceName(companyName, tenantSlug);

  return {
    tenantSlug,
    companyName,
    configured: false,
    instanceName,
    exists: false,
    connectionState: 'missing',
    connected: false,
    qrDataUrl: null,
    lastError: 'Configure evolutionUrl e evolutionApiKey para criar a instancia.',
  };
};

export const getEvolutionInstanceStatus = async (
  tenantSlugRaw?: string,
  options: { includeQr?: boolean } = {},
): Promise<EvolutionInstanceStatus> => {
  const resolved = await resolveEvolutionConfig(tenantSlugRaw);
  if (!resolved) {
    return missingConfigStatus(tenantSlugRaw);
  }

  try {
    const instances = await listEvolutionInstances(resolved);
    const found = findInstanceRow(instances, resolved.instanceName);
    if (!found) {
      return toStatusPayload(resolved, { exists: false, connectionState: 'missing' });
    }

    const rowState = parseConnectionState(found.connectionStatus || found.state || found.status);
    const connectionState = rowState === 'unknown' ? await readInstanceState(resolved) : rowState;

    let qrDataUrl: string | null = null;
    if (options.includeQr && connectionState !== 'open') {
      try {
        const connectPayload = await evolutionRequest(resolved, 'GET', `/instance/connect/${encodeURIComponent(resolved.instanceName)}`);
        qrDataUrl = extractQrDataUrl(connectPayload);
      } catch (error) {
        return toStatusPayload(resolved, {
          exists: true,
          connectionState,
          qrDataUrl: null,
          lastError: error instanceof Error ? error.message : 'Falha ao obter QR da Evolution.',
        });
      }
    }

    return toStatusPayload(resolved, {
      exists: true,
      connectionState,
      qrDataUrl,
    });
  } catch (error) {
    return toStatusPayload(resolved, {
      exists: false,
      connectionState: 'unknown',
      lastError: error instanceof Error ? error.message : 'Falha ao consultar Evolution.',
    });
  }
};

export const createEvolutionInstance = async (
  tenantSlugRaw?: string,
  preferredCompanyName?: string,
): Promise<EvolutionInstanceStatus> => {
  const resolved = await resolveEvolutionConfig(tenantSlugRaw, preferredCompanyName ? buildInstanceName(preferredCompanyName, normalizeTenantSlug(tenantSlugRaw)) : undefined);
  if (!resolved) {
    return missingConfigStatus(tenantSlugRaw);
  }

  try {
    await evolutionRequest(resolved, 'POST', '/instance/create', {
      instanceName: resolved.instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar instancia na Evolution.';
    if (!message.toLowerCase().includes('already in use') && !message.toLowerCase().includes('already exists')) {
      return toStatusPayload(resolved, {
        exists: false,
        connectionState: 'unknown',
        lastError: message,
      });
    }
  }

  return getEvolutionInstanceStatus(resolved.tenantSlug, { includeQr: true });
};

export const logoutEvolutionInstance = async (tenantSlugRaw?: string): Promise<EvolutionInstanceStatus> => {
  const resolved = await resolveEvolutionConfig(tenantSlugRaw);
  if (!resolved) {
    return missingConfigStatus(tenantSlugRaw);
  }

  try {
    // Logout disconnects WhatsApp session on the Evolution API
    await evolutionRequest(resolved, 'DELETE', `/instance/logout/${encodeURIComponent(resolved.instanceName)}`);
  } catch (err) {
    console.warn('Logout da instância Evolution falhou:', err);
  }

  // Return status with QR so admin can reconnect with a different number
  return getEvolutionInstanceStatus(resolved.tenantSlug, { includeQr: true });
};

export const refreshEvolutionInstanceQr = async (tenantSlugRaw?: string): Promise<EvolutionInstanceStatus> => {
  const resolved = await resolveEvolutionConfig(tenantSlugRaw);
  if (!resolved) {
    return missingConfigStatus(tenantSlugRaw);
  }

  try {
    await evolutionRequest(resolved, 'POST', `/instance/restart/${encodeURIComponent(resolved.instanceName)}`, {});
  } catch (err) {
    console.warn('Restart da instância Evolution não necessário ou falhou:', err);
  }

  return getEvolutionInstanceStatus(resolved.tenantSlug, { includeQr: true });
};
