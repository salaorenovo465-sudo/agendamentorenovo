import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Phone,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { formatDateBR } from '../AdminUtils';
import { listUnifiedAdminBookingsHistory } from '../api';
import { DangerConfirmModal } from '../AdminHelpers';
import { MoneyEyeButton, useMoneyPrivacy } from '../MoneyPrivacyContext';
import {
  createCollaboratorDraft,
  extractBookingServiceItems,
  type ServiceCatalogCategory,
} from '../collaboratorUtils';
import type {
  AdminBooking,
  AdminUnifiedHistoryStatus,
  AdminUnifiedHistoryStatusCounts,
} from '../types';

const PAGE_SIZE = 20;

const STATUS_FILTER_OPTIONS: {
  id: AdminUnifiedHistoryStatus;
  label: string;
}[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'overdue', label: 'Atrasados' },
  { id: 'confirmed', label: 'Concluídos' },
  { id: 'completed', label: 'Finalizados' },
];

const computeCardOperationalStatus = (
  booking: AdminBooking,
  now: Date,
): {
  key: 'pending' | 'overdue' | 'confirmed' | 'completed';
  label: string;
} => {
  if (booking.status === 'completed') {
    return { key: 'completed', label: 'Finalizado' };
  }
  const slotDate = new Date(`${booking.date}T${(booking.time || '00:00').slice(0, 5)}`);
  if (slotDate < now) {
    return { key: 'overdue', label: 'Atrasado' };
  }
  if (booking.status === 'confirmed') {
    return { key: 'confirmed', label: 'Concluído' };
  }
  return { key: 'pending', label: 'Pendente' };
};

export function HistoricoTab({
  adminKey,
  tenantSlug,
  initialStatusFilter = 'all',
  onStatusFilterConsumed,
  busyBookingId,
  onConfirm,
  onComplete,
  onReopen,
  onReject,
  onDelete,
  professionals,
  serviceCatalog,
}: {
  adminKey: string;
  tenantSlug: string;
  initialStatusFilter?: AdminUnifiedHistoryStatus;
  onStatusFilterConsumed?: () => void;
  busyBookingId: number | null;
  onConfirm: (booking: AdminBooking) => Promise<void>;
  onComplete: (booking: AdminBooking) => Promise<void>;
  onReopen: (booking: AdminBooking) => Promise<void>;
  onReject: (booking: AdminBooking) => Promise<void>;
  onDelete: (booking: AdminBooking, masterPassword: string) => Promise<void>;
  professionals: Record<string, unknown>[];
  serviceCatalog: ServiceCatalogCategory[];
}) {
  const { maskMoneyText } = useMoneyPrivacy();
  const [statusFilter, setStatusFilter] = useState<AdminUnifiedHistoryStatus>(() => {
    if (typeof window !== 'undefined') {
      const urlStatus = new URLSearchParams(window.location.search).get('histStatus');
      if (urlStatus === 'all' || urlStatus === 'pending' || urlStatus === 'overdue' || urlStatus === 'confirmed' || urlStatus === 'completed') {
        return urlStatus;
      }
    }
    return initialStatusFilter;
  });
  const [searchInput, setSearchInput] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('histQ') || '';
  });
  const [searchDebounced, setSearchDebounced] = useState<string>(searchInput);
  const [startDate, setStartDate] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('histFrom') || '';
  });
  const [endDate, setEndDate] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('histTo') || '';
  });
  const [professionalId, setProfessionalId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('histProf') || '';
  });

  const [items, setItems] = useState<AdminBooking[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [overallTotal, setOverallTotal] = useState<number>(0);
  const [statusCounts, setStatusCounts] = useState<AdminUnifiedHistoryStatusCounts>({
    all: 0,
    pending: 0,
    overdue: 0,
    confirmed: 0,
    completed: 0,
  });
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<AdminBooking | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);
  const reqSeqRef = useRef<number>(0);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
    setPage(1);
    onStatusFilterConsumed?.();
  }, [initialStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchDebounced(searchInput.trim());
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('histStatus', statusFilter);
    if (searchDebounced) url.searchParams.set('histQ', searchDebounced);
    else url.searchParams.delete('histQ');
    if (startDate) url.searchParams.set('histFrom', startDate);
    else url.searchParams.delete('histFrom');
    if (endDate) url.searchParams.set('histTo', endDate);
    else url.searchParams.delete('histTo');
    if (professionalId) url.searchParams.set('histProf', professionalId);
    else url.searchParams.delete('histProf');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [statusFilter, searchDebounced, startDate, endDate, professionalId]);

  const collaborators = useMemo(
    () =>
      professionals
        .map((row) => createCollaboratorDraft(row, serviceCatalog))
        .filter((row) => row.id && row.name)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR')),
    [professionals, serviceCatalog],
  );

  const fetchHistory = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!adminKey) return;

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++reqSeqRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError('');

      try {
        const res = await listUnifiedAdminBookingsHistory(
          adminKey,
          {
            status: statusFilter,
            search: searchDebounced || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            professionalId: professionalId || undefined,
            page: targetPage,
            limit: PAGE_SIZE,
          },
          tenantSlug,
          controller.signal,
        );

        if (seq !== reqSeqRef.current || controller.signal.aborted) {
          return;
        }

        setItems((current) => {
          if (!append) return res.items;
          const seen = new Set(current.map((item) => item.id));
          const uniqueNext = res.items.filter((item) => !seen.has(item.id));
          return [...current, ...uniqueNext];
        });
        setTotal(res.total);
        setOverallTotal(res.overallTotal);
        setStatusCounts(res.statusCounts);
        setPage(res.page);
        setHasMore(res.hasMore);
      } catch (err) {
        if (controller.signal.aborted || seq !== reqSeqRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Erro ao consultar histórico de cards.');
      } finally {
        if (seq === reqSeqRef.current && !controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [adminKey, tenantSlug, statusFilter, searchDebounced, startDate, endDate, professionalId],
  );

  useEffect(() => {
    void fetchHistory(1, false);
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchHistory]);

  const hasActiveFilters = Boolean(
    statusFilter !== 'all' || searchDebounced || startDate || endDate || professionalId,
  );

  const handleClearFilters = () => {
    setStatusFilter('all');
    setSearchInput('');
    setSearchDebounced('');
    setStartDate('');
    setEndDate('');
    setProfessionalId('');
  };

  const handleConfirmDelete = async (masterPassword?: string) => {
    if (!deleteTarget || !masterPassword) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget, masterPassword);
      setDeleteTarget(null);
      await fetchHistory(1, false);
    } finally {
      setDeleting(false);
    }
  };

  const now = new Date();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="historico-page">
      {/* 1. Título e descrição curta */}
      <header className="historico-header">
        <div>
          <h2>Histórico</h2>
          <p>Consulte todos os cards e acompanhe seus status</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <MoneyEyeButton variant="compact" />
          <div className="historico-summary-badge">
            <span>Total filtrado</span>
            <strong>{total}</strong>
          </div>
        </div>
      </header>

      {/* 2. Busca + 3. Filtros de status + 4. Filtros complementares */}
      <section className="historico-controls" aria-label="Filtros do histórico">
        <div className="historico-search-row">
          <div className="historico-search-input">
            <Search style={{ width: 15, height: 15, flexShrink: 0 }} />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por cliente, serviço, telefone ou #ID (ex: #55)..."
              aria-label="Buscar por título ou identificador"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="historico-clear-search"
                aria-label="Limpar busca"
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>

          <div className="historico-secondary-filters">
            <select
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              className="admin-input-sm historico-select"
              aria-label="Filtrar por responsável"
            >
              <option value="">Todos os responsáveis</option>
              {collaborators.map((collab) => (
                <option key={collab.id} value={String(collab.id)}>
                  {collab.name}
                </option>
              ))}
              <option value="unassigned">Sem responsável</option>
            </select>

            <div className="historico-date-range">
              <span>De</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  if (val && endDate && val > endDate) {
                    setEndDate(val);
                  }
                }}
                className="admin-input-sm"
                aria-label="Data inicial"
              />
              <span>Até</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!startDate || !val || val >= startDate) {
                    setEndDate(val);
                  }
                }}
                className="admin-input-sm"
                aria-label="Data final"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="admin-btn-outline historico-clear-btn"
              >
                <X style={{ width: 13, height: 13 }} /> Limpar filtros
              </button>
            )}
          </div>
        </div>

        <div className="historico-status-bar" role="tablist" aria-label="Filtro por status">
          {STATUS_FILTER_OPTIONS.map((option) => {
            const active = statusFilter === option.id;
            const count = statusCounts[option.id] ?? 0;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(option.id)}
                className={`historico-status-tab${active ? ' active' : ''}`}
              >
                <span>{option.label}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. Lista única filtrável de resultados e controles de paginação */}
      <section className="historico-results" aria-live="polite">
        {loading ? (
          <div className="historico-state-card">
            <Loader2 style={{ width: 20, height: 20 }} className="animate-spin" />
            <span>Carregando cards...</span>
          </div>
        ) : error ? (
          <div className="historico-state-card historico-state-error" role="alert">
            <AlertTriangle style={{ width: 20, height: 20 }} />
            <strong>Não foi possível carregar os cards</strong>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void fetchHistory(page, false)}
              className="admin-btn-primary"
            >
              Tentar novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="historico-state-card">
            {overallTotal === 0 && !hasActiveFilters ? (
              <>
                <strong>Nenhum card registrado</strong>
                <p>Ainda não existem cards cadastrados para esta unidade.</p>
              </>
            ) : (
              <>
                <strong>Nenhum resultado para os filtros selecionados</strong>
                <p>Revise a busca, o status, o responsável ou o período aplicado.</p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="admin-btn-outline"
                  >
                    Limpar filtros
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="historico-list">
              {items.map((booking) => {
                const opStatus = computeCardOperationalStatus(booking, now);
                const serviceItems = extractBookingServiceItems(booking);
                const leadService = serviceItems[0]?.name || booking.service;
                const extraCount = Math.max(0, serviceItems.length - 1);
                const hasCollaborator = Boolean(booking.professionalId && booking.professionalName);
                const busy = busyBookingId === booking.id;

                return (
                  <article key={booking.id} className="historico-card" aria-busy={busy}>
                    <div className="historico-card-top">
                      <span className={`historico-badge historico-badge-${opStatus.key}`}>
                        {opStatus.label}
                      </span>
                      <span className="historico-card-id">#{booking.id}</span>
                    </div>

                    <div className="historico-card-main">
                      <h3 className="historico-card-title">{booking.name}</h3>
                      <p className="historico-card-service">
                        {leadService}
                        {extraCount > 0 ? ` +${extraCount} serviço(s)` : ''}
                        {booking.servicePrice ? ` · ${maskMoneyText(booking.servicePrice)}` : ''}
                      </p>
                    </div>

                    <div className="historico-card-meta">
                      <span>
                        <Calendar style={{ width: 13, height: 13 }} />
                        {formatDateBR(booking.date)} às {booking.time}
                      </span>
                      <span>
                        <UserRound style={{ width: 13, height: 13 }} />
                        {hasCollaborator ? booking.professionalName : 'Sem responsável'}
                      </span>
                      <span>
                        <Phone style={{ width: 13, height: 13 }} />
                        {booking.phone}
                      </span>
                      {opStatus.key === 'overdue' && (
                        <span className="historico-overdue-note">
                          <Clock3 style={{ width: 13, height: 13 }} />
                          Prazo de atendimento vencido
                        </span>
                      )}
                    </div>

                    <div className="historico-card-actions">
                      {booking.status === 'pending' && (
                        <button
                          type="button"
                          disabled={busy || !hasCollaborator}
                          title={!hasCollaborator ? 'Vincule um colaborador na Agenda antes de confirmar' : undefined}
                          onClick={async () => {
                            await onConfirm(booking);
                            await fetchHistory(1, false);
                          }}
                          className="admin-btn-outline historico-action-btn"
                        >
                          <CheckCircle2 style={{ width: 13, height: 13 }} /> Confirmar
                        </button>
                      )}
                      {(booking.status === 'confirmed' || opStatus.key === 'overdue') && booking.status !== 'completed' && (
                        <button
                          type="button"
                          disabled={busy || !hasCollaborator}
                          title={!hasCollaborator ? 'Vincule um colaborador na Agenda antes de finalizar' : undefined}
                          onClick={async () => {
                            await onComplete(booking);
                            await fetchHistory(1, false);
                          }}
                          className="admin-btn-primary historico-action-btn"
                        >
                          <Sparkles style={{ width: 13, height: 13 }} /> Finalizar
                        </button>
                      )}
                      {booking.status === 'completed' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            await onReopen(booking);
                            await fetchHistory(1, false);
                          }}
                          className="admin-btn-outline historico-action-btn"
                        >
                          <RotateCcw style={{ width: 13, height: 13 }} /> Reabrir
                        </button>
                      )}
                      {booking.status !== 'completed' && booking.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            await onReject(booking);
                            await fetchHistory(1, false);
                          }}
                          className="admin-btn-outline historico-action-btn"
                        >
                          <XCircle style={{ width: 13, height: 13 }} /> Rejeitar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy || deleting}
                        onClick={() => setDeleteTarget(booking)}
                        className="admin-btn-outline historico-action-btn historico-delete-btn"
                      >
                        <Trash2 style={{ width: 13, height: 13 }} /> Excluir
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <footer className="historico-pagination">
              <span className="historico-pagination-info">
                Exibindo <strong>{items.length}</strong> de <strong>{total}</strong> card(s)
              </span>

              <div className="historico-pagination-controls">
                {hasMore && (
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void fetchHistory(page + 1, true)}
                    className="admin-btn-primary historico-load-more-btn"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Carregando...
                      </>
                    ) : (
                      <>Carregar mais 20</>
                    )}
                  </button>
                )}

                <div className="historico-page-nav">
                  <button
                    type="button"
                    disabled={page <= 1 || loading || loadingMore}
                    onClick={() => void fetchHistory(page - 1, false)}
                    className="admin-btn-outline historico-page-btn"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft style={{ width: 14, height: 14 }} /> Anterior
                  </button>
                  <span className="historico-page-indicator">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={!hasMore || loading || loadingMore}
                    onClick={() => void fetchHistory(page + 1, false)}
                    className="admin-btn-outline historico-page-btn"
                    aria-label="Próxima página"
                  >
                    Próxima <ChevronRight style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>
            </footer>
          </>
        )}
      </section>

      <DangerConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Excluir agendamento"
        subtitle="O registro será removido permanentemente"
        description={`Digite EXCLUIR AGENDAMENTO para apagar o agendamento de ${deleteTarget?.name || 'este cliente'}.`}
        confirmText="EXCLUIR AGENDAMENTO"
        confirmLabel="Excluir agendamento"
        helperText="Esta exclusão remove o agendamento do banco de dados e apaga o evento vinculado no calendário quando existir."
        requireMasterPassword
        passwordPlaceholder="Digite a senha master para excluir o agendamento"
        busy={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
