import { workbenchStore } from '../db/workbenchStore';
import { resolveTenantBridgeConfig } from './chatwootEvolutionBridge';
import { normalizeWhatsappPhone } from '../utils/phone';

type EvolutionApiFetchResult = {
  ok: boolean;
  rawBody: string;
  payload: unknown;
  status: number;
};

export type EvolutionIntegrationTestResult = {
  ok: boolean;
  reachable: boolean;
  instanceFound: boolean;
  instancesCount: number;
  error: string | null;
};

const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();
const DEFAULT_EVOLUTION_SEND_PATH = '/message/sendText/{instance}';

const normalizeTenantSlug = (tenantSlug?: string): string => {
  const normalized = (tenantSlug || '').trim().toLowerCase();
  return normalized || DEFAULT_TENANT_SLUG;
};

const toBaseUrl = (value: string): string => {
  const raw = value.trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
};

const withLeadingSlash = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const extractProviderMessageId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const keyCandidate = root.key;
  if (keyCandidate && typeof keyCandidate === 'object') {
    const key = keyCandidate as Record<string, unknown>;
    if (typeof key.id === 'string' && key.id.trim()) {
      return key.id.trim();
    }
  }

  const directCandidates = ['messageId', 'message_id', 'id'];
  for (const candidate of directCandidates) {
    if (typeof root[candidate] === 'string' && String(root[candidate]).trim()) {
      return String(root[candidate]).trim();
    }
  }

  return null;
};

const buildEvolutionSendUrl = (evolutionUrl: string, instanceName: string, sendPath?: string): string => {
  const normalizedPath = (sendPath || DEFAULT_EVOLUTION_SEND_PATH).includes('{instance}')
    ? (sendPath || DEFAULT_EVOLUTION_SEND_PATH)
    : `${(sendPath || DEFAULT_EVOLUTION_SEND_PATH).replace(/\/+$/, '')}/{instance}`;
  const dynamicPath = normalizedPath.replace('{instance}', encodeURIComponent(instanceName));
  return `${toBaseUrl(evolutionUrl)}${withLeadingSlash(dynamicPath)}`;
};

const evolutionApiFetch = async (
  evolutionUrl: string,
  evolutionApiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<EvolutionApiFetchResult> => {
  const response = await fetch(`${toBaseUrl(evolutionUrl)}${withLeadingSlash(path)}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: evolutionApiKey,
      Authorization: `Bearer ${evolutionApiKey}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const rawBody = await response.text();
  let payload: unknown = rawBody;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as unknown) : {};
  } catch {
    payload = rawBody;
  }

  return {
    ok: response.ok,
    rawBody,
    payload,
    status: response.status,
  };
};

const resolveTenantEvolutionConfig = async (
  tenantSlug?: string,
  settingsOverride?: Record<string, unknown>,
) => {
  const targetTenant = normalizeTenantSlug(tenantSlug);
  const storedSettings = await workbenchStore.getSettings(targetTenant);
  const settings = settingsOverride
    ? {
        ...storedSettings,
        ...settingsOverride,
      }
    : storedSettings;
  const resolved = resolveTenantBridgeConfig(targetTenant, settings, 'evolution');
  return {
    tenantSlug: targetTenant,
    settings,
    resolved,
  };
};

export const testTenantEvolutionIntegration = async (
  tenantSlug?: string,
  settingsOverride?: Record<string, unknown>,
): Promise<EvolutionIntegrationTestResult> => {
  const { resolved } = await resolveTenantEvolutionConfig(tenantSlug, settingsOverride);
  if (resolved.ok === false) {
    return {
      ok: false,
      reachable: false,
      instanceFound: false,
      instancesCount: 0,
      error: resolved.error,
    };
  }

  const response = await evolutionApiFetch(
    resolved.config.evolutionUrl,
    resolved.config.evolutionApiKey,
    'GET',
    '/instance/fetchInstances',
  );

  if (!response.ok) {
    return {
      ok: false,
      reachable: false,
      instanceFound: false,
      instancesCount: 0,
      error: `Falha ao acessar Evolution (${response.status}): ${response.rawBody || 'sem detalhes'}`,
    };
  }

  const rows = Array.isArray(response.payload)
    ? response.payload
    : response.payload && typeof response.payload === 'object'
      ? ((response.payload as Record<string, unknown>).data as unknown[] | undefined)
        || ((response.payload as Record<string, unknown>).instances as unknown[] | undefined)
        || []
      : [];

  const normalizedInstanceName = resolved.config.evolutionInstance.trim().toLowerCase();
  const instanceFound = rows.some((row) => {
    if (!row || typeof row !== 'object') {
      return false;
    }
    const item = row as Record<string, unknown>;
    return typeof item.name === 'string' && item.name.trim().toLowerCase() === normalizedInstanceName;
  });

  return {
    ok: instanceFound,
    reachable: true,
    instanceFound,
    instancesCount: rows.length,
    error: instanceFound ? null : 'A Evolution respondeu, mas a instancia configurada ainda nao foi encontrada.',
  };
};

export const sendEvolutionMessageToCustomer = async (
  tenantSlug: string | undefined,
  phone: string,
  text: string,
): Promise<string | null> => {
  const { resolved } = await resolveTenantEvolutionConfig(tenantSlug);
  if (resolved.ok === false) {
    throw new Error(resolved.error);
  }

  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    throw new Error('Telefone invalido para envio pela Evolution.');
  }

  const message = (text || '').trim();
  if (!message) {
    throw new Error('Mensagem vazia para envio pela Evolution.');
  }

  const url = buildEvolutionSendUrl(
    resolved.config.evolutionUrl,
    resolved.config.evolutionInstance,
    resolved.config.evolutionSendPath,
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: resolved.config.evolutionApiKey,
      Authorization: `Bearer ${resolved.config.evolutionApiKey}`,
    },
    body: JSON.stringify({
      number: normalizedPhone,
      text: message,
    }),
  });

  const rawBody = await response.text();
  let payload: unknown = rawBody;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as unknown) : {};
  } catch {
    payload = rawBody;
  }

  if (!response.ok) {
    throw new Error(`Falha no envio via Evolution (${response.status}): ${rawBody || 'sem detalhes'}`);
  }

  return extractProviderMessageId(payload);
};
