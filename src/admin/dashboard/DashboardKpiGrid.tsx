import { AlertCircle, CalendarDays, CheckCircle2, Clock3, UsersRound } from 'lucide-react';
import type { WorkbenchOverview } from '../types';

type Props = {
  overview: WorkbenchOverview;
  loading: boolean;
  hasLoadedOnce: boolean;
  error: string;
  dateScope: 'all' | 'range';
  onRetry: () => void;
};

export function DashboardKpiGrid({
  overview,
  loading,
  hasLoadedOnce,
  error,
  dateScope,
  onRetry,
}: Props) {
  if (error && !hasLoadedOnce) {
    return (
      <section className="dash-kpi-error" role="alert">
        <div className="dash-state-inline">
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
        <button type="button" className="admin-btn-outline dash-sm-btn" onClick={onRetry}>
          Tentar novamente
        </button>
      </section>
    );
  }

  const showSkeleton = loading && !hasLoadedOnce;
  const stats = overview?.bookingStats ?? { total: 0, pending: 0, confirmed: 0, completed: 0, rejected: 0 };
  const totalCount = Number(stats.total ?? 0);
  const pendingCount = Number(stats.pending ?? 0);
  const confirmedCount = Number(stats.confirmed ?? 0);
  const completedCount = Number(stats.completed ?? 0);
  const rejectedCount = Number(stats.rejected ?? 0);
  const leadsTotal = Number(overview?.leads?.total ?? 0);
  const periodLabel = dateScope === 'all' ? 'Todo o histórico' : 'No período selecionado';

  const cards = [
    {
      id: 'total',
      label: 'Total de agendamentos',
      value: totalCount,
      caption: `${periodLabel} · ${rejectedCount} rejeitado(s)`,
      badge: confirmedCount > 0 ? `${confirmedCount} em andamento` : null,
      icon: CalendarDays,
      tone: 'wine',
    },
    {
      id: 'pending',
      label: 'Pendentes',
      value: pendingCount,
      caption: 'Aguardando confirmação',
      badge: confirmedCount > 0 ? `Confirmados: ${confirmedCount}` : null,
      icon: Clock3,
      tone: 'amber',
    },
    {
      id: 'completed',
      label: 'Finalizados',
      value: completedCount,
      caption: `Atendimentos concluídos · Confirmados: ${confirmedCount}`,
      badge: null,
      icon: CheckCircle2,
      tone: 'green',
    },
    {
      id: 'leads',
      label: 'Leads no funil',
      value: leadsTotal,
      caption: overview?.leads?.filteredByPeriod ? 'Criados no período' : 'Base ativa geral (sem filtro de data)',
      badge: overview?.leads?.filteredByPeriod ? null : 'Sem filtro de data',
      icon: UsersRound,
      tone: 'neutral',
    },
  ] as const;

  return (
    <section aria-label="Indicadores principais">
      {error && hasLoadedOnce && (
        <div className="dash-section-alert" role="alert">
          <div className="dash-state-inline">
            <AlertCircle className="w-4 h-4" aria-hidden="true" />
            <span>Falha ao atualizar indicadores: {error}</span>
          </div>
          <button type="button" className="admin-btn-outline dash-sm-btn" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      )}

      <div className={`dash-kpi-grid${loading && hasLoadedOnce ? ' is-updating' : ''}`}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.id} className={`dash-kpi-card tone-${card.tone}`}>
              <div className="dash-kpi-head">
                <div className="dash-kpi-icon">
                  <Icon strokeWidth={1.9} className="w-5 h-5" aria-hidden="true" />
                </div>
                {card.badge && <span className="dash-kpi-chip">{card.badge}</span>}
              </div>

              {showSkeleton ? (
                <div className="dash-skeleton-stack" aria-busy="true" aria-label={`Carregando ${card.label}`}>
                  <div className="dash-skeleton-line w-24" />
                  <div className="dash-skeleton-value" />
                  <div className="dash-skeleton-line w-36" />
                </div>
              ) : (
                <div className="dash-kpi-body">
                  <span className="dash-kpi-label">{card.label}</span>
                  <strong className="dash-kpi-value">{Number(card.value ?? 0).toLocaleString('pt-BR')}</strong>
                  <p className="dash-kpi-caption">{card.caption}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
