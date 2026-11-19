import crypto from 'crypto';
import { Router } from 'express';

import {
  workbenchStore,
  type WorkbenchEntity,
  type ClientStatus,
  type ClientFocusFilter,
  type ClientSortMode,
} from '../db/workbenchStore';
import { bookingStore } from '../db/bookingStore';
import { checkSupabaseReadiness } from '../db/supabaseReadiness';
import { createRateLimit } from '../middleware/rateLimit';
import { deleteCalendarEventById } from '../services/calendarService';
import {
  CLIENT_AGENT_EVENTS_KEY,
  CLIENT_AGENT_RULES_KEY,
  runClientAgentRuleForTenant,
  sanitizeClientAgentEvents,
  sanitizeClientAgentRules,
} from '../services/clientAgentService';
import {
  inspectEvolutionIntegration,
  sendEvolutionTestMessage,
  testTenantEvolutionIntegration,
} from '../services/evolutionIntegrationService';
import { getEvolutionInstanceStatus } from '../services/evolutionInstanceService';
import type { BookingRecord } from '../types';
import { getTodayDate, parseId } from '../utils/helpers';
import { isValidIsoDate } from '../db/workbench/dashboardHelpers';
import type { DashboardFinanceGroupBy, DashboardFinanceStatusFilter } from '../db/workbench/workbenchTypes';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}$/;
const BASIC_PLATFORM_SETTINGS_KEYS = [
  'companyName',
  'companyPhone',
  'timezone',
  'cancelPolicy',
  'whatsappOpenTime',
  'whatsappCloseTime',
  'masterPasswordUpdatedAt',
  'serviceCatalogManaged',
] as const;

const MASTER_PASSWORD_MIN_LENGTH = 4;
const EVOLUTION_DEFAULT_SEND_PATH = '/message/sendText/{instance}';

const masterPasswordRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 5,
  message: 'Muitas tentativas de validacao de senha master. Aguarde 1 minuto.',
  keyPrefix: 'master-password',
});

const safeEqualString = (left: string, right: string): boolean => {
  const leftBuf = Buffer.from(left, 'utf8');
  const rightBuf = Buffer.from(right, 'utf8');
  if (leftBuf.length !== rightBuf.length || leftBuf.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
};

const pickBasicPlatformSettings = (value: Record<string, unknown>): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const key of BASIC_PLATFORM_SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      picked[key] = value[key];
    }
  }

  return picked;
};

const maskSecret = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}••••`;
  }

  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
};

const normalizeUrlSetting = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
};

const pickEvolutionIntegrationSettings = (settings: Record<string, unknown>) => {
  const evolutionUrl = (typeof settings.evolutionUrl === 'string' && settings.evolutionUrl.trim())
    ? settings.evolutionUrl.trim()
    : (process.env.EVOLUTION_URL || '').trim();
  const evolutionApiKey = (typeof settings.evolutionApiKey === 'string' && settings.evolutionApiKey.trim())
    ? settings.evolutionApiKey.trim()
    : (process.env.EVOLUTION_API_KEY || '').trim();
  const evolutionInstance = (typeof settings.evolutionInstance === 'string' && settings.evolutionInstance.trim())
    ? settings.evolutionInstance.trim()
    : (process.env.EVOLUTION_INSTANCE || '').trim();
  const evolutionSendPath = typeof settings.evolutionSendPath === 'string' && settings.evolutionSendPath.trim()
    ? settings.evolutionSendPath.trim()
    : EVOLUTION_DEFAULT_SEND_PATH;
  const evolutionWebhookSecret = (typeof settings.evolutionWebhookSecret === 'string' && settings.evolutionWebhookSecret.trim())
    ? settings.evolutionWebhookSecret.trim()
    : (process.env.EVOLUTION_WEBHOOK_SECRET || '').trim();

  return {
    provider: 'evolution' as const,
    configured: Boolean(evolutionUrl && evolutionApiKey && evolutionInstance),
    evolutionUrl,
    evolutionInstance,
    evolutionSendPath,
    hasApiKey: Boolean(evolutionApiKey),
    apiKeyPreview: maskSecret(evolutionApiKey),
    hasWebhookSecret: Boolean(evolutionWebhookSecret),
    webhookSecretPreview: maskSecret(evolutionWebhookSecret),
  };
};

const isWorkbenchUnavailable = (error: unknown): boolean =>
  error instanceof Error && error.message.toLowerCase().includes('modulo workbench indisponivel');

const deleteCalendarEventsForBookings = async (bookings: BookingRecord[]): Promise<number> => {
  let removed = 0;

  for (const booking of bookings) {
    if (!booking.googleEventId) {
      continue;
    }

    try {
      await deleteCalendarEventById(booking.googleEventId);
      removed += 1;
    } catch (error) {
      console.error('Falha ao remover evento do Google Calendar durante limpeza em massa:', error);
    }
  }

  return removed;
};

const parseTenantFromQuery = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!TENANT_SLUG_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
};

const getHeaderValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first.split(',')[0]?.trim() || undefined : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.split(',')[0]?.trim();
  return normalized || undefined;
};

const resolveRequestPublicBaseUrl = (req: {
  protocol?: string;
  get?: (name: string) => string | undefined;
  headers?: Record<string, unknown>;
}): string | undefined => {
  const forwardedProto = req.get?.('x-forwarded-proto') || getHeaderValue(req.headers?.['x-forwarded-proto']);
  const forwardedHost = req.get?.('x-forwarded-host') || getHeaderValue(req.headers?.['x-forwarded-host']);
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get?.('host') || getHeaderValue(req.headers?.host);
  if (!protocol || !host) {
    return undefined;
  }

  return `${protocol}://${host}`;
};

const getPayloadString = (payload: Record<string, unknown>, key: string): string =>
  typeof payload[key] === 'string' ? payload[key].trim() : '';

const getRequestFallbackMasterPassword = (_req: { headers: Record<string, unknown> }): string => {
  return process.env.ADMIN_MASTER_PASSWORD || process.env.WHATSAPP_MASTER_PASSWORD || '';
};

const resolveMasterPassword = (settings: Record<string, unknown>, fallbackPassword: string): string => {
  const configured = typeof settings.masterPassword === 'string' ? settings.masterPassword.trim() : '';
  return configured || fallbackPassword;
};

const ENTITIES: WorkbenchEntity[] = [
  'availability',
  'clients',
  'leads',
  'services',
  'professionals',
  'finance',
  'reviews',
  'tasks',
  'automations',
];

const SENSITIVE_DELETE_ENTITIES = new Set<WorkbenchEntity>([
  'availability',
  'clients',
  'professionals',
  'services',
]);

const isValidEntity = (value: string): value is WorkbenchEntity => ENTITIES.includes(value as WorkbenchEntity);

export const adminWorkbenchRoutes = Router();

const ensureKnownTenant = async (rawTenant: unknown): Promise<{ ok: true; tenant: string | null } | { ok: false; status: number; error: string }> => {
  if (rawTenant === undefined || rawTenant === null || String(rawTenant).trim() === '') {
    return { ok: true, tenant: null };
  }
  const parsed = parseTenantFromQuery(rawTenant);
  if (!parsed) {
    return { ok: false, status: 400, error: 'Slug de tenant invalido.' };
  }

  try {
    const tenants = await workbenchStore.listTenants();
    if (!tenants.some((item) => item.slug === parsed && item.active)) {
      return { ok: false, status: 403, error: 'Estabelecimento não autorizado ou inativo.' };
    }
  } catch (error) {
    if (!isWorkbenchUnavailable(error)) {
      throw error;
    }
  }

  return { ok: true, tenant: parsed };
};

adminWorkbenchRoutes.get('/overview', async (req, res) => {
  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch((err) => {
    console.error('Erro ao validar tenant em overview:', err);
    return { ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' };
  });
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  const scope = req.query.scope === 'all' ? 'all' : 'range';
  const rawStartDate = typeof req.query.date === 'string'
    ? req.query.date.trim()
    : typeof req.query.startDate === 'string'
      ? req.query.startDate.trim()
      : '';
  if (scope === 'range' && rawStartDate && (!DATE_REGEX.test(rawStartDate) || !isValidIsoDate(rawStartDate))) {
    return res.status(400).json({ error: 'Data inicial invalida. Use YYYY-MM-DD.' });
  }

  const rawEndDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';
  if (scope === 'range' && rawEndDate && (!DATE_REGEX.test(rawEndDate) || !isValidIsoDate(rawEndDate))) {
    return res.status(400).json({ error: 'Data final invalida. Use YYYY-MM-DD.' });
  }

  const startDate = rawStartDate || getTodayDate();
  const endDate = rawEndDate || startDate;
  if (scope === 'range' && startDate > endDate) {
    return res.status(400).json({ error: 'A data inicial nao pode ser maior que a data final.' });
  }

  try {
    const overview = await workbenchStore.getOverview(
      scope === 'all'
        ? { tenantSlug: tenantCheck.tenant || undefined }
        : {
            startDate,
            endDate,
            tenantSlug: tenantCheck.tenant || undefined,
          },
    );
    return res.json(overview);
  } catch (error) {
    console.error('Erro ao carregar overview do workbench:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao carregar overview.' });
  }
});

adminWorkbenchRoutes.get('/supabase/status', async (req, res) => {
  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch((err) => {
    console.error('Erro ao validar tenant em supabase/status:', err);
    return { ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' };
  });
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  try {
    const report = workbenchStore.isEnabled()
      ? await workbenchStore.checkSupabaseHealth(tenantCheck.tenant || undefined)
      : await checkSupabaseReadiness(null, tenantCheck.tenant || undefined);
    return res.json(report);
  } catch (error) {
    console.error('Erro ao verificar status do Supabase:', error);
    return res.status(500).json({ error: 'Erro ao diagnosticar vínculo com Supabase.' });
  }
});

adminWorkbenchRoutes.get('/dashboard/finance', async (req, res) => {
  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch((err) => {
    console.error('Erro ao validar tenant em dashboard/finance:', err);
    return { ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' };
  });
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  const scope = req.query.scope === 'all' ? 'all' : 'range';
  const rawStartDate = typeof req.query.date === 'string'
    ? req.query.date.trim()
    : typeof req.query.startDate === 'string'
      ? req.query.startDate.trim()
      : '';
  if (scope === 'range' && rawStartDate && (!DATE_REGEX.test(rawStartDate) || !isValidIsoDate(rawStartDate))) {
    return res.status(400).json({ error: 'Data inicial invalida. Use YYYY-MM-DD.' });
  }

  const rawEndDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';
  if (scope === 'range' && rawEndDate && (!DATE_REGEX.test(rawEndDate) || !isValidIsoDate(rawEndDate))) {
    return res.status(400).json({ error: 'Data final invalida. Use YYYY-MM-DD.' });
  }

  const startDate = scope === 'range' ? (rawStartDate || getTodayDate()) : null;
  const endDate = scope === 'range' ? (rawEndDate || startDate) : null;
  if (scope === 'range' && startDate && endDate && startDate > endDate) {
    return res.status(400).json({ error: 'A data inicial nao pode ser maior que a data final.' });
  }

  const rawGroupBy = typeof req.query.groupBy === 'string' ? req.query.groupBy.trim().toLowerCase() : 'auto';
  const validGroupBy = new Set(['auto', 'day', 'week', 'month']);
  if (!validGroupBy.has(rawGroupBy)) {
    return res.status(400).json({ error: 'Agrupamento invalido. Use auto, day, week ou month.' });
  }

  const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
  if (!Number.isFinite(rawPage) || rawPage < 1 || rawPage > 10_000) {
    return res.status(400).json({ error: 'Parametro page invalido.' });
  }

  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 10;
  if (!Number.isFinite(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    return res.status(400).json({ error: 'Parametro limit deve estar entre 1 e 50.' });
  }

  const rawEntryStatus = typeof req.query.entryStatus === 'string' ? req.query.entryStatus.trim().toLowerCase() : 'all';
  const validEntryStatuses = new Set(['all', 'pago', 'pendente']);
  if (!validEntryStatuses.has(rawEntryStatus)) {
    return res.status(400).json({ error: 'Parametro entryStatus invalido. Use all, pago ou pendente.' });
  }

  const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';

  try {
    const financeData = await workbenchStore.getDashboardFinance({
      scope,
      startDate,
      endDate,
      groupBy: rawGroupBy as DashboardFinanceGroupBy | 'auto',
      tenantSlug: tenantCheck.tenant || undefined,
      entryStatus: rawEntryStatus as DashboardFinanceStatusFilter,
      search: rawSearch,
      page: Math.trunc(rawPage),
      limit: Math.trunc(rawLimit),
    });
    return res.json(financeData);
  } catch (error) {
    console.error('Erro ao carregar painel financeiro da dashboard:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao carregar dados financeiros da dashboard.' });
  }
});

adminWorkbenchRoutes.get('/settings', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  try {
    const settings = await workbenchStore.getSettings(tenant || undefined);
    return res.json({ settings: pickBasicPlatformSettings(settings) });
  } catch (error) {
    console.error('Erro ao carregar settings:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
});

adminWorkbenchRoutes.post('/settings/master-password/verify', masterPasswordRateLimit, async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload invalido para validar senha master.' });
  }

  const password = getPayloadString(payload, 'password');
  if (!password) {
    return res.status(400).json({ error: 'Informe a senha master.' });
  }

  try {
    const settings = await workbenchStore.getSettings(tenant || undefined);
    const expectedMaster = resolveMasterPassword(settings, getRequestFallbackMasterPassword(req));
    return res.json({ ok: Boolean(expectedMaster) && safeEqualString(password, expectedMaster) });
  } catch (error) {
    console.error('Erro ao validar senha master:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao validar senha master.' });
  }
});

adminWorkbenchRoutes.put('/settings/master-password', masterPasswordRateLimit, async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload invalido para redefinir senha master.' });
  }

  const currentPassword = getPayloadString(payload, 'currentPassword');
  const newPassword = getPayloadString(payload, 'newPassword');

  if (!currentPassword) {
    return res.status(400).json({ error: 'Informe a senha master atual.' });
  }

  if (newPassword.length < MASTER_PASSWORD_MIN_LENGTH) {
    return res.status(400).json({ error: `A nova senha master deve ter pelo menos ${MASTER_PASSWORD_MIN_LENGTH} caracteres.` });
  }

  try {
    const current = await workbenchStore.getSettings(tenant || undefined);
    const expectedMaster = resolveMasterPassword(current, getRequestFallbackMasterPassword(req));
    if (!expectedMaster) {
      return res.status(500).json({ error: 'Senha master não configurada. Defina ADMIN_MASTER_PASSWORD no servidor.' });
    }
    if (!safeEqualString(currentPassword, expectedMaster)) {
      return res.status(403).json({ error: 'Senha master atual invalida.' });
    }

    const saved = await workbenchStore.saveSettings(
      {
        ...current,
        masterPassword: newPassword,
        masterPasswordUpdatedAt: new Date().toISOString(),
      },
      tenant || undefined,
    );

    return res.json({ ok: true, settings: pickBasicPlatformSettings(saved) });
  } catch (error) {
    console.error('Erro ao redefinir senha master:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao redefinir senha master.' });
  }
});

adminWorkbenchRoutes.put('/settings', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido para configurações.' });
  }

  try {
    const current = await workbenchStore.getSettings(tenant || undefined);
    const patch = pickBasicPlatformSettings(payload as Record<string, unknown>);
    const merged: Record<string, unknown> = {
      ...current,
      ...patch,
    };

    const saved = await workbenchStore.saveSettings(merged, tenant || undefined);
    return res.json({ settings: pickBasicPlatformSettings(saved) });
  } catch (error) {
    console.error('Erro ao salvar settings:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

adminWorkbenchRoutes.get('/settings/integrations/evolution', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  try {
    const settings = await workbenchStore.getSettings(tenant || undefined).catch(() => ({} as Record<string, unknown>));
    const status = await getEvolutionInstanceStatus(tenant || undefined, { includeQr: false });
    const effectiveSettings = status.exists && status.instanceName
      ? { ...settings, evolutionInstance: status.instanceName }
      : settings;
    const diagnostics = await inspectEvolutionIntegration(
      tenant || undefined,
      effectiveSettings,
      { publicBaseUrl: resolveRequestPublicBaseUrl(req) },
    );
    return res.json({
      integration: pickEvolutionIntegrationSettings(effectiveSettings),
      status,
      diagnostics,
    });
  } catch (error) {
    console.error('Erro ao carregar integracao Evolution:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao carregar integracao Evolution.' });
  }
});

adminWorkbenchRoutes.put('/settings/integrations/evolution', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload invalido para integracao Evolution.' });
  }

  try {
    const current = await workbenchStore.getSettings(tenant || undefined);
    const evolutionUrl = normalizeUrlSetting(getPayloadString(payload, 'evolutionUrl'));
    const evolutionInstance = getPayloadString(payload, 'evolutionInstance');
    const evolutionSendPath = getPayloadString(payload, 'evolutionSendPath') || EVOLUTION_DEFAULT_SEND_PATH;
    const nextApiKey = getPayloadString(payload, 'evolutionApiKey');
    const nextWebhookSecret = getPayloadString(payload, 'evolutionWebhookSecret');
    const clearApiKey = payload.clearApiKey === true;
    const clearWebhookSecret = payload.clearWebhookSecret === true;

    const currentApiKey = typeof current.evolutionApiKey === 'string' ? current.evolutionApiKey.trim() : '';
    const currentWebhookSecret = typeof current.evolutionWebhookSecret === 'string' ? current.evolutionWebhookSecret.trim() : '';

    const evolutionApiKey = clearApiKey ? '' : nextApiKey || currentApiKey;
    const evolutionWebhookSecret = clearWebhookSecret ? '' : nextWebhookSecret || currentWebhookSecret;

    if (!evolutionUrl) {
      return res.status(400).json({ error: 'Informe uma URL valida da Evolution.' });
    }

    if (!evolutionInstance) {
      return res.status(400).json({ error: 'Informe o nome da instancia na Evolution.' });
    }

    if (!evolutionApiKey) {
      return res.status(400).json({ error: 'Informe a API Key da Evolution.' });
    }

    const merged: Record<string, unknown> = {
      ...current,
      whatsappProvider: 'evolution',
      evolutionUrl,
      evolutionApiKey,
      evolutionInstance,
      evolutionSendPath,
      evolutionWebhookSecret,
    };

    const saved = await workbenchStore.saveSettings(merged, tenant || undefined);
    const status = await getEvolutionInstanceStatus(tenant || undefined, { includeQr: false });
    const effectiveSettings = status.exists && status.instanceName
      ? { ...saved, evolutionInstance: status.instanceName }
      : saved;
    const diagnostics = await inspectEvolutionIntegration(
      tenant || undefined,
      effectiveSettings,
      { publicBaseUrl: resolveRequestPublicBaseUrl(req) },
    );
    return res.json({
      integration: pickEvolutionIntegrationSettings(effectiveSettings),
      status,
      diagnostics,
    });
  } catch (error) {
    console.error('Erro ao salvar integracao Evolution:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao salvar integracao Evolution.' });
  }
});

adminWorkbenchRoutes.post('/settings/integrations/evolution/test', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const current = await workbenchStore.getSettings(tenant || undefined).catch(() => ({} as Record<string, unknown>));

    const testSettings: Record<string, unknown> = {
      ...current,
      evolutionUrl: normalizeUrlSetting(getPayloadString(payload, 'evolutionUrl')) || current.evolutionUrl,
      evolutionInstance: getPayloadString(payload, 'evolutionInstance') || current.evolutionInstance,
      evolutionSendPath: getPayloadString(payload, 'evolutionSendPath') || current.evolutionSendPath || EVOLUTION_DEFAULT_SEND_PATH,
      evolutionApiKey: getPayloadString(payload, 'evolutionApiKey') || current.evolutionApiKey,
      evolutionWebhookSecret: getPayloadString(payload, 'evolutionWebhookSecret') || current.evolutionWebhookSecret,
    };

    const result = await testTenantEvolutionIntegration(
      tenant || undefined,
      testSettings,
      { publicBaseUrl: resolveRequestPublicBaseUrl(req) },
    );
    return res.json({ result });
  } catch (error) {
    console.error('Erro ao testar integracao Evolution:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao testar integracao Evolution.' });
  }
});

adminWorkbenchRoutes.post('/settings/integrations/evolution/test-message', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload invalido para o teste de envio.' });
  }

  const phone = getPayloadString(payload, 'phone');
  const text = getPayloadString(payload, 'text');
  const settingsPayload = payload.settings && typeof payload.settings === 'object'
    ? (payload.settings as Record<string, unknown>)
    : {};

  if (!phone) {
    return res.status(400).json({ error: 'Informe o telefone de teste.' });
  }

  if (!text) {
    return res.status(400).json({ error: 'Informe a mensagem de teste.' });
  }

  try {
    const current = await workbenchStore.getSettings(tenant || undefined).catch(() => ({} as Record<string, unknown>));
    const settingsOverride: Record<string, unknown> = {
      ...current,
      evolutionUrl: normalizeUrlSetting(getPayloadString(settingsPayload, 'evolutionUrl')) || current.evolutionUrl,
      evolutionInstance: getPayloadString(settingsPayload, 'evolutionInstance') || current.evolutionInstance,
      evolutionSendPath: getPayloadString(settingsPayload, 'evolutionSendPath') || current.evolutionSendPath || EVOLUTION_DEFAULT_SEND_PATH,
      evolutionApiKey: getPayloadString(settingsPayload, 'evolutionApiKey') || current.evolutionApiKey,
      evolutionWebhookSecret: getPayloadString(settingsPayload, 'evolutionWebhookSecret') || current.evolutionWebhookSecret,
    };

    const result = await sendEvolutionTestMessage(
      tenant || undefined,
      phone,
      text,
      settingsOverride,
      { publicBaseUrl: resolveRequestPublicBaseUrl(req) },
    );

    return res.json({ result });
  } catch (error) {
    console.error('Erro ao enviar mensagem de teste pela Evolution:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }

    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao enviar mensagem de teste.' });
  }
});

adminWorkbenchRoutes.get('/client-agents', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  try {
    const settings = await workbenchStore.getSettings(tenant || undefined);
    const rules = sanitizeClientAgentRules(settings[CLIENT_AGENT_RULES_KEY]);
    const events = sanitizeClientAgentEvents(settings[CLIENT_AGENT_EVENTS_KEY]);
    return res.json({ rules, events });
  } catch (error) {
    console.error('Erro ao carregar estado do agente de clientes:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao carregar estado do agente de clientes.' });
  }
});

adminWorkbenchRoutes.put('/client-agents', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload invalido para o agente de clientes.' });
  }

  const nextRules = sanitizeClientAgentRules(payload.rules);
  const nextEvents = sanitizeClientAgentEvents(payload.events);

  try {
    const current = await workbenchStore.getSettings(tenant || undefined);
    const merged: Record<string, unknown> = {
      ...current,
      [CLIENT_AGENT_RULES_KEY]: nextRules,
      [CLIENT_AGENT_EVENTS_KEY]: nextEvents,
    };

    const saved = await workbenchStore.saveSettings(merged, tenant || undefined);
    return res.json({
      rules: sanitizeClientAgentRules(saved[CLIENT_AGENT_RULES_KEY]),
      events: sanitizeClientAgentEvents(saved[CLIENT_AGENT_EVENTS_KEY]),
    });
  } catch (error) {
    console.error('Erro ao salvar estado do agente de clientes:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao salvar estado do agente de clientes.' });
  }
});

adminWorkbenchRoutes.post('/client-agents/:ruleId/run', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const ruleId = typeof req.params.ruleId === 'string' ? req.params.ruleId.trim() : '';
  if (!ruleId) {
    return res.status(400).json({ error: 'Informe a regra que deve ser executada.' });
  }

  try {
    const result = await runClientAgentRuleForTenant(ruleId, tenant || undefined, { executeNow: true });
    return res.json(result);
  } catch (error) {
    console.error('Erro ao executar regra do agente de clientes:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao executar regra do agente de clientes.' });
  }
});

adminWorkbenchRoutes.get('/tenants', async (_req, res) => {
  try {
    const tenants = await workbenchStore.listTenants();
    return res.json({ tenants });
  } catch (error) {
    console.error('Erro ao listar tenants:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao listar empresas.' });
  }
});

adminWorkbenchRoutes.post('/tenants', async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido para tenant.' });
  }

  const slug = typeof payload.slug === 'string' ? payload.slug : '';
  const name = typeof payload.name === 'string' ? payload.name : '';
  const active = typeof payload.active === 'boolean' ? payload.active : true;

  if (!TENANT_SLUG_REGEX.test(slug.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Slug inválido. Use letras minúsculas, números e hífen.' });
  }

  if (!name.trim()) {
    return res.status(400).json({ error: 'Nome da empresa é obrigatório.' });
  }

  try {
    const tenant = await workbenchStore.createTenant({ slug, name, active });
    return res.status(201).json({ tenant });
  } catch (error) {
    console.error('Erro ao criar tenant:', error);
    const message = error instanceof Error ? error.message : 'Erro ao criar empresa.';
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
});

adminWorkbenchRoutes.patch('/tenants/:slug', async (req, res) => {
  const slug = req.params.slug?.trim().toLowerCase();
  if (!slug || !TENANT_SLUG_REGEX.test(slug)) {
    return res.status(400).json({ error: 'Slug inválido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido para tenant.' });
  }

  try {
    const tenant = await workbenchStore.updateTenant(slug, {
      name: typeof payload.name === 'string' ? payload.name : undefined,
      active: typeof payload.active === 'boolean' ? payload.active : undefined,
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    return res.json({ tenant });
  } catch (error) {
    console.error('Erro ao atualizar tenant:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao atualizar empresa.' });
  }
});

adminWorkbenchRoutes.post('/leads/:id/convert', async (req, res) => {
  const leadId = parseId(req.params.id);
  if (!leadId) {
    return res.status(400).json({ error: 'ID de lead inválido.' });
  }

  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch(() => ({ ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' }));
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  try {
    const result = await workbenchStore.convertLeadToClient(leadId, tenantCheck.tenant || undefined);
    return res.json({
      message: 'Lead convertido em cliente com sucesso.',
      lead: result.lead,
      client: result.client,
    });
  } catch (error) {
    console.error('Erro ao converter lead:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao converter lead em cliente.' });
  }
});

adminWorkbenchRoutes.post('/finance/:id/pay', async (req, res) => {
  const financeId = parseId(req.params.id);
  if (!financeId) {
    return res.status(400).json({ error: 'ID financeiro inválido.' });
  }

  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch(() => ({ ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' }));
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  const paymentMethod = typeof req.body?.payment_method === 'string' ? req.body.payment_method.trim() : undefined;

  try {
    const entry = await workbenchStore.markFinancePaid(financeId, paymentMethod, tenantCheck.tenant || undefined);
    return res.json({ message: 'Pagamento marcado como pago.', entry });
  } catch (error) {
    console.error('Erro ao marcar pagamento:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao marcar pagamento.' });
  }
});

adminWorkbenchRoutes.get('/clients/workspace', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);
  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const mode = req.query.mode === 'directory' ? 'directory' : 'kanban';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const statusRaw = typeof req.query.status === 'string' ? req.query.status.trim() : 'todos';
  const focusRaw = typeof req.query.focus === 'string' ? req.query.focus.trim() : 'todos';
  const sortRaw = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'proximo-aviso';
  const columnLimit = typeof req.query.columnLimit === 'string' ? Number(req.query.columnLimit) : 20;
  const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;

  let columnLimits: Partial<Record<ClientStatus, number>> | undefined;
  if (typeof req.query.columnLimits === 'string' && req.query.columnLimits.trim()) {
    try {
      const parsed = JSON.parse(req.query.columnLimits);
      if (parsed && typeof parsed === 'object') {
        columnLimits = parsed as Partial<Record<ClientStatus, number>>;
      }
    } catch {
      // ignore invalid JSON
    }
  }

  try {
    if (req.query.refresh === '1') {
      workbenchStore.invalidateClientsWorkspaceCache();
    }
    const workspace = await workbenchStore.getClientsWorkspace({
      tenantSlug: tenant || undefined,
      mode,
      search,
      status: statusRaw as 'todos' | ClientStatus,
      focus: focusRaw as ClientFocusFilter,
      sort: sortRaw as ClientSortMode,
      columnLimit: Number.isFinite(columnLimit) ? columnLimit : 20,
      columnLimits,
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 20,
    });
    return res.json(workspace);
  } catch (error) {
    console.error('Erro ao carregar workspace de clientes:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao carregar carteira de clientes.' });
  }
});

adminWorkbenchRoutes.get('/clients/by-phone/:phone', async (req, res) => {
  const phone = req.params.phone?.trim();
  if (!phone) {
    return res.status(400).json({ error: 'Telefone é obrigatório.' });
  }

  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch(() => ({ ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' }));
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  try {
    const client = await workbenchStore.findClientByPhone(phone, tenantCheck.tenant || undefined);
    return res.json({ client });
  } catch (error) {
    console.error('Erro ao buscar cliente por telefone:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao buscar cliente.' });
  }
});

adminWorkbenchRoutes.post('/finance/reset', async (req, res) => {
  const rawDate = typeof req.body?.date === 'string' ? req.body.date.trim() : '';
  if (rawDate && (!DATE_REGEX.test(rawDate) || !isValidIsoDate(rawDate))) {
    return res.status(400).json({ error: 'Data invalida para zerar financeiro. Use YYYY-MM-DD.' });
  }
  const date = rawDate || undefined;

  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch((err) => {
    console.error('Erro ao validar tenant em finance/reset:', err);
    return { ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' };
  });
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }
  const tenant = tenantCheck.tenant;

  try {
    const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
    const masterPassword = getPayloadString(payload, 'masterPassword');

    if (!masterPassword) {
      return res.status(400).json({ error: 'Informe a senha master.' });
    }

    const settings = await workbenchStore.getSettings(tenant || undefined);
    const expectedMaster = resolveMasterPassword(settings, getRequestFallbackMasterPassword(req));
    if (!expectedMaster) {
      return res.status(500).json({ error: 'Senha master não configurada. Defina ADMIN_MASTER_PASSWORD no servidor.' });
    }
    if (!safeEqualString(masterPassword, expectedMaster)) {
      return res.status(403).json({ error: 'Senha master invalida.' });
    }

    const deleted = await workbenchStore.resetFinance(date, tenant || undefined);
    let bookingsReset = 0;
    if (!date) {
      bookingsReset = await bookingStore.resetAllPaymentStatuses(tenant || undefined);
    }
    return res.json({
      message: `${deleted} lançamento(s) financeiro(s) removido(s).`,
      deleted,
      bookingsReset,
      scope: date ? 'date' : 'all',
      date: date || null,
    });
  } catch (error) {
    console.error('Erro ao zerar financeiro:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao zerar financeiro.' });
  }
});

adminWorkbenchRoutes.post('/history/reset', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
    const masterPassword = getPayloadString(payload, 'masterPassword');

    if (!masterPassword) {
      return res.status(400).json({ error: 'Informe a senha master.' });
    }

    const settings = await workbenchStore.getSettings(tenant || undefined);
    const expectedMaster = resolveMasterPassword(settings, getRequestFallbackMasterPassword(req));
    if (!expectedMaster) {
      return res.status(500).json({ error: 'Senha master não configurada. Defina ADMIN_MASTER_PASSWORD no servidor.' });
    }
    if (!safeEqualString(masterPassword, expectedMaster)) {
      return res.status(403).json({ error: 'Senha master invalida.' });
    }

    if (!workbenchStore.isEnabled()) {
      return res.status(503).json({ error: 'Modulo workbench indisponivel para limpar o historico total.' });
    }

    const currentBookings = await bookingStore.listAll();
    const history = await workbenchStore.resetAnalyticsHistory();
    const bookingsDeleted = await bookingStore.resetAll();
    const calendarEventsRemoved = await deleteCalendarEventsForBookings(currentBookings);

    return res.json({
      message: 'Historico total removido com sucesso.',
      deleted: {
        bookings: bookingsDeleted,
        finance: history.finance,
        leads: history.leads,
        reviews: history.reviews,
        tasks: history.tasks,
        calendarEvents: calendarEventsRemoved,
      },
    });
  } catch (error) {
    console.error('Erro ao limpar historico total (workbench):', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao limpar historico total.' });
  }
});

adminWorkbenchRoutes.post('/finance/confirm-booking-payment', async (req, res) => {
  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch(() => ({ ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' }));
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  const bookingId = typeof req.body?.booking_id === 'number' ? req.body.booking_id : null;
  const paymentMethod = typeof req.body?.payment_method === 'string' ? req.body.payment_method.trim() : null;

  if (!bookingId || !paymentMethod) {
    return res.status(400).json({ error: 'booking_id e payment_method são obrigatórios.' });
  }

  const validMethods = ['pix', 'dinheiro', 'debito', 'credito'];
  if (!validMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: `Método inválido. Use: ${validMethods.join(', ')}` });
  }

  try {
    const entry = await workbenchStore.confirmBookingPayment(bookingId, paymentMethod, tenantCheck.tenant || undefined);
    return res.json({ message: 'Pagamento confirmado com sucesso.', entry });
  } catch (error) {
    console.error('Erro ao confirmar pagamento do agendamento:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    const message = error instanceof Error ? error.message : 'Erro ao confirmar pagamento.';
    return res.status(500).json({ error: message });
  }
});

adminWorkbenchRoutes.get('/:entity', async (req, res) => {
  const { entity } = req.params;
  if (!isValidEntity(entity)) {
    return res.status(404).json({ error: 'Entidade não suportada.' });
  }

  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch(() => ({ ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' }));
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  try {
    const rows = await workbenchStore.list(entity, tenantCheck.tenant || undefined);
    return res.json({ rows });
  } catch (error) {
    console.error(`Erro ao listar entidade ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao listar registros.' });
  }
});

adminWorkbenchRoutes.post('/:entity', async (req, res) => {
  const { entity } = req.params;
  if (!isValidEntity(entity)) {
    return res.status(404).json({ error: 'Entidade não suportada.' });
  }

  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch(() => ({ ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' }));
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  try {
    const row = await workbenchStore.create(entity, payload, tenantCheck.tenant || undefined);
    return res.status(201).json({ row });
  } catch (error) {
    console.error(`Erro ao criar registro ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao criar registro.' });
  }
});

adminWorkbenchRoutes.patch('/:entity/:id', async (req, res) => {
  const { entity } = req.params;
  if (!isValidEntity(entity)) {
    return res.status(404).json({ error: 'Entidade não suportada.' });
  }

  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch(() => ({ ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' }));
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  try {
    const row = await workbenchStore.update(entity, id, payload, tenantCheck.tenant || undefined);
    return res.json({ row });
  } catch (error) {
    console.error(`Erro ao atualizar registro ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao atualizar registro.' });
  }
});

adminWorkbenchRoutes.delete('/:entity/:id', async (req, res) => {
  const { entity } = req.params;
  if (!isValidEntity(entity)) {
    return res.status(404).json({ error: 'Entidade não suportada.' });
  }

  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  const tenantCheck = await ensureKnownTenant(req.query.tenant).catch(() => ({ ok: false as const, status: 500, error: 'Erro ao validar estabelecimento.' }));
  if (tenantCheck.ok === false) {
    return res.status(tenantCheck.status).json({ error: tenantCheck.error });
  }
  const tenant = tenantCheck.tenant;

  try {
    if (SENSITIVE_DELETE_ENTITIES.has(entity)) {
      const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
      const masterPassword = getPayloadString(payload, 'masterPassword');

      if (!masterPassword) {
        return res.status(400).json({ error: 'Informe a senha master para concluir a exclusao.' });
      }

      const settings = await workbenchStore.getSettings(tenant || undefined);
      const expectedMaster = resolveMasterPassword(settings, getRequestFallbackMasterPassword(req));
      if (!expectedMaster) {
        return res.status(500).json({ error: 'Senha master não configurada. Defina ADMIN_MASTER_PASSWORD no servidor.' });
      }
      if (!safeEqualString(masterPassword, expectedMaster)) {
        return res.status(403).json({ error: 'Senha master invalida.' });
      }
    }

    await workbenchStore.remove(entity, id, tenant || undefined);
    return res.json({ message: 'Registro removido com sucesso.' });
  } catch (error) {
    console.error(`Erro ao remover registro ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao remover registro.' });
  }
});
