import {
  CheckSquare,
  ClipboardList,
  Database,
  History,
  Users,
  WalletCards,
} from 'lucide-react';

import type { TabId } from '../AdminUtils';
import type { SupabaseReadinessReport, WorkbenchOverview } from '../types';

type Props = {
  overview: WorkbenchOverview;
  dateScope: 'all' | 'range';
  supabaseStatus: SupabaseReadinessReport | null;
  supabaseLoading: boolean;
  onNavigateTab?: (tabId: TabId) => void;
};

export function DashboardOperationsSection({
  overview,
  dateScope,
  supabaseStatus,
  supabaseLoading,
  onNavigateTab,
}: Props) {
  const totalBookings = Number(overview.bookingStats?.total ?? 0);
  const completedBookings = Number(overview.bookingStats?.completed ?? 0);
  const rejectedBookings = Number(overview.bookingStats?.rejected ?? 0);
  const completionRate =
    totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 100) : null;

  const pendingTasks = Number(overview.tasks?.pending ?? 0);
  const doneTasks = Number(overview.tasks?.done ?? 0);

  const renderSupabaseBadge = () => {
    if (supabaseLoading && !supabaseStatus) {
      return (
        <span className="dash-sync-badge is-checking" title="Verificando conexão com Supabase">
          <Database className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Verificando Supabase...</span>
        </span>
      );
    }

    if (!supabaseStatus) {
      return null;
    }

    if (supabaseStatus.readyForProduction) {
      return (
        <span
          className="dash-sync-badge is-ready"
          title={`Conectado ao projeto ${supabaseStatus.projectRef || ''} (${supabaseStatus.tablesReady}/${supabaseStatus.tablesChecked} tabelas prontas)`}
        >
          <Database className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Supabase pronto · {supabaseStatus.latencyMs} ms</span>
        </span>
      );
    }

    if (supabaseStatus.connected) {
      const pendingItems =
        supabaseStatus.missingColumns.length + supabaseStatus.missingTables.length;
      const detailsText =
        supabaseStatus.notes[0] ||
        'Existem ajustes pendentes de schema no banco Supabase.';
      return (
        <span
          className="dash-sync-badge is-warning"
          title={detailsText}
        >
          <Database className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            Supabase conectado ·{' '}
            {pendingItems > 0 ? `${pendingItems} ajuste(s) SQL` : 'verificar schema'}
          </span>
        </span>
      );
    }

    return (
      <span
        className="dash-sync-badge is-offline"
        title={supabaseStatus.notes[0] || 'Supabase desconectado'}
      >
        <Database className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Supabase desconectado</span>
      </span>
    );
  };

  return (
    <section
      className="dash-surface dash-ops-card"
      aria-labelledby="dash-ops-heading"
    >
      <div className="dash-section-head">
        <div>
          <h3 id="dash-ops-heading">
            <ClipboardList className="w-4 h-4" aria-hidden="true" />
            <span>Operação & atalhos rápidos</span>
          </h3>
          <p>
            Desempenho do período combinado à fila ativa de tarefas operacionais.
          </p>
        </div>
        {renderSupabaseBadge()}
      </div>

      <div className="dash-ops-metrics">
        <article className="dash-ops-metric-box">
          <span>Taxa de finalização</span>
          <strong>{completionRate === null ? '—' : `${completionRate}%`}</strong>
          <small>
            {totalBookings > 0
              ? `${completedBookings.toLocaleString('pt-BR')} de ${totalBookings.toLocaleString('pt-BR')} ${dateScope === 'all' ? 'no histórico' : 'no período'}`
              : 'Sem atendimentos no recorte'}
          </small>
        </article>

        <article className="dash-ops-metric-box">
          <span>Rejeitados ({dateScope === 'all' ? 'geral' : 'período'})</span>
          <strong>{rejectedBookings.toLocaleString('pt-BR')}</strong>
          <small>
            {rejectedBookings === 0
              ? 'Nenhuma recusa registrada'
              : 'Recusados ou cancelados'}
          </small>
        </article>

        <article className="dash-ops-metric-box">
          <span>Tarefas da equipe</span>
          <strong>{pendingTasks.toLocaleString('pt-BR')} pendente(s)</strong>
          <small>
            {doneTasks.toLocaleString('pt-BR')} concluída(s) ·{' '}
            {overview.tasks?.filteredByPeriod
              ? 'No período aplicado'
              : 'Base ativa geral (sem filtro de data)'}
          </small>
        </article>
      </div>

      {supabaseStatus && !supabaseStatus.readyForProduction && supabaseStatus.pendingMigrations.length > 0 && (
        <div className="dash-supabase-note">
          <strong>Vínculo Supabase ativo ({supabaseStatus.tablesReady}/{supabaseStatus.tablesChecked} tabelas)</strong>
          <span>
            Migração pendente no banco: <code>{supabaseStatus.pendingMigrations[0]}</code>
            {supabaseStatus.missingColumns.length > 0 &&
              ` (${supabaseStatus.missingColumns.map((c) => `${c.table}.${c.column}`).join(', ')})`}
            .
          </span>
        </div>
      )}

      {onNavigateTab && (
        <div className="dash-ops-shortcuts" role="navigation" aria-label="Atalhos administrativos">
          <button
            type="button"
            className="dash-shortcut-btn"
            onClick={() => onNavigateTab('pagamentos')}
          >
            <WalletCards className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Pagamentos</span>
          </button>
          <button
            type="button"
            className="dash-shortcut-btn"
            onClick={() => onNavigateTab('historico')}
          >
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Histórico completo</span>
          </button>
          <button
            type="button"
            className="dash-shortcut-btn"
            onClick={() => onNavigateTab('tarefas')}
          >
            <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tarefas</span>
          </button>
          <button
            type="button"
            className="dash-shortcut-btn"
            onClick={() => onNavigateTab('clientes')}
          >
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clientes</span>
          </button>
        </div>
      )}
    </section>
  );
}
