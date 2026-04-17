import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Crown,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';

import {
  createWorkbenchEntityForAdmin,
  deleteWorkbenchEntityForAdmin,
  getClientAgentStateForAdmin,
  listAdminBookings,
  listBookingsByPhoneForAdmin,
  listWorkbenchEntityForAdmin,
  saveClientAgentStateForAdmin,
  updateWorkbenchEntityForAdmin,
  type ClientAgentChannel,
  type ClientAgentEvent,
  type ClientAgentIntervalUnit,
  type ClientAgentRule,
} from '../api';
import { DangerConfirmModal } from '../AdminHelpers';
import { formatDateBR, toNumber, toStringValue } from '../AdminUtils';
import type { AdminBooking } from '../types';
import './clientes-module.css';

type Props = {
  adminKey: string;
  tenantSlug: string;
};

type ClientStatus = 'novo' | 'ativo' | 'recorrente' | 'VIP' | 'em risco' | 'inativo';
type ClientRecord = Record<string, unknown>;
type ClientTone = 'vip' | 'risk' | 'active' | 'neutral';
type FocusFilter = 'todos' | 'com-agente' | 'reativacao' | 'alto-valor' | 'sem-retorno';
type SortMode = 'proximo-aviso' | 'valor' | 'ultima-visita' | 'nome';

type AgentDraft = {
  serviceName: string;
  intervalValue: number;
  intervalUnit: ClientAgentIntervalUnit;
  channel: ClientAgentChannel;
  messageTemplate: string;
};

type ClientServiceSnapshot = { name: string; count: number; lastDate: string | null };

type ClientSummarySnapshot = {
  totalSpent: number;
  visitCount: number;
  avgTicket: number;
  services: ClientServiceSnapshot[];
  lastVisit: AdminBooking | null;
  nextReminder: string | null;
  overdueRuleCount: number;
  activeRuleCount: number;
  dormancyDays: number | null;
};

type ClientInsight = {
  totalSpent: number;
  visitCount: number;
  avgTicket: number;
  topService: string;
  lastVisit: string | null;
  nextReminder: string | null;
  activeRuleCount: number;
  overdueRuleCount: number;
  dormancyDays: number | null;
  tone: ClientTone;
  toneLabel: string;
  attentionLine: string;
};

type ClientBoardItem = {
  client: ClientRecord;
  insight: ClientInsight;
};

type AgentPipelineNode = {
  label: string;
  value: string;
  detail: string;
  tone: ClientTone;
};

type AgentPlaybook = {
  badge: string;
  title: string;
  action: string;
  rationale: string;
  tone: ClientTone;
};

type AgentControlTower = {
  modeLabel: string;
  modeDetail: string;
  channelLabel: string;
  channelDetail: string;
  nodes: AgentPipelineNode[];
  playbooks: AgentPlaybook[];
  guardrails: string[];
};

type AgentExecutionPriority = 'baixa' | 'media' | 'alta';

type AgentExecutionDecision = {
  tone: ClientTone;
  modeLabel: string;
  modeDetail: string;
  priority: AgentExecutionPriority;
  priorityLabel: string;
  owner: string;
  channel: ClientAgentChannel;
  urgencyScore: number;
  queuePressure: number;
  rationale: string;
};

const CLIENT_COLUMNS: Array<{ status: ClientStatus; label: string; hint: string }> = [
  { status: 'novo', label: 'Novos', hint: 'Primeira passagem, captacao ou onboarding.' },
  { status: 'ativo', label: 'Ativos', hint: 'Cliente rodando em fluxo normal da carteira.' },
  { status: 'recorrente', label: 'Recorrentes', hint: 'Ja opera com retorno previsivel por servico.' },
  { status: 'VIP', label: 'VIP', hint: 'Maior valor percebido e prioridade comercial.' },
  { status: 'em risco', label: 'Em risco', hint: 'Sem retorno dentro da janela ideal.' },
  { status: 'inativo', label: 'Inativos', hint: 'Historico existe, mas o ciclo esfriou.' },
];

const STATUS_SET = new Set(CLIENT_COLUMNS.map((column) => column.status));
const DAY_MS = 1000 * 60 * 60 * 24;
const TODAY = (): string => new Date().toISOString().slice(0, 10);

const formatDate = (value: string): string => (value ? formatDateBR(value) : '--');

const formatDateTime = (value: string): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const parseMoney = (value: string | null): number => {
  if (!value) return 0;
  const normalized = value.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const normalizeClientStatus = (value: unknown): ClientStatus => {
  const raw = toStringValue(value).trim() as ClientStatus;
  return STATUS_SET.has(raw) ? raw : 'novo';
};

const normalizePhone = (value: string): string => value.replace(/\D/g, '');

const addInterval = (baseDate: string, value: number, unit: ClientAgentIntervalUnit): string => {
  const [year, month, day] = baseDate.split('-').map((part) => Number(part));
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) {
    return TODAY();
  }

  if (unit === 'days') {
    date.setDate(date.getDate() + value);
  } else if (unit === 'weeks') {
    date.setDate(date.getDate() + value * 7);
  } else {
    date.setMonth(date.getMonth() + value);
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const renderAgentMessage = (template: string, payload: { cliente: string; servico: string; data_proxima: string }): string =>
  template
    .replaceAll('{cliente}', payload.cliente)
    .replaceAll('{servico}', payload.servico)
    .replaceAll('{data_proxima}', payload.data_proxima);

const isSameOrBefore = (left: string, right: string): boolean => left <= right;

const getClientInitials = (value: string): string => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
};

const getBookingTotal = (booking: AdminBooking): number => {
  if (booking.serviceItems.length > 0) {
    return booking.serviceItems.reduce((sum, item) => sum + parseMoney(item.price), 0);
  }
  return parseMoney(booking.servicePrice);
};

const isRevenueBooking = (booking: AdminBooking): boolean =>
  booking.status === 'confirmed' || booking.status === 'completed';

const resolveServiceList = (bookings: AdminBooking[]): Array<{ name: string; count: number; lastDate: string | null }> => {
  const counts = new Map<string, { count: number; lastDate: string | null }>();
  for (const booking of bookings) {
    const candidates = booking.serviceItems.length > 0
      ? booking.serviceItems.map((item) => item.name.trim()).filter(Boolean)
      : [booking.service.trim()].filter(Boolean);

    for (const name of candidates) {
      const current = counts.get(name);
      counts.set(name, {
        count: (current?.count || 0) + 1,
        lastDate: !current?.lastDate || booking.date > current.lastDate ? booking.date : current.lastDate,
      });
    }
  }

  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, count: value.count, lastDate: value.lastDate }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
};

const resolveLatestServiceDate = (bookings: AdminBooking[], serviceName: string): string | null => {
  const normalizedService = serviceName.trim().toLowerCase();
  if (!normalizedService) return null;

  let latest: string | null = null;
  for (const booking of bookings) {
    const candidates = booking.serviceItems.length > 0
      ? booking.serviceItems.map((item) => item.name.toLowerCase())
      : [booking.service.toLowerCase()];
    if (!candidates.some((candidate) => candidate.includes(normalizedService))) {
      continue;
    }

    if (!latest || booking.date > latest) {
      latest = booking.date;
    }
  }

  return latest;
};

const buildDefaultDraft = (clientName: string, serviceName = ''): AgentDraft => ({
  serviceName,
  intervalValue: 3,
  intervalUnit: 'months',
  channel: 'manual',
  messageTemplate: `Ola {cliente}, ja estamos no periodo ideal para revisao do servico {servico}. Sua proxima sugestao de retorno: {data_proxima}.`,
});

const toDateValue = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateTimeValue = (date: string, time = '00:00'): number => {
  const parsed = Date.parse(`${date}T${time || '00:00'}`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const daysSince = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = toDateValue(value);
  if (!parsed) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / DAY_MS));
};

const formatDormancy = (value: number | null): string => {
  if (value === null) return 'Sem historico';
  if (value === 0) return 'Hoje';
  if (value < 30) return `${value} dias`;
  return `${Math.floor(value / 30)}m ${value % 30}d`;
};

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const formatInterval = (value: number, unit: ClientAgentIntervalUnit): string => {
  if (unit === 'days') return `${value} dia${value === 1 ? '' : 's'}`;
  if (unit === 'weeks') return `${value} semana${value === 1 ? '' : 's'}`;
  return `${value} mes${value === 1 ? '' : 'es'}`;
};

const recommendCadence = (serviceName: string): { value: number; unit: ClientAgentIntervalUnit; rationale: string } => {
  const normalized = serviceName.trim().toLowerCase();
  if (/(alis|progressiva|botox|selagem|mecha|luzes|colora|reconstr)/.test(normalized)) {
    return { value: 3, unit: 'months', rationale: 'Servico tecnico de maior ciclo, com revisao mais longa.' };
  }
  if (/(manicure|pedicure|unha|spa dos pes)/.test(normalized)) {
    return { value: 21, unit: 'days', rationale: 'Servico de manutencao rapida, ideal para retorno curto.' };
  }
  if (/(cilios|sobrancelha|henna|design)/.test(normalized)) {
    return { value: 30, unit: 'days', rationale: 'Servico de detalhe com curva media de recorrencia.' };
  }
  if (/(corte|barba|escova|hidrata)/.test(normalized)) {
    return { value: 45, unit: 'days', rationale: 'Servico de manutencao com janela intermediaria.' };
  }
  return { value: 45, unit: 'days', rationale: 'Cadencia padrao sugerida para manter contato ativo.' };
};

const resolveAgentDecision = ({
  summary,
  requestedChannel,
  queuedEvents,
  pendingTasks,
}: {
  summary: ClientSummarySnapshot;
  requestedChannel: ClientAgentChannel;
  queuedEvents: number;
  pendingTasks: number;
}): AgentExecutionDecision => {
  let tone: ClientTone = 'neutral';
  let modeLabel = 'Monitoramento ativo';
  let modeDetail = 'Cliente dentro de uma janela normal, com automacao focada em manutencao do ciclo.';
  let urgencyScore = 28;

  if (summary.totalSpent >= 1200) {
    tone = 'vip';
    modeLabel = 'Retencao VIP';
    modeDetail = 'Protege valor da carteira, prioriza atendimento premium e antecipa o proximo movimento comercial.';
    urgencyScore += 18;
  } else if (summary.overdueRuleCount > 0 || (summary.dormancyDays !== null && summary.dormancyDays >= 60)) {
    tone = 'risk';
    modeLabel = 'Reativacao inteligente';
    modeDetail = 'Motor entra em modo de recuperacao, identifica ausencia fora da janela ideal e sobe a urgencia.';
    urgencyScore += 30;
  } else if (summary.activeRuleCount > 0 || summary.nextReminder) {
    tone = 'active';
    modeLabel = 'Recorrencia orquestrada';
    modeDetail = 'Fluxo continuo com trigger, janela, fila, tarefa e recalculo automatico da proxima recorrencia.';
    urgencyScore += 16;
  }

  if (summary.dormancyDays !== null) {
    if (summary.dormancyDays >= 120) urgencyScore += 20;
    else if (summary.dormancyDays >= 90) urgencyScore += 14;
    else if (summary.dormancyDays >= 45) urgencyScore += 8;
  }

  urgencyScore += Math.min(summary.overdueRuleCount * 8, 24);
  urgencyScore += Math.min(summary.activeRuleCount * 2, 8);
  urgencyScore -= Math.min((queuedEvents + pendingTasks) * 2, 12);
  urgencyScore = clampNumber(urgencyScore, 12, 96);

  let priority: AgentExecutionPriority = 'baixa';
  let priorityLabel = 'Baixa prioridade';
  if (urgencyScore >= 72) {
    priority = 'alta';
    priorityLabel = 'Alta prioridade';
  } else if (urgencyScore >= 42) {
    priority = 'media';
    priorityLabel = 'Media prioridade';
  }

  const owner = requestedChannel === 'manual'
    ? 'Central de relacionamento'
    : requestedChannel === 'whatsapp'
      ? 'Fila WhatsApp'
      : 'Fila Email';

  return {
    tone,
    modeLabel,
    modeDetail,
    priority,
    priorityLabel,
    owner,
    channel: requestedChannel,
    urgencyScore,
    queuePressure: queuedEvents + pendingTasks,
    rationale: `${modeLabel} com score ${urgencyScore}/100, ${queuedEvents} evento(s) na fila e ${pendingTasks} tarefa(s) pendente(s).`,
  };
};

const buildAgentControlTower = ({
  summary,
  clientRules,
  clientEvents,
  clientTaskTimeline,
  currentClient,
  agentDraft,
  agentPreviewReferenceDate,
  agentPreviewNextDate,
  decision,
}: {
  summary: ClientSummarySnapshot;
  clientRules: ClientAgentRule[];
  clientEvents: ClientAgentEvent[];
  clientTaskTimeline: Record<string, unknown>[];
  currentClient: ClientRecord;
  agentDraft: AgentDraft;
  agentPreviewReferenceDate: string;
  agentPreviewNextDate: string;
  decision: AgentExecutionDecision;
}): AgentControlTower => {
  const topService = summary.services[0]?.name || toStringValue(currentClient.preferred_service) || agentDraft.serviceName || 'Servico nao definido';
  const serviceCadence = recommendCadence(topService);
  const queuedEvents = clientEvents.filter((event) => event.status === 'queued').length;
  const pendingTasks = clientTaskTimeline.filter((task) => toStringValue(task.status) !== 'concluida').length;

  const channelLabel = agentDraft.channel === 'manual'
    ? 'Operacao manual assistida'
    : agentDraft.channel === 'whatsapp'
      ? 'WhatsApp como canal primario'
      : 'Email como canal primario';
  const channelDetail = `${decision.priorityLabel} via ${decision.owner}. ${
    agentDraft.channel === 'manual'
      ? 'A IA prepara a rotina, mas a central valida o disparo final.'
      : agentDraft.channel === 'whatsapp'
        ? 'Prioriza contato rapido e personalizado, com fallback de tarefa quando necessario.'
        : 'Usa mensagem mais estruturada e registra retorno em trilha operacional.'
  }`;

  const nodes: AgentPipelineNode[] = [
    {
      label: 'Trigger',
      value: summary.nextReminder ? formatDate(summary.nextReminder) : formatDormancy(summary.dormancyDays),
      detail: summary.nextReminder
        ? `Janela aberta para ${topService}.`
        : `Ultimo ponto conhecido em ${summary.lastVisit ? formatDate(summary.lastVisit.date) : '--'}.`,
      tone: decision.tone,
    },
    {
      label: 'Enriquecimento',
      value: `${summary.visitCount} visitas`,
      detail: `Ticket medio ${formatCurrency(summary.avgTicket)} | ancora ${topService} | score ${decision.urgencyScore}/100.`,
      tone: summary.totalSpent > 0 ? 'active' : 'neutral',
    },
    {
      label: 'Decisao',
      value: decision.modeLabel,
      detail: decision.modeDetail,
      tone: decision.tone,
    },
    {
      label: 'Dispatch',
      value: formatDate(agentPreviewNextDate),
      detail: `${decision.priorityLabel} | fila ${queuedEvents} | tarefas abertas ${pendingTasks} | owner ${decision.owner}.`,
      tone: decision.priority === 'alta' ? 'risk' : queuedEvents > 0 || pendingTasks > 0 ? 'active' : 'neutral',
    },
  ];

  const playbooks: AgentPlaybook[] = [
    {
      badge: 'Playbook 01',
      title: 'Revisao de servico',
      action: `Agendar retorno em ${formatInterval(serviceCadence.value, serviceCadence.unit)} para ${topService}.`,
      rationale: serviceCadence.rationale,
      tone: 'active',
    },
    {
      badge: 'Playbook 02',
      title: summary.dormancyDays !== null && summary.dormancyDays >= 60 ? 'Recuperacao de cliente' : 'Continuidade de ciclo',
      action: summary.dormancyDays !== null && summary.dormancyDays >= 60
        ? `Abrir reacendimento com prova social e oferta leve para quem esta sem retorno ha ${formatDormancy(summary.dormancyDays)}.`
        : 'Usar mensagem consultiva para manter previsibilidade sem parecer cobranca mecanica.',
      rationale: summary.overdueRuleCount > 0
        ? `${summary.overdueRuleCount} aviso(s) ja ultrapassaram a janela.`
        : 'Nenhuma quebra grave de janela detectada.',
      tone: summary.dormancyDays !== null && summary.dormancyDays >= 60 ? 'risk' : 'neutral',
    },
    {
      badge: 'Playbook 03',
      title: summary.totalSpent >= 1200 ? 'Blindagem VIP' : 'Upsell contextual',
      action: summary.totalSpent >= 1200
        ? 'Priorizar atendimento humano, reforcar exclusividade e sugerir reserva antecipada.'
        : `Quando ${topService} for o gatilho, sugerir complemento compativel com o perfil atual do cliente.`,
      rationale: summary.totalSpent >= 1200
        ? `Cliente ja movimentou ${formatCurrency(summary.totalSpent)} na carteira.`
        : `Basear sugestao no historico das ${summary.visitCount} visitas confirmadas.`,
      tone: summary.totalSpent >= 1200 ? 'vip' : 'neutral',
    },
  ];

  const guardrails = [
    `Referencia atual usada pelo agente: ${formatDate(agentPreviewReferenceDate)}.`,
    `Regras mapeadas para este cliente: ${clientRules.length}, com ${summary.activeRuleCount} em operacao.`,
    'Evita duplicidade de aviso para a mesma data antes de criar nova fila.',
    'Toda execucao gera trilha operacional por tarefa e recalcula o proximo ciclo.',
    `Motor decisor atual: ${decision.rationale}`,
    agentDraft.channel === 'manual'
      ? 'Fluxo exige revisao da central antes do contato final com a cliente.'
      : `Canal ${agentDraft.channel} fica armado, mas a fila continua rastreada na central.`,
  ];

  return {
    modeLabel: decision.modeLabel,
    modeDetail: decision.modeDetail,
    channelLabel,
    channelDetail,
    nodes,
    playbooks,
    guardrails,
  };
};

const buildClientInsight = (
  client: ClientRecord,
  bookingsByPhone: Map<string, AdminBooking[]>,
  rulesByClientId: Map<number, ClientAgentRule[]>,
): ClientInsight => {
  const phoneKey = normalizePhone(toStringValue(client.phone));
  const clientBookings = phoneKey ? bookingsByPhone.get(phoneKey) || [] : [];
  const confirmedBookings = clientBookings.filter(isRevenueBooking);
  const services = resolveServiceList(confirmedBookings);
  const totalSpent = confirmedBookings.reduce((sum, booking) => sum + getBookingTotal(booking), 0);
  const visitCount = confirmedBookings.length;
  const avgTicket = visitCount > 0 ? totalSpent / visitCount : 0;
  const lastVisit = confirmedBookings.slice().sort((left, right) => right.date.localeCompare(left.date))[0]?.date || null;
  const dormancyDays = daysSince(lastVisit);
  const clientId = toNumber(client.id);
  const clientRules = clientId ? rulesByClientId.get(clientId) || [] : [];
  const enabledRules = clientRules.filter((rule) => rule.enabled);
  const nextReminder = enabledRules.slice().sort((left, right) => left.nextRunDate.localeCompare(right.nextRunDate))[0]?.nextRunDate || null;
  const overdueRuleCount = enabledRules.filter((rule) => rule.nextRunDate <= TODAY()).length;
  const status = normalizeClientStatus(client.status);

  let tone: ClientTone = 'neutral';
  let toneLabel = 'Em observacao';
  let attentionLine = nextReminder ? `Proximo aviso em ${formatDate(nextReminder)}` : 'Sem agenda de retorno ativa';

  if (status === 'VIP' || totalSpent >= 1200) {
    tone = 'vip';
    toneLabel = 'Alto valor';
    attentionLine = totalSpent > 0 ? `Carteira acumulada ${formatCurrency(totalSpent)}` : 'Cliente VIP sem historico consolidado';
  } else if (status === 'em risco' || status === 'inativo' || overdueRuleCount > 0 || (dormancyDays !== null && dormancyDays >= 75)) {
    tone = 'risk';
    toneLabel = 'Pedir reacendimento';
    attentionLine = overdueRuleCount > 0
      ? `${overdueRuleCount} aviso${overdueRuleCount === 1 ? '' : 's'} vencido${overdueRuleCount === 1 ? '' : 's'}`
      : dormancyDays !== null
        ? `Sem retorno ha ${dormancyDays} dias`
        : 'Sem retorno recente mapeado';
  } else if (status === 'recorrente' || status === 'ativo' || enabledRules.length > 0) {
    tone = 'active';
    toneLabel = 'Ciclo ativo';
    attentionLine = nextReminder
      ? `Retorno programado para ${formatDate(nextReminder)}`
      : `Servico ancora: ${services[0]?.name || toStringValue(client.preferred_service) || 'nao definido'}`;
  }

  return {
    totalSpent,
    visitCount,
    avgTicket,
    topService: services[0]?.name || toStringValue(client.preferred_service) || 'Nao definido',
    lastVisit,
    nextReminder,
    activeRuleCount: enabledRules.length,
    overdueRuleCount,
    dormancyDays,
    tone,
    toneLabel,
    attentionLine,
  };
};

function ClienteModal({
  client,
  adminKey,
  rules,
  events,
  onSaveAgentState,
  onClose,
  onClientUpdated,
}: {
  client: ClientRecord;
  adminKey: string;
  rules: ClientAgentRule[];
  events: ClientAgentEvent[];
  onSaveAgentState: (nextRules: ClientAgentRule[], nextEvents: ClientAgentEvent[]) => Promise<void>;
  onClose: () => void;
  onClientUpdated: () => Promise<void>;
}) {
  const [currentClient, setCurrentClient] = useState<ClientRecord>({ ...client });
  const [activeTab, setActiveTab] = useState<'resumo' | 'agente' | 'timeline'>('resumo');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentBusyRule, setAgentBusyRule] = useState<string | null>(null);
  const [agentError, setAgentError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...client });
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(buildDefaultDraft(toStringValue(client.name)));

  useEffect(() => {
    setCurrentClient({ ...client });
    setDraft({ ...client });
  }, [client]);

  const clientId = toNumber(currentClient.id);
  const clientName = toStringValue(currentClient.name);
  const clientPhone = toStringValue(currentClient.phone);
  const clientStatus = normalizeClientStatus(currentClient.status);

  const loadClientContext = useCallback(async () => {
    setLoading(true);
    setAgentError('');
    try {
      const [bookingRows, taskRows] = await Promise.all([
        clientPhone ? listBookingsByPhoneForAdmin(clientPhone, adminKey) : Promise.resolve([]),
        listWorkbenchEntityForAdmin('tasks', adminKey),
      ]);
      setBookings(bookingRows);
      setTasks(taskRows);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Erro ao carregar historico do cliente.');
      setBookings([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [adminKey, clientPhone]);

  useEffect(() => {
    void loadClientContext();
  }, [loadClientContext]);

  const clientRules = useMemo(
    () => rules.filter((rule) => rule.clientId === clientId).sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate)),
    [clientId, rules],
  );

  const clientEvents = useMemo(
    () => events.filter((event) => event.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [clientId, events],
  );

  const summary = useMemo<ClientSummarySnapshot>(() => {
    const confirmed = bookings.filter(isRevenueBooking);
    const totalSpent = confirmed.reduce((sum, booking) => sum + getBookingTotal(booking), 0);
    const services = resolveServiceList(confirmed);
    const lastVisit = confirmed.slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    const avgTicket = confirmed.length > 0 ? totalSpent / confirmed.length : 0;
    const nextReminder = clientRules.filter((rule) => rule.enabled).slice().sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))[0]?.nextRunDate || null;
    const overdueRuleCount = clientRules.filter((rule) => rule.enabled && rule.nextRunDate <= TODAY()).length;
    const dormancyDays = daysSince(lastVisit?.date || null);
    return {
      totalSpent,
      visitCount: confirmed.length,
      avgTicket,
      services,
      lastVisit,
      nextReminder,
      overdueRuleCount,
      activeRuleCount: clientRules.filter((rule) => rule.enabled).length,
      dormancyDays,
    };
  }, [bookings, clientRules]);

  useEffect(() => {
    const topService = summary.services[0]?.name || toStringValue(currentClient.preferred_service);
    const cadence = recommendCadence(topService);
    setAgentDraft({
      ...buildDefaultDraft(clientName, topService),
      intervalValue: cadence.value,
      intervalUnit: cadence.unit,
    });
  }, [clientName, currentClient.preferred_service, summary.services]);

  const serviceScenarios = useMemo(() => {
    const baseServices = summary.services.length > 0
      ? summary.services.slice(0, 3).map((service) => service.name)
      : [toStringValue(currentClient.preferred_service)].filter(Boolean);
    return baseServices.map((serviceName) => ({
      serviceName,
      recommendation: recommendCadence(serviceName),
      lastDate: resolveLatestServiceDate(bookings, serviceName),
    }));
  }, [bookings, currentClient.preferred_service, summary.services]);

  const clientTaskTimeline = useMemo(() => {
    const normalizedClient = clientName.trim().toLowerCase();
    return tasks
      .filter((row) => {
        const related = toStringValue(row.related_client).trim().toLowerCase();
        if (related && related === normalizedClient) {
          return true;
        }
        const notes = toStringValue(row.notes);
        return notes.includes(`cliente:${clientId}`);
      })
      .sort((left, right) => toDateValue(toStringValue(right.due_date)) - toDateValue(toStringValue(left.due_date)));
  }, [clientId, clientName, tasks]);

  const recentBookings = useMemo(
    () => bookings.slice().sort((left, right) => toDateTimeValue(right.date, right.time) - toDateTimeValue(left.date, left.time)),
    [bookings],
  );

  const agentPreviewReferenceDate = useMemo(
    () => resolveLatestServiceDate(bookings, agentDraft.serviceName) || TODAY(),
    [agentDraft.serviceName, bookings],
  );

  const agentPreviewNextDate = useMemo(
    () => addInterval(agentPreviewReferenceDate, Number(agentDraft.intervalValue) || 1, agentDraft.intervalUnit),
    [agentDraft.intervalUnit, agentDraft.intervalValue, agentPreviewReferenceDate],
  );

  const agentPreviewMessage = useMemo(
    () => renderAgentMessage(agentDraft.messageTemplate, {
      cliente: clientName || 'Cliente',
      servico: agentDraft.serviceName || 'servico',
      data_proxima: formatDate(agentPreviewNextDate),
    }),
    [agentDraft.messageTemplate, agentDraft.serviceName, agentPreviewNextDate, clientName],
  );

  const agentExecutionDecision = useMemo(
    () => resolveAgentDecision({
      summary,
      requestedChannel: agentDraft.channel,
      queuedEvents: clientEvents.filter((event) => event.status === 'queued').length,
      pendingTasks: clientTaskTimeline.filter((task) => toStringValue(task.status) !== 'concluida').length,
    }),
    [agentDraft.channel, clientEvents, clientTaskTimeline, summary],
  );

  const agentControlTower = useMemo(
    () => buildAgentControlTower({
      summary,
      clientRules,
      clientEvents,
      clientTaskTimeline,
      currentClient,
      agentDraft,
      agentPreviewReferenceDate,
      agentPreviewNextDate,
      decision: agentExecutionDecision,
    }),
    [
      agentDraft,
      agentExecutionDecision,
      agentPreviewNextDate,
      agentPreviewReferenceDate,
      clientEvents,
      clientRules,
      clientTaskTimeline,
      currentClient,
      summary,
    ],
  );

  const activeRulesCount = clientRules.filter((rule) => rule.enabled).length;
  const queuedEventsCount = clientEvents.filter((event) => event.status === 'queued').length;
  const pendingTaskCount = clientTaskTimeline.filter((task) => toStringValue(task.status) !== 'concluida').length;
  const recentAgentEvents = clientEvents.slice(0, 4);

  const handleSaveClient = async () => {
    if (!clientId) return;
    setSaving(true);
    setAgentError('');
    try {
      await updateWorkbenchEntityForAdmin('clients', clientId, draft, adminKey);
      const nextClient = { ...currentClient, ...draft };
      setCurrentClient(nextClient);
      setDraft(nextClient);
      await onClientUpdated();
      setEditOpen(false);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Erro ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!clientId) return;
    setSaving(true);
    setAgentError('');
    try {
      await deleteWorkbenchEntityForAdmin('clients', clientId, adminKey);
      await onClientUpdated();
      setDeleteOpen(false);
      onClose();
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Erro ao remover cliente.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRule = async () => {
    if (!clientId) return;
    const serviceName = agentDraft.serviceName.trim();
    const intervalValue = Number(agentDraft.intervalValue);

    if (!serviceName || !Number.isFinite(intervalValue) || intervalValue < 1) {
      setAgentError('Informe servico e intervalo valido para programar o agente.');
      return;
    }

    const duplicatedRule = rules.some((rule) => (
      rule.clientId === clientId
      && rule.enabled
      && rule.serviceName.trim().toLowerCase() === serviceName.toLowerCase()
      && rule.channel === agentDraft.channel
    ));
    if (duplicatedRule) {
      setAgentError('Ja existe uma regra ativa para este servico e canal neste cliente.');
      return;
    }

    const latestServiceDate = resolveLatestServiceDate(bookings, serviceName);
    const referenceDate = latestServiceDate || TODAY();
    const nextRunDate = addInterval(referenceDate, intervalValue, agentDraft.intervalUnit);
    const now = new Date().toISOString();
    const newRule: ClientAgentRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      clientId,
      clientName,
      serviceName,
      intervalValue,
      intervalUnit: agentDraft.intervalUnit,
      channel: agentDraft.channel,
      messageTemplate: agentDraft.messageTemplate.trim(),
      enabled: true,
      referenceDate,
      nextRunDate,
      createdAt: now,
      updatedAt: now,
      lastExecutedAt: null,
    };

    setAgentError('');
    try {
      await onSaveAgentState([...rules, newRule], events);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Falha ao salvar regra de recorrencia.');
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    const now = new Date().toISOString();
    const nextRules = rules.map((rule) => (
      rule.id === ruleId
        ? { ...rule, enabled, updatedAt: now }
        : rule
    ));
    try {
      await onSaveAgentState(nextRules, events);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Falha ao atualizar regra.');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const nextRules = rules.filter((rule) => rule.id !== ruleId);
    const nextEvents = events.filter((event) => event.ruleId !== ruleId);
    try {
      await onSaveAgentState(nextRules, nextEvents);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Falha ao remover regra.');
    }
  };

  const handleRunRule = async (rule: ClientAgentRule) => {
    setAgentBusyRule(rule.id);
    setAgentError('');
    try {
      const today = TODAY();
      const scheduledFor = isSameOrBefore(rule.nextRunDate, today) ? today : rule.nextRunDate;
      const decision = resolveAgentDecision({
        summary,
        requestedChannel: rule.channel,
        queuedEvents: events.filter((event) => event.status === 'queued').length,
        pendingTasks: clientTaskTimeline.filter((task) => toStringValue(task.status) !== 'concluida').length,
      });
      const duplicated = events.some((event) => event.ruleId === rule.id && event.scheduledFor === scheduledFor && event.status === 'queued');
      const duplicatedTask = clientTaskTimeline.some((task) => (
        toStringValue(task.notes).includes(`rule:${rule.id}`)
        && toStringValue(task.due_date) === scheduledFor
        && toStringValue(task.status) !== 'concluida'
      ));
      if (duplicated || duplicatedTask) {
        const skippedEvent: ClientAgentEvent = {
          id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ruleId: rule.id,
          clientId: rule.clientId,
          clientName: rule.clientName,
          serviceName: rule.serviceName,
          channel: rule.channel,
          scheduledFor,
          messagePreview: '',
          createdAt: new Date().toISOString(),
          taskId: null,
          status: 'skipped',
          reason: duplicatedTask ? 'Tarefa operacional ja existe para a mesma data.' : 'Aviso ja existe para a mesma data.',
        };
        await onSaveAgentState(rules, [skippedEvent, ...events]);
        return;
      }

      const preview = renderAgentMessage(rule.messageTemplate, {
        cliente: rule.clientName,
        servico: rule.serviceName,
        data_proxima: formatDate(scheduledFor),
      });

      const taskRow = await createWorkbenchEntityForAdmin(
        'tasks',
        {
          title: `${decision.priority === 'alta' ? 'Acao prioritaria' : 'Aviso recorrencia'}: ${rule.clientName} - ${rule.serviceName}`,
          owner: decision.owner,
          due_date: scheduledFor,
          priority: decision.priority,
          status: 'pendente',
          related_client: rule.clientName,
          notes: `agente_cliente|rule:${rule.id}|cliente:${rule.clientId}|canal:${decision.channel}|prioridade:${decision.priority}|score:${decision.urgencyScore}|modo:${decision.modeLabel}|mensagem:${preview}`,
        },
        adminKey,
      );

      const now = new Date().toISOString();
      const queuedEvent: ClientAgentEvent = {
        id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ruleId: rule.id,
        clientId: rule.clientId,
        clientName: rule.clientName,
        serviceName: rule.serviceName,
        channel: rule.channel,
        scheduledFor,
        messagePreview: preview,
        createdAt: now,
        taskId: toNumber(taskRow.id) || null,
        status: 'queued',
        reason: null,
      };

      const nextRules = rules.map((row) => {
        if (row.id !== rule.id) return row;
        const nextReferenceDate = scheduledFor;
        return {
          ...row,
          referenceDate: nextReferenceDate,
          nextRunDate: addInterval(nextReferenceDate, row.intervalValue, row.intervalUnit),
          updatedAt: now,
          lastExecutedAt: now,
        };
      });

      await onSaveAgentState(nextRules, [queuedEvent, ...events]);
      await loadClientContext();
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Falha ao executar agente simulado.');
    } finally {
      setAgentBusyRule(null);
    }
  };

  const toneClass = clientStatus === 'VIP'
    ? 'tone-vip'
    : summary.overdueRuleCount > 0 || clientStatus === 'em risco' || clientStatus === 'inativo'
      ? 'tone-risk'
      : summary.activeRuleCount > 0 || clientStatus === 'recorrente'
        ? 'tone-active'
        : 'tone-neutral';

  return (
    <>
      <div className="admin-modal-root clientes-modal-root">
        <div className="admin-modal-overlay" onClick={onClose} />
        <div className="admin-modal-card clientes-modal-card" role="dialog" aria-modal="true">
          <div className="admin-modal-header clientes-modal-header clientes-modal-hero">
            <div className="clientes-modal-ident">
              <div className={`clientes-modal-avatar ${toneClass}`}>{getClientInitials(clientName)}</div>
              <div className="clientes-modal-headline">
                <div className="clientes-modal-badges">
                  <span className={`clientes-pill ${toneClass}`}>{clientStatus}</span>
                  <span className="clientes-pill clientes-pill-muted">{summary.activeRuleCount} regras</span>
                  {summary.nextReminder && <span className="clientes-pill clientes-pill-accent">Proximo aviso {formatDate(summary.nextReminder)}</span>}
                </div>
                <h3 className="admin-modal-title">{clientName || 'Cliente'}</h3>
                <p className="admin-modal-subtitle">
                  Painel 360 de relacionamento com leitura financeira, servicos, recorrencia e historico operacional.
                </p>
                <div className="clientes-modal-contactline">
                  <span><Phone className="w-3.5 h-3.5" /> {clientPhone || '--'}</span>
                  <span><Mail className="w-3.5 h-3.5" /> {toStringValue(currentClient.email) || 'email nao informado'}</span>
                </div>
              </div>
            </div>

            <div className="clientes-modal-actions">
              <button type="button" className="admin-btn-outline" onClick={() => setEditOpen((current) => !current)}>
                {editOpen ? 'Fechar edicao' : 'Editar cadastro'}
              </button>
              <button type="button" className="admin-btn-outline admin-btn-danger-soft" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-4 h-4" />
                Remover
              </button>
              <button type="button" className="admin-btn-outline" onClick={onClose}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="clientes-modal-kpis">
              <article>
                <span>Total gasto</span>
                <strong>{formatCurrency(summary.totalSpent)}</strong>
              </article>
              <article>
                <span>Visitas</span>
                <strong>{summary.visitCount}</strong>
              </article>
              <article>
                <span>Ticket medio</span>
                <strong>{formatCurrency(summary.avgTicket)}</strong>
              </article>
              <article>
                <span>Ultimo retorno</span>
                <strong>{summary.lastVisit ? formatDate(summary.lastVisit.date) : '--'}</strong>
              </article>
              <article>
                <span>Sem retorno</span>
                <strong>{formatDormancy(summary.dormancyDays)}</strong>
              </article>
            </div>
          </div>

          <div className="clientes-modal-tabs">
            {([
              { key: 'resumo', label: 'Resumo' },
              { key: 'agente', label: 'Agente' },
              { key: 'timeline', label: 'Timeline' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? 'active' : ''}
                onClick={() => setActiveTab(tab.key)}
                title={tab.label}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="admin-modal-body clientes-modal-body">
            {agentError && <div className="clientes-error">{agentError}</div>}

            {loading ? (
              <div className="clientes-loading-board">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando contexto completo do cliente...
              </div>
            ) : (
              <>
                {activeTab === 'resumo' && (
                  <div className="clientes-panel-shell">
                    <section className="clientes-surface clientes-summary-strip">
                      <article>
                        <span>Servico ancora</span>
                        <strong>{summary.services[0]?.name || toStringValue(currentClient.preferred_service) || 'Nao definido'}</strong>
                        <small>Leitura baseada no historico confirmado.</small>
                      </article>
                      <article>
                        <span>Proximo disparo</span>
                        <strong>{summary.nextReminder ? formatDate(summary.nextReminder) : '--'}</strong>
                        <small>{summary.activeRuleCount > 0 ? `${summary.activeRuleCount} rotina(s) ativa(s)` : 'Sem recorrencia automatizada'}</small>
                      </article>
                      <article>
                        <span>Pressao comercial</span>
                        <strong>{summary.overdueRuleCount > 0 ? 'Alta' : summary.dormancyDays !== null && summary.dormancyDays >= 60 ? 'Media' : 'Estavel'}</strong>
                        <small>{summary.overdueRuleCount > 0 ? `${summary.overdueRuleCount} aviso(s) fora da janela` : 'Sem alertas de atraso no momento'}</small>
                      </article>
                    </section>

                    <div className="clientes-summary-layout">
                      <div className="clientes-summary-main">
                        <section className="clientes-surface">
                          <div className="clientes-section-head">
                            <div>
                              <h4><Sparkles className="w-4 h-4" /> Inteligencia de servicos</h4>
                              <p>Quais servicos puxam o relacionamento e qual recorrencia faz sentido para cada um.</p>
                            </div>
                          </div>
                          {summary.services.length === 0 ? (
                            <p className="clientes-empty">Ainda nao ha historico confirmado para consolidar servicos.</p>
                          ) : (
                            <div className="clientes-service-stack">
                              {summary.services.map((service) => {
                                const maxCount = summary.services[0]?.count || 1;
                                const width = `${Math.max(18, Math.round((service.count / maxCount) * 100))}%`;
                                const recommendation = recommendCadence(service.name);
                                return (
                                  <article key={service.name} className="clientes-service-rank">
                                    <div className="clientes-service-meta">
                                      <strong>{service.name}</strong>
                                      <span>{service.count}x no historico confirmado</span>
                                    </div>
                                    <div className="clientes-service-bar">
                                      <span style={{ width }} />
                                    </div>
                                    <div className="clientes-service-foot">
                                      <small>Ultima vez: {service.lastDate ? formatDate(service.lastDate) : '--'}</small>
                                      <small>Cadencia sugerida: {formatInterval(recommendation.value, recommendation.unit)}</small>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </section>

                        <section className="clientes-surface">
                          <div className="clientes-section-head">
                            <div>
                              <h4><CalendarClock className="w-4 h-4" /> Agenda e historico recente</h4>
                              <p>Visao das ultimas passagens que formam o comportamento do cliente.</p>
                            </div>
                          </div>
                          {recentBookings.length === 0 ? (
                            <p className="clientes-empty">Nenhum agendamento encontrado para este cliente.</p>
                          ) : (
                            <div className="clientes-booking-feed">
                              {recentBookings.slice(0, 8).map((booking) => (
                                <article key={booking.id} className="clientes-booking-entry">
                                  <div>
                                    <strong>{booking.serviceItems.length > 0 ? booking.serviceItems.map((item) => item.name).join(', ') : booking.service}</strong>
                                    <span>{formatDate(booking.date)} as {booking.time || '--'}{booking.professionalName ? ` | ${booking.professionalName}` : ''}</span>
                                  </div>
                                  <div className="clientes-booking-side">
                                    <small>{formatCurrency(getBookingTotal(booking))}</small>
                                    <span className={`status-${booking.status}`}>{booking.status}</span>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>

                      <aside className="clientes-summary-side">
                        <section className="clientes-surface">
                          <div className="clientes-section-head">
                            <div>
                              <h4><UserRound className="w-4 h-4" /> Cadastro e preferencias</h4>
                              <p>Central de dados do cliente, com edicao inline no mesmo painel.</p>
                            </div>
                          </div>

                          {editOpen ? (
                            <div className="clientes-edit-grid">
                              <div>
                                <label className="admin-label">Nome</label>
                                <input className="admin-input" value={toStringValue(draft.name)} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                              </div>
                              <div>
                                <label className="admin-label">Telefone</label>
                                <input className="admin-input" value={toStringValue(draft.phone)} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
                              </div>
                              <div>
                                <label className="admin-label">Email</label>
                                <input className="admin-input" value={toStringValue(draft.email)} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
                              </div>
                              <div>
                                <label className="admin-label">Status</label>
                                <select className="admin-input" value={toStringValue(draft.status) || 'novo'} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                                  {CLIENT_COLUMNS.map((column) => (
                                    <option key={column.status} value={column.status}>{column.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="admin-label">Servico preferido</label>
                                <input className="admin-input" value={toStringValue(draft.preferred_service)} onChange={(event) => setDraft((current) => ({ ...current, preferred_service: event.target.value }))} />
                              </div>
                              <div>
                                <label className="admin-label">Profissional preferido</label>
                                <input className="admin-input" value={toStringValue(draft.preferred_professional)} onChange={(event) => setDraft((current) => ({ ...current, preferred_professional: event.target.value }))} />
                              </div>
                              <div className="clientes-edit-full">
                                <label className="admin-label">Observacoes</label>
                                <textarea className="admin-input" rows={4} value={toStringValue(draft.notes)} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
                              </div>
                              <div className="clientes-inline-actions">
                                <button type="button" className="admin-btn-outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</button>
                                <button type="button" className="admin-btn-primary" onClick={() => void handleSaveClient()} disabled={saving}>
                                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar ajustes'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="clientes-profile-grid">
                              <div><span>Telefone</span><strong>{clientPhone || '--'}</strong></div>
                              <div><span>Email</span><strong>{toStringValue(currentClient.email) || '--'}</strong></div>
                              <div><span>Status</span><strong>{clientStatus}</strong></div>
                              <div><span>Servico preferido</span><strong>{toStringValue(currentClient.preferred_service) || '--'}</strong></div>
                              <div><span>Profissional preferido</span><strong>{toStringValue(currentClient.preferred_professional) || '--'}</strong></div>
                              <div><span>Observacoes</span><strong>{toStringValue(currentClient.notes) || '--'}</strong></div>
                            </div>
                          )}
                        </section>

                        <section className="clientes-surface">
                          <div className="clientes-section-head">
                            <div>
                              <h4><Bot className="w-4 h-4" /> Leituras do agente</h4>
                              <p>Interpretacao operacional sobre retorno, janela e proxima melhor acao.</p>
                            </div>
                          </div>
                          <div className="clientes-recommendation-list">
                            <article>
                              <strong>Janela atual</strong>
                              <span>{summary.nextReminder ? `Proximo ponto de contato em ${formatDate(summary.nextReminder)}` : 'Sem janela agendada no momento'}</span>
                            </article>
                            <article>
                              <strong>Saude da carteira</strong>
                              <span>{summary.overdueRuleCount > 0 ? `${summary.overdueRuleCount} aviso(s) precisam de acao` : 'Sem atrasos estruturais de recorrencia'}</span>
                            </article>
                            <article>
                              <strong>Servico lider</strong>
                              <span>{summary.services[0]?.name || toStringValue(currentClient.preferred_service) || 'Ainda nao identificado'}</span>
                            </article>
                            <article>
                              <strong>Acao recomendada</strong>
                              <span>{summary.dormancyDays !== null && summary.dormancyDays >= 60 ? 'Abrir fluxo de reativacao com oferta contextual.' : 'Manter o ciclo com lembrete programado por servico.'}</span>
                            </article>
                          </div>
                        </section>
                      </aside>
                    </div>
                  </div>
                )}

                {activeTab === 'agente' && (
                  <div className="clientes-agent-shell">
                    <section className="clientes-surface clientes-agent-overview">
                      <div className="clientes-section-head">
                        <div>
                          <h4><Bot className="w-4 h-4" /> Central do agente</h4>
                          <p>Visao executiva do motor de recorrencia, com prioridade, proximo ciclo e saude da fila.</p>
                        </div>
                      </div>

                      <div className="clientes-agent-overview-grid">
                        <article className={`clientes-agent-overview-card tone-${agentExecutionDecision.tone}`}>
                          <span>Modo do motor</span>
                          <strong>{agentExecutionDecision.modeLabel}</strong>
                          <small>{agentExecutionDecision.modeDetail}</small>
                        </article>
                        <article className={`clientes-agent-overview-card tone-${agentExecutionDecision.priority === 'alta' ? 'risk' : agentExecutionDecision.priority === 'media' ? 'active' : 'neutral'}`}>
                          <span>Prioridade</span>
                          <strong>{agentExecutionDecision.priorityLabel}</strong>
                          <small>{agentExecutionDecision.owner} | score {agentExecutionDecision.urgencyScore}/100</small>
                        </article>
                        <article className="clientes-agent-overview-card">
                          <span>Proximo ciclo</span>
                          <strong>{formatDate(agentPreviewNextDate)}</strong>
                          <small>{queuedEventsCount} evento(s) em fila | {pendingTaskCount} tarefa(s) aberta(s)</small>
                        </article>
                        <article className="clientes-agent-overview-card">
                          <span>Pipeline</span>
                          <strong>{activeRulesCount} regra(s) ativa(s)</strong>
                          <small>{clientEvents.length > 0 ? `${clientEvents.length} evento(s) historicos rastreados` : 'Sem historico operacional do agente ainda.'}</small>
                        </article>
                      </div>
                    </section>

                    <div className="clientes-agent-workspace">
                      <section className="clientes-surface clientes-agent-lab">
                        <div className="clientes-section-head">
                          <div>
                            <h4><Sparkles className="w-4 h-4" /> Laboratorio de recorrencia</h4>
                            <p>Configure o agente por servico, intervalo, canal e mensagem final, sem excesso visual.</p>
                          </div>
                        </div>

                        <div className="clientes-agent-scenarios clientes-agent-scenarios-compact">
                          {serviceScenarios.length === 0 ? (
                            <p className="clientes-empty">Sem dados suficientes para sugerir cadencia automatica ainda.</p>
                          ) : (
                            serviceScenarios.map((scenario) => (
                              <button
                                key={scenario.serviceName}
                                type="button"
                                className="clientes-scenario-card"
                                onClick={() => setAgentDraft((current) => ({
                                  ...current,
                                  serviceName: scenario.serviceName,
                                  intervalValue: scenario.recommendation.value,
                                  intervalUnit: scenario.recommendation.unit,
                                }))}
                              >
                                <strong>{scenario.serviceName}</strong>
                                <span>{formatInterval(scenario.recommendation.value, scenario.recommendation.unit)}</span>
                                <small>{scenario.lastDate ? `Ultimo servico ${formatDate(scenario.lastDate)}` : 'Sem ultima data consolidada'}</small>
                              </button>
                            ))
                          )}
                        </div>

                        <div className="clientes-agent-preview clientes-agent-preview-grid">
                          <div>
                            <span>Referencia atual</span>
                            <strong>{formatDate(agentPreviewReferenceDate)}</strong>
                            <p>Base usada para recalcular o proximo ciclo do servico gatilho.</p>
                          </div>
                          <div>
                            <span>Proxima execucao</span>
                            <strong>{formatDate(agentPreviewNextDate)}</strong>
                            <p>{agentExecutionDecision.priorityLabel} | {agentExecutionDecision.owner}</p>
                          </div>
                          <div>
                            <span>Mensagem gerada</span>
                            <p>{agentPreviewMessage}</p>
                          </div>
                          <div>
                            <span>Roteamento</span>
                            <strong>{agentExecutionDecision.modeLabel}</strong>
                            <p>{agentControlTower.channelDetail}</p>
                          </div>
                        </div>

                        <div className="clientes-agent-form">
                          <div>
                            <label className="admin-label">Servico gatilho</label>
                            <input className="admin-input" value={agentDraft.serviceName} onChange={(event) => setAgentDraft((current) => ({ ...current, serviceName: event.target.value }))} />
                          </div>
                          <div>
                            <label className="admin-label">Intervalo</label>
                            <input className="admin-input" type="number" min={1} value={agentDraft.intervalValue} onChange={(event) => setAgentDraft((current) => ({ ...current, intervalValue: Number(event.target.value) || 1 }))} />
                          </div>
                          <div>
                            <label className="admin-label">Unidade</label>
                            <select className="admin-input" value={agentDraft.intervalUnit} onChange={(event) => setAgentDraft((current) => ({ ...current, intervalUnit: event.target.value as ClientAgentIntervalUnit }))}>
                              <option value="days">Dias</option>
                              <option value="weeks">Semanas</option>
                              <option value="months">Meses</option>
                            </select>
                          </div>
                          <div>
                            <label className="admin-label">Canal</label>
                            <select className="admin-input" value={agentDraft.channel} onChange={(event) => setAgentDraft((current) => ({ ...current, channel: event.target.value as ClientAgentChannel }))}>
                              <option value="manual">Manual</option>
                              <option value="whatsapp">WhatsApp</option>
                              <option value="email">Email</option>
                            </select>
                          </div>
                          <div className="clientes-edit-full">
                            <label className="admin-label">Template</label>
                            <textarea className="admin-input" rows={5} value={agentDraft.messageTemplate} onChange={(event) => setAgentDraft((current) => ({ ...current, messageTemplate: event.target.value }))} />
                          </div>
                        </div>

                        <div className="clientes-inline-actions">
                          <button type="button" className="admin-btn-primary" onClick={() => void handleCreateRule()}>
                            <Send className="w-3.5 h-3.5" />
                            Programar regra
                          </button>
                        </div>
                      </section>

                      <section className="clientes-surface clientes-agent-pipeline">
                        <div className="clientes-section-head">
                          <div>
                            <h4><Sparkles className="w-4 h-4" /> Pipeline do agente</h4>
                            <p>Regras ativas, fila recente e comandos de execucao em um painel mais enxuto.</p>
                          </div>
                        </div>

                        <div className="clientes-agent-totals">
                          <article><span>Regras totais</span><strong>{clientRules.length}</strong></article>
                          <article><span>Ativas</span><strong>{activeRulesCount}</strong></article>
                          <article><span>Fila</span><strong>{queuedEventsCount}</strong></article>
                        </div>

                        {clientRules.length === 0 ? (
                          <div className="clientes-agent-empty-state">
                            <strong>Nenhuma regra programada</strong>
                            <p>Configure um servico gatilho ao lado para colocar o agente em operacao.</p>
                          </div>
                        ) : (
                          <div className="clientes-agent-rules-list">
                            {clientRules.map((rule) => (
                              <article key={rule.id} className="clientes-rule-card">
                                <div className="clientes-rule-head">
                                  <div>
                                    <strong>{rule.serviceName}</strong>
                                    <span>{formatInterval(rule.intervalValue, rule.intervalUnit)} | canal {rule.channel}</span>
                                  </div>
                                  <span className={`clientes-pill ${rule.enabled ? 'tone-active' : 'tone-neutral'}`}>
                                    {rule.enabled ? 'ativa' : 'pausada'}
                                  </span>
                                </div>
                                <div className="clientes-rule-grid">
                                  <div><span>Referencia</span><strong>{formatDate(rule.referenceDate)}</strong></div>
                                  <div><span>Proximo ciclo</span><strong>{formatDate(rule.nextRunDate)}</strong></div>
                                  <div><span>Ultima execucao</span><strong>{rule.lastExecutedAt ? formatDateTime(rule.lastExecutedAt) : '--'}</strong></div>
                                </div>
                                <p>{rule.messageTemplate}</p>
                                <div className="clientes-rule-actions">
                                  <button type="button" className="admin-btn-outline" onClick={() => void handleToggleRule(rule.id, !rule.enabled)}>
                                    {rule.enabled ? 'Pausar' : 'Reativar'}
                                  </button>
                                  <button type="button" className="admin-btn-primary" onClick={() => void handleRunRule(rule)} disabled={agentBusyRule === rule.id}>
                                    {agentBusyRule === rule.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                    Executar
                                  </button>
                                  <button type="button" className="admin-btn-outline admin-btn-danger-soft" onClick={() => void handleDeleteRule(rule.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}

                        {recentAgentEvents.length > 0 && (
                          <div className="clientes-agent-queue-board">
                            <div className="clientes-section-head">
                              <div>
                                <h4><CalendarClock className="w-4 h-4" /> Fila recente</h4>
                                <p>Ultimos disparos e skips rastreados pelo motor.</p>
                              </div>
                            </div>
                            <div className="clientes-agent-queue-list">
                              {recentAgentEvents.map((event) => (
                                <article key={event.id}>
                                  <div>
                                    <strong>{event.serviceName}</strong>
                                    <span>{formatDate(event.scheduledFor)} | canal {event.channel}</span>
                                    <small>{event.messagePreview || event.reason || 'Sem mensagem registrada'}</small>
                                  </div>
                                  <span className={`event-${event.status}`}>{event.status}</span>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                      </section>
                    </div>

                    <div className="clientes-agent-support-grid">
                      <section className="clientes-surface">
                        <div className="clientes-section-head">
                          <div>
                            <h4><Bot className="w-4 h-4" /> Fluxo do motor</h4>
                            <p>Resumo operacional do caminho de decisao do agente, sem espalhar cards demais pela tela.</p>
                          </div>
                        </div>

                        <div className="clientes-agent-flow-list">
                          {agentControlTower.nodes.map((node) => (
                            <article key={node.label} className={`clientes-agent-flow-row tone-${node.tone}`}>
                              <div>
                                <span>{node.label}</span>
                                <strong>{node.value}</strong>
                              </div>
                              <small>{node.detail}</small>
                            </article>
                          ))}
                        </div>
                      </section>

                      <section className="clientes-surface clientes-agent-intelligence">
                        <div className="clientes-section-head">
                          <div>
                            <h4><Crown className="w-4 h-4" /> Inteligencia e guardrails</h4>
                            <p>Playbooks de acao e regras de seguranca que governam o comportamento do motor.</p>
                          </div>
                        </div>

                        <div className="clientes-agent-playbook-list">
                          {agentControlTower.playbooks.map((playbook) => (
                            <article key={playbook.badge} className={`clientes-agent-playbook-row tone-${playbook.tone}`}>
                              <div className="clientes-agent-playbook-head">
                                <span>{playbook.badge}</span>
                                {playbook.tone === 'vip' ? <Crown className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                              </div>
                              <strong>{playbook.title}</strong>
                              <p>{playbook.action}</p>
                              <small>{playbook.rationale}</small>
                            </article>
                          ))}
                        </div>

                        <div className="clientes-agent-guardrails">
                          <div className="clientes-section-head">
                            <div>
                              <h4><CheckCircle2 className="w-4 h-4" /> Guardrails</h4>
                              <p>Camada de seguranca e consistencia para o agente nao virar automacao cega.</p>
                            </div>
                          </div>
                          <div className="clientes-agent-guardrail-list">
                            {agentControlTower.guardrails.map((guardrail) => (
                              <article key={guardrail}>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>{guardrail}</span>
                              </article>
                            ))}
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                )}

                {activeTab === 'timeline' && (
                  <div className="clientes-timeline-dashboard">
                    <section className="clientes-surface clientes-timeline-summary">
                      <article>
                        <span>Agendamentos</span>
                        <strong>{bookings.length}</strong>
                      </article>
                      <article>
                        <span>Eventos do agente</span>
                        <strong>{clientEvents.length}</strong>
                      </article>
                      <article>
                        <span>Tarefas geradas</span>
                        <strong>{clientTaskTimeline.length}</strong>
                      </article>
                    </section>

                    <div className="clientes-timeline-grid">
                      <section className="clientes-surface">
                        <div className="clientes-section-head">
                          <div>
                            <h4><CalendarClock className="w-4 h-4" /> Linha de agendamentos</h4>
                            <p>Todos os agendamentos associados ao telefone deste cliente.</p>
                          </div>
                        </div>
                        {recentBookings.length === 0 ? (
                          <p className="clientes-empty">Nenhum agendamento encontrado.</p>
                        ) : (
                          <div className="clientes-timeline-list">
                            {recentBookings.map((booking) => (
                              <article key={`booking-${booking.id}`}>
                                <div>
                                  <strong>{booking.serviceItems.length > 0 ? booking.serviceItems.map((item) => item.name).join(', ') : booking.service}</strong>
                                  <span>{formatDate(booking.date)} | {booking.time || '--'}</span>
                                  <small>{formatCurrency(getBookingTotal(booking))}</small>
                                </div>
                                <span className={`status-${booking.status}`}>{booking.status}</span>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="clientes-surface">
                        <div className="clientes-section-head">
                          <div>
                            <h4><Bot className="w-4 h-4" /> Eventos do agente</h4>
                            <p>Fila, skips e execucoes programadas a partir das regras.</p>
                          </div>
                        </div>
                        {clientEvents.length === 0 ? (
                          <p className="clientes-empty">Nenhum evento do agente registrado.</p>
                        ) : (
                          <div className="clientes-timeline-list">
                            {clientEvents.map((event) => (
                              <article key={event.id}>
                                <div>
                                  <strong>{event.serviceName}</strong>
                                  <span>Agendado para {formatDate(event.scheduledFor)}</span>
                                  <small>{event.messagePreview || event.reason || 'Sem mensagem registrada'}</small>
                                </div>
                                <span className={`event-${event.status}`}>{event.status}</span>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="clientes-surface">
                        <div className="clientes-section-head">
                          <div>
                            <h4><CheckCircle2 className="w-4 h-4" /> Tarefas operacionais</h4>
                            <p>Saida do agente convertida em fila de trabalho para a central.</p>
                          </div>
                        </div>
                        {clientTaskTimeline.length === 0 ? (
                          <p className="clientes-empty">Nenhuma tarefa ligada ao cliente.</p>
                        ) : (
                          <div className="clientes-timeline-list">
                            {clientTaskTimeline.map((task) => (
                              <article key={`task-${toNumber(task.id)}`}>
                                <div>
                                  <strong>{toStringValue(task.title) || 'Tarefa sem titulo'}</strong>
                                  <span>Vencimento: {formatDate(toStringValue(task.due_date))}</span>
                                  <small>{toStringValue(task.owner) || 'Sem responsavel definido'}</small>
                                </div>
                                <span className={`task-${toStringValue(task.status) === 'concluida' ? 'done' : 'pending'}`}>
                                  {toStringValue(task.status) || 'pendente'}
                                </span>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <DangerConfirmModal
        isOpen={deleteOpen}
        title="Remover cliente"
        subtitle="Esta acao apaga o cadastro deste cliente da central."
        description={`Digite REMOVER CLIENTE para excluir ${clientName || 'este cliente'}. O historico operacional continua dependendo das tabelas relacionadas.`}
        confirmText="REMOVER CLIENTE"
        confirmLabel="Excluir cliente"
        helperText="Use apenas quando o cadastro realmente nao deve mais existir nesta carteira."
        busy={saving}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => handleDeleteClient()}
      />
    </>
  );
}

export default function ClientesModule({ adminKey, tenantSlug }: Props) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [portfolioBookings, setPortfolioBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | ClientStatus>('todos');
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('todos');
  const [sortMode, setSortMode] = useState<SortMode>('proximo-aviso');
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggingClientId, setDraggingClientId] = useState<number | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [agentRules, setAgentRules] = useState<ClientAgentRule[]>([]);
  const [agentEvents, setAgentEvents] = useState<ClientAgentEvent[]>([]);
  const [agentStateLoading, setAgentStateLoading] = useState(true);
  const [agentStateSaving, setAgentStateSaving] = useState(false);
  const [createDraft, setCreateDraft] = useState<Record<string, unknown>>({
    name: '',
    phone: '',
    email: '',
    status: 'novo',
    preferred_service: '',
    preferred_professional: '',
    notes: '',
  });

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listWorkbenchEntityForAdmin('clients', adminKey);
      setClients(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar clientes.');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  const loadPortfolioBookings = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const rows = await listAdminBookings(adminKey, { scope: 'all' });
      setPortfolioBookings(rows);
    } catch (loadError) {
      setPortfolioBookings([]);
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar extrato da carteira de clientes.');
    } finally {
      setPortfolioLoading(false);
    }
  }, [adminKey]);

  const loadAgentState = useCallback(async () => {
    setAgentStateLoading(true);
    try {
      const response = await getClientAgentStateForAdmin(adminKey, tenantSlug);
      setAgentRules(response.rules);
      setAgentEvents(response.events);
    } catch (loadError) {
      if (loadError instanceof Error && /\b404\b/.test(loadError.message)) {
        setAgentRules([]);
        setAgentEvents([]);
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar agente de clientes.');
      }
    } finally {
      setAgentStateLoading(false);
    }
  }, [adminKey, tenantSlug]);

  const persistAgentState = useCallback(async (nextRules: ClientAgentRule[], nextEvents: ClientAgentEvent[]) => {
    setAgentStateSaving(true);
    setError('');
    try {
      const saved = await saveClientAgentStateForAdmin(
        { rules: nextRules, events: nextEvents.slice(0, 600) },
        adminKey,
        tenantSlug,
      );
      setAgentRules(saved.rules);
      setAgentEvents(saved.events);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Erro ao salvar estado do agente de clientes.';
      setError(message);
      throw saveError;
    } finally {
      setAgentStateSaving(false);
    }
  }, [adminKey, tenantSlug]);

  useEffect(() => {
    void Promise.all([loadClients(), loadAgentState(), loadPortfolioBookings()]);
  }, [loadAgentState, loadClients, loadPortfolioBookings]);

  const bookingsByPhone = useMemo(() => {
    const grouped = new Map<string, AdminBooking[]>();
    for (const booking of portfolioBookings) {
      const phoneKey = normalizePhone(booking.phone);
      if (!phoneKey) continue;
      const rows = grouped.get(phoneKey) || [];
      rows.push(booking);
      grouped.set(phoneKey, rows);
    }
    return grouped;
  }, [portfolioBookings]);

  const rulesByClientId = useMemo(() => {
    const grouped = new Map<number, ClientAgentRule[]>();
    for (const rule of agentRules) {
      const rows = grouped.get(rule.clientId) || [];
      rows.push(rule);
      grouped.set(rule.clientId, rows);
    }
    return grouped;
  }, [agentRules]);

  const boardItems = useMemo<ClientBoardItem[]>(() => (
    clients.map((client) => ({
      client,
      insight: buildClientInsight(client, bookingsByPhone, rulesByClientId),
    }))
  ), [bookingsByPhone, clients, rulesByClientId]);

  const filteredBoardItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const items = boardItems.filter(({ client, insight }) => {
      const name = toStringValue(client.name).toLowerCase();
      const phone = toStringValue(client.phone).toLowerCase();
      const email = toStringValue(client.email).toLowerCase();
      const status = toStringValue(client.status).toLowerCase();
      const preferredService = toStringValue(client.preferred_service).toLowerCase();
      const topService = insight.topService.toLowerCase();

      const searchOk = !term || name.includes(term) || phone.includes(term) || email.includes(term) || status.includes(term) || preferredService.includes(term) || topService.includes(term);
      const statusOk = statusFilter === 'todos' || normalizeClientStatus(client.status) === statusFilter;
      const focusOk = focusFilter === 'todos'
        || (focusFilter === 'com-agente' && insight.activeRuleCount > 0)
        || (focusFilter === 'reativacao' && (insight.tone === 'risk' || normalizeClientStatus(client.status) === 'inativo'))
        || (focusFilter === 'alto-valor' && (normalizeClientStatus(client.status) === 'VIP' || insight.totalSpent >= 1200))
        || (focusFilter === 'sem-retorno' && insight.dormancyDays !== null && insight.dormancyDays >= 60);

      return searchOk && statusOk && focusOk;
    });

    return items.slice().sort((left, right) => {
      if (sortMode === 'valor') {
        return right.insight.totalSpent - left.insight.totalSpent;
      }
      if (sortMode === 'ultima-visita') {
        return toDateValue(right.insight.lastVisit) - toDateValue(left.insight.lastVisit);
      }
      if (sortMode === 'nome') {
        return toStringValue(left.client.name).localeCompare(toStringValue(right.client.name), 'pt-BR');
      }

      const leftReminder = left.insight.nextReminder ? toDateValue(left.insight.nextReminder) : Number.MAX_SAFE_INTEGER;
      const rightReminder = right.insight.nextReminder ? toDateValue(right.insight.nextReminder) : Number.MAX_SAFE_INTEGER;
      if (leftReminder !== rightReminder) {
        return leftReminder - rightReminder;
      }
      return right.insight.totalSpent - left.insight.totalSpent;
    });
  }, [boardItems, focusFilter, search, sortMode, statusFilter]);

  const groupedClients = useMemo(() => {
    const grouped = new Map<ClientStatus, ClientBoardItem[]>();
    CLIENT_COLUMNS.forEach((column) => grouped.set(column.status, []));
    for (const item of filteredBoardItems) {
      const status = normalizeClientStatus(item.client.status);
      grouped.get(status)?.push(item);
    }
    return grouped;
  }, [filteredBoardItems]);

  const overview = useMemo(() => {
    const totalRevenue = boardItems.reduce((sum, item) => sum + item.insight.totalSpent, 0);
    const totalVisits = boardItems.reduce((sum, item) => sum + item.insight.visitCount, 0);
    const upcoming = boardItems.filter((item) => item.insight.nextReminder).length;
    const vip = boardItems.filter((item) => normalizeClientStatus(item.client.status) === 'VIP').length;
    const risk = boardItems.filter((item) => item.insight.tone === 'risk').length;
    const active = boardItems.filter((item) => ['ativo', 'recorrente', 'VIP'].includes(normalizeClientStatus(item.client.status))).length;
    return {
      total: boardItems.length,
      active,
      upcoming,
      vip,
      risk,
      totalRevenue,
      averageTicket: totalVisits > 0 ? totalRevenue / totalVisits : 0,
    };
  }, [boardItems]);

  const upcomingRadar = useMemo(() => (
    boardItems
      .filter((item) => item.insight.nextReminder)
      .slice()
      .sort((left, right) => toDateValue(left.insight.nextReminder) - toDateValue(right.insight.nextReminder))
      .slice(0, 5)
  ), [boardItems]);

  const hotList = useMemo(() => (
    boardItems
      .slice()
      .sort((left, right) => right.insight.totalSpent - left.insight.totalSpent)
      .slice(0, 4)
  ), [boardItems]);

  const selectedResolvedClient = useMemo(() => {
    if (!selectedClient) return null;
    const selectedId = toNumber(selectedClient.id);
    if (!selectedId) return selectedClient;
    return boardItems.find((item) => toNumber(item.client.id) === selectedId)?.client || selectedClient;
  }, [boardItems, selectedClient]);

  const handleCreateClient = async () => {
    if (!toStringValue(createDraft.name).trim() || !toStringValue(createDraft.phone).trim()) {
      setError('Nome e telefone sao obrigatorios para criar cliente.');
      return;
    }
    setSavingCreate(true);
    setError('');
    try {
      await createWorkbenchEntityForAdmin('clients', createDraft, adminKey);
      setShowCreateModal(false);
      setCreateDraft({
        name: '',
        phone: '',
        email: '',
        status: 'novo',
        preferred_service: '',
        preferred_professional: '',
        notes: '',
      });
      await Promise.all([loadClients(), loadPortfolioBookings()]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Erro ao criar cliente.');
    } finally {
      setSavingCreate(false);
    }
  };

  const moveClientToStatus = async (clientId: number, targetStatus: ClientStatus) => {
    if (!clientId) return;
    const previous = clients;
    setClients((current) => current.map((row) => (toNumber(row.id) === clientId ? { ...row, status: targetStatus } : row)));
    try {
      await updateWorkbenchEntityForAdmin('clients', clientId, { status: targetStatus }, adminKey);
    } catch (moveError) {
      setClients(previous);
      setError(moveError instanceof Error ? moveError.message : 'Erro ao mover cliente no Kanban.');
    }
  };

  const busyLabel = agentStateSaving
    ? 'Salvando inteligencia do agente...'
    : agentStateLoading || portfolioLoading
      ? 'Consolidando carteira completa...'
      : '';

  return (
    <div className="clientes-module">
      <section className="clientes-command-grid">
        <article className="clientes-command-card admin-analytics-card">
          <div className="clientes-command-copy">
            <span className="clientes-kicker">Clientes Quantum CRM</span>
            <h3>Central executiva de clientes com leitura de valor, risco e recorrencia</h3>
            <p>
              A aba agora trabalha como um cockpit: extrai historico de agendamentos, mede valor por cliente,
              enxerga janelas de retorno e distribui a carteira em Kanban com sinais operacionais mais fortes.
            </p>
          </div>

          <div className="clientes-command-actions">
            <button type="button" className="admin-btn-outline" onClick={() => void Promise.all([loadClients(), loadPortfolioBookings(), loadAgentState()])}>
              <Loader2 className={`w-3.5 h-3.5 ${loading || portfolioLoading || agentStateLoading ? 'animate-spin' : ''}`} />
              Atualizar modulo
            </button>
            <button type="button" className="admin-btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-3.5 h-3.5" />
              Novo cliente
            </button>
          </div>

          <div className="clientes-command-metrics">
            <article>
              <span>Carteira total</span>
              <strong>{overview.total}</strong>
              <small>{overview.active} em fluxo ativo</small>
            </article>
            <article>
              <span>Receita da carteira</span>
              <strong>{formatCurrency(overview.totalRevenue)}</strong>
              <small>Ticket medio {formatCurrency(overview.averageTicket)}</small>
            </article>
            <article>
              <span>Retornos programados</span>
              <strong>{overview.upcoming}</strong>
              <small>Clientes com recorrencia armada</small>
            </article>
            <article>
              <span>Pressao de reativacao</span>
              <strong>{overview.risk}</strong>
              <small>Clientes em risco ou atrasados</small>
            </article>
          </div>
        </article>

        <aside className="clientes-radar-card admin-analytics-card">
          <div className="clientes-section-head">
            <div>
              <h4><Bot className="w-4 h-4" /> Radar de retorno</h4>
              <p>Quem precisa de contato ou carrega mais valor imediato.</p>
            </div>
          </div>

          <div className="clientes-radar-block">
            <span className="clientes-radar-title">Proximos avisos</span>
            {upcomingRadar.length === 0 ? (
              <p className="clientes-empty">Nenhum aviso ativo programado.</p>
            ) : (
              <div className="clientes-radar-list">
                {upcomingRadar.map((item) => (
                  <button key={`reminder-${toNumber(item.client.id) || toStringValue(item.client.phone)}`} type="button" onClick={() => setSelectedClient(item.client)}>
                    <div>
                      <strong>{toStringValue(item.client.name) || 'Cliente'}</strong>
                      <span>{item.insight.topService}</span>
                    </div>
                    <small>{item.insight.nextReminder ? formatDate(item.insight.nextReminder) : '--'}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="clientes-radar-block">
            <span className="clientes-radar-title">Carteira premium</span>
            {hotList.length === 0 ? (
              <p className="clientes-empty">Sem historico de faturamento consolidado.</p>
            ) : (
              <div className="clientes-radar-list">
                {hotList.map((item) => (
                  <button key={`vip-${toNumber(item.client.id) || toStringValue(item.client.phone)}`} type="button" onClick={() => setSelectedClient(item.client)}>
                    <div>
                      <strong>{toStringValue(item.client.name) || 'Cliente'}</strong>
                      <span>{item.insight.visitCount} visitas</span>
                    </div>
                    <small>{formatCurrency(item.insight.totalSpent)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>

      <section className="clientes-filters-card admin-analytics-card">
        <div className="clientes-toolbar-row">
          <label className="clientes-search">
            <Search className="w-3.5 h-3.5" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, telefone, email, status ou servico"
            />
          </label>

          <div className="clientes-sorter">
            <span>Ordenar</span>
            <select className="admin-input" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="proximo-aviso">Proximo aviso</option>
              <option value="valor">Maior valor</option>
              <option value="ultima-visita">Ultima visita</option>
              <option value="nome">Nome</option>
            </select>
          </div>
        </div>

        <div className="clientes-chip-row">
          <span className="clientes-chip-label">Status</span>
          <button type="button" className={statusFilter === 'todos' ? 'active' : ''} onClick={() => setStatusFilter('todos')}>Todos</button>
          {CLIENT_COLUMNS.map((column) => (
            <button
              key={column.status}
              type="button"
              className={statusFilter === column.status ? 'active' : ''}
              onClick={() => setStatusFilter(column.status)}
            >
              {column.label}
            </button>
          ))}
        </div>

        <div className="clientes-chip-row">
          <span className="clientes-chip-label">Foco</span>
          <button type="button" className={focusFilter === 'todos' ? 'active' : ''} onClick={() => setFocusFilter('todos')}>Tudo</button>
          <button type="button" className={focusFilter === 'com-agente' ? 'active' : ''} onClick={() => setFocusFilter('com-agente')}>Com agente</button>
          <button type="button" className={focusFilter === 'reativacao' ? 'active' : ''} onClick={() => setFocusFilter('reativacao')}>Reativacao</button>
          <button type="button" className={focusFilter === 'alto-valor' ? 'active' : ''} onClick={() => setFocusFilter('alto-valor')}>Alto valor</button>
          <button type="button" className={focusFilter === 'sem-retorno' ? 'active' : ''} onClick={() => setFocusFilter('sem-retorno')}>Sem retorno</button>
        </div>

        {busyLabel && (
          <div className="clientes-agent-loading">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {busyLabel}
          </div>
        )}
      </section>

      {error && <div className="clientes-error">{error}</div>}

      {loading ? (
        <div className="clientes-loading-board">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando carteira de clientes...
        </div>
      ) : (
        <section className="clientes-board-shell">
          <div className="clientes-board-header">
            <div>
              <h4>Kanban da carteira</h4>
              <p>Cards agora mostram valor acumulado, intensidade de relacao, servico ancora e janelas de retorno.</p>
            </div>
            <span>{filteredBoardItems.length} cliente(s) no recorte atual</span>
          </div>

          <div className="clientes-kanban">
            {CLIENT_COLUMNS.map((column) => {
              const columnClients = groupedClients.get(column.status) || [];
              return (
                <article
                  key={column.status}
                  className="clientes-kanban-column"
                  data-status={column.status}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggingClientId) {
                      void moveClientToStatus(draggingClientId, column.status);
                    }
                    setDraggingClientId(null);
                  }}
                >
                  <header>
                    <div>
                      <h4>{column.label}</h4>
                      <p>{column.hint}</p>
                    </div>
                    <span>{columnClients.length}</span>
                  </header>
                  <div className="clientes-kanban-list">
                    {columnClients.length === 0 ? (
                      <p className="clientes-empty">Sem clientes nesta fase.</p>
                    ) : (
                      columnClients.map((item) => {
                        const id = toNumber(item.client.id);
                        const toneClass = `tone-${item.insight.tone}`;
                        return (
                          <button
                            type="button"
                            key={id || `${toStringValue(item.client.name)}-${toStringValue(item.client.phone)}`}
                            className="clientes-card"
                            draggable={Boolean(id)}
                            onDragStart={() => setDraggingClientId(id)}
                            onClick={() => setSelectedClient(item.client)}
                          >
                            <div className={`clientes-card-accent ${toneClass}`} />
                            <div className="clientes-card-static">
                              <div className="clientes-card-head">
                                <div className={`clientes-card-avatar ${toneClass}`}>{getClientInitials(toStringValue(item.client.name))}</div>
                                <div className="clientes-card-head-main">
                                  <div className="clientes-card-identity">
                                    <strong>{toStringValue(item.client.name) || 'Cliente sem nome'}</strong>
                                  </div>
                                  <div className="clientes-card-contact">
                                    <Phone className="w-3 h-3" />
                                    <span>{toStringValue(item.client.phone) || '--'}</span>
                                  </div>
                                  <div className="clientes-card-status-row">
                                    <span className={`clientes-pill ${toneClass}`}>{item.insight.toneLabel}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="clientes-card-quickline">
                                <strong>{item.insight.topService}</strong>
                                <span>
                                  {item.insight.nextReminder
                                    ? `Aviso em ${formatDate(item.insight.nextReminder)}`
                                    : item.insight.activeRuleCount > 0
                                      ? `${item.insight.activeRuleCount} regra(s) ativa(s)`
                                      : 'Sem automacao ativa'}
                                </span>
                              </div>
                            </div>

                            <div className="clientes-card-hover-panel">
                              <div className="clientes-card-money">
                                <strong>{formatCurrency(item.insight.totalSpent)}</strong>
                                <span>{item.insight.visitCount} visita(s) confirmada(s)</span>
                              </div>

                              <div className="clientes-card-metrics">
                                <article>
                                  <span><Wallet className="w-3 h-3" /> Ticket</span>
                                  <strong>{formatCurrency(item.insight.avgTicket)}</strong>
                                </article>
                                <article>
                                  <span><Clock3 className="w-3 h-3" /> Sem retorno</span>
                                  <strong>{formatDormancy(item.insight.dormancyDays)}</strong>
                                </article>
                              </div>

                              <div className="clientes-card-tags">
                                <span>{item.insight.activeRuleCount > 0 ? `${item.insight.activeRuleCount} regra(s)` : 'Sem agente'}</span>
                                <span>{item.insight.lastVisit ? `Ultima visita ${formatDate(item.insight.lastVisit)}` : 'Sem visita consolidada'}</span>
                              </div>

                              <div className="clientes-card-footer">
                                <small>{item.insight.attentionLine}</small>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {showCreateModal && (
        <div className="admin-modal-root clientes-create-root">
          <div className="admin-modal-overlay" onClick={() => setShowCreateModal(false)} />
          <div className="admin-modal-card admin-modal-card-sm clientes-create-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header admin-modal-header-compact">
              <div className="admin-modal-icon admin-modal-icon-gold">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="admin-modal-title">Cadastrar cliente</h3>
                <p className="admin-modal-subtitle">Entrada rapida para a carteira CRM com dados basicos e contexto comercial.</p>
              </div>
            </div>
            <div className="admin-modal-body clientes-create-body">
              <div className="clientes-create-note">
                <strong>Como a nova carteira funciona</strong>
                <p>Assim que o cliente entra, o modulo passa a medir valor, historico, recorrencia e risco automaticamente.</p>
              </div>
              <div className="clientes-create-form">
                <div>
                  <label className="admin-label">Nome *</label>
                  <input className="admin-input" value={toStringValue(createDraft.name)} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div>
                  <label className="admin-label">Telefone *</label>
                  <input className="admin-input" value={toStringValue(createDraft.phone)} onChange={(event) => setCreateDraft((current) => ({ ...current, phone: event.target.value }))} />
                </div>
                <div>
                  <label className="admin-label">Email</label>
                  <input className="admin-input" value={toStringValue(createDraft.email)} onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))} />
                </div>
                <div>
                  <label className="admin-label">Status inicial</label>
                  <select className="admin-input" value={toStringValue(createDraft.status) || 'novo'} onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value }))}>
                    {CLIENT_COLUMNS.map((column) => (
                      <option key={column.status} value={column.status}>{column.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="admin-label">Servico preferido</label>
                  <input className="admin-input" value={toStringValue(createDraft.preferred_service)} onChange={(event) => setCreateDraft((current) => ({ ...current, preferred_service: event.target.value }))} />
                </div>
                <div>
                  <label className="admin-label">Profissional preferido</label>
                  <input className="admin-input" value={toStringValue(createDraft.preferred_professional)} onChange={(event) => setCreateDraft((current) => ({ ...current, preferred_professional: event.target.value }))} />
                </div>
                <div className="clientes-edit-full">
                  <label className="admin-label">Observacoes</label>
                  <textarea className="admin-input" rows={3} value={toStringValue(createDraft.notes)} onChange={(event) => setCreateDraft((current) => ({ ...current, notes: event.target.value }))} />
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="admin-btn-outline" onClick={() => setShowCreateModal(false)} disabled={savingCreate}>Cancelar</button>
              <button type="button" className="admin-btn-primary" onClick={() => void handleCreateClient()} disabled={savingCreate}>
                {savingCreate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {savingCreate ? 'Salvando...' : 'Criar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedResolvedClient && (
        <ClienteModal
          client={selectedResolvedClient}
          adminKey={adminKey}
          rules={agentRules}
          events={agentEvents}
          onSaveAgentState={persistAgentState}
          onClose={() => setSelectedClient(null)}
          onClientUpdated={async () => {
            await Promise.all([loadClients(), loadPortfolioBookings()]);
          }}
        />
      )}
    </div>
  );
}
