import { workbenchStore } from '../db/workbenchStore';
import { sendEvolutionMessageToCustomer } from './evolutionIntegrationService';

const CLIENT_AGENT_RULES_KEY = 'clientAgentRules';
const CLIENT_AGENT_EVENTS_KEY = 'clientAgentEvents';
const CLIENT_AGENT_MAX_EVENTS = 600;
const LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const ISO_INSTANT_REGEX = /^\d{4}-\d{2}-\d{2}T/;
const CLIENT_AGENT_INTERVAL_UNITS = new Set(['days', 'weeks', 'months']);
const CLIENT_AGENT_CHANNELS = new Set(['whatsapp', 'email', 'manual']);

type ClientAgentIntervalUnit = 'days' | 'weeks' | 'months';
type ClientAgentChannel = 'whatsapp' | 'email' | 'manual';
type ClientAgentEventStatus = 'queued' | 'sent' | 'failed' | 'skipped' | 'canceled';

export type ClientAgentRule = {
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

export type ClientAgentEvent = {
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
  status: ClientAgentEventStatus;
  reason: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
};

export type ClientAgentRunResult = {
  rules: ClientAgentRule[];
  events: ClientAgentEvent[];
  outcome: {
    dispatched: boolean;
    mode: 'whatsapp' | 'task' | 'skipped';
    message: string;
    error: string | null;
  };
};

const toTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const getNowLocalDateTime = (timeZone = 'America/Sao_Paulo'): string => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  return formatter.format(new Date()).replace(' ', 'T');
};

const getTodayLocalDate = (timeZone = 'America/Sao_Paulo'): string => getNowLocalDateTime(timeZone).slice(0, 10);

const normalizeLocalDate = (value: unknown, fallback: string): string => {
  const normalized = toTrimmedString(value);
  return LOCAL_DATE_REGEX.test(normalized) ? normalized : fallback;
};

const normalizeLocalDateTime = (value: unknown, fallback: string): string => {
  const normalized = toTrimmedString(value);
  return LOCAL_DATETIME_REGEX.test(normalized) ? normalized : fallback;
};

const normalizeIsoInstant = (value: unknown, fallback: string): string => {
  const normalized = toTrimmedString(value);
  return ISO_INSTANT_REGEX.test(normalized) ? normalized : fallback;
};

const parseLocalDate = (value: string): Date | null => {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const parsed = new Date(year, (month || 1) - 1, day || 1);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatLocalDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: string, delta: number): string => {
  const parsed = parseLocalDate(date);
  if (!parsed) {
    return date;
  }

  parsed.setDate(parsed.getDate() + delta);
  return formatLocalDate(parsed);
};

const addInterval = (baseDate: string, value: number, unit: ClientAgentIntervalUnit): string => {
  const parsed = parseLocalDate(baseDate);
  if (!parsed) {
    return getTodayLocalDate();
  }

  if (unit === 'days') {
    parsed.setDate(parsed.getDate() + value);
  } else if (unit === 'weeks') {
    parsed.setDate(parsed.getDate() + value * 7);
  } else {
    parsed.setMonth(parsed.getMonth() + value);
  }

  return formatLocalDate(parsed);
};

const dateDiffInDays = (targetDate: string, baseDate: string): number => {
  const target = parseLocalDate(targetDate);
  const base = parseLocalDate(baseDate);
  if (!target || !base) {
    return 0;
  }

  const start = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  const end = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
};

const extractDateFromLocalDateTime = (value: string): string => value.slice(0, 10);
const extractTimeFromLocalDateTime = (value: string): string => value.slice(11, 16) || '09:00';

const buildDefaultSendAt = (nextRunDate: string): string => `${nextRunDate}T09:00`;

const formatDateBR = (value: string): string => {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
};

const renderAgentMessage = (
  template: string,
  payload: { cliente: string; servico: string; data_proxima: string },
): string =>
  template
    .replaceAll('{cliente}', payload.cliente)
    .replaceAll('{servico}', payload.servico)
    .replaceAll('{data_proxima}', payload.data_proxima);

const buildTaskNotes = (rule: ClientAgentRule, preview: string): string =>
  `agente_cliente|rule:${rule.id}|cliente:${rule.clientId}|canal:${rule.channel}|mensagem:${preview}`;

const buildCycleEventId = (): string => `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const sanitizeClientAgentRules = (value: unknown): ClientAgentRule[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const nowIso = new Date().toISOString();
  const today = getTodayLocalDate();
  const sanitized: ClientAgentRule[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const row = item as Record<string, unknown>;
    const idRaw = toTrimmedString(row.id);
    if (!idRaw || seen.has(idRaw)) {
      continue;
    }

    const clientId = Number(row.clientId || 0);
    const clientName = toTrimmedString(row.clientName);
    const serviceName = toTrimmedString(row.serviceName);
    const intervalValue = Math.max(1, Math.min(36, Number(row.intervalValue || 0)));
    const intervalUnit = typeof row.intervalUnit === 'string' && CLIENT_AGENT_INTERVAL_UNITS.has(row.intervalUnit)
      ? (row.intervalUnit as ClientAgentIntervalUnit)
      : 'months';
    const channel = typeof row.channel === 'string' && CLIENT_AGENT_CHANNELS.has(row.channel)
      ? (row.channel as ClientAgentChannel)
      : 'manual';
    const messageTemplate = toTrimmedString(row.messageTemplate) || 'Ola {cliente}, recomendamos seu retorno para {servico} em {data_proxima}.';

    if (!Number.isFinite(clientId) || clientId <= 0 || !clientName || !serviceName) {
      continue;
    }

    const referenceDate = normalizeLocalDate(row.referenceDate, today);
    const nextRunDate = normalizeLocalDate(row.nextRunDate, referenceDate);
    const sendAtFallback = buildDefaultSendAt(nextRunDate);
    const sendAt = normalizeLocalDateTime(row.sendAt, sendAtFallback);
    const createdAt = normalizeIsoInstant(row.createdAt, nowIso);
    const updatedAt = normalizeIsoInstant(row.updatedAt, nowIso);
    const lastExecutedAt = row.lastExecutedAt === null ? null : normalizeIsoInstant(row.lastExecutedAt, '');

    sanitized.push({
      id: idRaw,
      clientId,
      clientName,
      serviceName,
      intervalValue,
      intervalUnit,
      channel,
      messageTemplate,
      enabled: row.enabled !== false,
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
  const today = getTodayLocalDate();
  const sanitized: ClientAgentEvent[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const row = item as Record<string, unknown>;
    const idRaw = toTrimmedString(row.id);
    if (!idRaw || seen.has(idRaw)) {
      continue;
    }

    const ruleId = toTrimmedString(row.ruleId);
    const clientId = Number(row.clientId || 0);
    const clientName = toTrimmedString(row.clientName);
    const serviceName = toTrimmedString(row.serviceName);
    const channel = typeof row.channel === 'string' && CLIENT_AGENT_CHANNELS.has(row.channel)
      ? (row.channel as ClientAgentChannel)
      : 'manual';
    const scheduledFor = normalizeLocalDateTime(
      row.scheduledFor,
      buildDefaultSendAt(normalizeLocalDate(row.scheduledFor, today)),
    );
    const messagePreview = toTrimmedString(row.messagePreview);
    const createdAt = normalizeIsoInstant(row.createdAt, nowIso);
    const statusRaw = toTrimmedString(row.status);
    const status: ClientAgentEventStatus = ['queued', 'sent', 'failed', 'skipped', 'canceled'].includes(statusRaw)
      ? (statusRaw as ClientAgentEventStatus)
      : 'queued';
    const reason = toTrimmedString(row.reason) || null;
    const taskId = Number(row.taskId || 0);
    const sentAt = row.sentAt === null ? null : normalizeIsoInstant(row.sentAt, '');
    const providerMessageId = toTrimmedString(row.providerMessageId) || null;

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
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, CLIENT_AGENT_MAX_EVENTS);
};

const hasEventForCycle = (
  events: ClientAgentEvent[],
  rule: ClientAgentRule,
  statuses: ClientAgentEventStatus[],
): boolean => events.some((event) => event.ruleId === rule.id && event.scheduledFor === rule.sendAt && statuses.includes(event.status));

const advanceRuleAfterDispatch = (rule: ClientAgentRule, executedAtIso: string): ClientAgentRule => {
  const nextRunDate = addInterval(rule.nextRunDate, rule.intervalValue, rule.intervalUnit);
  const currentSendDate = extractDateFromLocalDateTime(rule.sendAt);
  const leadDays = Math.max(0, dateDiffInDays(currentSendDate, rule.nextRunDate) * -1);
  const nextSendDate = addDays(nextRunDate, -leadDays);
  const nextSendAt = `${nextSendDate}T${extractTimeFromLocalDateTime(rule.sendAt)}`;

  return {
    ...rule,
    referenceDate: rule.nextRunDate,
    nextRunDate,
    sendAt: nextSendAt,
    updatedAt: executedAtIso,
    lastExecutedAt: executedAtIso,
  };
};

const buildClientPreview = (rule: ClientAgentRule, clientName: string): string =>
  renderAgentMessage(rule.messageTemplate, {
    cliente: clientName || rule.clientName || 'Cliente',
    servico: rule.serviceName,
    data_proxima: formatDateBR(rule.nextRunDate),
  });

const saveState = async (
  rules: ClientAgentRule[],
  events: ClientAgentEvent[],
  tenantSlug?: string,
): Promise<{ rules: ClientAgentRule[]; events: ClientAgentEvent[] }> => {
  const current = await workbenchStore.getSettings(tenantSlug);
  const merged: Record<string, unknown> = {
    ...current,
    [CLIENT_AGENT_RULES_KEY]: rules,
    [CLIENT_AGENT_EVENTS_KEY]: events.slice(0, CLIENT_AGENT_MAX_EVENTS),
  };
  const saved = await workbenchStore.saveSettings(merged, tenantSlug);
  return {
    rules: sanitizeClientAgentRules(saved[CLIENT_AGENT_RULES_KEY]),
    events: sanitizeClientAgentEvents(saved[CLIENT_AGENT_EVENTS_KEY]),
  };
};

const findClientById = async (clientId: number): Promise<Record<string, unknown> | null> => {
  if (!clientId) {
    return null;
  }

  const rows = await workbenchStore.list('clients');
  return rows.find((row) => Number(row.id) === clientId) || null;
};

export const getClientAgentStateForTenant = async (
  tenantSlug?: string,
): Promise<{ rules: ClientAgentRule[]; events: ClientAgentEvent[] }> => {
  const settings = await workbenchStore.getSettings(tenantSlug);
  return {
    rules: sanitizeClientAgentRules(settings[CLIENT_AGENT_RULES_KEY]),
    events: sanitizeClientAgentEvents(settings[CLIENT_AGENT_EVENTS_KEY]),
  };
};

export const runClientAgentRuleForTenant = async (
  ruleId: string,
  tenantSlug?: string,
  options?: { executeNow?: boolean },
): Promise<ClientAgentRunResult> => {
  const { rules, events } = await getClientAgentStateForTenant(tenantSlug);
  const rule = rules.find((row) => row.id === ruleId);

  if (!rule) {
    throw new Error('Regra do agente nao encontrada.');
  }

  if (!rule.enabled) {
    return {
      rules,
      events,
      outcome: {
        dispatched: false,
        mode: 'skipped',
        message: 'A regra esta pausada.',
        error: 'Reative a regra antes de executar.',
      },
    };
  }

  if (hasEventForCycle(events, rule, ['sent'])) {
    return {
      rules,
      events,
      outcome: {
        dispatched: false,
        mode: 'skipped',
        message: 'Este ciclo ja foi disparado.',
        error: 'Evitei um envio duplicado para o mesmo ciclo.',
      },
    };
  }

  if (!options?.executeNow && hasEventForCycle(events, rule, ['failed'])) {
    return {
      rules,
      events,
      outcome: {
        dispatched: false,
        mode: 'skipped',
        message: 'O ciclo anterior falhou e aguarda intervencao manual.',
        error: 'Reexecute manualmente depois de validar a integracao Evolution.',
      },
    };
  }

  const client = await findClientById(rule.clientId);
  const clientName = toTrimmedString(client?.name) || rule.clientName;
  const clientPhone = toTrimmedString(client?.phone);
  const preview = buildClientPreview({ ...rule, clientName }, clientName);
  const scheduledFor = rule.sendAt;
  const nowIso = new Date().toISOString();

  let nextRules = rules.slice();
  let nextEvents = events.slice();
  let outcome: ClientAgentRunResult['outcome'];

  if (rule.channel === 'whatsapp') {
    if (!clientPhone) {
      const failedEvent: ClientAgentEvent = {
        id: buildCycleEventId(),
        ruleId: rule.id,
        clientId: rule.clientId,
        clientName,
        serviceName: rule.serviceName,
        channel: rule.channel,
        scheduledFor,
        messagePreview: preview,
        createdAt: nowIso,
        taskId: null,
        status: 'failed',
        reason: 'Cliente sem telefone valido para envio automatico.',
        sentAt: null,
        providerMessageId: null,
      };

      nextEvents = [failedEvent, ...nextEvents];
      const saved = await saveState(nextRules, nextEvents, tenantSlug);
      return {
        ...saved,
        outcome: {
          dispatched: false,
          mode: 'whatsapp',
          message: 'Falha ao disparar a mensagem do agente.',
          error: 'Cliente sem WhatsApp valido.',
        },
      };
    }

    try {
      const providerMessageId = await sendEvolutionMessageToCustomer(tenantSlug, clientPhone, preview);
      const sentEvent: ClientAgentEvent = {
        id: buildCycleEventId(),
        ruleId: rule.id,
        clientId: rule.clientId,
        clientName,
        serviceName: rule.serviceName,
        channel: rule.channel,
        scheduledFor,
        messagePreview: preview,
        createdAt: nowIso,
        taskId: null,
        status: 'sent',
        reason: null,
        sentAt: nowIso,
        providerMessageId,
      };

      nextRules = nextRules.map((row) => (row.id === rule.id ? advanceRuleAfterDispatch({ ...row, clientName }, nowIso) : row));
      nextEvents = [sentEvent, ...nextEvents];
      outcome = {
        dispatched: true,
        mode: 'whatsapp',
        message: 'Mensagem enviada ao cliente pela Evolution API.',
        error: null,
      };
    } catch (error) {
      const failedEvent: ClientAgentEvent = {
        id: buildCycleEventId(),
        ruleId: rule.id,
        clientId: rule.clientId,
        clientName,
        serviceName: rule.serviceName,
        channel: rule.channel,
        scheduledFor,
        messagePreview: preview,
        createdAt: nowIso,
        taskId: null,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Falha ao enviar pela Evolution API.',
        sentAt: null,
        providerMessageId: null,
      };

      nextEvents = [failedEvent, ...nextEvents];
      outcome = {
        dispatched: false,
        mode: 'whatsapp',
        message: 'Falha ao disparar a mensagem do agente.',
        error: failedEvent.reason,
      };
    }
  } else {
    const taskRow = await workbenchStore.create('tasks', {
      title: `Agente AI: ${clientName} - ${rule.serviceName}`,
      owner: 'Central de relacionamento',
      due_date: extractDateFromLocalDateTime(scheduledFor),
      priority: 'media',
      status: 'pendente',
      related_client: clientName,
      notes: buildTaskNotes(rule, preview),
    });

    const queuedEvent: ClientAgentEvent = {
      id: buildCycleEventId(),
      ruleId: rule.id,
      clientId: rule.clientId,
      clientName,
      serviceName: rule.serviceName,
      channel: rule.channel,
      scheduledFor,
      messagePreview: preview,
      createdAt: nowIso,
      taskId: Number(taskRow.id) || null,
      status: 'queued',
      reason: rule.channel === 'email' ? 'Email segue em modo operacional sem provedor ativo.' : null,
      sentAt: null,
      providerMessageId: null,
    };

    nextRules = nextRules.map((row) => (row.id === rule.id ? advanceRuleAfterDispatch({ ...row, clientName }, nowIso) : row));
    nextEvents = [queuedEvent, ...nextEvents];
    outcome = {
      dispatched: true,
      mode: 'task',
      message: 'Regra executada e convertida em fila operacional.',
      error: null,
    };
  }

  const saved = await saveState(nextRules, nextEvents, tenantSlug);
  return { ...saved, outcome };
};

let schedulerStarted = false;
let schedulerBusy = false;
let schedulerHandle: NodeJS.Timeout | null = null;

const processDueRules = async (): Promise<void> => {
  if (schedulerBusy || !workbenchStore.isEnabled()) {
    return;
  }

  schedulerBusy = true;
  try {
    const tenants = await workbenchStore.listTenants();
    for (const tenant of tenants) {
      const { rules, events } = await getClientAgentStateForTenant(tenant.slug);
      const nowLocal = getNowLocalDateTime();

      for (const rule of rules) {
        const shouldDispatch = rule.enabled
          && rule.channel === 'whatsapp'
          && rule.sendAt <= nowLocal
          && !hasEventForCycle(events, rule, ['sent', 'failed']);

        if (!shouldDispatch) {
          continue;
        }

        try {
          await runClientAgentRuleForTenant(rule.id, tenant.slug, { executeNow: false });
        } catch (error) {
          console.error(`Erro ao executar scheduler do agente AI (${tenant.slug}):`, error);
        }
      }
    }
  } catch (error) {
    console.error('Erro ao processar scheduler do agente AI:', error);
  } finally {
    schedulerBusy = false;
  }
};

export const startClientAgentScheduler = (): void => {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  schedulerHandle = setInterval(() => {
    void processDueRules();
  }, 60_000);

  void processDueRules();
};

export const stopClientAgentScheduler = (): void => {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
  schedulerStarted = false;
};
