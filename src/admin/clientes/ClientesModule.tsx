import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Crown,
  Eye,
  History,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
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
  getClientsWorkspaceForAdmin,
  listBookingsByPhoneForAdmin,
  listWorkbenchEntityForAdmin,
  runClientAgentRuleForAdmin,
  saveClientAgentStateForAdmin,
  updateWorkbenchEntityForAdmin,
  type ClientAgentChannel,
  type ClientAgentEvent,
  type ClientAgentIntervalUnit,
  type ClientAgentRule,
  type ClientsWorkspaceResponse,
} from '../api';
import { DangerConfirmModal } from '../AdminHelpers';
import { MoneyEyeButton, useMoneyPrivacy } from '../MoneyPrivacyContext';
import { formatBrazilWhatsappInput, formatDateBR, toNumber, toStringValue } from '../AdminUtils';
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
  nextRunDate: string;
  sendAt: string;
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
const NOW_LOCAL = (): string => {
  const current = new Date();
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, '0');
  const day = String(current.getDate()).padStart(2, '0');
  const hour = String(current.getHours()).padStart(2, '0');
  const minute = String(current.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const formatDate = (value: string): string => (value ? formatDateBR(value) : '--');

const formatDateTime = (value: string): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatLocalDateTime = (value: string): string => {
  if (!value) return '--';
  const [date, time] = value.split('T');
  if (!date) return value;
  return `${formatDate(date)}${time ? ` as ${time}` : ''}`;
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

const buildDefaultSendAt = (nextRunDate: string): string => `${nextRunDate}T09:00`;

const renderAgentMessage = (template: string, payload: { cliente: string; servico: string; data_proxima: string }): string =>
  template
    .replaceAll('{cliente}', payload.cliente)
    .replaceAll('{servico}', payload.servico)
    .replaceAll('{data_proxima}', payload.data_proxima);

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
  channel: 'whatsapp',
  messageTemplate: `✨ *LEMBRETE DE RETORNO* ✨

Ola, *{cliente}*! 💖
Estamos entrando em contato pelo *Estudio Renovo* para lembrar do seu retorno. 🌸

👑 *SERVICO:*
{servico}

📅 *DATA SUGERIDA:* {data_proxima}

Se quiser, responda esta mensagem para organizarmos seu proximo horario. 💬✨
Sera um prazer receber voce novamente! 💕`,
  nextRunDate: TODAY(),
  sendAt: buildDefaultSendAt(TODAY()),
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
  let modeDetail = 'Cliente dentro de uma janela normal, com automação focada em manutenção do ciclo.';
  let urgencyScore = 28;

  if (summary.totalSpent >= 1200) {
    tone = 'vip';
    modeLabel = 'Retenção VIP';
    modeDetail = 'Protege valor da carteira, prioriza atendimento premium e antecipa o próximo movimento comercial.';
    urgencyScore += 18;
  } else if (summary.overdueRuleCount > 0 || (summary.dormancyDays !== null && summary.dormancyDays >= 60)) {
    tone = 'risk';
    modeLabel = 'Reativação inteligente';
    modeDetail = 'Motor entra em modo de recuperação, identifica ausência fora da janela ideal e eleva a urgência.';
    urgencyScore += 30;
  } else if (summary.activeRuleCount > 0 || summary.nextReminder) {
    tone = 'active';
    modeLabel = 'Recorrência orquestrada';
    modeDetail = 'Fluxo contínuo com gatilho, janela, fila, tarefa e recálculo automático da próxima recorrência.';
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
    priorityLabel = 'Média prioridade';
  }

  const owner = requestedChannel === 'manual'
    ? 'Central de relacionamento'
    : requestedChannel === 'whatsapp'
      ? 'Fila Evolution'
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
  const queuedEvents = clientRules.filter((rule) => rule.enabled && rule.sendAt >= NOW_LOCAL()).length;
  const pendingTasks = clientTaskTimeline.filter((task) => toStringValue(task.status) !== 'concluida').length;

  const channelLabel = agentDraft.channel === 'manual'
    ? 'Operacao manual assistida'
    : agentDraft.channel === 'whatsapp'
      ? 'WhatsApp via Evolution'
      : 'Email como canal primario';
  const channelDetail = `${decision.priorityLabel} via ${decision.owner}. ${
    agentDraft.channel === 'manual'
      ? 'A IA prepara a rotina, mas a central valida o disparo final.'
      : agentDraft.channel === 'whatsapp'
        ? 'Prioriza contato rapido e personalizado usando a Evolution como camada oficial de envio.'
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
      value: formatLocalDateTime(agentDraft.sendAt),
      detail: `${decision.priorityLabel} | proxima execucao ${formatDate(agentPreviewNextDate)} | fila ${queuedEvents} | tarefas abertas ${pendingTasks} | owner ${decision.owner}.`,
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
  const nextReminder = enabledRules.slice().sort((left, right) => left.sendAt.localeCompare(right.sendAt))[0]?.sendAt.slice(0, 10) || null;
  const overdueRuleCount = enabledRules.filter((rule) => rule.sendAt <= NOW_LOCAL()).length;
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

const BOOKING_STATUS_PT: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  completed: 'Finalizado',
  rejected: 'Rejeitado',
};

const EVENT_STATUS_PT: Record<string, string> = {
  queued: 'Na fila',
  sent: 'Enviado',
  failed: 'Falhou',
  skipped: 'Ignorado',
  canceled: 'Cancelado',
};

function ClienteModal({
  client,
  adminKey,
  tenantSlug,
  rules,
  events,
  onSaveAgentState,
  onClose,
  onClientUpdated,
}: {
  client: ClientRecord;
  adminKey: string;
  tenantSlug: string;
  rules: ClientAgentRule[];
  events: ClientAgentEvent[];
  onSaveAgentState: (nextRules: ClientAgentRule[], nextEvents: ClientAgentEvent[]) => Promise<void>;
  onClose: () => void;
  onClientUpdated: () => Promise<void>;
}) {
  const { maskCurrency, maskMoneyText } = useMoneyPrivacy();
  const [currentClient, setCurrentClient] = useState<ClientRecord>({ ...client });
  const [activeTab, setActiveTab] = useState<'resumo' | 'agente' | 'timeline' | 'cadastro'>('resumo');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [agentBusyRule, setAgentBusyRule] = useState<string | null>(null);
  const [agentError, setAgentError] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...client });
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(buildDefaultDraft(toStringValue(client.name)));

  useEffect(() => {
    setCurrentClient({ ...client });
    setDraft({ ...client });
    setSaveMessage('');
  }, [client]);

  const clientId = toNumber(currentClient.id);
  const clientName = toStringValue(currentClient.name);
  const clientPhone = toStringValue(currentClient.phone);
  const clientStatus = normalizeClientStatus(currentClient.status);
  const clientStageLabel = CLIENT_COLUMNS.find((col) => col.status === clientStatus)?.label || clientStatus;

  const loadClientContext = useCallback(async () => {
    setLoading(true);
    setAgentError('');
    try {
      const [bookingRows, taskRows] = await Promise.all([
        clientPhone ? listBookingsByPhoneForAdmin(clientPhone, adminKey, tenantSlug) : Promise.resolve([]),
        listWorkbenchEntityForAdmin('tasks', adminKey),
      ]);
      setBookings(bookingRows);
      setTasks(taskRows);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Erro ao carregar histórico do cliente.');
      setBookings([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [adminKey, clientPhone, tenantSlug]);

  useEffect(() => {
    void loadClientContext();
  }, [loadClientContext]);

  const clientRules = useMemo(
    () => rules.filter((rule) => rule.clientId === clientId).sort((a, b) => a.sendAt.localeCompare(b.sendAt)),
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
    const nextReminder = clientRules.filter((rule) => rule.enabled).slice().sort((a, b) => a.sendAt.localeCompare(b.sendAt))[0]?.sendAt.slice(0, 10) || null;
    const overdueRuleCount = clientRules.filter((rule) => rule.enabled && rule.sendAt <= NOW_LOCAL()).length;
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
    const referenceDate = resolveLatestServiceDate(bookings, topService) || TODAY();
    const nextRunDate = addInterval(referenceDate, cadence.value, cadence.unit);
    setAgentDraft({
      ...buildDefaultDraft(clientName, topService),
      intervalValue: cadence.value,
      intervalUnit: cadence.unit,
      nextRunDate,
      sendAt: buildDefaultSendAt(nextRunDate),
    });
  }, [bookings, clientName, currentClient.preferred_service, summary.services]);

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
  const agentPreviewNextDate = agentDraft.nextRunDate;
  const agentPreviewSendAt = agentDraft.sendAt;

  const agentPreviewMessage = useMemo(
    () => renderAgentMessage(agentDraft.messageTemplate, {
      cliente: clientName || 'Cliente',
      servico: agentDraft.serviceName || 'serviço',
      data_proxima: formatDate(agentDraft.nextRunDate),
    }),
    [agentDraft.messageTemplate, agentDraft.nextRunDate, agentDraft.serviceName, clientName],
  );

  const agentExecutionDecision = useMemo(
    () => resolveAgentDecision({
      summary,
      requestedChannel: agentDraft.channel,
      queuedEvents: clientRules.filter((rule) => rule.enabled && rule.sendAt >= NOW_LOCAL()).length,
      pendingTasks: clientTaskTimeline.filter((task) => toStringValue(task.status) !== 'concluida').length,
    }),
    [agentDraft.channel, clientRules, clientTaskTimeline, summary],
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
      agentPreviewReferenceDate,
      clientEvents,
      clientRules,
      clientTaskTimeline,
      currentClient,
      summary,
    ],
  );

  const activeRulesCount = clientRules.filter((rule) => rule.enabled).length;
  const queuedEventsCount = clientRules.filter((rule) => rule.enabled && rule.sendAt >= NOW_LOCAL()).length;
  const pendingTaskCount = clientTaskTimeline.filter((task) => toStringValue(task.status) !== 'concluida').length;
  const recentAgentEvents = clientEvents.slice(0, 4);

  const handleOpenServiceInAgent = (serviceName: string) => {
    const cadence = recommendCadence(serviceName);
    const refDate = resolveLatestServiceDate(bookings, serviceName) || TODAY();
    const nextRunDate = addInterval(refDate, cadence.value, cadence.unit);
    setAgentDraft((current) => ({
      ...current,
      serviceName,
      intervalValue: cadence.value,
      intervalUnit: cadence.unit,
      nextRunDate,
      sendAt: buildDefaultSendAt(nextRunDate),
    }));
    setActiveTab('agente');
  };

  const handleSaveClient = async () => {
    if (!clientId) return;
    if (normalizePhone(toStringValue(draft.phone)).length < 12) {
      setAgentError('Informe um WhatsApp válido com prefixo +55 antes de salvar.');
      return;
    }
    setSaving(true);
    setAgentError('');
    setSaveMessage('');
    try {
      await updateWorkbenchEntityForAdmin('clients', clientId, draft, adminKey);
      const nextClient = { ...currentClient, ...draft };
      setCurrentClient(nextClient);
      setDraft(nextClient);
      await onClientUpdated();
      setSaveMessage('Cadastro atualizado com sucesso.');
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Erro ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClient = async (masterPassword?: string) => {
    if (!clientId) return;
    setSaving(true);
    setAgentError('');
    try {
      await deleteWorkbenchEntityForAdmin('clients', clientId, adminKey, {
        masterPassword,
        tenantSlug,
      });
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
    const nextRunDate = agentDraft.nextRunDate;
    const sendAt = agentDraft.sendAt;

    if (!serviceName || !Number.isFinite(intervalValue) || intervalValue < 1) {
      setAgentError('Informe o serviço e um intervalo válido para programar o agente.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextRunDate)) {
      setAgentError('Defina a próxima execução em formato válido.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sendAt)) {
      setAgentError('Defina a data e hora do envio em formato válido.');
      return;
    }

    if (sendAt.slice(0, 10) > nextRunDate) {
      setAgentError('O envio do lembrete não pode ficar depois da próxima execução.');
      return;
    }

    const duplicatedRule = rules.some((rule) => (
      rule.clientId === clientId
      && rule.enabled
      && rule.serviceName.trim().toLowerCase() === serviceName.toLowerCase()
      && rule.channel === agentDraft.channel
    ));
    if (duplicatedRule) {
      setAgentError('Já existe uma regra ativa para este serviço e canal neste cliente.');
      return;
    }

    const latestServiceDate = resolveLatestServiceDate(bookings, serviceName);
    const referenceDate = latestServiceDate || TODAY();
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
      sendAt,
      createdAt: now,
      updatedAt: now,
      lastExecutedAt: null,
    };

    setAgentError('');
    try {
      await onSaveAgentState([...rules, newRule], events);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Falha ao salvar regra de recorrência.');
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

  const handlePatchRule = async (ruleId: string, patch: Partial<ClientAgentRule>) => {
    const nextRules = rules.map((rule) => {
      if (rule.id !== ruleId) {
        return rule;
      }

      const nextRule = {
        ...rule,
        ...patch,
        updatedAt: new Date().toISOString(),
      };

      if (nextRule.sendAt.slice(0, 10) > nextRule.nextRunDate) {
        throw new Error('O envio do lembrete não pode ficar depois da próxima execução.');
      }

      return nextRule;
    });

    await onSaveAgentState(nextRules, events);
  };

  const handleRunRule = async (rule: ClientAgentRule) => {
    setAgentBusyRule(rule.id);
    setAgentError('');
    try {
      const response = await runClientAgentRuleForAdmin(rule.id, adminKey, tenantSlug);
      await onSaveAgentState(response.rules, response.events);
      if (!response.outcome.dispatched) {
        setAgentError(response.outcome.error || response.outcome.message);
        return;
      }
      await loadClientContext();
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : 'Falha ao executar o agente.');
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

  const healthLabel = summary.overdueRuleCount > 0
    ? 'Atenção imediata'
    : summary.dormancyDays !== null && summary.dormancyDays >= 60
      ? 'Reativação sugerida'
      : 'Ciclo saudável';

  const healthSub = summary.overdueRuleCount > 0
    ? `${summary.overdueRuleCount} aviso(s) fora da janela`
    : summary.dormancyDays !== null && summary.dormancyDays >= 60
      ? `${summary.dormancyDays} dias desde a última visita`
      : 'Sem pendências ou atrasos ativos';

  return (
    <>
      <div className="admin-modal-root clientes-modal-root">
        <div className="admin-modal-overlay" onClick={onClose} />
        <div className="admin-modal-card clientes-modal-card" role="dialog" aria-modal="true" aria-label={`Painel 360 de ${clientName || 'Cliente'}`}>
          {/* CABEÇALHO COMPACTO DO PAINEL 360 */}
          <header className="clientes-modal-header">
            <div className="clientes-modal-ident">
              <div className="clientes-modal-ident-left">
                <div className={`clientes-modal-avatar ${toneClass}`}>{getClientInitials(clientName)}</div>
                <div className="clientes-modal-headline">
                  <div className="clientes-modal-title-row">
                    <h3 className="admin-modal-title">{clientName || 'Cliente sem nome'}</h3>
                    <div className="clientes-modal-badges">
                      <span className={`clientes-pill ${toneClass}`}>{clientStageLabel}</span>
                      <span className="clientes-pill clientes-pill-muted">{summary.activeRuleCount} regra(s)</span>
                      {summary.nextReminder && (
                        <span className="clientes-pill clientes-pill-accent">Aviso {formatDate(summary.nextReminder)}</span>
                      )}
                    </div>
                  </div>
                  <div className="clientes-modal-contactline">
                    <span><Phone className="w-3.5 h-3.5" /> {clientPhone || '--'}</span>
                    <span><Mail className="w-3.5 h-3.5" /> {toStringValue(currentClient.email) || 'E-mail não informado'}</span>
                  </div>
                </div>
              </div>

              <div className="clientes-modal-actions">
                <MoneyEyeButton variant="compact" />
                <button
                  type="button"
                  className={`clientes-action-btn${activeTab === 'cadastro' ? ' clientes-radar-toggle active' : ''}`}
                  onClick={() => setActiveTab('cadastro')}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar cadastro
                </button>
                <button
                  type="button"
                  className="clientes-action-btn clientes-btn-danger"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </button>
                <button
                  type="button"
                  className="clientes-modal-close-btn"
                  onClick={onClose}
                  aria-label="Fechar painel 360"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* KPIs do cliente em faixa única */}
            <div className="clientes-modal-kpis">
              <article>
                <span>Total acumulado</span>
                <strong className="is-money">{maskCurrency(summary.totalSpent)}</strong>
              </article>
              <article>
                <span>Visitas confirmadas</span>
                <strong>{summary.visitCount}</strong>
              </article>
              <article>
                <span>Ticket médio</span>
                <strong>{maskCurrency(summary.avgTicket)}</strong>
              </article>
              <article>
                <span>Último retorno</span>
                <strong>{summary.lastVisit ? formatDate(summary.lastVisit.date) : '--'}</strong>
              </article>
              <article>
                <span>Sem retorno</span>
                <strong>{formatDormancy(summary.dormancyDays)}</strong>
              </article>
            </div>

            {/* Navegação por abas limpa */}
            <nav className="clientes-modal-tabs" role="tablist" aria-label="Seções do painel 360">
              {([
                { key: 'resumo', label: 'Resumo & histórico', icon: Sparkles },
                { key: 'agente', label: `Agente de retorno (${activeRulesCount})`, icon: Bot },
                { key: 'timeline', label: `Timeline (${bookings.length + clientEvents.length + clientTaskTimeline.length})`, icon: History },
                { key: 'cadastro', label: 'Cadastro', icon: UserRound },
              ] as const).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    className={activeTab === tab.key ? 'active' : ''}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setSaveMessage('');
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </header>

          {/* CORPO ROLÁVEL DO PAINEL 360 */}
          <div className="clientes-modal-body">
            {agentError && (
              <div className="clientes-error">
                <span>{agentError}</span>
                <button type="button" onClick={() => setAgentError('')} aria-label="Fechar alerta">×</button>
              </div>
            )}

            {loading ? (
              <div className="clientes-loading-board">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando histórico e contexto 360° do cliente...
              </div>
            ) : (
              <>
                {/* ABA 1: RESUMO & HISTÓRICO */}
                {activeTab === 'resumo' && (
                  <div className="clientes-panel-shell">
                    <div className="clientes-summary-strip">
                      <article>
                        <span>Serviço âncora</span>
                        <strong>{summary.services[0]?.name || toStringValue(currentClient.preferred_service) || 'Não definido'}</strong>
                        <small>Baseado no histórico confirmado</small>
                      </article>
                      <article>
                        <span>Próximo disparo</span>
                        <strong>{summary.nextReminder ? formatDate(summary.nextReminder) : 'Não programado'}</strong>
                        <small>
                          {summary.activeRuleCount > 0 ? `${summary.activeRuleCount} rotina(s) ativa(s)` : 'Configure na aba Agente de retorno'}
                        </small>
                      </article>
                      <article>
                        <span>Situação comercial</span>
                        <strong>{healthLabel}</strong>
                        <small>{healthSub}</small>
                      </article>
                    </div>

                    <div className="clientes-summary-layout">
                      <div className="clientes-summary-main">
                        <section className="clientes-surface">
                          <div className="clientes-section-head">
                            <div>
                              <h4><Sparkles className="w-4 h-4" /> Serviços mais realizados</h4>
                              <p>Frequência no histórico confirmado e cadência ideal para retorno.</p>
                            </div>
                          </div>
                          {summary.services.length === 0 ? (
                            <p className="clientes-empty">Ainda não há serviços confirmados para este cliente.</p>
                          ) : (
                            <div className="clientes-service-stack">
                              {summary.services.map((service) => {
                                const maxCount = summary.services[0]?.count || 1;
                                const width = `${Math.max(16, Math.round((service.count / maxCount) * 100))}%`;
                                const recommendation = recommendCadence(service.name);
                                return (
                                  <article key={service.name} className="clientes-service-rank">
                                    <div className="clientes-service-meta">
                                      <strong>{service.name}</strong>
                                      <div className="clientes-service-meta-right">
                                        <span>{service.count}x</span>
                                        <button
                                          type="button"
                                          className="clientes-mini-link"
                                          onClick={() => handleOpenServiceInAgent(service.name)}
                                        >
                                          Programar retorno
                                        </button>
                                      </div>
                                    </div>
                                    <div className="clientes-service-bar">
                                      <span style={{ width }} />
                                    </div>
                                    <div className="clientes-service-foot">
                                      <small>Última vez: {service.lastDate ? formatDate(service.lastDate) : '--'}</small>
                                      <small>Cadência sugerida: {formatInterval(recommendation.value, recommendation.unit)}</small>
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
                              <h4><CalendarClock className="w-4 h-4" /> Agendamentos recentes</h4>
                              <p>Últimos atendimentos registrados para este telefone.</p>
                            </div>
                            {recentBookings.length > 6 && (
                              <button
                                type="button"
                                className="clientes-mini-link"
                                onClick={() => setActiveTab('timeline')}
                              >
                                Ver todos ({recentBookings.length}) →
                              </button>
                            )}
                          </div>
                          {recentBookings.length === 0 ? (
                            <p className="clientes-empty">Nenhum agendamento encontrado para este cliente.</p>
                          ) : (
                            <div className="clientes-clean-list">
                              {recentBookings.slice(0, 6).map((booking) => (
                                <article key={booking.id} className="clientes-booking-row">
                                  <div className="clientes-booking-row-main">
                                    <strong>
                                      {booking.serviceItems.length > 0
                                        ? booking.serviceItems.map((item) => item.name).join(', ')
                                        : booking.service}
                                    </strong>
                                    <span>
                                      {formatDate(booking.date)} às {booking.time || '--'}
                                      {booking.professionalName ? ` • ${booking.professionalName}` : ''}
                                    </span>
                                  </div>
                                  <div className="clientes-booking-row-side">
                                    <strong>{maskCurrency(getBookingTotal(booking))}</strong>
                                    <span className={`status-${booking.status}`}>
                                      {BOOKING_STATUS_PT[booking.status] || booking.status}
                                    </span>
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
                              <h4><UserRound className="w-4 h-4" /> Resumo cadastral</h4>
                            </div>
                            <button
                              type="button"
                              className="clientes-mini-link"
                              onClick={() => setActiveTab('cadastro')}
                            >
                              Editar dados
                            </button>
                          </div>

                          <dl className="clientes-dl-list">
                            <div>
                              <dt>WhatsApp</dt>
                              <dd>{clientPhone || '--'}</dd>
                            </div>
                            <div>
                              <dt>E-mail</dt>
                              <dd>{toStringValue(currentClient.email) || '--'}</dd>
                            </div>
                            <div>
                              <dt>Etapa</dt>
                              <dd>{clientStageLabel}</dd>
                            </div>
                            <div>
                              <dt>Serviço preferido</dt>
                              <dd>{toStringValue(currentClient.preferred_service) || '--'}</dd>
                            </div>
                            <div>
                              <dt>Profissional</dt>
                              <dd>{toStringValue(currentClient.preferred_professional) || '--'}</dd>
                            </div>
                            <div>
                              <dt>Observações</dt>
                              <dd>{toStringValue(currentClient.notes) || 'Nenhuma observação cadastrada.'}</dd>
                            </div>
                          </dl>
                        </section>

                        <section className="clientes-surface">
                          <div className="clientes-section-head">
                            <div>
                              <h4><Bot className="w-4 h-4" /> Próxima ação recomendada</h4>
                            </div>
                            <button
                              type="button"
                              className="clientes-mini-link"
                              onClick={() => setActiveTab('agente')}
                            >
                              Abrir agente
                            </button>
                          </div>

                          <dl className="clientes-dl-list">
                            <div>
                              <dt>Modo sugerido</dt>
                              <dd>{agentExecutionDecision.modeLabel} ({agentExecutionDecision.priorityLabel})</dd>
                            </div>
                            <div>
                              <dt>Janela</dt>
                              <dd>
                                {summary.nextReminder
                                  ? `Aviso em ${formatDate(summary.nextReminder)}`
                                  : 'Sem retorno programado'}
                              </dd>
                            </div>
                            <div>
                              <dt>Orientação</dt>
                              <dd>
                                {summary.dormancyDays !== null && summary.dormancyDays >= 60
                                  ? 'Abrir abordagem de reativação com oferta contextual.'
                                  : 'Manter ciclo ativo com lembrete de retorno por serviço.'}
                              </dd>
                            </div>
                          </dl>
                        </section>
                      </aside>
                    </div>
                  </div>
                )}

                {/* ABA 2: AGENTE DE RECORRÊNCIA */}
                {activeTab === 'agente' && (
                  <div className="clientes-agent-shell">
                    {/* Faixa enxuta com o diagnóstico executivo em 1 linha */}
                    <div className="clientes-agent-status-bar">
                      <div>
                        <span>Modo</span>
                        <strong>{agentExecutionDecision.modeLabel}</strong>
                      </div>
                      <div>
                        <span>Prioridade</span>
                        <strong>{agentExecutionDecision.priorityLabel} ({agentExecutionDecision.urgencyScore}/100)</strong>
                      </div>
                      <div>
                        <span>Canal padrão</span>
                        <strong>{agentExecutionDecision.owner}</strong>
                      </div>
                      <div>
                        <span>Regras ativas</span>
                        <strong>{activeRulesCount} de {clientRules.length}</strong>
                      </div>
                      <div>
                        <span>Fila / Tarefas</span>
                        <strong>{queuedEventsCount} na fila · {pendingTaskCount} aberta(s)</strong>
                      </div>
                    </div>

                    <div className="clientes-agent-workspace">
                      {/* Coluna Esquerda: Passo 1 — Configurar lembrete */}
                      <section className="clientes-surface clientes-agent-config-card">
                        <div className="clientes-section-head">
                          <div>
                            <h4><Sparkles className="w-4 h-4" /> 1. Configurar lembrete de retorno</h4>
                            <p>Defina o serviço gatilho, a frequência e o texto enviado à cliente.</p>
                          </div>
                        </div>

                        {serviceScenarios.length > 0 && (
                          <div className="clientes-scenario-chips">
                            <span className="clientes-chip-hint">Sugestões:</span>
                            {serviceScenarios.map((scenario) => (
                              <button
                                key={scenario.serviceName}
                                type="button"
                                className={`clientes-scenario-chip${agentDraft.serviceName === scenario.serviceName ? ' active' : ''}`}
                                onClick={() => handleOpenServiceInAgent(scenario.serviceName)}
                              >
                                <strong>{scenario.serviceName}</strong>
                                <span>{formatInterval(scenario.recommendation.value, scenario.recommendation.unit)}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="clientes-agent-form">
                          <div>
                            <label className="admin-label">Serviço gatilho</label>
                            <input
                              className="admin-input"
                              value={agentDraft.serviceName}
                              onChange={(event) => setAgentDraft((current) => ({ ...current, serviceName: event.target.value }))}
                              placeholder="Ex.: Pedicure e Manicure"
                            />
                          </div>
                          <div>
                            <label className="admin-label">Canal de envio</label>
                            <select
                              className="admin-input"
                              value={agentDraft.channel}
                              onChange={(event) => setAgentDraft((current) => ({ ...current, channel: event.target.value as ClientAgentChannel }))}
                            >
                              <option value="whatsapp">WhatsApp via Evolution</option>
                              <option value="manual">Operação manual</option>
                              <option value="email">E-mail</option>
                            </select>
                          </div>
                          <div>
                            <label className="admin-label">Repetir a cada</label>
                            <input
                              className="admin-input"
                              type="number"
                              min={1}
                              value={agentDraft.intervalValue}
                              onChange={(event) => setAgentDraft((current) => ({ ...current, intervalValue: Number(event.target.value) || 1 }))}
                            />
                          </div>
                          <div>
                            <label className="admin-label">Unidade</label>
                            <select
                              className="admin-input"
                              value={agentDraft.intervalUnit}
                              onChange={(event) => setAgentDraft((current) => ({ ...current, intervalUnit: event.target.value as ClientAgentIntervalUnit }))}
                            >
                              <option value="days">Dias</option>
                              <option value="weeks">Semanas</option>
                              <option value="months">Meses</option>
                            </select>
                          </div>
                          <div>
                            <label className="admin-label" title="Data exibida no texto da mensagem no lugar de {data_proxima}">
                              Data sugerida do retorno
                            </label>
                            <input
                              className="admin-input"
                              type="date"
                              value={agentDraft.nextRunDate}
                              onChange={(event) => setAgentDraft((current) => ({ ...current, nextRunDate: event.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="admin-label" title="Dia e horário exato em que a mensagem será disparada">
                              Quando enviar o aviso
                            </label>
                            <input
                              className="admin-input"
                              type="datetime-local"
                              value={agentDraft.sendAt}
                              onChange={(event) => setAgentDraft((current) => ({ ...current, sendAt: event.target.value }))}
                            />
                          </div>
                          <div className="clientes-edit-full">
                            <div className="clientes-field-label-row">
                              <label className="admin-label">Mensagem personalizada</label>
                              <small>Variáveis: {'{cliente}'}, {'{servico}'}, {'{data_proxima}'}</small>
                            </div>
                            <textarea
                              className="admin-input"
                              rows={6}
                              value={agentDraft.messageTemplate}
                              onChange={(event) => setAgentDraft((current) => ({ ...current, messageTemplate: event.target.value }))}
                            />
                          </div>
                        </div>
                      </section>

                      {/* Coluna Direita: Passo 2 — Prévia ao vivo + Regras ativas */}
                      <div className="clientes-agent-right-col">
                        <section className="clientes-surface clientes-preview-card">
                          <div className="clientes-section-head">
                            <div>
                              <h4><Send className="w-4 h-4" /> 2. Prévia do envio & confirmação</h4>
                              <p>Confira como a mensagem chegará e confirme o agendamento da rotina.</p>
                            </div>
                          </div>

                          <div className="clientes-preview-box">
                            <div className="clientes-preview-head">
                              <span>Disparo: {formatLocalDateTime(agentPreviewSendAt)}</span>
                              <small>Ref.: {formatDate(agentPreviewReferenceDate)}</small>
                            </div>
                            <p>{agentPreviewMessage}</p>
                          </div>

                          <div className="clientes-inline-actions">
                            <span className="clientes-inline-hint">
                              Canal selecionado: {agentDraft.channel === 'whatsapp' ? 'WhatsApp (Evolution)' : agentDraft.channel === 'manual' ? 'Manual' : 'E-mail'}
                            </span>
                            <button type="button" className="clientes-action-btn clientes-action-primary" onClick={() => void handleCreateRule()}>
                              <Send className="w-3.5 h-3.5" />
                              Agendar recorrência
                            </button>
                          </div>
                        </section>

                        <section className="clientes-surface clientes-agent-pipeline">
                          <div className="clientes-section-head">
                            <div>
                              <h4><Bot className="w-4 h-4" /> 3. Regras programadas e fila</h4>
                              <p>{clientRules.length} regra(s) · {activeRulesCount} ativa(s) · {queuedEventsCount} na fila</p>
                            </div>
                          </div>

                          {clientRules.length === 0 ? (
                            <div className="clientes-empty-box">
                              <strong>Nenhuma regra programada ainda</strong>
                              <p>Revise a prévia acima e clique em &quot;Agendar recorrência&quot; para ativar os envios.</p>
                            </div>
                          ) : (
                            <div className="clientes-agent-rules-list">
                              {clientRules.map((rule) => (
                                <article key={rule.id} className="clientes-rule-card">
                                  <div className="clientes-rule-head">
                                    <div>
                                      <strong>{rule.serviceName}</strong>
                                      <span>
                                        A cada {formatInterval(rule.intervalValue, rule.intervalUnit)} · {rule.channel}
                                      </span>
                                    </div>
                                    <span className={`clientes-pill ${rule.enabled ? 'tone-active' : 'tone-neutral'}`}>
                                      {rule.enabled ? 'Ativa' : 'Pausada'}
                                    </span>
                                  </div>

                                  <div className="clientes-rule-meta">
                                    <span>Referência: <strong>{formatDate(rule.referenceDate)}</strong></span>
                                    <span>Último envio: <strong>{rule.lastExecutedAt ? formatDateTime(rule.lastExecutedAt) : 'Ainda não enviado'}</strong></span>
                                  </div>

                                  <div className="clientes-agent-form">
                                    <div>
                                      <label className="admin-label">Data sugerida do retorno</label>
                                      <input
                                        className="admin-input"
                                        type="date"
                                        value={rule.nextRunDate}
                                        onChange={(event) => {
                                          void handlePatchRule(rule.id, { nextRunDate: event.target.value }).catch((error) => {
                                            setAgentError(error instanceof Error ? error.message : 'Falha ao atualizar a data do retorno.');
                                          });
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <label className="admin-label">Quando enviar o aviso</label>
                                      <input
                                        className="admin-input"
                                        type="datetime-local"
                                        value={rule.sendAt}
                                        onChange={(event) => {
                                          void handlePatchRule(rule.id, { sendAt: event.target.value }).catch((error) => {
                                            setAgentError(error instanceof Error ? error.message : 'Falha ao atualizar a janela de envio.');
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>

                                  <blockquote className="clientes-rule-quote">{rule.messageTemplate}</blockquote>

                                  <div className="clientes-rule-actions">
                                    <button type="button" className="clientes-action-btn" onClick={() => void handleToggleRule(rule.id, !rule.enabled)}>
                                      {rule.enabled ? 'Pausar' : 'Reativar'}
                                    </button>
                                    <button type="button" className="clientes-action-btn clientes-action-primary" onClick={() => void handleRunRule(rule)} disabled={agentBusyRule === rule.id}>
                                      {agentBusyRule === rule.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                      Executar agora
                                    </button>
                                    <button
                                      type="button"
                                      className="clientes-action-btn clientes-btn-danger"
                                      onClick={() => void handleDeleteRule(rule.id)}
                                      title="Excluir regra"
                                      aria-label="Excluir regra"
                                    >
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
                                </div>
                              </div>
                              <div className="clientes-clean-list">
                                {recentAgentEvents.map((event) => (
                                  <article key={event.id} className="clientes-booking-row">
                                    <div className="clientes-booking-row-main">
                                      <strong>{event.serviceName}</strong>
                                      <span>{formatLocalDateTime(event.scheduledFor)} · {event.channel}</span>
                                      <small>
                                        {event.sentAt ? `Enviado em ${formatDateTime(event.sentAt)}. ` : ''}
                                        {event.messagePreview || event.reason || 'Sem mensagem registrada'}
                                      </small>
                                    </div>
                                    <span className={`event-${event.status}`}>
                                      {EVENT_STATUS_PT[event.status] || event.status}
                                    </span>
                                  </article>
                                ))}
                              </div>
                            </div>
                          )}
                        </section>
                      </div>
                    </div>

                    {/* Acordeão discreto para diagnóstico avançado do motor */}
                    <div className="clientes-diagnostics-box">
                      <button
                        type="button"
                        className="clientes-diagnostics-toggle"
                        onClick={() => setShowDiagnostics((prev) => !prev)}
                        aria-expanded={showDiagnostics}
                      >
                        <span><Crown className="w-3.5 h-3.5" /> Diagnóstico do motor, playbooks e guardrails</span>
                        {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {showDiagnostics && (
                        <div className="clientes-agent-support-grid">
                          <section className="clientes-surface">
                            <div className="clientes-section-head">
                              <div>
                                <h4><Bot className="w-4 h-4" /> Fluxo de decisão</h4>
                              </div>
                            </div>
                            <dl className="clientes-dl-list">
                              {agentControlTower.nodes.map((node) => (
                                <div key={node.label}>
                                  <dt>{node.label}: {node.value}</dt>
                                  <dd>{maskMoneyText(node.detail)}</dd>
                                </div>
                              ))}
                            </dl>
                          </section>

                          <section className="clientes-surface">
                            <div className="clientes-section-head">
                              <div>
                                <h4><CheckCircle2 className="w-4 h-4" /> Playbooks e guardrails</h4>
                              </div>
                            </div>
                            <dl className="clientes-dl-list">
                              {agentControlTower.playbooks.map((playbook) => (
                                <div key={playbook.badge}>
                                  <dt>{playbook.badge} — {playbook.title}</dt>
                                  <dd>{playbook.action}</dd>
                                </div>
                              ))}
                            </dl>
                            <ul className="clientes-guardrail-bullets">
                              {agentControlTower.guardrails.map((guardrail) => (
                                <li key={guardrail}>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{guardrail}</span>
                                </li>
                              ))}
                            </ul>
                          </section>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ABA 3: TIMELINE UNIFICADA */}
                {activeTab === 'timeline' && (
                  <div className="clientes-timeline-dashboard">
                    <div className="clientes-timeline-summary">
                      <article>
                        <span>Agendamentos</span>
                        <strong>{bookings.length}</strong>
                      </article>
                      <article>
                        <span>Eventos do agente</span>
                        <strong>{clientEvents.length}</strong>
                      </article>
                      <article>
                        <span>Tarefas operacionais</span>
                        <strong>{clientTaskTimeline.length}</strong>
                      </article>
                    </div>

                    <div className="clientes-timeline-grid">
                      <section className="clientes-surface">
                        <div className="clientes-section-head">
                          <div>
                            <h4><CalendarClock className="w-4 h-4" /> Agendamentos</h4>
                          </div>
                        </div>
                        {recentBookings.length === 0 ? (
                          <p className="clientes-empty">Nenhum agendamento encontrado.</p>
                        ) : (
                          <div className="clientes-clean-list clientes-timeline-scroll">
                            {recentBookings.map((booking) => (
                              <article key={`booking-${booking.id}`} className="clientes-booking-row">
                                <div className="clientes-booking-row-main">
                                  <strong>{booking.serviceItems.length > 0 ? booking.serviceItems.map((item) => item.name).join(', ') : booking.service}</strong>
                                  <span>{formatDate(booking.date)} às {booking.time || '--'}</span>
                                  <small>{maskCurrency(getBookingTotal(booking))}</small>
                                </div>
                                <span className={`status-${booking.status}`}>
                                  {BOOKING_STATUS_PT[booking.status] || booking.status}
                                </span>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="clientes-surface">
                        <div className="clientes-section-head">
                          <div>
                            <h4><Bot className="w-4 h-4" /> Eventos do agente</h4>
                          </div>
                        </div>
                        {clientEvents.length === 0 ? (
                          <p className="clientes-empty">Nenhum evento do agente registrado.</p>
                        ) : (
                          <div className="clientes-clean-list clientes-timeline-scroll">
                            {clientEvents.map((event) => (
                              <article key={event.id} className="clientes-booking-row">
                                <div className="clientes-booking-row-main">
                                  <strong>{event.serviceName}</strong>
                                  <span>{formatLocalDateTime(event.scheduledFor)}</span>
                                  <small>{event.sentAt ? `Enviado em ${formatDateTime(event.sentAt)}. ` : ''}{event.messagePreview || event.reason || 'Sem mensagem'}</small>
                                </div>
                                <span className={`event-${event.status}`}>
                                  {EVENT_STATUS_PT[event.status] || event.status}
                                </span>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="clientes-surface">
                        <div className="clientes-section-head">
                          <div>
                            <h4><CheckCircle2 className="w-4 h-4" /> Tarefas operacionais</h4>
                          </div>
                        </div>
                        {clientTaskTimeline.length === 0 ? (
                          <p className="clientes-empty">Nenhuma tarefa ligada ao cliente.</p>
                        ) : (
                          <div className="clientes-clean-list clientes-timeline-scroll">
                            {clientTaskTimeline.map((task) => {
                              const isDone = toStringValue(task.status) === 'concluida';
                              return (
                                <article key={`task-${toNumber(task.id)}`} className="clientes-booking-row">
                                  <div className="clientes-booking-row-main">
                                    <strong>{toStringValue(task.title) || 'Tarefa sem título'}</strong>
                                    <span>Vencimento: {formatDate(toStringValue(task.due_date))}</span>
                                    <small>{toStringValue(task.owner) || 'Sem responsável'}</small>
                                  </div>
                                  <span className={`task-${isDone ? 'done' : 'pending'}`}>
                                    {isDone ? 'Concluída' : 'Pendente'}
                                  </span>
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    </div>
                  </div>
                )}

                {/* ABA 4: CADASTRO & PREFERÊNCIAS */}
                {activeTab === 'cadastro' && (
                  <section className="clientes-surface clientes-cadastro-panel">
                    <div className="clientes-section-head">
                      <div>
                        <h4><UserRound className="w-4 h-4" /> Cadastro e preferências do cliente</h4>
                        <p>Atualize os dados de contato, etapa da carteira no Kanban e observações comerciais.</p>
                      </div>
                      {saveMessage && (
                        <span className="clientes-save-ok">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {saveMessage}
                        </span>
                      )}
                    </div>

                    <div className="clientes-edit-grid">
                      <div>
                        <label className="admin-label">Nome completo</label>
                        <input
                          className="admin-input"
                          value={toStringValue(draft.name)}
                          onChange={(event) => {
                            setSaveMessage('');
                            setDraft((current) => ({ ...current, name: event.target.value }));
                          }}
                        />
                      </div>
                      <div>
                        <label className="admin-label">WhatsApp / Telefone</label>
                        <input
                          className="admin-input"
                          value={toStringValue(draft.phone)}
                          onChange={(event) => {
                            setSaveMessage('');
                            setDraft((current) => ({ ...current, phone: formatBrazilWhatsappInput(event.target.value) }));
                          }}
                        />
                      </div>
                      <div>
                        <label className="admin-label">E-mail</label>
                        <input
                          className="admin-input"
                          value={toStringValue(draft.email)}
                          onChange={(event) => {
                            setSaveMessage('');
                            setDraft((current) => ({ ...current, email: event.target.value }));
                          }}
                        />
                      </div>
                      <div>
                        <label className="admin-label">Etapa da carteira (Kanban)</label>
                        <select
                          className="admin-input"
                          value={toStringValue(draft.status) || 'novo'}
                          onChange={(event) => {
                            setSaveMessage('');
                            setDraft((current) => ({ ...current, status: event.target.value }));
                          }}
                        >
                          {CLIENT_COLUMNS.map((column) => (
                            <option key={column.status} value={column.status}>{column.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="admin-label">Serviço preferido</label>
                        <input
                          className="admin-input"
                          value={toStringValue(draft.preferred_service)}
                          onChange={(event) => {
                            setSaveMessage('');
                            setDraft((current) => ({ ...current, preferred_service: event.target.value }));
                          }}
                        />
                      </div>
                      <div>
                        <label className="admin-label">Profissional preferido</label>
                        <input
                          className="admin-input"
                          value={toStringValue(draft.preferred_professional)}
                          onChange={(event) => {
                            setSaveMessage('');
                            setDraft((current) => ({ ...current, preferred_professional: event.target.value }));
                          }}
                        />
                      </div>
                      <div className="clientes-edit-full">
                        <label className="admin-label">Observações</label>
                        <textarea
                          className="admin-input"
                          rows={4}
                          value={toStringValue(draft.notes)}
                          onChange={(event) => {
                            setSaveMessage('');
                            setDraft((current) => ({ ...current, notes: event.target.value }));
                          }}
                          placeholder="Preferências de horário, histórico relevante, alergias ou notas de atendimento..."
                        />
                      </div>
                      <div className="clientes-inline-actions">
                        <button
                          type="button"
                          className="clientes-action-btn"
                          onClick={() => {
                            setDraft({ ...currentClient });
                            setSaveMessage('');
                          }}
                          disabled={saving}
                        >
                          Restaurar
                        </button>
                        <button
                          type="button"
                          className="clientes-action-btn clientes-action-primary"
                          onClick={() => void handleSaveClient()}
                          disabled={saving}
                        >
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          {saving ? 'Salvando...' : 'Salvar cadastro'}
                        </button>
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <DangerConfirmModal
        isOpen={deleteOpen}
        title="Remover cliente"
        subtitle="Esta ação apaga o cadastro deste cliente da central."
        description={`Digite REMOVER CLIENTE para excluir ${clientName || 'este cliente'}. O histórico operacional continua dependendo das tabelas relacionadas.`}
        confirmText="REMOVER CLIENTE"
        confirmLabel="Excluir cliente"
        helperText="Use apenas quando o cadastro realmente não deve mais existir nesta carteira."
        requireMasterPassword
        passwordPlaceholder="Digite a senha master para excluir o cliente"
        busy={saving}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteClient}
      />
    </>
  );
}

const DIRECTORY_PAGE_SIZE = 20;
const KANBAN_COLUMN_STEP = 20;

const EMPTY_WORKSPACE: ClientsWorkspaceResponse = {
  mode: 'kanban',
  overview: {
    total: 0,
    active: 0,
    upcoming: 0,
    vip: 0,
    risk: 0,
    totalRevenue: 0,
    averageTicket: 0,
  },
  radar: {
    upcoming: [],
    hotList: [],
  },
  filteredTotal: 0,
  columnCounts: {
    novo: 0,
    ativo: 0,
    recorrente: 0,
    VIP: 0,
    'em risco': 0,
    inativo: 0,
  },
  columns: {
    novo: { status: 'novo', items: [], total: 0, limit: KANBAN_COLUMN_STEP, hasMore: false },
    ativo: { status: 'ativo', items: [], total: 0, limit: KANBAN_COLUMN_STEP, hasMore: false },
    recorrente: { status: 'recorrente', items: [], total: 0, limit: KANBAN_COLUMN_STEP, hasMore: false },
    VIP: { status: 'VIP', items: [], total: 0, limit: KANBAN_COLUMN_STEP, hasMore: false },
    'em risco': { status: 'em risco', items: [], total: 0, limit: KANBAN_COLUMN_STEP, hasMore: false },
    inativo: { status: 'inativo', items: [], total: 0, limit: KANBAN_COLUMN_STEP, hasMore: false },
  },
  directory: {
    items: [],
    total: 0,
    overallTotal: 0,
    page: 1,
    limit: DIRECTORY_PAGE_SIZE,
    totalPages: 1,
    hasMore: false,
  },
};

export default function ClientesModule({ adminKey, tenantSlug }: Props) {
  const { maskCurrency, maskMoneyText } = useMoneyPrivacy();
  const [viewMode, setViewMode] = useState<'kanban' | 'directory'>('kanban');
  const [workspace, setWorkspace] = useState<ClientsWorkspaceResponse>(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | ClientStatus>('todos');
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('todos');
  const [sortMode, setSortMode] = useState<SortMode>('proximo-aviso');
  const [directoryPage, setDirectoryPage] = useState(1);
  const [columnLimits, setColumnLimits] = useState<Partial<Record<ClientStatus, number>>>({});
  const [loadingMoreColumn, setLoadingMoreColumn] = useState<ClientStatus | null>(null);
  const [showRadar, setShowRadar] = useState(false);

  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggingClientId, setDraggingClientId] = useState<number | null>(null);
  const [movingClientId, setMovingClientId] = useState<number | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);

  const [agentRules, setAgentRules] = useState<ClientAgentRule[]>([]);
  const [agentEvents, setAgentEvents] = useState<ClientAgentEvent[]>([]);
  const [agentLoaded, setAgentLoaded] = useState(false);
  const [agentStateSaving, setAgentStateSaving] = useState(false);

  const [createDraft, setCreateDraft] = useState<Record<string, unknown>>({
    name: '',
    phone: '+55',
    email: '',
    status: 'novo',
    preferred_service: '',
    preferred_professional: '',
    notes: '',
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === debouncedSearch) return;
    const timer = window.setTimeout(() => {
      setDirectoryPage(1);
      setColumnLimits({});
      setDebouncedSearch(trimmed);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [debouncedSearch, searchInput]);

  const handleStatusChange = useCallback((next: 'todos' | ClientStatus) => {
    setDirectoryPage(1);
    setColumnLimits({});
    setStatusFilter(next);
  }, []);

  const handleFocusChange = useCallback((next: FocusFilter | ((prev: FocusFilter) => FocusFilter)) => {
    setDirectoryPage(1);
    setColumnLimits({});
    setFocusFilter(next);
  }, []);

  const handleSortChange = useCallback((next: SortMode) => {
    setDirectoryPage(1);
    setColumnLimits({});
    setSortMode(next);
  }, []);

  const fetchWorkspace = useCallback(
    async (options?: { forceRefresh?: boolean; customColumnLimits?: Partial<Record<ClientStatus, number>>; silent?: boolean }) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      if (!options?.silent) {
        if (workspace.overview.total === 0) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
      }
      setError('');

      try {
        const response = await getClientsWorkspaceForAdmin(adminKey, {
          tenantSlug,
          mode: viewMode,
          search: debouncedSearch,
          status: statusFilter,
          focus: focusFilter,
          sort: sortMode,
          columnLimit: KANBAN_COLUMN_STEP,
          columnLimits: options?.customColumnLimits ?? columnLimits,
          page: directoryPage,
          limit: DIRECTORY_PAGE_SIZE,
          refresh: options?.forceRefresh,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;
        setWorkspace(response);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar carteira de clientes.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMoreColumn(null);
        }
      }
    },
    [adminKey, columnLimits, debouncedSearch, directoryPage, focusFilter, sortMode, statusFilter, tenantSlug, viewMode, workspace.overview.total],
  );

  useEffect(() => {
    setDirectoryPage(1);
    setColumnLimits({});
  }, [tenantSlug]);

  useEffect(() => {
    void fetchWorkspace();
    return () => {
      abortRef.current?.abort();
    };
  }, [debouncedSearch, statusFilter, focusFilter, sortMode, viewMode, directoryPage, tenantSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAgentState = useCallback(async () => {
    try {
      const response = await getClientAgentStateForAdmin(adminKey, tenantSlug);
      setAgentRules(response.rules);
      setAgentEvents(response.events);
      setAgentLoaded(true);
    } catch (loadError) {
      if (loadError instanceof Error && /\b404\b/.test(loadError.message)) {
        setAgentRules([]);
        setAgentEvents([]);
        setAgentLoaded(true);
      }
    }
  }, [adminKey, tenantSlug]);

  useEffect(() => {
    if (selectedClient && !agentLoaded) {
      void loadAgentState();
    }
  }, [agentLoaded, loadAgentState, selectedClient]);

  const persistAgentState = useCallback(
    async (nextRules: ClientAgentRule[], nextEvents: ClientAgentEvent[]) => {
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
        void fetchWorkspace({ forceRefresh: true, silent: true });
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : 'Erro ao salvar estado do agente de clientes.';
        setError(message);
        throw saveError;
      } finally {
        setAgentStateSaving(false);
      }
    },
    [adminKey, fetchWorkspace, tenantSlug],
  );

  const selectedResolvedClient = useMemo(() => {
    if (!selectedClient) return null;
    const selectedId = toNumber(selectedClient.id);
    if (!selectedId) return selectedClient;

    for (const col of CLIENT_COLUMNS) {
      const found = workspace.columns[col.status]?.items.find((item) => toNumber(item.client.id) === selectedId);
      if (found) return found.client;
    }
    const dirFound = workspace.directory.items.find((item) => toNumber(item.client.id) === selectedId);
    if (dirFound) return dirFound.client;

    return selectedClient;
  }, [selectedClient, workspace.columns, workspace.directory.items]);

  const handleCreateClient = async () => {
    if (!toStringValue(createDraft.name).trim() || normalizePhone(toStringValue(createDraft.phone)).length < 12) {
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
        phone: '+55',
        email: '',
        status: 'novo',
        preferred_service: '',
        preferred_professional: '',
        notes: '',
      });
      await fetchWorkspace({ forceRefresh: true });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Erro ao criar cliente.');
    } finally {
      setSavingCreate(false);
    }
  };

  const moveClientToStatus = async (clientId: number, targetStatus: ClientStatus) => {
    if (!clientId) return;
    setMovingClientId(clientId);
    setError('');
    try {
      await updateWorkbenchEntityForAdmin('clients', clientId, { status: targetStatus }, adminKey);
      await fetchWorkspace({ forceRefresh: true, silent: true });
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Erro ao mover cliente de etapa.');
    } finally {
      setMovingClientId(null);
    }
  };

  const handleLoadMoreColumn = (status: ClientStatus) => {
    const currentSlice = workspace.columns[status];
    const nextLimit = (currentSlice?.limit || KANBAN_COLUMN_STEP) + KANBAN_COLUMN_STEP;
    const nextLimits = {
      ...columnLimits,
      [status]: nextLimit,
    };
    setColumnLimits(nextLimits);
    setLoadingMoreColumn(status);
    void fetchWorkspace({ customColumnLimits: nextLimits, silent: true });
  };

  const hasActiveFilters = Boolean(searchInput.trim() || statusFilter !== 'todos' || focusFilter !== 'todos' || sortMode !== 'proximo-aviso');

  const handleClearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('todos');
    setFocusFilter('todos');
    setSortMode('proximo-aviso');
    setDirectoryPage(1);
    setColumnLimits({});
  };

  const { overview, radar, columnCounts, directory } = workspace;
  const radarAlertCount = radar.upcoming.length + overview.risk;

  return (
    <div className={`clientes-module${viewMode === 'kanban' ? ' clientes-module-kanban-locked' : ''}`}>
      {/* CABEÇALHO UNIFICADO: Carteira + Radar + Filtros */}
      <section className="clientes-header">
        {/* Linha 1: título + ações */}
        <div className="clientes-header-row clientes-header-top">
          <div className="clientes-header-title">
            <h2>Carteira de Clientes</h2>
            <p>Relacionamento, valor acumulado e janelas de retorno da base.</p>
          </div>

          <div className="clientes-header-actions">
            <MoneyEyeButton variant="compact" />
            <button
              type="button"
              className={`clientes-action-btn clientes-radar-toggle${showRadar ? ' active' : ''}`}
              onClick={() => setShowRadar((prev) => !prev)}
              aria-expanded={showRadar}
            >
              <Bot className="w-3.5 h-3.5" />
              Radar de retorno
              {radarAlertCount > 0 && <span className="clientes-radar-badge">{radarAlertCount}</span>}
              {showRadar ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              className="clientes-action-btn"
              onClick={() => void fetchWorkspace({ forceRefresh: true })}
              disabled={loading || refreshing}
              title="Atualizar carteira"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </button>

            <button
              type="button"
              className="clientes-action-btn clientes-action-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Novo cliente
            </button>
          </div>
        </div>

        {/* Linha 2: indicadores */}
        <div className="clientes-kpi-grid">
          <button
            type="button"
            className={`clientes-kpi${statusFilter === 'todos' && focusFilter === 'todos' ? ' is-selected' : ''}`}
            onClick={() => {
              setDirectoryPage(1);
              setColumnLimits({});
              setStatusFilter('todos');
              setFocusFilter('todos');
            }}
            title="Ver toda a carteira"
          >
            <span className="clientes-kpi-label">Carteira total</span>
            <strong className="clientes-kpi-value">{overview.total}</strong>
            <small className="clientes-kpi-sub">{overview.active} em fluxo ativo</small>
          </button>

          <button
            type="button"
            className={`clientes-kpi${focusFilter === 'alto-valor' ? ' is-selected' : ''}`}
            onClick={() => handleFocusChange((prev) => (prev === 'alto-valor' ? 'todos' : 'alto-valor'))}
            title="Filtrar clientes de alto valor"
          >
            <span className="clientes-kpi-label">Receita da carteira</span>
            <strong className="clientes-kpi-value is-money">{maskCurrency(overview.totalRevenue)}</strong>
            <small className="clientes-kpi-sub">Ticket médio {maskCurrency(overview.averageTicket)}</small>
          </button>

          <button
            type="button"
            className={`clientes-kpi${focusFilter === 'com-agente' ? ' is-selected' : ''}`}
            onClick={() => handleFocusChange((prev) => (prev === 'com-agente' ? 'todos' : 'com-agente'))}
            title="Filtrar clientes com retorno programado"
          >
            <span className="clientes-kpi-label">Retornos programados</span>
            <strong className="clientes-kpi-value">{overview.upcoming}</strong>
            <small className="clientes-kpi-sub">Com recorrência ativa</small>
          </button>

          <button
            type="button"
            className={`clientes-kpi${overview.risk > 0 ? ' is-danger' : ''}${focusFilter === 'reativacao' ? ' is-selected' : ''}`}
            onClick={() => handleFocusChange((prev) => (prev === 'reativacao' ? 'todos' : 'reativacao'))}
            title="Filtrar clientes em risco ou sem retorno"
          >
            <span className="clientes-kpi-label">
              {overview.risk > 0 && <AlertTriangle style={{ width: 12, height: 12 }} />}
              Pressão de reativação
            </span>
            <strong className="clientes-kpi-value">{overview.risk}</strong>
            <small className="clientes-kpi-sub">Em risco ou sem retorno</small>
          </button>
        </div>

        {/* Radar sob demanda */}
        {showRadar && (
          <div className="clientes-radar-drawer">
            <div className="clientes-radar-column">
              <div className="clientes-radar-col-head">
                <span><CalendarClock className="w-3.5 h-3.5" /> Próximos avisos</span>
                <small>{radar.upcoming.length} programado(s)</small>
              </div>
              {radar.upcoming.length === 0 ? (
                <p className="clientes-empty">Nenhum aviso de retorno programado no momento.</p>
              ) : (
                <div className="clientes-radar-items">
                  {radar.upcoming.map((item) => (
                    <button
                      key={`radar-rem-${toNumber(item.client.id) || toStringValue(item.client.phone)}`}
                      type="button"
                      className="clientes-radar-item"
                      onClick={() => setSelectedClient(item.client)}
                    >
                      <div>
                        <strong>{toStringValue(item.client.name) || 'Cliente'}</strong>
                        <span>{item.insight.topService}</span>
                      </div>
                      <span className="clientes-radar-pill">
                        {item.insight.nextReminder ? formatDate(item.insight.nextReminder) : '--'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="clientes-radar-column">
              <div className="clientes-radar-col-head">
                <span><Crown className="w-3.5 h-3.5" /> Carteira premium</span>
                <small>Top {radar.hotList.length}</small>
              </div>
              {radar.hotList.length === 0 ? (
                <p className="clientes-empty">Sem histórico de faturamento consolidado.</p>
              ) : (
                <div className="clientes-radar-items">
                  {radar.hotList.map((item) => (
                    <button
                      key={`radar-vip-${toNumber(item.client.id) || toStringValue(item.client.phone)}`}
                      type="button"
                      className="clientes-radar-item"
                      onClick={() => setSelectedClient(item.client)}
                    >
                      <div>
                        <strong>{toStringValue(item.client.name) || 'Cliente'}</strong>
                        <span>{item.insight.visitCount} visita(s) • {item.insight.topService}</span>
                      </div>
                      <strong className="clientes-radar-money">{maskCurrency(item.insight.totalSpent)}</strong>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Linha 3: visualização + busca + filtros */}
        <div className="clientes-header-row clientes-toolbar">
          <div className="clientes-view-toggle" role="tablist" aria-label="Modo de visualização">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'kanban'}
              className={viewMode === 'kanban' ? 'active' : ''}
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Kanban
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'directory'}
              className={viewMode === 'directory' ? 'active' : ''}
              onClick={() => setViewMode('directory')}
            >
              <List className="w-3.5 h-3.5" />
              Todos os clientes ({overview.total})
            </button>
          </div>

          <label className="clientes-compact-search" aria-label="Buscar clientes">
            <Search className="w-3.5 h-3.5" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar nome, telefone ou serviço"
            />
            {searchInput && (
              <button
                type="button"
                className="clientes-search-clear"
                onClick={() => {
                  setSearchInput('');
                  setDirectoryPage(1);
                  setColumnLimits({});
                  setDebouncedSearch('');
                }}
                aria-label="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </label>

          <div className="clientes-toolbar-selects">
            <select
              className="clientes-compact-select"
              value={statusFilter}
              onChange={(event) => handleStatusChange(event.target.value as 'todos' | ClientStatus)}
              aria-label="Filtrar por etapa"
            >
              <option value="todos">Etapa: todas ({workspace.filteredTotal})</option>
              {CLIENT_COLUMNS.map((column) => (
                <option key={column.status} value={column.status}>
                  {column.label} ({columnCounts[column.status] ?? 0})
                </option>
              ))}
            </select>

            <select
              className="clientes-compact-select"
              value={focusFilter}
              onChange={(event) => handleFocusChange(event.target.value as FocusFilter)}
              aria-label="Filtrar por foco"
            >
              <option value="todos">Foco: todos</option>
              <option value="com-agente">Com agente ativo</option>
              <option value="reativacao">Reativação / risco</option>
              <option value="alto-valor">Alto valor / VIP</option>
              <option value="sem-retorno">Sem retorno (60d+)</option>
            </select>

            <select
              className="clientes-compact-select"
              value={sortMode}
              onChange={(event) => handleSortChange(event.target.value as SortMode)}
              aria-label="Ordenar clientes"
            >
              <option value="proximo-aviso">Ordenar: próximo aviso</option>
              <option value="valor">Ordenar: maior valor</option>
              <option value="ultima-visita">Ordenar: última visita</option>
              <option value="nome">Ordenar: nome (A–Z)</option>
            </select>

            {hasActiveFilters && (
              <button type="button" className="clientes-clear-btn" onClick={handleClearFilters}>
                <X className="w-3.5 h-3.5" />
                Limpar
              </button>
            )}
          </div>

          <span className="clientes-result-count">
            <strong>{workspace.filteredTotal}</strong> de {overview.total}
            {agentStateSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          </span>
        </div>
      </section>

      {error && (
        <div className="clientes-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Fechar erro">×</button>
        </div>
      )}

      {loading && workspace.overview.total === 0 ? (
        <div className="clientes-loading-board">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando carteira de clientes...
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN DA CARTEIRA (Fixed viewport height + Independent column vertical scroll + Max 20 per column) */
        <div className="clientes-kanban" role="region" aria-label="Kanban da carteira de clientes">
          {CLIENT_COLUMNS.map((column) => {
            const slice = workspace.columns[column.status] || {
              status: column.status,
              items: [],
              total: 0,
              limit: KANBAN_COLUMN_STEP,
              hasMore: false,
            };
            const columnClients = slice.items;
            const totalInColumn = slice.total;

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
                <header className="clientes-column-header">
                  <div className="clientes-column-title-wrap" title={column.hint}>
                    <h4>{column.label}</h4>
                  </div>
                  <span
                    className="clientes-column-count"
                    title={
                      slice.hasMore
                        ? `Exibindo ${columnClients.length} de ${totalInColumn} clientes nesta etapa`
                        : `${totalInColumn} cliente(s) nesta etapa`
                    }
                  >
                    {slice.hasMore ? `${columnClients.length}/${totalInColumn}` : totalInColumn}
                  </span>
                </header>

                <div className="clientes-kanban-list admin-scroll">
                  {columnClients.length === 0 ? (
                    <div className="clientes-column-empty">
                      <p className="clientes-empty">
                        {hasActiveFilters ? 'Nenhum cliente nesta etapa com os filtros atuais.' : 'Sem clientes nesta etapa.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {columnClients.map((item) => {
                        const id = toNumber(item.client.id);
                        const toneClass = `tone-${item.insight.tone}`;
                        const currentStatus = normalizeClientStatus(item.client.status);

                        return (
                          <article
                            key={id || `${toStringValue(item.client.name)}-${toStringValue(item.client.phone)}`}
                            className={`clientes-card${movingClientId === id ? ' is-moving' : ''}`}
                            draggable={Boolean(id)}
                            onDragStart={() => setDraggingClientId(id)}
                            onClick={() => setSelectedClient(item.client)}
                            title="Clique para abrir a Ficha 360° e configurar recorrência"
                          >
                            <div className={`clientes-card-accent ${toneClass}`} />

                            <div className="clientes-card-badge-bar">
                              <span className={`clientes-pill ${toneClass}`}>{item.insight.toneLabel}</span>
                              <strong className="clientes-card-revenue">
                                {maskCurrency(item.insight.totalSpent)}
                              </strong>
                            </div>

                            <div className="clientes-card-top">
                              <div className={`clientes-card-avatar ${toneClass}`}>
                                {getClientInitials(toStringValue(item.client.name))}
                              </div>
                              <div className="clientes-card-identity">
                                <strong title={toStringValue(item.client.name) || 'Cliente sem nome'}>
                                  {toStringValue(item.client.name) || 'Cliente sem nome'}
                                </strong>
                                <span className="clientes-card-phone">
                                  <Phone className="w-2.5 h-2.5" />
                                  {toStringValue(item.client.phone) || '--'}
                                </span>
                              </div>
                            </div>

                            <div className="clientes-card-summary-row">
                              <strong className="clientes-card-service-title" title={item.insight.topService}>
                                {item.insight.topService}
                              </strong>
                              <span className="clientes-card-meta-text">
                                {item.insight.visitCount} {item.insight.visitCount === 1 ? 'visita' : 'visitas'}
                                {' · '}
                                {item.insight.nextReminder
                                  ? `Aviso ${formatDate(item.insight.nextReminder)}`
                                  : item.insight.lastVisit
                                    ? formatDate(item.insight.lastVisit)
                                    : 'Sem visita'}
                              </span>
                            </div>

                            <div
                              className="clientes-card-actions"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <select
                                className="clientes-card-stage-select"
                                value={currentStatus}
                                disabled={!id || movingClientId === id}
                                onChange={(event) => {
                                  const nextStatus = event.target.value as ClientStatus;
                                  if (id && nextStatus !== currentStatus) {
                                    void moveClientToStatus(id, nextStatus);
                                  }
                                }}
                                aria-label={`Mover ${toStringValue(item.client.name)} de etapa`}
                              >
                                {CLIENT_COLUMNS.map((col) => (
                                  <option key={col.status} value={col.status}>
                                    Fase: {col.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </article>
                        );
                      })}

                      {slice.hasMore && (
                        <div className="clientes-column-footer">
                          <button
                            type="button"
                            className="admin-btn-outline admin-btn-sm clientes-load-more-btn"
                            onClick={() => handleLoadMoreColumn(column.status)}
                            disabled={loadingMoreColumn === column.status}
                          >
                            {loadingMoreColumn === column.status ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" />
                            )}
                            Carregar mais 20 ({columnClients.length} de {totalInColumn})
                          </button>
                          <button
                            type="button"
                            className="clientes-view-all-link"
                            onClick={() => {
                              handleStatusChange(column.status);
                              setViewMode('directory');
                            }}
                          >
                            Ver todos os {totalInColumn} na lista →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* DEDICATED "TODOS OS CLIENTES" DIRECTORY VIEW (Server-side 20 per page) */
        <section className="clientes-directory-shell">
          <div className="clientes-directory-header">
            <div>
              <h3>Todos os clientes</h3>
              <p>
                Consulte toda a carteira com busca, filtros e paginação no servidor ({DIRECTORY_PAGE_SIZE} registros por página).
              </p>
            </div>
            <div className="clientes-directory-meta">
              <span>
                Mostrando{' '}
                <strong>
                  {directory.total === 0 ? 0 : (directory.page - 1) * directory.limit + 1}–
                  {Math.min(directory.page * directory.limit, directory.total)}
                </strong>{' '}
                de <strong>{directory.total}</strong> cliente(s)
              </span>
            </div>
          </div>

          {directory.items.length === 0 ? (
            <div className="clientes-directory-empty">
              <strong>
                {hasActiveFilters
                  ? 'Nenhum cliente encontrado para os critérios selecionados.'
                  : 'Nenhum cliente cadastrado na carteira.'}
              </strong>
              <p>
                {hasActiveFilters
                  ? 'Limpe ou ajuste os filtros acima para visualizar outros clientes.'
                  : 'Clique em "Novo cliente" no topo para cadastrar o primeiro cliente.'}
              </p>
              {hasActiveFilters && (
                <button type="button" className="admin-btn-outline admin-btn-sm" onClick={handleClearFilters}>
                  Limpar filtros ativos
                </button>
              )}
            </div>
          ) : (
            <div className="clientes-directory-table-wrap">
              <table className="clientes-directory-table">
                <thead>
                  <tr>
                    <th>Cliente & Contato</th>
                    <th>Etapa da Carteira</th>
                    <th>Serviço Âncora & Visitas</th>
                    <th>Valor Acumulado</th>
                    <th>Última Visita & Retorno</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.items.map((item) => {
                    const id = toNumber(item.client.id);
                    const toneClass = `tone-${item.insight.tone}`;
                    const currentStatus = normalizeClientStatus(item.client.status);
                    const email = toStringValue(item.client.email);

                    return (
                      <tr key={id || `${toStringValue(item.client.name)}-${toStringValue(item.client.phone)}`}>
                        <td>
                          <div className="clientes-dir-identity">
                            <div className={`clientes-card-avatar ${toneClass}`}>
                              {getClientInitials(toStringValue(item.client.name))}
                            </div>
                            <div>
                              <button
                                type="button"
                                className="clientes-dir-name-btn"
                                onClick={() => setSelectedClient(item.client)}
                              >
                                {toStringValue(item.client.name) || 'Cliente sem nome'}
                              </button>
                              <div className="clientes-dir-sub">
                                <span><Phone className="w-3 h-3" /> {toStringValue(item.client.phone) || '--'}</span>
                                {email && <span><Mail className="w-3 h-3" /> {email}</span>}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="clientes-dir-stage-cell">
                            <select
                              className="admin-select clientes-dir-stage-select"
                              value={currentStatus}
                              disabled={!id || movingClientId === id}
                              onChange={(event) => {
                                const nextStatus = event.target.value as ClientStatus;
                                if (id && nextStatus !== currentStatus) {
                                  void moveClientToStatus(id, nextStatus);
                                }
                              }}
                            >
                              {CLIENT_COLUMNS.map((col) => (
                                <option key={col.status} value={col.status}>
                                  {col.label}
                                </option>
                              ))}
                            </select>
                            <span className={`clientes-pill ${toneClass}`}>{item.insight.toneLabel}</span>
                          </div>
                        </td>

                        <td>
                          <div className="clientes-dir-col-stack">
                            <strong>{item.insight.topService}</strong>
                            <span>
                              {item.insight.visitCount} visita(s) confirmada(s)
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className="clientes-dir-col-stack">
                            <strong style={{ color: 'var(--admin-wine)' }}>
                              {maskCurrency(item.insight.totalSpent)}
                            </strong>
                            <span>Ticket médio {maskCurrency(item.insight.avgTicket)}</span>
                          </div>
                        </td>

                        <td>
                          <div className="clientes-dir-col-stack">
                            <strong>
                              {item.insight.lastVisit ? formatDate(item.insight.lastVisit) : 'Sem visita'}
                            </strong>
                            <span>
                              {item.insight.nextReminder
                                ? `Próximo aviso: ${formatDate(item.insight.nextReminder)}`
                                : item.insight.dormancyDays !== null
                                  ? `Ausência: ${formatDormancy(item.insight.dormancyDays)}`
                                  : maskMoneyText(item.insight.attentionLine)}
                            </span>
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="admin-btn-outline admin-btn-sm"
                            onClick={() => setSelectedClient(item.client)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Abrir ficha 360°
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {directory.total > 0 && (
            <div className="clientes-directory-pagination">
              <span className="clientes-pagination-info">
                Página <strong>{directory.page}</strong> de <strong>{directory.totalPages}</strong> — {directory.total} registro(s) no filtro ({directory.overallTotal} na base total)
              </span>

              <div className="clientes-pagination-controls">
                <button
                  type="button"
                  className="admin-btn-outline admin-btn-sm"
                  disabled={directory.page <= 1 || loading || refreshing}
                  onClick={() => setDirectoryPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>

                {Array.from({ length: Math.min(5, directory.totalPages) }, (_, idx) => {
                  const startPage = Math.max(1, Math.min(directory.page - 2, directory.totalPages - 4));
                  const pageNumber = startPage + idx;
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`clientes-page-num${pageNumber === directory.page ? ' active' : ''}`}
                      onClick={() => setDirectoryPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  );
                })}

                <button
                  type="button"
                  className="admin-btn-outline admin-btn-sm"
                  disabled={!directory.hasMore || loading || refreshing}
                  onClick={() => setDirectoryPage((prev) => Math.min(directory.totalPages, prev + 1))}
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
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
                  <input className="admin-input" value={toStringValue(createDraft.phone)} onChange={(event) => setCreateDraft((current) => ({ ...current, phone: formatBrazilWhatsappInput(event.target.value) }))} />
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
          tenantSlug={tenantSlug}
          rules={agentRules}
          events={agentEvents}
          onSaveAgentState={persistAgentState}
          onClose={() => setSelectedClient(null)}
          onClientUpdated={async () => {
            await fetchWorkspace({ forceRefresh: true, silent: true });
          }}
        />
      )}
    </div>
  );
}
