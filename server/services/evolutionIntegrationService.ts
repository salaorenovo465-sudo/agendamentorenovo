import { workbenchStore } from '../db/workbenchStore';
import { normalizeWhatsappPhone } from '../utils/phone';
import { resolveTenantBridgeConfig } from './chatwootEvolutionBridge';
import {
  getEvolutionInstanceStatus,
  type EvolutionInstanceStatus,
} from './evolutionInstanceService';

type EvolutionApiFetchResult = {
  ok: boolean;
  rawBody: string;
  payload: unknown;
  status: number;
};

type EvolutionChecklistStatus = 'ok' | 'warn' | 'error' | 'pending';

type EvolutionChecklistItem = {
  id: string;
  label: string;
  status: EvolutionChecklistStatus;
  detail: string;
};

export type EvolutionIntegrationDiagnostics = {
  checkedAt: string;
  tenantSlug: string;
  overallStatus: 'ready' | 'attention' | 'error' | 'missing';
  readinessScore: number;
  apiReachable: boolean;
  secureUrl: boolean;
  sendPathResolved: string;
  sendUrlPreview: string | null;
  webhookUrl: string | null;
  instanceFound: boolean;
  availableInstances: string[];
  instancesCount: number;
  checklist: EvolutionChecklistItem[];
  issues: string[];
  warnings: string[];
  recommendations: string[];
};

export type EvolutionIntegrationTestResult = {
  ok: boolean;
  reachable: boolean;
  instanceFound: boolean;
  instancesCount: number;
  error: string | null;
  diagnostics: EvolutionIntegrationDiagnostics;
};

export type EvolutionTestMessageResult = {
  ok: boolean;
  normalizedPhone: string;
  providerMessageId: string | null;
  sentAt: string;
  diagnostics: EvolutionIntegrationDiagnostics;
};

type ResolvedEvolutionConfig = {
  tenantSlug: string;
  settings: Record<string, unknown>;
  resolved: ReturnType<typeof resolveTenantBridgeConfig>;
};

const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();
const DEFAULT_EVOLUTION_SEND_PATH = '/message/sendText/{instance}';
const EVOLUTION_REQUEST_TIMEOUT_MS = 12_000;

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

const isSecureHttpUrl = (value: string): boolean => {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const isLocalHttpUrl = (value: string): boolean => {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.trim().toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
};

const normalizeSendPath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_EVOLUTION_SEND_PATH;
  }

  if (trimmed.includes('{instance}')) {
    return trimmed;
  }

  return `${trimmed.replace(/\/+$/, '')}/{instance}`;
};

const buildEvolutionSendUrl = (evolutionUrl: string, instanceName: string, sendPath?: string): string => {
  const normalizedPath = normalizeSendPath(sendPath || DEFAULT_EVOLUTION_SEND_PATH);
  const dynamicPath = normalizedPath.replace('{instance}', encodeURIComponent(instanceName));
  return `${toBaseUrl(evolutionUrl)}${withLeadingSlash(dynamicPath)}`;
};

const withTimeout = async <T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs = EVOLUTION_REQUEST_TIMEOUT_MS): Promise<T> => {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(handle);
  }
};

const evolutionApiFetch = async (
  evolutionUrl: string,
  evolutionApiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<EvolutionApiFetchResult> =>
  withTimeout(async (signal) => {
    const response = await fetch(`${toBaseUrl(evolutionUrl)}${withLeadingSlash(path)}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionApiKey,
        Authorization: `Bearer ${evolutionApiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
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
  });

const extractProviderMessageId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const directCandidates = ['messageId', 'message_id', 'id'];
  for (const candidate of directCandidates) {
    if (typeof root[candidate] === 'string' && String(root[candidate]).trim()) {
      return String(root[candidate]).trim();
    }
  }

  const keyCandidate = root.key;
  if (keyCandidate && typeof keyCandidate === 'object') {
    const key = keyCandidate as Record<string, unknown>;
    if (typeof key.id === 'string' && key.id.trim()) {
      return key.id.trim();
    }
  }

  return null;
};

const extractInstanceNames = (payload: unknown): string[] => {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).data as unknown[] | undefined)
        || ((payload as Record<string, unknown>).instances as unknown[] | undefined)
        || []
      : [];

  return rows
    .map((row) => (row && typeof row === 'object' ? String((row as Record<string, unknown>).name || '').trim() : ''))
    .filter(Boolean)
    .slice(0, 25);
};

const buildWebhookUrl = (publicBaseUrl: string | undefined, tenantSlug: string): string | null => {
  const base = (publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base) {
    return null;
  }

  return `${base}/api/integrations/evolution/${encodeURIComponent(tenantSlug)}/webhook`;
};

const buildPublicBaseUrl = (requestContext?: { protocol?: string; host?: string }): string | undefined => {
  const envCandidates = [
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.PUBLIC_BASE_URL,
    process.env.BACKEND_PUBLIC_URL,
  ];

  const fromEnv = envCandidates.find((value) => typeof value === 'string' && value.trim());
  if (fromEnv) {
    return fromEnv.trim().replace(/\/+$/, '');
  }

  if (requestContext?.protocol && requestContext?.host) {
    return `${requestContext.protocol}://${requestContext.host}`.replace(/\/+$/, '');
  }

  return undefined;
};

const calculateReadinessScore = (items: EvolutionChecklistItem[]): number => {
  if (items.length === 0) {
    return 0;
  }

  const total = items.reduce((sum, item) => {
    if (item.status === 'ok') return sum + 1;
    if (item.status === 'warn') return sum + 0.55;
    if (item.status === 'pending') return sum + 0.35;
    return sum;
  }, 0);

  return Math.round((total / items.length) * 100);
};

const resolveOverallStatus = (
  configured: boolean,
  issues: string[],
  warnings: string[],
  status: EvolutionInstanceStatus,
): EvolutionIntegrationDiagnostics['overallStatus'] => {
  if (!configured) {
    return 'missing';
  }

  if (issues.length > 0) {
    return 'error';
  }

  if (warnings.length > 0 || !status.connected) {
    return 'attention';
  }

  return 'ready';
};

const buildChecklist = (params: {
  configured: boolean;
  secureUrl: boolean;
  allowHttpLocal: boolean;
  apiReachable: boolean;
  instanceFound: boolean;
  connected: boolean;
  hasWebhookSecret: boolean;
  sendPathResolved: string;
  sendUrlPreview: string | null;
}): EvolutionChecklistItem[] => {
  const {
    configured,
    secureUrl,
    allowHttpLocal,
    apiReachable,
    instanceFound,
    connected,
    hasWebhookSecret,
    sendPathResolved,
    sendUrlPreview,
  } = params;

  return [
    {
      id: 'credentials',
      label: 'Credenciais',
      status: configured ? 'ok' : 'error',
      detail: configured ? 'URL, API Key e instancia foram informadas.' : 'Faltam campos obrigatorios para a Evolution.',
    },
    {
      id: 'transport',
      label: 'Transporte',
      status: secureUrl || allowHttpLocal ? 'ok' : 'warn',
      detail: secureUrl || allowHttpLocal
        ? 'Base URL pronta para trafego do canal.'
        : 'A URL usa HTTP publico. O recomendado e HTTPS.',
    },
    {
      id: 'reachability',
      label: 'Alcance da API',
      status: apiReachable ? 'ok' : configured ? 'error' : 'pending',
      detail: apiReachable
        ? 'A Evolution respondeu aos testes de inventario.'
        : configured
          ? 'Nao foi possivel consultar a Evolution.'
          : 'A consulta sera liberada depois de salvar as credenciais.',
    },
    {
      id: 'instance',
      label: 'Instancia',
      status: instanceFound ? 'ok' : apiReachable ? 'error' : 'pending',
      detail: instanceFound
        ? 'A instancia configurada foi localizada na conta.'
        : apiReachable
          ? 'A Evolution respondeu, mas a instancia ainda nao foi encontrada.'
          : 'A validacao da instancia depende da comunicacao com a API.',
    },
    {
      id: 'connection',
      label: 'Conexao do numero',
      status: connected ? 'ok' : instanceFound ? 'warn' : 'pending',
      detail: connected
        ? 'A instancia esta aberta e pronta para enviar.'
        : instanceFound
          ? 'A instancia existe, mas ainda nao esta conectada.'
          : 'Conecte a instancia depois de confirmar as credenciais.',
    },
    {
      id: 'send_path',
      label: 'Rota de envio',
      status: sendUrlPreview ? 'ok' : 'error',
      detail: sendUrlPreview
        ? `Path resolvido: ${sendPathResolved}`
        : 'Nao foi possivel compor a rota final de envio.',
    },
    {
      id: 'webhook',
      label: 'Webhook',
      status: hasWebhookSecret ? 'ok' : 'pending',
      detail: hasWebhookSecret
        ? 'Webhook secret ja preparado para uso de callbacks.'
        : 'Opcional por enquanto. Recomendado para cenarios com webhook.',
    },
  ];
};

const buildDiagnostics = async (
  tenantSlug?: string,
  settingsOverride?: Record<string, unknown>,
  options?: { publicBaseUrl?: string },
): Promise<EvolutionIntegrationDiagnostics> => {
  const checkedAt = new Date().toISOString();
  const targetTenant = normalizeTenantSlug(tenantSlug);
  const storedSettings = await workbenchStore.getSettings(targetTenant);
  const effectiveSettings = settingsOverride
    ? { ...storedSettings, ...settingsOverride }
    : storedSettings;
  const resolvedWrapper: ResolvedEvolutionConfig = {
    tenantSlug: targetTenant,
    settings: effectiveSettings,
    resolved: resolveTenantBridgeConfig(targetTenant, effectiveSettings, 'evolution'),
  };

  const configured = resolvedWrapper.resolved.ok === true;
  const publicBaseUrl = buildPublicBaseUrl({ protocol: undefined, host: undefined }) || options?.publicBaseUrl;
  const webhookUrl = buildWebhookUrl(publicBaseUrl, targetTenant);

  const defaultDiagnostics: EvolutionIntegrationDiagnostics = {
    checkedAt,
    tenantSlug: targetTenant,
    overallStatus: 'missing',
    readinessScore: 0,
    apiReachable: false,
    secureUrl: false,
    sendPathResolved: normalizeSendPath(
      typeof effectiveSettings.evolutionSendPath === 'string' ? effectiveSettings.evolutionSendPath : DEFAULT_EVOLUTION_SEND_PATH,
    ),
    sendUrlPreview: null,
    webhookUrl,
    instanceFound: false,
    availableInstances: [],
    instancesCount: 0,
    checklist: [],
    issues: [],
    warnings: [],
    recommendations: [],
  };

  if (resolvedWrapper.resolved.ok === false) {
    const resolvedError = resolvedWrapper.resolved.error;
    const issues = [resolvedError];
    const checklist = buildChecklist({
      configured: false,
      secureUrl: false,
      allowHttpLocal: false,
      apiReachable: false,
      instanceFound: false,
      connected: false,
      hasWebhookSecret: Boolean(effectiveSettings.evolutionWebhookSecret),
      sendPathResolved: defaultDiagnostics.sendPathResolved,
      sendUrlPreview: null,
    });

    return {
      ...defaultDiagnostics,
      checklist,
      issues,
      recommendations: [
        'Preencha URL, API Key e instancia para habilitar o canal.',
        'Depois de salvar, valide a comunicacao com a Evolution.',
      ],
    };
  }

  const resolvedConfig = resolvedWrapper.resolved.config;
  const evolutionUrl = resolvedConfig.evolutionUrl;
  const secureUrl = isSecureHttpUrl(evolutionUrl);
  const allowHttpLocal = isLocalHttpUrl(evolutionUrl);
  const sendPathResolved = normalizeSendPath(resolvedConfig.evolutionSendPath);
  const sendUrlPreview = buildEvolutionSendUrl(
    resolvedConfig.evolutionUrl,
    resolvedConfig.evolutionInstance,
    resolvedConfig.evolutionSendPath,
  );

  const issues: string[] = [];
  const warnings: string[] = [];
  let apiReachable = false;
  let availableInstances: string[] = [];

  let status: EvolutionInstanceStatus = await getEvolutionInstanceStatus(targetTenant, { includeQr: false });

  try {
    const fetchInstances = await evolutionApiFetch(
      resolvedConfig.evolutionUrl,
      resolvedConfig.evolutionApiKey,
      'GET',
      '/instance/fetchInstances',
    );

    if (fetchInstances.ok) {
      apiReachable = true;
      availableInstances = extractInstanceNames(fetchInstances.payload);
    } else {
      issues.push(`Falha ao consultar instancias (${fetchInstances.status}).`);
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'Falha de rede ao consultar a Evolution.');
  }

  if (!secureUrl && !allowHttpLocal) {
    warnings.push('A URL da Evolution nao usa HTTPS.');
  }

  if (!status.exists) {
    issues.push('A instancia configurada ainda nao existe na conta Evolution.');
  } else if (!status.connected) {
    warnings.push('A instancia existe, mas ainda nao esta conectada.');
  }

  if (!availableInstances.includes(status.instanceName) && apiReachable) {
    warnings.push('A lista de instancias nao retornou o nome configurado.');
  }

  const checklist = buildChecklist({
    configured: true,
    secureUrl,
    allowHttpLocal,
    apiReachable,
    instanceFound: status.exists,
    connected: status.connected,
    hasWebhookSecret: typeof effectiveSettings.evolutionWebhookSecret === 'string' && effectiveSettings.evolutionWebhookSecret.trim().length > 0,
    sendPathResolved,
    sendUrlPreview,
  });

  const recommendations: string[] = [];
  if (!apiReachable) {
    recommendations.push('Valide URL base, firewall e API Key da Evolution.');
  }
  if (status.exists && !status.connected) {
    recommendations.push('Gere o QR e conecte o numero da instancia para liberar disparos reais.');
  }
  if (!status.exists && configured) {
    recommendations.push('Crie a instancia diretamente pelo painel antes de liberar o agente.');
  }
  if (!secureUrl && !allowHttpLocal) {
    recommendations.push('Prefira HTTPS publico para evitar bloqueios e inconsistencias em producao.');
  }
  if (!effectiveSettings.evolutionWebhookSecret) {
    recommendations.push('Cadastre um webhook secret para endurecer callbacks futuros.');
  }

  const readinessScore = calculateReadinessScore(checklist);

  return {
    checkedAt,
    tenantSlug: targetTenant,
    overallStatus: resolveOverallStatus(true, issues, warnings, status),
    readinessScore,
    apiReachable,
    secureUrl: secureUrl || allowHttpLocal,
    sendPathResolved,
    sendUrlPreview,
    webhookUrl,
    instanceFound: status.exists,
    availableInstances,
    instancesCount: availableInstances.length,
    checklist,
    issues,
    warnings,
    recommendations,
  };
};

export const inspectEvolutionIntegration = async (
  tenantSlug?: string,
  settingsOverride?: Record<string, unknown>,
  options?: { publicBaseUrl?: string },
): Promise<EvolutionIntegrationDiagnostics> => buildDiagnostics(tenantSlug, settingsOverride, options);

export const testTenantEvolutionIntegration = async (
  tenantSlug?: string,
  settingsOverride?: Record<string, unknown>,
  options?: { publicBaseUrl?: string },
): Promise<EvolutionIntegrationTestResult> => {
  const diagnostics = await inspectEvolutionIntegration(tenantSlug, settingsOverride, options);
  const error = diagnostics.issues[0] || (diagnostics.instanceFound ? null : 'A Evolution respondeu, mas a instancia configurada ainda nao foi encontrada.');

  return {
    ok: diagnostics.apiReachable && diagnostics.instanceFound,
    reachable: diagnostics.apiReachable,
    instanceFound: diagnostics.instanceFound,
    instancesCount: diagnostics.instancesCount,
    error,
    diagnostics,
  };
};

const resolveEffectiveEvolutionConfig = async (
  tenantSlug?: string,
  settingsOverride?: Record<string, unknown>,
) => {
  const targetTenant = normalizeTenantSlug(tenantSlug);
  const current = await workbenchStore.getSettings(targetTenant);
  const merged = settingsOverride ? { ...current, ...settingsOverride } : current;
  const resolved = resolveTenantBridgeConfig(targetTenant, merged, 'evolution');

  if (resolved.ok === false) {
    throw new Error(resolved.error);
  }

  return {
    tenantSlug: targetTenant,
    settings: merged,
    config: resolved.config,
  };
};

const buildSendPathCandidates = (configuredPath: string): string[] => {
  const normalized = normalizeSendPath(configuredPath);
  const defaults = [normalized, DEFAULT_EVOLUTION_SEND_PATH];
  return Array.from(new Set(defaults.map((value) => normalizeSendPath(value))));
};

export const sendEvolutionMessageToCustomer = async (
  tenantSlug: string | undefined,
  phone: string,
  text: string,
  settingsOverride?: Record<string, unknown>,
): Promise<string | null> => {
  const { config } = await resolveEffectiveEvolutionConfig(tenantSlug, settingsOverride);

  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    throw new Error('Telefone invalido para envio pela Evolution.');
  }

  const message = (text || '').trim();
  if (!message) {
    throw new Error('Mensagem vazia para envio pela Evolution.');
  }

  const attemptedErrors: string[] = [];
  const sendPathCandidates = buildSendPathCandidates(config.evolutionSendPath);

  for (const sendPath of sendPathCandidates) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await withTimeout(async (signal) => {
          const sendUrl = buildEvolutionSendUrl(config.evolutionUrl, config.evolutionInstance, sendPath);
          return fetch(sendUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: config.evolutionApiKey,
              Authorization: `Bearer ${config.evolutionApiKey}`,
            },
            body: JSON.stringify({
              number: normalizedPhone,
              text: message,
            }),
            signal,
          });
        });

        const rawBody = await response.text();
        let payload: unknown = rawBody;
        try {
          payload = rawBody ? (JSON.parse(rawBody) as unknown) : {};
        } catch {
          payload = rawBody;
        }

        if (!response.ok) {
          attemptedErrors.push(`Path ${sendPath} tentativa ${attempt}: ${response.status} ${rawBody || 'sem detalhes'}`);

          if (response.status >= 500 && attempt < 2) {
            continue;
          }

          if (response.status === 404 || response.status === 405) {
            break;
          }

          throw new Error(`Falha no envio via Evolution (${response.status}): ${rawBody || 'sem detalhes'}`);
        }

        return extractProviderMessageId(payload);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        attemptedErrors.push(`Path ${sendPath} tentativa ${attempt}: ${messageText}`);
        if (attempt >= 2) {
          break;
        }
      }
    }
  }

  throw new Error(attemptedErrors[attemptedErrors.length - 1] || 'Falha no envio pela Evolution.');
};

export const sendEvolutionTestMessage = async (
  tenantSlug: string | undefined,
  phone: string,
  text: string,
  settingsOverride?: Record<string, unknown>,
  options?: { publicBaseUrl?: string },
): Promise<EvolutionTestMessageResult> => {
  const diagnostics = await inspectEvolutionIntegration(tenantSlug, settingsOverride, options);
  const normalizedPhone = normalizeWhatsappPhone(phone);

  if (!normalizedPhone) {
    throw new Error('Informe um telefone valido para o teste de envio.');
  }

  const providerMessageId = await sendEvolutionMessageToCustomer(tenantSlug, normalizedPhone, text, settingsOverride);

  return {
    ok: true,
    normalizedPhone,
    providerMessageId,
    sentAt: new Date().toISOString(),
    diagnostics,
  };
};
