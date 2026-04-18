import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  BadgeDollarSign,
  Check,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
} from 'lucide-react';

import {
  createWorkbenchEntityForAdmin,
  listAdminBookings,
  listWorkbenchEntityForAdmin,
  markFinancePaidForAdmin,
} from './api';
import type { AdminBooking, AdminFinanceEntry } from './types';
import { DangerConfirmModal } from './AdminHelpers';

type Props = {
  adminKey: string;
  onClearPaymentsHistory: (masterPassword?: string) => Promise<void>;
};

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Debito' },
  { value: 'credito', label: 'Credito' },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

type ResolvedFinanceEntry = AdminFinanceEntry & {
  booking: AdminBooking | null;
  resolvedAmount: number;
  referenceDate: string;
  isOverdue: boolean;
  amountSource: 'entry' | 'booking';
};

type MissingFinanceEntry = {
  booking: AdminBooking;
  estimatedAmount: number;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const getTodayDate = (): string => new Date().toISOString().slice(0, 10);

const getMonthStart = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const formatCurrency = (value: number): string => currencyFormatter.format(value || 0);

const formatDate = (date: string | null | undefined): string => {
  if (!date) {
    return '--';
  }

  const value = date.slice(0, 10);
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
};

const parseMoneyAmount = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const match = value.match(/[\d.]+(?:,\d{2})?|\d+(?:\.\d{2})?/);
  if (!match) {
    return 0;
  }

  return Number(match[0].replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
};

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizePaymentMethod = (value: string | null | undefined): PaymentMethod | '' => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PAYMENT_METHODS.some((method) => method.value === normalized as PaymentMethod)
    ? normalized as PaymentMethod
    : '';
};

const paymentMethodLabel = (value: string | null | undefined): string => {
  const normalized = normalizePaymentMethod(value);
  return PAYMENT_METHODS.find((method) => method.value === normalized)?.label || 'Nao informado';
};

const isSettledStatus = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().toLowerCase() === 'pago';

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
};

const toNullableNumber = (value: unknown): number | null => {
  const parsed = toNumber(value);
  return parsed > 0 ? parsed : null;
};

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const normalizeFinanceEntry = (row: Record<string, unknown>): AdminFinanceEntry => ({
  id: toNumber(row.id),
  bookingId: toNullableNumber(row.booking_id),
  clientName: toStringValue(row.client_name),
  serviceName: toStringValue(row.service_name),
  amount: toNumber(row.amount),
  paymentMethod: toStringValue(row.payment_method) || null,
  status: isSettledStatus(toStringValue(row.status)) ? 'pago' : 'pendente',
  dueDate: toStringValue(row.due_date) || null,
  paidAt: toStringValue(row.paid_at) || null,
  createdAt: toStringValue(row.created_at),
  updatedAt: toStringValue(row.updated_at),
});

const resolveReferenceDate = (entry: AdminFinanceEntry, booking: AdminBooking | null): string =>
  entry.paidAt?.slice(0, 10) ||
  entry.dueDate?.slice(0, 10) ||
  booking?.date ||
  entry.createdAt.slice(0, 10) ||
  getTodayDate();

const matchesDateRange = (date: string, startDate: string, endDate: string): boolean =>
  date >= startDate && date <= endDate;

const createFinancePayloadFromBooking = (booking: AdminBooking): Record<string, unknown> => ({
  booking_id: booking.id,
  client_name: booking.name,
  service_name: booking.service,
  amount: parseMoneyAmount(booking.servicePrice),
  status: 'pendente',
  due_date: booking.date,
});

const sumResolvedAmounts = (rows: ResolvedFinanceEntry[]): number =>
  rows.reduce((total, row) => total + row.resolvedAmount, 0);

const sumMissingAmounts = (rows: MissingFinanceEntry[]): number =>
  rows.reduce((total, row) => total + row.estimatedAmount, 0);

const sumPrimitiveAmounts = (rows: number[]): number =>
  rows.reduce((total, row) => total + row, 0);

export default function PaymentConfirmationTab({ adminKey, onClearPaymentsHistory }: Props) {
  const [entries, setEntries] = useState<AdminFinanceEntry[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente' | 'pago'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [periodMode, setPeriodMode] = useState<'all' | 'range'>('all');
  const [startDate, setStartDate] = useState(getMonthStart());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [resetPaymentsModalOpen, setResetPaymentsModalOpen] = useState(false);

  const handleClearPaymentsHistory = async (masterPassword?: string) => {
    setBusyKey('reset-payments');
    setError('');

    try {
      await onClearPaymentsHistory(masterPassword);
      await load();
      setResetPaymentsModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao limpar o historico de pagamentos.');
    } finally {
      setBusyKey(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [financeRows, bookingRows] = await Promise.all([
        listWorkbenchEntityForAdmin('finance', adminKey),
        listAdminBookings(adminKey, { scope: 'all' }),
      ]);

      setEntries(financeRows.map((row) => normalizeFinanceEntry(row)));
      setBookings(bookingRows);
      setSelectedMethod((current) => {
        const next = { ...current };

        financeRows.forEach((row) => {
          const normalized = normalizeFinanceEntry(row);
          const method = normalizePaymentMethod(normalized.paymentMethod);
          if (normalized.id && method && !next[normalized.id]) {
            next[normalized.id] = method;
          }
        });

        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar extrato financeiro.');
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const bookingsById = useMemo(() => new Map(bookings.map((booking) => [booking.id, booking])), [bookings]);

  const resolvedEntries = useMemo<ResolvedFinanceEntry[]>(() => (
    entries.map((entry) => {
      const booking = entry.bookingId ? bookingsById.get(entry.bookingId) || null : null;
      const bookingAmount = parseMoneyAmount(booking?.servicePrice);
      const referenceDate = resolveReferenceDate(entry, booking);

      return {
        ...entry,
        booking,
        resolvedAmount: entry.amount > 0 ? entry.amount : bookingAmount,
        referenceDate,
        isOverdue: !isSettledStatus(entry.status) && referenceDate < getTodayDate(),
        amountSource: entry.amount > 0 ? 'entry' : 'booking',
      };
    })
  ), [entries, bookingsById]);

  const financeBookingIds = useMemo(
    () => new Set(entries.map((entry) => entry.bookingId).filter((bookingId): bookingId is number => Boolean(bookingId))),
    [entries],
  );

  const missingEntries = useMemo<MissingFinanceEntry[]>(() => (
    bookings
      .filter((booking) => (booking.status === 'confirmed' || booking.status === 'completed') && !financeBookingIds.has(booking.id))
      .map((booking) => ({
        booking,
        estimatedAmount: parseMoneyAmount(booking.servicePrice),
      }))
      .sort((a, b) => `${b.booking.date} ${b.booking.time}`.localeCompare(`${a.booking.date} ${a.booking.time}`))
  ), [bookings, financeBookingIds]);

  const filteredEntries = useMemo<ResolvedFinanceEntry[]>(() => (
    resolvedEntries
      .filter((entry) => {
        if (periodMode === 'range' && !matchesDateRange(entry.referenceDate, startDate, endDate)) {
          return false;
        }

        if (statusFilter !== 'all' && entry.status !== statusFilter) {
          return false;
        }

        if (methodFilter !== 'all' && normalizePaymentMethod(entry.paymentMethod) !== methodFilter) {
          return false;
        }

        if (search.trim()) {
          const query = normalizeText(search.trim());
          const haystack = normalizeText([
            entry.clientName,
            entry.serviceName,
            entry.booking?.professionalName || '',
            entry.booking?.phone || '',
          ].join(' '));

          if (!haystack.includes(query)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => `${b.referenceDate} ${b.createdAt}`.localeCompare(`${a.referenceDate} ${a.createdAt}`))
  ), [endDate, methodFilter, periodMode, resolvedEntries, search, startDate, statusFilter]);

  const filteredMissingEntries = useMemo<MissingFinanceEntry[]>(() => (
    missingEntries.filter(({ booking }) => {
      if (periodMode === 'range' && !matchesDateRange(booking.date, startDate, endDate)) {
        return false;
      }

      if (search.trim()) {
        const query = normalizeText(search.trim());
        const haystack = normalizeText([
          booking.name,
          booking.service,
          booking.professionalName || '',
          booking.phone,
        ].join(' '));

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    })
  ), [endDate, missingEntries, periodMode, search, startDate]);

  const pendingEntries = useMemo<ResolvedFinanceEntry[]>(
    () => filteredEntries
      .filter((entry) => entry.status !== 'pago')
      .sort((a, b) => `${a.referenceDate} ${a.createdAt}`.localeCompare(`${b.referenceDate} ${b.createdAt}`)),
    [filteredEntries],
  );

  const expectedTotal = useMemo(
    () => sumResolvedAmounts(filteredEntries) + sumMissingAmounts(filteredMissingEntries),
    [filteredEntries, filteredMissingEntries],
  );

  const receivedTotal = useMemo(
    () => sumResolvedAmounts(filteredEntries.filter((entry) => entry.status === 'pago')),
    [filteredEntries],
  );

  const pendingTotal = Math.max(expectedTotal - receivedTotal, 0);

  const overdueTotal = useMemo(
    () => (
      sumResolvedAmounts(filteredEntries.filter((entry) => entry.isOverdue)) +
      sumMissingAmounts(filteredMissingEntries.filter((entry) => entry.booking.date < getTodayDate()))
    ),
    [filteredEntries, filteredMissingEntries],
  );

  const ticketAverage = useMemo(() => {
    const allAmounts = [
      ...filteredEntries.map((entry) => entry.resolvedAmount),
      ...filteredMissingEntries.map((entry) => entry.estimatedAmount),
    ].filter((amount) => amount > 0);

    if (allAmounts.length === 0) {
      return 0;
    }

    return sumPrimitiveAmounts(allAmounts) / allAmounts.length;
  }, [filteredEntries, filteredMissingEntries]);

  const methodBreakdown = useMemo(() => (
    PAYMENT_METHODS.map((method) => {
      const rows = filteredEntries.filter((entry) => normalizePaymentMethod(entry.paymentMethod) === method.value);
      return {
        ...method,
        count: rows.length,
        total: sumResolvedAmounts(rows),
      };
    })
  ), [filteredEntries]);

  const paymentSignals = useMemo(() => ([
    {
      label: 'Extratos reais',
      value: String(filteredEntries.length),
      tone: 'default',
      description: 'Lancamentos persistidos no financeiro.',
    },
    {
      label: 'Baixados',
      value: String(filteredEntries.filter((entry) => entry.status === 'pago').length),
      tone: 'success',
      description: 'Valores confirmados como recebidos.',
    },
    {
      label: 'Fila pendente',
      value: String(pendingEntries.length),
      tone: 'warning',
      description: 'Lancamentos aguardando baixa.',
    },
    {
      label: 'Lacunas',
      value: String(filteredMissingEntries.length),
      tone: 'danger',
      description: 'Agendamentos ainda sem extrato.',
    },
  ]), [filteredEntries, filteredMissingEntries.length, pendingEntries.length]);

  const currentWindowLabel = periodMode === 'all'
    ? 'Visao geral completa'
    : startDate === endDate
      ? `Recorte: ${formatDate(startDate)}`
      : `Recorte: ${formatDate(startDate)} ate ${formatDate(endDate)}`;

  const handleConfirm = async (entry: ResolvedFinanceEntry) => {
    const method = selectedMethod[entry.id] || normalizePaymentMethod(entry.paymentMethod);
    if (!method) {
      setError('Selecione um metodo de pagamento antes de baixar o valor.');
      return;
    }

    setBusyKey(`pay-${entry.id}`);
    setError('');

    try {
      const updated = await markFinancePaidForAdmin(entry.id, adminKey, method);
      if (updated) {
        const normalized = normalizeFinanceEntry(updated);
        setEntries((current) => current.map((row) => (row.id === entry.id ? normalized : row)));
      } else {
        await load();
      }

      setSelectedMethod((current) => ({ ...current, [entry.id]: method }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar pagamento.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleGenerateMissingEntry = async (booking: AdminBooking) => {
    setBusyKey(`generate-${booking.id}`);
    setError('');

    try {
      const row = await createWorkbenchEntityForAdmin('finance', createFinancePayloadFromBooking(booking), adminKey);
      setEntries((current) => [normalizeFinanceEntry(row), ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o lancamento financeiro.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="payments-shell">
      <section className="payments-hero admin-analytics-card">
        <div>
          <span className="payments-kicker">Central Financeira</span>
          <h3>Extratos, baixas e historico consolidado</h3>
          <p>
            A aba de pagamentos agora trabalha em cima dos lancamentos financeiros reais e cruza esses dados
            com a agenda para mostrar valores, pendencias e lacunas operacionais no mesmo painel.
          </p>
          <div className="payments-hero-meta">
            <span>{currentWindowLabel}</span>
            <span>{formatCurrency(expectedTotal)} em movimentacao bruta</span>
          </div>
        </div>
        <div className="payments-hero-actions">
          <button
            type="button"
            className="admin-btn-danger"
            onClick={() => setResetPaymentsModalOpen(true)}
            disabled={busyKey === 'reset-payments'}
          >
            {busyKey === 'reset-payments' ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : 'Limpar pagamentos'}
          </button>
          <button type="button" className="admin-btn-outline" onClick={() => void load()}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Atualizar
          </button>
        </div>
      </section>

      {error && <div className="payments-alert payments-alert-error">{error}</div>}

      {loading ? (
        <div className="payments-loading admin-analytics-card">
          <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
          Carregando extrato financeiro...
        </div>
      ) : (
        <>
          <section className="payments-kpi-grid">
            <article className="payments-kpi-card">
              <div className="payments-kpi-icon">
                <BadgeDollarSign style={{ width: 18, height: 18 }} />
              </div>
              <span>Recebido</span>
              <strong>{formatCurrency(receivedTotal)}</strong>
              <small>Somente valores ja baixados como pagos.</small>
            </article>

            <article className="payments-kpi-card">
              <div className="payments-kpi-icon">
                <Wallet style={{ width: 18, height: 18 }} />
              </div>
              <span>Em aberto</span>
              <strong>{formatCurrency(pendingTotal)}</strong>
              <small>{pendingEntries.length + filteredMissingEntries.length} registro(s) aguardando baixa ou geracao.</small>
            </article>

            <article className="payments-kpi-card">
              <div className="payments-kpi-icon payments-kpi-icon-warning">
                <AlertTriangle style={{ width: 18, height: 18 }} />
              </div>
              <span>Vencido</span>
              <strong>{formatCurrency(overdueTotal)}</strong>
              <small>Lancamentos pendentes com data anterior a hoje.</small>
            </article>

            <article className="payments-kpi-card">
              <div className="payments-kpi-icon">
                <ArrowDownCircle style={{ width: 18, height: 18 }} />
              </div>
              <span>Ticket medio</span>
              <strong>{formatCurrency(ticketAverage)}</strong>
              <small>{filteredEntries.length + filteredMissingEntries.length} movimentacao(oes) no recorte.</small>
            </article>
          </section>

          <section className="payments-method-grid">
            {methodBreakdown.map((method) => (
              <article key={method.value} className="payments-method-card">
                <span>{method.label}</span>
                <strong>{formatCurrency(method.total)}</strong>
                <small>{method.count} registro(s)</small>
              </article>
            ))}
          </section>

          <section className="payments-signal-grid">
            {paymentSignals.map((signal) => (
              <article key={signal.label} className={`payments-signal-card is-${signal.tone}`}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
                <small>{signal.description}</small>
              </article>
            ))}
          </section>

          <section className="payments-filters admin-analytics-card">
            <div className="payments-search">
              <Search style={{ width: 15, height: 15 }} />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por cliente, servico, telefone ou colaborador"
                className="admin-input"
              />
            </div>

            <div className="payments-filter-grid">
              <label>
                <span className="admin-label">Status</span>
                <select
                  className="admin-input"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | 'pendente' | 'pago')}
                >
                  <option value="all">Todos</option>
                  <option value="pendente">Pendentes</option>
                  <option value="pago">Pagos</option>
                </select>
              </label>

              <label>
                <span className="admin-label">Metodo</span>
                <select
                  className="admin-input"
                  value={methodFilter}
                  onChange={(event) => setMethodFilter(event.target.value as 'all' | PaymentMethod)}
                >
                  <option value="all">Todos</option>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>{method.label}</option>
                  ))}
                </select>
              </label>

              <div className="payments-period-switch">
                <span className="admin-label">Periodo</span>
                <div className="payments-period-buttons">
                  <button
                    type="button"
                    className={periodMode === 'all' ? 'admin-btn-primary' : 'admin-btn-outline'}
                    onClick={() => setPeriodMode('all')}
                  >
                    Geral
                  </button>
                  <button
                    type="button"
                    className={periodMode === 'range' ? 'admin-btn-primary' : 'admin-btn-outline'}
                    onClick={() => setPeriodMode('range')}
                  >
                    Periodo
                  </button>
                </div>
              </div>

              {periodMode === 'range' && (
                <>
                  <label>
                    <span className="admin-label">De</span>
                    <input
                      type="date"
                      className="admin-input"
                      value={startDate}
                      onChange={(event) => {
                        setStartDate(event.target.value);
                        if (event.target.value > endDate) {
                          setEndDate(event.target.value);
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span className="admin-label">Ate</span>
                    <input
                      type="date"
                      className="admin-input"
                      value={endDate}
                      onChange={(event) => {
                        if (event.target.value >= startDate) {
                          setEndDate(event.target.value);
                        }
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          </section>

          {filteredMissingEntries.length > 0 && (
            <section className="payments-panel admin-analytics-card">
              <div className="payments-panel-head">
                <div>
                  <span className="payments-kicker">Inconsistencias</span>
                  <h4>Agendamentos sem lancamento financeiro</h4>
                </div>
                <p>
                  Estes atendimentos ja passaram pela agenda, mas ainda nao possuem um extrato salvo no financeiro.
                </p>
              </div>

              <div className="payments-missing-list">
                {filteredMissingEntries.map(({ booking, estimatedAmount }) => {
                  const busy = busyKey === `generate-${booking.id}`;

                  return (
                    <article key={booking.id} className="payments-row payments-row-warning">
                      <div className="payments-row-main">
                        <div className="payments-row-title">
                          <strong>{booking.name}</strong>
                          <span>{booking.service}</span>
                        </div>
                        <div className="payments-row-meta">
                          <span>{formatDate(booking.date)} as {booking.time}</span>
                          <span>{booking.professionalName || 'Colaborador nao definido'}</span>
                          <span>{booking.phone}</span>
                        </div>
                      </div>

                      <div className="payments-row-side">
                        <strong>{estimatedAmount > 0 ? formatCurrency(estimatedAmount) : 'Sob consulta'}</strong>
                        <button
                          type="button"
                          className="admin-btn-outline"
                          onClick={() => void handleGenerateMissingEntry(booking)}
                          disabled={busy}
                        >
                          {busy ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : 'Gerar extrato'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <div className="payments-layout">
            <section className="payments-panel admin-analytics-card">
              <div className="payments-panel-head">
                <div>
                  <span className="payments-kicker">Fila de baixa</span>
                  <h4>Pendentes de pagamento</h4>
                </div>
                <p>{pendingEntries.length} registro(s) aguardando baixa.</p>
              </div>

              {pendingEntries.length === 0 ? (
                <div className="payments-empty">Nenhum lancamento pendente dentro dos filtros atuais.</div>
              ) : (
                <div className="payments-pending-list payments-scroll-region">
                  {pendingEntries.map((entry) => {
                    const method = selectedMethod[entry.id] || normalizePaymentMethod(entry.paymentMethod);
                    const busy = busyKey === `pay-${entry.id}`;

                    return (
                      <article key={entry.id} className="payments-row">
                        <div className="payments-row-main">
                          <div className="payments-row-title">
                            <strong>{entry.clientName || entry.booking?.name || 'Cliente nao informado'}</strong>
                            <span>{entry.serviceName || entry.booking?.service || 'Servico nao informado'}</span>
                          </div>
                          <div className="payments-row-meta">
                            <span>{formatDate(entry.referenceDate)}</span>
                            <span>{entry.booking?.professionalName || 'Sem colaborador'}</span>
                            <span>{entry.booking?.phone || 'Telefone nao informado'}</span>
                          </div>
                          {entry.amountSource === 'booking' && (
                            <span className="payments-source-pill">Valor recuperado da agenda</span>
                          )}
                        </div>

                        <div className="payments-row-side">
                          <strong>{formatCurrency(entry.resolvedAmount)}</strong>
                          <select
                            className="admin-input-sm"
                            value={method}
                            onChange={(event) => setSelectedMethod((current) => ({ ...current, [entry.id]: event.target.value }))}
                          >
                            <option value="">Metodo...</option>
                            {PAYMENT_METHODS.map((paymentMethod) => (
                              <option key={paymentMethod.value} value={paymentMethod.value}>{paymentMethod.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="admin-btn-success"
                            onClick={() => void handleConfirm(entry)}
                            disabled={busy || !method}
                          >
                            {busy ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <Check style={{ width: 13, height: 13 }} />}
                            Baixar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="payments-panel admin-analytics-card">
              <div className="payments-panel-head">
                <div>
                  <span className="payments-kicker">Extrato</span>
                  <h4>Historico financeiro</h4>
                </div>
                <p>
                  {filteredEntries.length} lancamento(s) reais | {formatCurrency(expectedTotal)} movimentados no recorte atual.
                </p>
              </div>

              {filteredEntries.length === 0 ? (
                <div className="payments-empty">Nenhum extrato encontrado para os filtros aplicados.</div>
              ) : (
                <div className="payments-ledger-list payments-scroll-region">
                  {filteredEntries.map((entry) => (
                    <article key={entry.id} className="payments-ledger-item">
                      <div className="payments-ledger-top">
                        <div className="payments-ledger-heading">
                          <strong>{entry.clientName || entry.booking?.name || 'Cliente nao informado'}</strong>
                          <span>{entry.serviceName || entry.booking?.service || 'Servico nao informado'}</span>
                        </div>
                        <div className="payments-ledger-value">
                          <strong>{formatCurrency(entry.resolvedAmount)}</strong>
                          <span className={`payments-status-pill ${entry.status === 'pago' ? 'is-paid' : entry.isOverdue ? 'is-overdue' : 'is-pending'}`}>
                            {entry.status === 'pago' ? 'Pago' : entry.isOverdue ? 'Pendente vencido' : 'Pendente'}
                          </span>
                        </div>
                      </div>

                      <div className="payments-ledger-grid">
                        <div>
                          <span>Referencia</span>
                          <strong>{formatDate(entry.referenceDate)}</strong>
                        </div>
                        <div>
                          <span>Metodo</span>
                          <strong>{paymentMethodLabel(entry.paymentMethod)}</strong>
                        </div>
                        <div>
                          <span>Pagamento</span>
                          <strong>{entry.paidAt ? formatDate(entry.paidAt) : '--'}</strong>
                        </div>
                        <div>
                          <span>Colaborador</span>
                          <strong>{entry.booking?.professionalName || 'Nao informado'}</strong>
                        </div>
                      </div>

                      <div className="payments-ledger-foot">
                        <span>ID financeiro #{entry.id}</span>
                        {entry.bookingId ? <span>Agendamento #{entry.bookingId}</span> : <span>Lancamento manual</span>}
                        {entry.amountSource === 'booking' && <span>Valor recomposto da agenda</span>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <DangerConfirmModal
        isOpen={resetPaymentsModalOpen}
        title="Limpar pagamentos"
        subtitle="Toda a central financeira sera reiniciada"
        description="Todos os lancamentos de pagamento serao removidos do historico, e os status financeiros vinculados aos agendamentos serao resetados."
        confirmText="LIMPAR PAGAMENTOS"
        confirmLabel="Apagar pagamentos"
        helperText="A limpeza remove os extratos financeiros do Supabase e redefine os pagamentos vinculados na agenda."
        requireMasterPassword
        passwordPlaceholder="Digite a senha master para limpar pagamentos"
        busy={busyKey === 'reset-payments'}
        onClose={() => setResetPaymentsModalOpen(false)}
        onConfirm={handleClearPaymentsHistory}
      />
    </div>
  );
}
