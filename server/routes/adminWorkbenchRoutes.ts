import { Router } from 'express';

import { workbenchStore, type WorkbenchEntity } from '../db/workbenchStore';
import { bookingStore } from '../db/bookingStore';
import { deleteCalendarEventById } from '../services/calendarService';
import { runClientAgentRuleForTenant } from '../services/clientAgentService';
import {
  inspectEvolutionIntegration,
  sendEvolutionTestMessage,
  testTenantEvolutionIntegration,
} from '../services/evolutionIntegrationService';
import { getEvolutionInstanceStatus } from '../services/evolutionInstanceService';
import type { BookingRecord } from '../types';
import { getTodayDate, parseId } from '../utils/helpers';

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
const CLIENT_AGENT_RULES_KEY = 'clientAgentRules';
const CLIENT_AGENT_EVENTS_KEY = 'clientAgentEvents';
const CLIENT_AGENT_MAX_EVENTS = 600;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const ISO_INSTANT_REGEX = /^\d{4}-\d{2}-\d{2}T/;
const CLIENT_AGENT_INTERVAL_UNITS = new Set(['days', 'weeks', 'months']);
const CLIENT_AGENT_CHANNELS = new Set(['whatsapp', 'email', 'manual']);

type ClientAgentIntervalUnit = 'days' | 'weeks' | 'months';
type ClientAgentChannel = 'whatsapp' | 'email' | 'manual';

type ClientAgentRule = {
  id: string;
  clientId: number;
  clientName: string;
  serviceName: string;
  intervalValue: number;
  intervalUnit: ClientAgentIntervalUnit;
  channel: ClientAgentChannel;
  messageTemplate: string;
  enabled: boolean;
  referenceDate: string;
  nextRunDate: string;
  sendAt: string;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt: string | null;
};

type ClientAgentEvent = {
  id: string;
  ruleId: string;
  clientId: number;
  clientName: string;
  serviceName: string;
  channel: ClientAgentChannel;
  scheduledFor: string;
  messagePreview: string;
  createdAt: string;
  taskId: number | null;
  status: 'queued' | 'sent' | 'failed' | 'skipped' | 'canceled';
  reason: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
};

const normalizeIsoDate = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return ISO_DATE_REGEX.test(normalized) ? normalized : fallback;
};

const normalizeIsoInstant = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return ISO_INSTANT_REGEX.test(normalized) ? normalized : fallback;
};

const normalizeLocalDateTime = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return LOCAL_DATETIME_REGEX.test(normalized) ? normalized : fallback;
};

const sanitizeClientAgentRules = (value: unknown): ClientAgentRule[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const nowIso = new Date().toISOString();
  const today = getTodayDate();
  const sanitized: ClientAgentRule[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const row = item as Record<string, unknown>;
    const idRaw = typeof row.id === 'string' ? row.id.trim() : '';
    if (!idRaw || seen.has(idRaw)) {
      continue;
    }

    const clientId = Number(row.clientId || 0);
    const clientName = typeof row.clientName === 'string' ? row.clientName.trim() : '';
    const serviceName = typeof row.serviceName === 'string' ? row.serviceName.trim() : '';
    const intervalValue = Math.max(1, Math.min(36, Number(row.intervalValue || 0)));
    const intervalUnit = typeof row.intervalUnit === 'string' && CLIENT_AGENT_INTERVAL_UNITS.has(row.intervalUnit)
      ? (row.intervalUnit as ClientAgentIntervalUnit)
      : 'months';
    const channel = typeof row.channel === 'string' && CLIENT_AGENT_CHANNELS.has(row.channel)
      ? (row.channel as ClientAgentChannel)
      : 'manual';
    const messageTemplate = typeof row.messageTemplate === 'string' && row.messageTemplate.trim()
      ? row.messageTemplate.trim()
      : 'Ola {cliente}, recomendamos seu retorno para {servico} em {data_proxima}.';
    const enabled = row.enabled !== false;

    if (!Number.isFinite(clientId) || clientId <= 0 || !clientName || !serviceName || !Number.isFinite(intervalValue)) {
      continue;
    }

    const referenceDate = normalizeIsoDate(row.referenceDate, today);
    const nextRunDate = normalizeIsoDate(row.nextRunDate, today);
    const sendAt = normalizeLocalDateTime(row.sendAt, `${nextRunDate}T09:00`);
    const createdAt = normalizeIsoInstant(row.createdAt, nowIso);
    const updatedAt = normalizeIsoInstant(row.updatedAt, nowIso);
    const lastExecutedAt = row.lastExecutedAt === null
      ? null
      : normalizeIsoInstant(row.lastExecutedAt, '');

    sanitized.push({
      id: idRaw,
      clientId,
      clientName,
      serviceName,
      intervalValue,
      intervalUnit,
      channel,
      messageTemplate,
      enabled,
      referenceDate,
      nextRunDate,
      sendAt,
      createdAt,
      updatedAt,
      lastExecutedAt: lastExecutedAt || null,
    });
    seen.add(idRaw);
  }

  return sanitized;
};

const sanitizeClientAgentEvents = (value: unknown): ClientAgentEvent[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const nowIso = new Date().toISOString();
  const today = getTodayDate();
  const sanitized: ClientAgentEvent[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const row = item as Record<string, unknown>;
    const idRaw = typeof row.id === 'string' ? row.id.trim() : '';
    if (!idRaw || seen.has(idRaw)) {
      continue;
    }

    const ruleId = typeof row.ruleId === 'string' ? row.ruleId.trim() : '';
    const clientId = Number(row.clientId || 0);
    const clientName = typeof row.clientName === 'string' ? row.clientName.trim() : '';
    const serviceName = typeof row.serviceName === 'string' ? row.serviceName.trim() : '';
    const channel = typeof row.channel === 'string' && CLIENT_AGENT_CHANNELS.has(row.channel)
      ? (row.channel as ClientAgentChannel)
      : 'manual';
    const scheduledFor = normalizeLocalDateTime(row.scheduledFor, `${normalizeIsoDate(row.scheduledFor, today)}T09:00`);
    const messagePreview = typeof row.messagePreview === 'string' ? row.messagePreview.trim() : '';
    const createdAt = normalizeIsoInstant(row.createdAt, nowIso);
    const status = row.status === 'sent'
      ? 'sent'
      : row.status === 'failed'
        ? 'failed'
        : row.status === 'skipped'
          ? 'skipped'
          : row.status === 'canceled'
            ? 'canceled'
            : 'queued';
    const reason = typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : null;
    const taskId = Number(row.taskId || 0);
    const sentAt = row.sentAt === null
      ? null
      : normalizeIsoInstant(row.sentAt, '');
    const providerMessageId = typeof row.providerMessageId === 'string' && row.providerMessageId.trim()
      ? row.providerMessageId.trim()
      : null;

    if (!ruleId || !Number.isFinite(clientId) || clientId <= 0 || !clientName || !serviceName) {
      continue;
    }

    sanitized.push({
      id: idRaw,
      ruleId,
      clientId,
      clientName,
      serviceName,
      channel,
      scheduledFor,
      messagePreview,
      createdAt,
      taskId: Number.isFinite(taskId) && taskId > 0 ? taskId : null,
      status,
      reason,
      sentAt: sentAt || null,
      providerMessageId,
    });
    seen.add(idRaw);
  }

  return sanitized
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, CLIENT_AGENT_MAX_EVENTS);
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
  const evolutionUrl = typeof settings.evolutionUrl === 'string' ? settings.evolutionUrl.trim() : '';
  const evolutionApiKey = typeof settings.evolutionApiKey === 'string' ? settings.evolutionApiKey.trim() : '';
  const evolutionInstance = typeof settings.evolutionInstance === 'string' ? settings.evolutionInstance.trim() : '';
  const evolutionSendPath = typeof settings.evolutionSendPath === 'string' && settings.evolutionSendPath.trim()
    ? settings.evolutionSendPath.trim()
    : EVOLUTION_DEFAULT_SEND_PATH;
  const evolutionWebhookSecret = typeof settings.evolutionWebhookSecret === 'string' ? settings.evolutionWebhookSecret.trim() : '';

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

const getRequestFallbackMasterPassword = (req: { headers: Record<string, unknown> }): string => {
  const adminHeader = req.headers['x-admin-key'];
  const adminKey = Array.isArray(adminHeader) ? adminHeader[0] : adminHeader;
  return process.env.ADMIN_MASTER_PASSWORD || process.env.WHATSAPP_MASTER_PASSWORD || (typeof adminKey === 'string' ? adminKey.trim() : '');
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

adminWorkbenchRoutes.get('/overview', async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'range';
  const startDate = typeof req.query.date === 'string' && DATE_REGEX.test(req.query.date) ? req.query.date : getTodayDate();
  const endDate = typeof req.query.endDate === 'string' && DATE_REGEX.test(req.query.endDate) ? req.query.endDate : null;

  try {
    const overview = await workbenchStore.getOverview(
      scope === 'all'
        ? undefined
        : {
            startDate,
            endDate: endDate || startDate,
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

adminWorkbenchRoutes.post('/settings/master-password/verify', async (req, res) => {
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
    return res.json({ ok: password === resolveMasterPassword(settings, getRequestFallbackMasterPassword(req)) });
  } catch (error) {
    console.error('Erro ao validar senha master:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao validar senha master.' });
  }
});

adminWorkbenchRoutes.put('/settings/master-password', async (req, res) => {
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
    if (currentPassword !== resolveMasterPassword(current, getRequestFallbackMasterPassword(req))) {
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
    const settings = await workbenchStore.getSettings(tenant || undefined);
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
    const current = await workbenchStore.getSettings(tenant || undefined);

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
    const current = await workbenchStore.getSettings(tenant || undefined);
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

  try {
    const result = await workbenchStore.convertLeadToClient(leadId);
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

  const paymentMethod = typeof req.body?.payment_method === 'string' ? req.body.payment_method.trim() : undefined;

  try {
    const entry = await workbenchStore.markFinancePaid(financeId, paymentMethod);
    return res.json({ message: 'Pagamento marcado como pago.', entry });
  } catch (error) {
    console.error('Erro ao marcar pagamento:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao marcar pagamento.' });
  }
});

adminWorkbenchRoutes.get('/clients/by-phone/:phone', async (req, res) => {
  const phone = req.params.phone?.trim();
  if (!phone) {
    return res.status(400).json({ error: 'Telefone é obrigatório.' });
  }

  try {
    const client = await workbenchStore.findClientByPhone(phone);
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
  const date = typeof req.body?.date === 'string' && DATE_REGEX.test(req.body.date) ? req.body.date : undefined;
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
    if (masterPassword !== resolveMasterPassword(settings, getRequestFallbackMasterPassword(req))) {
      return res.status(403).json({ error: 'Senha master invalida.' });
    }

    const deleted = await workbenchStore.resetFinance(date);
    let bookingsReset = 0;
    if (!date) {
      bookingsReset = await bookingStore.resetAllPaymentStatuses();
    }
    return res.json({
      message: `${deleted} entradas financeiras removidas.`,
      deleted,
      bookingsReset,
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
    if (masterPassword !== resolveMasterPassword(settings, getRequestFallbackMasterPassword(req))) {
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
    const entry = await workbenchStore.confirmBookingPayment(bookingId, paymentMethod);
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

  try {
    const rows = await workbenchStore.list(entity);
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

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  try {
    const row = await workbenchStore.create(entity, payload);
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

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  try {
    const row = await workbenchStore.update(entity, id, payload);
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

  const tenant = parseTenantFromQuery(req.query.tenant);
  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  try {
    if (SENSITIVE_DELETE_ENTITIES.has(entity)) {
      const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
      const masterPassword = getPayloadString(payload, 'masterPassword');

      if (!masterPassword) {
        return res.status(400).json({ error: 'Informe a senha master para concluir a exclusao.' });
      }

      const settings = await workbenchStore.getSettings(tenant || undefined);
      if (masterPassword !== resolveMasterPassword(settings, getRequestFallbackMasterPassword(req))) {
        return res.status(403).json({ error: 'Senha master invalida.' });
      }
    }

    await workbenchStore.remove(entity, id);
    return res.json({ message: 'Registro removido com sucesso.' });
  } catch (error) {
    console.error(`Erro ao remover registro ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao remover registro.' });
  }
});
