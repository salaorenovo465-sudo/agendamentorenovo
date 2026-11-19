import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  Phone,
  UserRound,
  X,
} from 'lucide-react';

import {
  formatDateBR,
  formatIsoDateLocal,
  formatMonthYearPT,
  getDaysInMonthLocal,
  getTodayDate,
  parseIsoDateLocal,
  shiftYearMonth,
} from '../AdminUtils';
import { getAdminBookingsCalendar } from '../api';
import { extractBookingServiceItems } from '../collaboratorUtils';
import { useMoneyPrivacy } from '../MoneyPrivacyContext';
import type { AdminBooking, AdminBookingCalendarResponse, CalendarDayCounts } from '../types';

type Props = {
  adminKey: string;
  tenantSlug: string;
  refreshSignal: number;
  onOpenAgendaForDate: (date: string) => void;
};

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAY_LIST_PAGE_SIZE = 8;

const shiftIsoDateSafe = (isoDate: string, deltaDays: number): string => {
  const parts = parseIsoDateLocal(isoDate);
  if (!parts) return isoDate;
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays, 12, 0, 0));
  return formatIsoDateLocal(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
};

const STATUS_META: Record<AdminBooking['status'], { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'is-pending' },
  confirmed: { label: 'Confirmado', className: 'is-confirmed' },
  completed: { label: 'Finalizado', className: 'is-completed' },
  rejected: { label: 'Rejeitado', className: 'is-rejected' },
};

export function DashboardCalendarAgenda({
  adminKey,
  tenantSlug,
  refreshSignal,
  onOpenAgendaForDate,
}: Props) {
  const headingId = useId();
  const detailHeadingId = useId();
  const { maskMoneyText } = useMoneyPrivacy();
  const today = getTodayDate();
  const todayParts = parseIsoDateLocal(today) || { year: 2026, month: 1, day: 1 };

  const [visibleMonth, setVisibleMonth] = useState<{ year: number; month: number }>({
    year: todayParts.year,
    month: todayParts.month,
  });
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [dayPage, setDayPage] = useState<number>(1);
  const [dayStatusFilter, setDayStatusFilter] = useState<'all' | AdminBooking['status']>('all');
  const [calendarData, setCalendarData] = useState<AdminBookingCalendarResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [detailBooking, setDetailBooking] = useState<AdminBooking | null>(null);
  const detailReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocusDateRef = useRef<string | null>(null);

  const visibleMonthKey = `${String(visibleMonth.year).padStart(4, '0')}-${String(visibleMonth.month).padStart(2, '0')}`;

  const fetchMonthData = useCallback(async (signal?: AbortSignal) => {
    if (!adminKey) return;
    setLoading(true);
    setError('');
    try {
      const response = await getAdminBookingsCalendar(
        adminKey,
        { month: visibleMonthKey, signal },
        tenantSlug,
      );
      if (signal?.aborted) return;
      setCalendarData(response);
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Erro ao carregar agendamentos do mês.');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [adminKey, tenantSlug, visibleMonthKey]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchMonthData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchMonthData, refreshSignal]);

  useEffect(() => {
    if (!detailBooking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetailBooking(null);
        window.setTimeout(() => detailReturnFocusRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailBooking]);

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(visibleMonth.year, visibleMonth.month - 1, 1).getDay();
    const totalDays = getDaysInMonthLocal(visibleMonth.year, visibleMonth.month);
    const cells: Array<{
      key: string;
      day: number | null;
      dateStr: string | null;
      counts: CalendarDayCounts | null;
    }> = [];

    for (let blank = 0; blank < firstWeekday; blank += 1) {
      cells.push({ key: `blank-${blank}`, day: null, dateStr: null, counts: null });
    }

    const countsMap = calendarData?.countsByDate || {};
    for (let day = 1; day <= totalDays; day += 1) {
      const dateStr = formatIsoDateLocal(visibleMonth.year, visibleMonth.month, day);
      cells.push({
        key: dateStr,
        day,
        dateStr,
        counts: countsMap[dateStr] || null,
      });
    }

    return cells;
  }, [calendarData?.countsByDate, visibleMonth.month, visibleMonth.year]);

  const monthSummary = useMemo(() => {
    const totals = { pending: 0, confirmed: 0, completed: 0, rejected: 0 };
    const countsMap: Record<string, CalendarDayCounts> = calendarData?.countsByDate || {};
    for (const day of Object.values(countsMap)) {
      totals.pending += Number(day.pending || 0);
      totals.confirmed += Number(day.confirmed || 0);
      totals.completed += Number(day.completed || 0);
      totals.rejected += Number(day.rejected || 0);
    }
    return totals;
  }, [calendarData?.countsByDate]);

  const selectedDayBookings = useMemo(() => {
    const allMonthBookings = calendarData?.bookings || [];
    return allMonthBookings
      .filter((item) => item.date.slice(0, 10) === selectedDate)
      .sort((a, b) => {
        const timeCmp = (a.time || '').localeCompare(b.time || '');
        return timeCmp !== 0 ? timeCmp : a.id - b.id;
      });
  }, [calendarData?.bookings, selectedDate]);

  const selectedDayCounts = useMemo(() => {
    const counts = { all: selectedDayBookings.length, pending: 0, confirmed: 0, completed: 0, rejected: 0 };
    for (const item of selectedDayBookings) {
      if (item.status === 'pending' || item.status === 'confirmed' || item.status === 'completed' || item.status === 'rejected') {
        counts[item.status] += 1;
      }
    }
    return counts;
  }, [selectedDayBookings]);

  const filteredDayBookings = useMemo(() => {
    if (dayStatusFilter === 'all') return selectedDayBookings;
    return selectedDayBookings.filter((item) => item.status === dayStatusFilter);
  }, [dayStatusFilter, selectedDayBookings]);

  const dayTotalPages = Math.max(1, Math.ceil(filteredDayBookings.length / DAY_LIST_PAGE_SIZE));
  const safeDayPage = Math.min(dayPage, dayTotalPages);
  const pagedDayBookings = useMemo(() => {
    const start = (safeDayPage - 1) * DAY_LIST_PAGE_SIZE;
    return filteredDayBookings.slice(start, start + DAY_LIST_PAGE_SIZE);
  }, [filteredDayBookings, safeDayPage]);

  useEffect(() => {
    const target = pendingFocusDateRef.current;
    if (!target || target !== selectedDate) return;
    const node = dayButtonRefs.current[target];
    if (node) {
      node.focus();
      pendingFocusDateRef.current = null;
    }
  }, [selectedDate, calendarCells]);

  const focusAndSelectDate = (nextDate: string) => {
    const nextParts = parseIsoDateLocal(nextDate);
    if (!nextParts) return;
    pendingFocusDateRef.current = nextDate;
    if (nextParts.year !== visibleMonth.year || nextParts.month !== visibleMonth.month) {
      setVisibleMonth({ year: nextParts.year, month: nextParts.month });
    }
    setSelectedDate(nextDate);
    setDayPage(1);
    const immediateNode = dayButtonRefs.current[nextDate];
    if (immediateNode) {
      immediateNode.focus();
      pendingFocusDateRef.current = null;
    }
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentDate: string) => {
    const currentParts = parseIsoDateLocal(currentDate);
    if (!currentParts) return;

    let nextDate: string | null = null;
    if (event.key === 'ArrowLeft') {
      nextDate = shiftIsoDateSafe(currentDate, -1);
    } else if (event.key === 'ArrowRight') {
      nextDate = shiftIsoDateSafe(currentDate, 1);
    } else if (event.key === 'ArrowUp') {
      nextDate = shiftIsoDateSafe(currentDate, -7);
    } else if (event.key === 'ArrowDown') {
      nextDate = shiftIsoDateSafe(currentDate, 7);
    } else if (event.key === 'Home') {
      const weekday = new Date(Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day, 12)).getUTCDay();
      nextDate = shiftIsoDateSafe(currentDate, -weekday);
    } else if (event.key === 'End') {
      const weekday = new Date(Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day, 12)).getUTCDay();
      nextDate = shiftIsoDateSafe(currentDate, 6 - weekday);
    } else if (event.key === 'PageUp') {
      const shifted = shiftYearMonth(currentParts.year, currentParts.month, -1);
      const maxDay = getDaysInMonthLocal(shifted.year, shifted.month);
      nextDate = formatIsoDateLocal(shifted.year, shifted.month, Math.min(currentParts.day, maxDay));
    } else if (event.key === 'PageDown') {
      const shifted = shiftYearMonth(currentParts.year, currentParts.month, 1);
      const maxDay = getDaysInMonthLocal(shifted.year, shifted.month);
      nextDate = formatIsoDateLocal(shifted.year, shifted.month, Math.min(currentParts.day, maxDay));
    }

    if (nextDate) {
      event.preventDefault();
      focusAndSelectDate(nextDate);
    }
  };

  const handleStepMonth = (delta: number) => {
    const next = shiftYearMonth(visibleMonth.year, visibleMonth.month, delta);
    setVisibleMonth({ year: next.year, month: next.month });
    setDayPage(1);

    const currentMonthKey = today.slice(0, 7);
    if (next.monthKey === currentMonthKey) {
      setSelectedDate(today);
    } else {
      setSelectedDate(formatIsoDateLocal(next.year, next.month, 1));
    }
  };

  const handleJumpToday = () => {
    const currentParts = parseIsoDateLocal(getTodayDate()) || todayParts;
    setVisibleMonth({ year: currentParts.year, month: currentParts.month });
    setSelectedDate(getTodayDate());
    setDayPage(1);
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setDayPage(1);
  };

  const isMonthReady = Boolean(calendarData && calendarData.startDate.startsWith(visibleMonthKey));

  return (
    <section className="dash-surface dash-calendar-section" aria-labelledby={headingId}>
      <div className="dash-section-head">
        <div>
          <h3 id={headingId}>
            <CalendarDays className="w-4 h-4" aria-hidden="true" />
            <span>Agenda integrada com calendário</span>
          </h3>
          <p>
            Navegação mensal completa (independente do filtro superior e sem limite de registros finalizados). Clique em um dia para consultar os atendimentos.
          </p>
        </div>
        {isMonthReady && (
          <span className="dash-pill-muted">
            {Number(calendarData?.total ?? 0).toLocaleString('pt-BR')} agendamento(s) em {formatMonthYearPT(visibleMonth.year, visibleMonth.month)}
          </span>
        )}
      </div>

      <div className="dash-calendar-layout">
        {/* Coluna Esquerda: Calendário Mensal */}
        <div className="dash-calendar-panel">
          <div className="dash-calendar-nav">
            <button
              type="button"
              className="dash-cal-nav-btn"
              onClick={() => handleStepMonth(-1)}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            <strong className="dash-cal-month-title">
              {formatMonthYearPT(visibleMonth.year, visibleMonth.month)}
            </strong>

            <div className="dash-cal-nav-right">
              <button
                type="button"
                className="dash-cal-today-btn"
                onClick={handleJumpToday}
              >
                Hoje
              </button>
              <button
                type="button"
                className="dash-cal-nav-btn"
                onClick={() => handleStepMonth(1)}
                aria-label="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            className={`dash-cal-grid-wrap${loading ? ' is-loading' : ''}`}
            role="grid"
            aria-label={`Calendário de ${formatMonthYearPT(visibleMonth.year, visibleMonth.month)}`}
          >
            <div className="dash-cal-weekdays" role="row">
              {WEEKDAY_HEADERS.map((weekday) => (
                <div key={weekday} role="columnheader" className="dash-cal-weekday">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="dash-cal-days">
              {calendarCells.map((cell) => {
                if (!cell.day || !cell.dateStr) {
                  return <div key={cell.key} className="dash-cal-day-blank" aria-hidden="true" />;
                }

                const isToday = cell.dateStr === today;
                const isSelected = cell.dateStr === selectedDate;
                const count = cell.counts?.total || 0;
                const hasPending = (cell.counts?.pending || 0) > 0;
                const hasConfirmed = (cell.counts?.confirmed || 0) > 0;
                const hasCompleted = (cell.counts?.completed || 0) > 0;
                const hasRejectedOnly = count > 0 && !hasPending && !hasConfirmed && !hasCompleted;

                const dayLabel = isMonthReady
                  ? `${formatDateBR(cell.dateStr)}${isToday ? ' (Hoje)' : ''}: ${count} agendamento(s)`
                  : `${formatDateBR(cell.dateStr)}${isToday ? ' (Hoje)' : ''}`;

                return (
                  <button
                    key={cell.key}
                    ref={(el) => {
                      if (cell.dateStr) {
                        dayButtonRefs.current[cell.dateStr] = el;
                      }
                    }}
                    type="button"
                    role="gridcell"
                    tabIndex={isSelected ? 0 : -1}
                    aria-selected={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={dayLabel}
                    onClick={() => handleSelectDate(cell.dateStr!)}
                    onKeyDown={(event) => handleGridKeyDown(event, cell.dateStr!)}
                    className={[
                      'dash-cal-day-btn',
                      isSelected ? 'is-selected' : '',
                      isToday ? 'is-today' : '',
                      count > 0 ? 'has-bookings' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="dash-cal-day-num">{cell.day}</span>
                    {isMonthReady && count > 0 && (
                      <span className="dash-cal-day-count" aria-hidden="true">
                        {count}
                      </span>
                    )}
                    {isMonthReady && count > 0 && (
                      <span className="dash-cal-dots" aria-hidden="true">
                        {hasPending && <i className="dot-pending" />}
                        {hasConfirmed && <i className="dot-confirmed" />}
                        {hasCompleted && <i className="dot-completed" />}
                        {hasRejectedOnly && <i className="dot-rejected" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dash-cal-legend" aria-label="Legenda do calendário">
            <span><i className="legend-dot dot-pending" aria-hidden="true" /> Pendente</span>
            <span><i className="legend-dot dot-confirmed" aria-hidden="true" /> Confirmado</span>
            <span><i className="legend-dot dot-completed" aria-hidden="true" /> Finalizado</span>
            <span><i className="legend-dot dot-rejected" aria-hidden="true" /> Rejeitado</span>
          </div>

          {isMonthReady && (
            <div className="dash-cal-month-strip" aria-label="Resumo de status no mês">
              <span className="dash-booking-badge is-confirmed">
                {monthSummary.confirmed.toLocaleString('pt-BR')} confirmado(s)
              </span>
              <span className="dash-booking-badge is-pending">
                {monthSummary.pending.toLocaleString('pt-BR')} pendente(s)
              </span>
              <span className="dash-booking-badge is-completed">
                {monthSummary.completed.toLocaleString('pt-BR')} finalizado(s)
              </span>
              {monthSummary.rejected > 0 && (
                <span className="dash-booking-badge is-rejected">
                  {monthSummary.rejected.toLocaleString('pt-BR')} rejeitado(s)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Coluna Direita: Lista sincronizada do dia selecionado */}
        <div className="dash-day-agenda-panel">
          <div className="dash-day-agenda-head">
            <div>
              <span className="dash-day-kicker">Atendimentos em</span>
              <h4>{formatDateBR(selectedDate)}</h4>
            </div>
            <button
              type="button"
              className="admin-btn-outline dash-sm-btn"
              onClick={() => onOpenAgendaForDate(selectedDate)}
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Abrir na Agenda</span>
            </button>
          </div>

          {error ? (
            <div className="dash-empty-state is-error" role="alert">
              <div className="dash-state-inline">
                <AlertCircle className="w-4 h-4" aria-hidden="true" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                className="admin-btn-outline dash-sm-btn"
                onClick={() => void fetchMonthData()}
              >
                Tentar novamente
              </button>
            </div>
          ) : loading && !isMonthReady ? (
            <div className="dash-skeleton-stack" aria-busy="true">
              <div className="dash-skeleton-line w-full" />
              <div className="dash-skeleton-line w-full" />
              <div className="dash-skeleton-line w-3/4" />
            </div>
          ) : selectedDayBookings.length === 0 ? (
            <div className="dash-empty-state">
              <strong>Sem agendamentos em {formatDateBR(selectedDate)}</strong>
              <p>Nenhum atendimento registrado para este dia. Selecione outro dia destacado no calendário ou abra a Agenda para criar um novo.</p>
            </div>
          ) : (
            <>
              <div className="dash-day-summary-row">
                <span>
                  {filteredDayBookings.length} de {selectedDayBookings.length} agendamento(s)
                  {loading && ' · Atualizando...'}
                </span>
              </div>

              <div className="dash-day-status-chips" role="group" aria-label="Filtrar agendamentos do dia por status">
                {([
                  { id: 'all', label: `Todos (${selectedDayCounts.all})` },
                  { id: 'pending', label: `Pendentes (${selectedDayCounts.pending})` },
                  { id: 'confirmed', label: `Confirmados (${selectedDayCounts.confirmed})` },
                  { id: 'completed', label: `Finalizados (${selectedDayCounts.completed})` },
                ] as const).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={dayStatusFilter === chip.id}
                    className={`dash-day-chip${dayStatusFilter === chip.id ? ' is-active' : ''}`}
                    onClick={() => {
                      setDayStatusFilter(chip.id);
                      setDayPage(1);
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {pagedDayBookings.length === 0 ? (
                <div className="dash-empty-state">
                  <strong>Nenhum agendamento com este status neste dia</strong>
                  <p>Altere o filtro acima para visualizar os outros horários de {formatDateBR(selectedDate)}.</p>
                  <div>
                    <button
                      type="button"
                      className="admin-btn-outline dash-sm-btn"
                      onClick={() => {
                        setDayStatusFilter('all');
                        setDayPage(1);
                      }}
                    >
                      Mostrar todos ({selectedDayCounts.all})
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="dash-day-list">
                {pagedDayBookings.map((booking) => {
                  const statusMeta = STATUS_META[booking.status] || STATUS_META.pending;
                  return (
                    <article key={booking.id} className="dash-day-booking-card">
                      <div className="dash-day-booking-time">
                        <Clock3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <strong>{booking.time || '--:--'}</strong>
                      </div>

                      <div className="dash-day-booking-main">
                        <div className="dash-day-booking-top">
                          <strong title={booking.name}>{booking.name || 'Cliente não informado'}</strong>
                          <span className={`dash-booking-badge ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </div>

                        <p className="dash-day-booking-service" title={booking.service}>
                          {booking.service || 'Serviço não especificado'}
                        </p>

                        <div className="dash-day-booking-meta">
                          <span>
                            <UserRound className="w-3 h-3" aria-hidden="true" />
                            <span>{booking.professionalName || 'Sem colaborador'}</span>
                          </span>
                          {booking.servicePrice && <span>{maskMoneyText(booking.servicePrice)}</span>}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="dash-detail-btn"
                        aria-label={`Ver detalhes de ${booking.name} às ${booking.time || '--:--'}`}
                        onClick={(event) => {
                          detailReturnFocusRef.current = event.currentTarget;
                          setDetailBooking(booking);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Detalhes</span>
                      </button>
                    </article>
                  );
                })}
                  </div>

                  {dayTotalPages > 1 && (
                    <div className="dash-pagination-row">
                      <button
                        type="button"
                        className="admin-btn-outline dash-sm-btn"
                        disabled={safeDayPage <= 1}
                        onClick={() => setDayPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Anterior</span>
                      </button>
                      <span>
                        Página <strong>{safeDayPage}</strong> de <strong>{dayTotalPages}</strong>
                      </span>
                      <button
                        type="button"
                        className="admin-btn-outline dash-sm-btn"
                        disabled={safeDayPage >= dayTotalPages}
                        onClick={() => setDayPage((p) => Math.min(dayTotalPages, p + 1))}
                      >
                        <span>Próxima</span>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal somente leitura com detalhes do agendamento */}
      {detailBooking && (
        <div
          className="admin-modal-root"
          onClick={() => {
            setDetailBooking(null);
            window.setTimeout(() => detailReturnFocusRef.current?.focus(), 0);
          }}
        >
          <div className="admin-modal-overlay" />
          <div
            className="admin-modal-card admin-modal-card-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailHeadingId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <h3 id={detailHeadingId} style={{ fontSize: 16, fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>
                  Agendamento #{detailBooking.id}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>
                  Visualização somente leitura pela Dashboard
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar detalhes do agendamento"
                onClick={() => {
                  setDetailBooking(null);
                  window.setTimeout(() => detailReturnFocusRef.current?.focus(), 0);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-muted)' }}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="dash-detail-grid">
                <div>
                  <span>Cliente</span>
                  <strong>{detailBooking.name}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <span className={`dash-booking-badge ${(STATUS_META[detailBooking.status] || STATUS_META.pending).className}`}>
                    {(STATUS_META[detailBooking.status] || STATUS_META.pending).label}
                  </span>
                </div>
                <div>
                  <span>Data e horário</span>
                  <strong>{formatDateBR(detailBooking.date)} às {detailBooking.time || '--:--'}</strong>
                </div>
                <div>
                  <span>Telefone</span>
                  <strong>
                    <Phone className="w-3 h-3 inline mr-1" aria-hidden="true" />
                    {detailBooking.phone || 'Não informado'}
                  </strong>
                </div>
                <div>
                  <span>Colaborador</span>
                  <strong>{detailBooking.professionalName || 'Sem colaborador atribuído'}</strong>
                </div>
                <div>
                  <span>Valor estimado</span>
                  <strong>{detailBooking.servicePrice ? maskMoneyText(detailBooking.servicePrice) : 'Não informado'}</strong>
                </div>
                <div className="dash-detail-full">
                  <span>Serviço(s)</span>
                  <strong>{detailBooking.service}</strong>
                  {extractBookingServiceItems(detailBooking).length > 1 && (
                    <ul className="dash-detail-services-list">
                      {extractBookingServiceItems(detailBooking).map((item, idx) => (
                        <li key={`${item.name}-${idx}`}>
                          {item.name}{item.price ? ` · ${maskMoneyText(item.price)}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {detailBooking.rejectionReason && (
                  <div className="dash-detail-full">
                    <span>Motivo da rejeição</span>
                    <strong>{detailBooking.rejectionReason}</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="admin-modal-footer admin-modal-footer-split">
              <button
                type="button"
                className="admin-btn-outline"
                onClick={() => {
                  setDetailBooking(null);
                  window.setTimeout(() => detailReturnFocusRef.current?.focus(), 0);
                }}
              >
                Fechar
              </button>
              <button
                type="button"
                className="admin-btn-primary"
                onClick={() => {
                  const targetDate = detailBooking.date.slice(0, 10);
                  setDetailBooking(null);
                  onOpenAgendaForDate(targetDate);
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Gerenciar na Agenda</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
