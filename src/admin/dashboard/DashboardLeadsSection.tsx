import { AlertCircle, UsersRound } from 'lucide-react';

type Props = {
  stageSummary: [string, unknown][];
  totalLeads: number;
  filteredByPeriod: boolean;
  loading: boolean;
  hasLoadedOnce: boolean;
  error: string;
  onRetry: () => void;
};

export function DashboardLeadsSection({
  stageSummary,
  totalLeads,
  filteredByPeriod,
  loading,
  hasLoadedOnce,
  error,
  onRetry,
}: Props) {
  const maxStageCount = stageSummary.reduce((max, [, count]) => Math.max(max, Number(count) || 0), 0) || 1;

  return (
    <section className="dash-surface dash-leads-card" aria-labelledby="dash-leads-heading">
      <div className="dash-section-head">
        <div>
          <h3 id="dash-leads-heading">
            <UsersRound className="w-4 h-4" aria-hidden="true" />
            <span>Leads por etapa</span>
          </h3>
          <p>
            {filteredByPeriod
              ? 'Distribuição do funil comercial no período aplicado.'
              : 'Distribuição atual do funil no estabelecimento (não filtrada por período).'}
          </p>
        </div>
        <span className="dash-pill-muted">{Number(totalLeads ?? 0).toLocaleString('pt-BR')} no total</span>
      </div>

      {error && !hasLoadedOnce ? (
        <div className="dash-empty-state is-error" role="alert">
          <div className="dash-state-inline">
            <AlertCircle className="w-4 h-4" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button type="button" className="admin-btn-outline dash-sm-btn" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      ) : loading && !hasLoadedOnce ? (
        <div className="dash-skeleton-stack" aria-busy="true">
          <div className="dash-skeleton-line w-full" />
          <div className="dash-skeleton-line w-3/4" />
        </div>
      ) : stageSummary.length === 0 ? (
        <div className="dash-empty-state">
          <strong>Nenhum lead cadastrado</strong>
          <p>Quando novos contatos entrarem no funil comercial, as etapas aparecerão aqui com a proporção de cada estágio.</p>
        </div>
      ) : (
        <div className="dash-leads-bars">
          {stageSummary.map(([stage, rawCount]) => {
            const count = Number(rawCount) || 0;
            const widthPct = Math.max(6, Math.round((count / maxStageCount) * 100));
            return (
              <div key={stage} className="dash-lead-stage-row">
                <div className="dash-lead-stage-top">
                  <span className="dash-lead-stage-name">{stage || 'Sem etapa'}</span>
                  <strong>{count.toLocaleString('pt-BR')}</strong>
                </div>
                <div className="dash-lead-bar-track" aria-hidden="true">
                  <div className="dash-lead-bar-fill" style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
