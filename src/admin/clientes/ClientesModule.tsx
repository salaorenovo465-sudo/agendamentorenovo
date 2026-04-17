import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

import {
  createWorkbenchEntityForAdmin,
  deleteWorkbenchEntityForAdmin,
  getClientAgentStateForAdmin,
  listBookingsByPhoneForAdmin,
  listWorkbenchEntityForAdmin,
  saveClientAgentStateForAdmin,
  updateWorkbenchEntityForAdmin,
  type ClientAgentChannel,
  type ClientAgentEvent,
  type ClientAgentIntervalUnit,
  type ClientAgentRule,
} from '../api';
import type { AdminBooking } from '../types';
import { formatDateBR, toNumber, toStringValue } from '../AdminUtils';
import './clientes-module.css';

type Props = {
  adminKey: string;
  tenantSlug: string;
};

type ClientStatus = 'novo' | 'ativo' | 'recorrente' | 'VIP' | 'em risco' | 'inativo';

type ClientRecord = Record<string, unknown>;

type AgentDraft = {
  serviceName: string;
  intervalValue: number;
  intervalUnit: ClientAgentIntervalUnit;
  channel: ClientAgentChannel;
  messageTemplate: string;
};

const CLIENT_COLUMNS: Array<{ status: ClientStatus; label: string; hint: string }> = [
  { status: 'novo', label: 'Novos', hint: 'Primeiro contato ou primeira visita.' },
  { status: 'ativo', label: 'Ativos', hint: 'Clientes em ciclo regular recente.' },
  { status: 'recorrente', label: 'Recorrentes', hint: 'Retorno com frequencia definida.' },
  { status: 'VIP', label: 'VIP', hint: 'Ticket alto ou prioridade comercial.' },
  { status: 'em risco', label: 'Em risco', hint: 'Sem retorno acima do esperado.' },
  { status: 'inativo', label: 'Inativos', hint: 'Sem atividade por periodo prolongado.' },
];

const STATUS_SET = new Set(CLIENT_COLUMNS.map((column) => column.status));
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

const resolveServiceList = (bookings: AdminBooking[]): Array<{ name: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.serviceItems && booking.serviceItems.length > 0) {
      for (const item of booking.serviceItems) {
        const name = item.name.trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      continue;
    }

    const fallback = booking.service.trim();
    if (!fallback) continue;
    counts.set(fallback, (counts.get(fallback) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
};

const resolveLatestServiceDate = (bookings: AdminBooking[], serviceName: string): string | null => {
  const normalizedService = serviceName.trim().toLowerCase();
  if (!normalizedService) return null;

  let latest: string | null = null;
  for (const booking of bookings) {
    const candidates = booking.serviceItems && booking.serviceItems.length > 0
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

const isSameOrBefore = (left: string, right: string): boolean => left <= right;

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
  const [activeTab, setActiveTab] = useState<'resumo' | 'agente' | 'timeline'>('resumo');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentBusyRule, setAgentBusyRule] = useState<string | null>(null);
  const [agentError, setAgentError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...client });
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(buildDefaultDraft(toStringValue(client.name)));

  const clientId = toNumber(client.id);
  const clientName = toStringValue(client.name);
  const clientPhone = toStringValue(client.phone);

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

  useEffect(() => {
    const topService = resolveServiceList(bookings)[0]?.name || toStringValue(client.preferred_service);
    setAgentDraft(buildDefaultDraft(clientName, topService));
  }, [bookings, client.preferred_service, clientName]);

  const clientRules = useMemo(
    () => rules.filter((rule) => rule.clientId === clientId).sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate)),
    [clientId, rules],
  );

  const clientEvents = useMemo(
    () => events.filter((event) => event.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [clientId, events],
  );

  const summary = useMemo(() => {
    const confirmed = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed');
    const totalSpent = confirmed.reduce((sum, booking) => {
      if (booking.serviceItems && booking.serviceItems.length > 0) {
        return sum + booking.serviceItems.reduce((acc, item) => acc + parseMoney(item.price), 0);
      }
      return sum + parseMoney(booking.servicePrice);
    }, 0);
    const lastVisit = confirmed.slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    const services = resolveServiceList(confirmed);
    return { totalSpent, visitCount: confirmed.length, services, lastVisit };
  }, [bookings]);

  const clientTaskTimeline = useMemo(() => {
    const normalizedClient = clientName.trim().toLowerCase();
    return tasks.filter((row) => {
      const related = toStringValue(row.related_client).trim().toLowerCase();
      if (related && related === normalizedClient) {
        return true;
      }
      const notes = toStringValue(row.notes);
      return notes.includes(`cliente:${clientId}`);
    });
  }, [clientId, clientName, tasks]);

  const handleSaveClient = async () => {
    if (!clientId) return;
    setSaving(true);
    setAgentError('');
    try {
      await updateWorkbenchEntityForAdmin('clients', clientId, draft, adminKey);
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
    if (!window.confirm(`Remover cliente ${clientName}?`)) return;
    setSaving(true);
    setAgentError('');
    try {
      await deleteWorkbenchEntityForAdmin('clients', clientId, adminKey);
      await onClientUpdated();
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
      const duplicated = events.some((event) => event.ruleId === rule.id && event.scheduledFor === scheduledFor && event.status === 'queued');
      if (duplicated) {
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
          reason: 'Aviso ja existe para a mesma data.',
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
          title: `Aviso recorrencia: ${rule.clientName} - ${rule.serviceName}`,
          owner: 'Agente de Clientes',
          due_date: scheduledFor,
          priority: 'media',
          status: 'pendente',
          related_client: rule.clientName,
          notes: `agente_cliente|rule:${rule.id}|cliente:${rule.clientId}|canal:${rule.channel}|mensagem:${preview}`,
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

  return (
    <div className="admin-modal-root clientes-modal-root">
      <div className="admin-modal-overlay" onClick={onClose} />
      <div className="admin-modal-card clientes-modal-card" role="dialog" aria-modal="true">
        <div className="admin-modal-header clientes-modal-header">
          <div className="admin-modal-title-row">
            <div className="admin-modal-icon admin-modal-icon-gold">
              <UserRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="admin-modal-title">{clientName || 'Cliente'}</h3>
              <p className="admin-modal-subtitle">Painel 360: historico, valor acumulado, recorrencia e avisos.</p>
            </div>
          </div>
          <button type="button" className="admin-btn-outline" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="clientes-modal-tabs">
          {(['resumo', 'agente', 'timeline'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              className={activeTab === tabKey ? 'active' : ''}
              onClick={() => setActiveTab(tabKey)}
            >
              {tabKey === 'resumo' ? 'Resumo' : tabKey === 'agente' ? 'Agente AI' : 'Timeline'}
            </button>
          ))}
        </div>

        <div className="admin-modal-body clientes-modal-body">
          {agentError && <div className="clientes-error">{agentError}</div>}

          {activeTab === 'resumo' && (
            <div className="clientes-summary-shell">
              {loading ? (
                <div className="clientes-loading"><Loader2 className="w-4 h-4 animate-spin" /> Carregando contexto do cliente...</div>
              ) : (
                <>
                  <div className="clientes-summary-grid">
                    <article>
                      <span>Visitas confirmadas</span>
                      <strong>{summary.visitCount}</strong>
                    </article>
                    <article>
                      <span>Total gasto</span>
                      <strong>{formatCurrency(summary.totalSpent)}</strong>
                    </article>
                    <article>
                      <span>Ultima visita</span>
                      <strong>{summary.lastVisit ? formatDate(summary.lastVisit.date) : '--'}</strong>
                    </article>
                  </div>

                  <div className="clientes-info-grid">
                    <div>
                      <label>Telefone</label>
                      <p><Phone className="w-3 h-3" /> {clientPhone || '--'}</p>
                    </div>
                    <div>
                      <label>Email</label>
                      <p><Mail className="w-3 h-3" /> {toStringValue(client.email) || '--'}</p>
                    </div>
                    <div>
                      <label>Status</label>
                      <p>{normalizeClientStatus(client.status)}</p>
                    </div>
                    <div>
                      <label>Servico preferido</label>
                      <p>{toStringValue(client.preferred_service) || '--'}</p>
                    </div>
                  </div>

                  <div className="clientes-services-block">
                    <h4>Servicos ja realizados</h4>
                    {summary.services.length === 0 ? (
                      <p className="clientes-empty">Sem servicos confirmados ainda.</p>
                    ) : (
                      <div className="clientes-services-list">
                        {summary.services.map((service) => (
                          <div key={service.name}>
                            <span>{service.name}</span>
                            <strong>{service.count}x</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {!editOpen ? (
                    <div className="clientes-row-actions">
                      <button type="button" className="admin-btn-primary" onClick={() => setEditOpen(true)}>Editar cadastro</button>
                      <button type="button" className="admin-btn-danger" onClick={() => void handleDeleteClient()} disabled={saving}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Excluir cliente
                      </button>
                    </div>
                  ) : (
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
                        <select className="admin-input" value={normalizeClientStatus(draft.status)} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                          {CLIENT_COLUMNS.map((column) => (
                            <option key={column.status} value={column.status}>{column.status}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label className="admin-label">Observacoes</label>
                        <textarea className="admin-input" rows={3} value={toStringValue(draft.notes)} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
                      </div>
                      <div className="clientes-row-actions" style={{ gridColumn: '1 / -1' }}>
                        <button type="button" className="admin-btn-success" onClick={() => void handleSaveClient()} disabled={saving}>
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Salvar
                        </button>
                        <button type="button" className="admin-btn-outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'agente' && (
            <div className="clientes-agent-shell">
              <section className="clientes-agent-create">
                <h4><Bot className="w-4 h-4" /> Programar recorrencia simulada</h4>
                <p>Configure o retorno automatico por servico. O agente simulado cria tarefas de aviso e atualiza o proximo ciclo.</p>
                <div className="clientes-agent-form">
                  <div>
                    <label className="admin-label">Servico de referencia</label>
                    <input
                      className="admin-input"
                      value={agentDraft.serviceName}
                      onChange={(event) => setAgentDraft((current) => ({ ...current, serviceName: event.target.value }))}
                      placeholder="Ex: Alisamento"
                    />
                  </div>
                  <div>
                    <label className="admin-label">Intervalo</label>
                    <div className="clientes-agent-inline">
                      <input
                        type="number"
                        min={1}
                        max={36}
                        className="admin-input"
                        value={agentDraft.intervalValue}
                        onChange={(event) => setAgentDraft((current) => ({ ...current, intervalValue: Number(event.target.value) || 1 }))}
                      />
                      <select
                        className="admin-input"
                        value={agentDraft.intervalUnit}
                        onChange={(event) => setAgentDraft((current) => ({ ...current, intervalUnit: event.target.value as ClientAgentIntervalUnit }))}
                      >
                        <option value="days">dias</option>
                        <option value="weeks">semanas</option>
                        <option value="months">meses</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="admin-label">Canal principal</label>
                    <select
                      className="admin-input"
                      value={agentDraft.channel}
                      onChange={(event) => setAgentDraft((current) => ({ ...current, channel: event.target.value as ClientAgentChannel }))}
                    >
                      <option value="manual">manual</option>
                      <option value="whatsapp">whatsapp</option>
                      <option value="email">email</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="admin-label">Template do aviso</label>
                    <textarea
                      className="admin-input"
                      rows={3}
                      value={agentDraft.messageTemplate}
                      onChange={(event) => setAgentDraft((current) => ({ ...current, messageTemplate: event.target.value }))}
                    />
                    <small>Variaveis: {'{cliente}'}, {'{servico}'}, {'{data_proxima}'}</small>
                  </div>
                </div>
                <div className="clientes-row-actions">
                  <button type="button" className="admin-btn-primary" onClick={() => void handleCreateRule()}>
                    <Sparkles className="w-3.5 h-3.5" /> Salvar regra de recorrencia
                  </button>
                </div>
              </section>

              <section className="clientes-agent-rules">
                <h4><CalendarClock className="w-4 h-4" /> Regras do cliente</h4>
                {clientRules.length === 0 ? (
                  <p className="clientes-empty">Nenhuma regra criada para este cliente.</p>
                ) : (
                  <div className="clientes-agent-rules-list">
                    {clientRules.map((rule) => (
                      <article key={rule.id}>
                        <div>
                          <strong>{rule.serviceName}</strong>
                          <span>
                            intervalo: {rule.intervalValue} {rule.intervalUnit} | proximo aviso: {formatDate(rule.nextRunDate)}
                          </span>
                        </div>
                        <div className="clientes-agent-rule-actions">
                          <button
                            type="button"
                            className="admin-btn-outline"
                            onClick={() => void handleRunRule(rule)}
                            disabled={agentBusyRule === rule.id || !rule.enabled}
                          >
                            {agentBusyRule === rule.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Executar agente
                          </button>
                          <button
                            type="button"
                            className={rule.enabled ? 'admin-btn-success' : 'admin-btn-outline'}
                            onClick={() => void handleToggleRule(rule.id, !rule.enabled)}
                          >
                            {rule.enabled ? 'Ativo' : 'Pausado'}
                          </button>
                          <button type="button" className="admin-btn-danger" onClick={() => void handleDeleteRule(rule.id)}>
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="clientes-timeline-shell">
              <section>
                <h4><Clock3 className="w-4 h-4" /> Historico de agendamentos</h4>
                {bookings.length === 0 ? (
                  <p className="clientes-empty">Sem agendamentos para este cliente.</p>
                ) : (
                  <div className="clientes-timeline-list">
                    {bookings
                      .slice()
                      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
                      .map((booking) => (
                        <article key={`booking-${booking.id}`}>
                          <div>
                            <strong>{booking.service}</strong>
                            <span>{formatDate(booking.date)} as {booking.time}</span>
                          </div>
                          <span className={`status-${booking.status}`}>{booking.status}</span>
                        </article>
                      ))}
                  </div>
                )}
              </section>

              <section>
                <h4><Bot className="w-4 h-4" /> Eventos do agente</h4>
                {clientEvents.length === 0 ? (
                  <p className="clientes-empty">Nenhum evento de agente registrado.</p>
                ) : (
                  <div className="clientes-timeline-list">
                    {clientEvents.map((event) => (
                      <article key={event.id}>
                        <div>
                          <strong>{event.serviceName}</strong>
                          <span>
                            aviso para {formatDate(event.scheduledFor)} | criado em {formatDateTime(event.createdAt)}
                          </span>
                          {event.messagePreview && <small>{event.messagePreview}</small>}
                        </div>
                        <span className={`event-${event.status}`}>{event.status}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h4><CheckCircle2 className="w-4 h-4" /> Tarefas geradas</h4>
                {clientTaskTimeline.length === 0 ? (
                  <p className="clientes-empty">Nenhuma tarefa ligada ao cliente.</p>
                ) : (
                  <div className="clientes-timeline-list">
                    {clientTaskTimeline.map((task) => (
                      <article key={`task-${toNumber(task.id)}`}>
                        <div>
                          <strong>{toStringValue(task.title) || 'Tarefa sem titulo'}</strong>
                          <span>vencimento: {formatDate(toStringValue(task.due_date))}</span>
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
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClientesModule({ adminKey, tenantSlug }: Props) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
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
    void Promise.all([loadClients(), loadAgentState()]);
  }, [loadAgentState, loadClients]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => {
      const name = toStringValue(client.name).toLowerCase();
      const phone = toStringValue(client.phone).toLowerCase();
      const email = toStringValue(client.email).toLowerCase();
      const status = toStringValue(client.status).toLowerCase();
      return name.includes(term) || phone.includes(term) || email.includes(term) || status.includes(term);
    });
  }, [clients, search]);

  const stats = useMemo(() => {
    const total = clients.length;
    const vip = clients.filter((client) => normalizeClientStatus(client.status) === 'VIP').length;
    const emRisco = clients.filter((client) => normalizeClientStatus(client.status) === 'em risco').length;
    const ativos = clients.filter((client) => ['ativo', 'recorrente', 'VIP'].includes(normalizeClientStatus(client.status))).length;
    return { total, vip, emRisco, ativos };
  }, [clients]);

  const nextReminderByClient = useMemo(() => {
    const map = new Map<number, string>();
    for (const rule of agentRules) {
      if (!rule.enabled) continue;
      const current = map.get(rule.clientId);
      if (!current || rule.nextRunDate < current) {
        map.set(rule.clientId, rule.nextRunDate);
      }
    }
    return map;
  }, [agentRules]);

  const groupedClients = useMemo(() => {
    const grouped = new Map<ClientStatus, ClientRecord[]>();
    CLIENT_COLUMNS.forEach((column) => grouped.set(column.status, []));
    for (const client of filteredClients) {
      const status = normalizeClientStatus(client.status);
      grouped.get(status)?.push(client);
    }
    return grouped;
  }, [filteredClients]);

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
      await loadClients();
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

  return (
    <div className="clientes-module">
      <section className="clientes-hero admin-analytics-card">
        <div>
          <span className="clientes-kicker">CRM Clientes Module</span>
          <h3>Kanban de clientes + agente de recorrencia simulado</h3>
          <p>Modulo isolado da tela principal, com painel de cliente 360 e programacao de avisos por servico.</p>
        </div>
        <div className="clientes-hero-actions">
          <button type="button" className="admin-btn-outline" onClick={() => void loadClients()}>
            <Loader2 className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button type="button" className="admin-btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-3.5 h-3.5" />
            Novo cliente
          </button>
        </div>
      </section>

      <section className="clientes-stats">
        <article><span>Total</span><strong>{stats.total}</strong></article>
        <article><span>Ativos</span><strong>{stats.ativos}</strong></article>
        <article><span>VIP</span><strong>{stats.vip}</strong></article>
        <article><span>Em risco</span><strong>{stats.emRisco}</strong></article>
      </section>

      <section className="clientes-toolbar">
        <label className="clientes-search">
          <Search className="w-3.5 h-3.5" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, telefone, email ou status"
          />
        </label>
        {(agentStateLoading || agentStateSaving) && (
          <span className="clientes-agent-loading">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {agentStateSaving ? 'Salvando agente...' : 'Carregando agente...'}
          </span>
        )}
      </section>

      {error && <div className="clientes-error">{error}</div>}

      {loading ? (
        <div className="clientes-loading-board"><Loader2 className="w-4 h-4 animate-spin" /> Carregando carteira de clientes...</div>
      ) : (
        <section className="clientes-kanban">
          {CLIENT_COLUMNS.map((column) => {
            const columnClients = groupedClients.get(column.status) || [];
            return (
              <article
                key={column.status}
                className="clientes-kanban-column"
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
                    columnClients.map((client) => {
                      const id = toNumber(client.id);
                      const nextReminder = nextReminderByClient.get(id);
                      return (
                        <button
                          type="button"
                          key={id || `${toStringValue(client.name)}-${toStringValue(client.phone)}`}
                          className="clientes-card"
                          draggable={Boolean(id)}
                          onDragStart={() => setDraggingClientId(id)}
                          onClick={() => setSelectedClient(client)}
                        >
                          <div className="clientes-card-head">
                            <div className="admin-avatar">{toStringValue(client.name).charAt(0).toUpperCase() || '?'}</div>
                            <div>
                              <strong>{toStringValue(client.name) || 'Cliente sem nome'}</strong>
                              <span><Phone className="w-3 h-3" /> {toStringValue(client.phone) || '--'}</span>
                            </div>
                          </div>
                          <div className="clientes-card-body">
                            <p><Mail className="w-3 h-3" /> {toStringValue(client.email) || 'email nao informado'}</p>
                            <p><Sparkles className="w-3 h-3" /> {toStringValue(client.preferred_service) || 'servico nao definido'}</p>
                            <p><CalendarClock className="w-3 h-3" /> {nextReminder ? `proximo aviso: ${formatDate(nextReminder)}` : 'sem regra de recorrencia'}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </article>
            );
          })}
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
                <p className="admin-modal-subtitle">Entrada rapida para a carteira CRM.</p>
              </div>
            </div>
            <div className="admin-modal-body">
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
                  <label className="admin-label">Status</label>
                  <select className="admin-input" value={toStringValue(createDraft.status) || 'novo'} onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value }))}>
                    {CLIENT_COLUMNS.map((column) => (
                      <option key={column.status} value={column.status}>{column.status}</option>
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
                <div style={{ gridColumn: '1 / -1' }}>
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

      {selectedClient && (
        <ClienteModal
          client={selectedClient}
          adminKey={adminKey}
          rules={agentRules}
          events={agentEvents}
          onSaveAgentState={persistAgentState}
          onClose={() => setSelectedClient(null)}
          onClientUpdated={loadClients}
        />
      )}
    </div>
  );
}
