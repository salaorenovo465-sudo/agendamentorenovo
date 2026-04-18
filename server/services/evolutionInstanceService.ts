import { workbenchStore } from '../db/workbenchStore';
import { resolveTenantBridgeConfig } from './chatwootEvolutionBridge';
import { asObject, getString } from '../utils/helpers';
import {
  evolutionApiRequest,
  extractEvolutionInstanceName,
  fetchEvolutionInstances,
  parseEvolutionConnectionState,
  resolveEvolutionInstance,
} from './evolutionApiService';

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

const toConnectionState = (value: unknown): EvolutionInstanceConnectionState => {
  const normalized = parseEvolutionConnectionState(value);
  if (normalized === 'open' || normalized === 'connecting' || normalized === 'close' || normalized === 'disconnected' || normalized === 'missing') {
    return normalized;
  }
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

const readInstanceState = async (
  config: ResolvedEvolutionConfig,
  instanceName: string,
): Promise<EvolutionInstanceConnectionState> => {
  try {
    const payload = await evolutionApiRequest(
      config.evolutionUrl,
      config.evolutionApiKey,
      'GET',
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
    const instance = asObject(asObject(payload)?.instance);
    return toConnectionState(instance?.state);
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
    const instances = await fetchEvolutionInstances(resolved.evolutionUrl, resolved.evolutionApiKey);
    const match = resolveEvolutionInstance(instances, resolved.instanceName);
    if (!match.row) {
      return toStatusPayload(resolved, { exists: false, connectionState: 'missing' });
    }

    const resolvedInstanceName = extractEvolutionInstanceName(match.row) || match.instanceName || resolved.instanceName;
    if (resolvedInstanceName && resolvedInstanceName !== resolved.instanceName) {
      await saveInstanceNameToSettings(resolved.tenantSlug, resolved.settings, resolvedInstanceName);
    }

    const rowState = toConnectionState(match.row.connectionStatus || match.row.state || match.row.status);
    const connectionState = rowState === 'unknown' ? await readInstanceState(resolved, resolvedInstanceName) : rowState;

    let qrDataUrl: string | null = null;
    if (options.includeQr && connectionState !== 'open') {
      try {
        const connectPayload = await evolutionApiRequest(
          resolved.evolutionUrl,
          resolved.evolutionApiKey,
          'GET',
          `/instance/connect/${encodeURIComponent(resolvedInstanceName)}`,
        );
        qrDataUrl = extractQrDataUrl(connectPayload);
      } catch (error) {
        return toStatusPayload(
          { ...resolved, instanceName: resolvedInstanceName },
          {
            exists: true,
            connectionState,
            qrDataUrl: null,
            lastError: error instanceof Error ? error.message : 'Falha ao obter QR da Evolution.',
          },
        );
      }
    }

    return toStatusPayload(
      { ...resolved, instanceName: resolvedInstanceName },
      {
        exists: true,
        connectionState,
        qrDataUrl,
      },
    );
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
  const resolved = await resolveEvolutionConfig(
    tenantSlugRaw,
    preferredCompanyName ? buildInstanceName(preferredCompanyName, normalizeTenantSlug(tenantSlugRaw)) : undefined,
  );
  if (!resolved) {
    return missingConfigStatus(tenantSlugRaw);
  }

  try {
    await evolutionApiRequest(resolved.evolutionUrl, resolved.evolutionApiKey, 'POST', '/instance/create', {
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
    const currentStatus = await getEvolutionInstanceStatus(resolved.tenantSlug, { includeQr: false });
    const targetInstance = currentStatus.exists ? currentStatus.instanceName : resolved.instanceName;
    await evolutionApiRequest(
      resolved.evolutionUrl,
      resolved.evolutionApiKey,
      'DELETE',
      `/instance/logout/${encodeURIComponent(targetInstance)}`,
    );
  } catch (err) {
    console.warn('Logout da instÃ¢ncia Evolution falhou:', err);
  }

  return getEvolutionInstanceStatus(resolved.tenantSlug, { includeQr: true });
};

export const refreshEvolutionInstanceQr = async (tenantSlugRaw?: string): Promise<EvolutionInstanceStatus> => {
  const resolved = await resolveEvolutionConfig(tenantSlugRaw);
  if (!resolved) {
    return missingConfigStatus(tenantSlugRaw);
  }

  try {
    const currentStatus = await getEvolutionInstanceStatus(resolved.tenantSlug, { includeQr: false });
    const targetInstance = currentStatus.exists ? currentStatus.instanceName : resolved.instanceName;
    await evolutionApiRequest(
      resolved.evolutionUrl,
      resolved.evolutionApiKey,
      'POST',
      `/instance/restart/${encodeURIComponent(targetInstance)}`,
      {},
    );
  } catch (err) {
    console.warn('Restart da instÃ¢ncia Evolution nÃ£o necessÃ¡rio ou falhou:', err);
  }

  return getEvolutionInstanceStatus(resolved.tenantSlug, { includeQr: true });
};
