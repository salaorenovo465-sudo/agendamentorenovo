import { useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Loader2, Percent, Sparkles, Trash2, UserRound, X } from 'lucide-react';

import { ActivityTimeline, AnalyticsPanel, MostProfitableService, OccupancyBar, StatusPieChart, WeeklyCalendar } from '../AdminFeatures';
import type { AdminBooking } from '../types';
import {
  computeCollaboratorPerformance,
  countCollaboratorCategories,
  countCollaboratorServices,
  createCollaboratorDraft,
  type ServiceCatalogCategory,
} from '../collaboratorUtils';
import { DangerConfirmModal } from '../AdminHelpers';

type CollaboratorAnalyticsModalProps = {
  collaborator: ReturnType<typeof createCollaboratorDraft>;
  overall: ReturnType<typeof computeCollaboratorPerformance>;
  period: ReturnType<typeof computeCollaboratorPerformance>;
  dateLabel: string;
  onClose: () => void;
};

const formatMoney = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function CollaboratorAnalyticsModal({
  collaborator,
  overall,
  period,
  dateLabel,
  onClose,
}: CollaboratorAnalyticsModalProps) {
  const breakdown = useMemo(() => {
    const merged = new Map<string, {
      serviceName: string;
      category: string;
      commissionPercent: number;
      overallQty: number;
      overallCommission: number;
      periodQty: number;
      periodCommission: number;
    }>();

    for (const row of overall.serviceBreakdown) {
      merged.set(`${row.category}::${row.serviceName}`, {
        serviceName: row.serviceName,
        category: row.category,
        commissionPercent: row.commissionPercent,
        overallQty: row.quantity,
        overallCommission: row.commissionAmount,
        periodQty: 0,
        periodCommission: 0,
      });
    }

    for (const row of period.serviceBreakdown) {
      const key = `${row.category}::${row.serviceName}`;
      const current = merged.get(key);
      if (current) {
        current.periodQty = row.quantity;
        current.periodCommission = row.commissionAmount;
      } else {
        merged.set(key, {
          serviceName: row.serviceName,
          category: row.category,
          commissionPercent: row.commissionPercent,
          overallQty: 0,
          overallCommission: 0,
          periodQty: row.quantity,
          periodCommission: row.commissionAmount,
        });
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.periodCommission - a.periodCommission || b.overallCommission - a.overallCommission);
  }, [overall.serviceBreakdown, period.serviceBreakdown]);

  return (
    <div className="admin-modal-root collaborator-modal-root" style={{ zIndex: 1400 }}>
      <div className="admin-modal-overlay" onClick={onClose} />
      <div className="admin-modal-card analytics-collaborator-modal" role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title-row">
            <div className="admin-modal-icon admin-modal-icon-gold">
              <UserRound style={{ width: 18, height: 18, color: 'var(--admin-gold, #d4af37)' }} />
            </div>
            <div>
              <h3 className="admin-modal-title">{collaborator.name}</h3>
              <p className="admin-modal-subtitle">Painel de produtividade e comissoes por servico.</p>
            </div>
          </div>
          <button className="admin-btn-outline" onClick={onClose} style={{ padding: 6 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="admin-modal-body analytics-collaborator-body">
          <div className="analytics-collaborator-kpis">
            <div className="collaborator-summary-card">
              <span>Servicos realizados geral</span>
              <strong>{overall.servicesCompleted}</strong>
            </div>
            <div className="collaborator-summary-card">
              <span>Servicos no filtro</span>
              <strong>{period.servicesCompleted}</strong>
            </div>
            <div className="collaborator-summary-card">
              <span>Comissao geral</span>
              <strong>{formatMoney(overall.commissionTotal)}</strong>
            </div>
            <div className="collaborator-summary-card">
              <span>Comissao em {dateLabel.toLowerCase()}</span>
              <strong>{formatMoney(period.commissionTotal)}</strong>
            </div>
          </div>

          <div className="collaborator-meta-list" style={{ marginBottom: 18 }}>
            <span><Sparkles style={{ width: 12, height: 12 }} /> {countCollaboratorCategories(collaborator)} categorias ativas</span>
            <span><BarChart3 style={{ width: 12, height: 12 }} /> {countCollaboratorServices(collaborator)} servicos monitorados</span>
          </div>

          <div className="analytics-service-breakdown">
            {breakdown.map((row) => (
              <div key={`${row.category}-${row.serviceName}`} className="analytics-service-row">
                <div>
                  <strong>{row.serviceName}</strong>
                  <span>{row.category || 'Sem categoria'} | {row.commissionPercent}%</span>
                </div>
                <div className="analytics-service-values">
                  <span>Geral: {row.overallQty} | {formatMoney(row.overallCommission)}</span>
                  <span>Filtro: {row.periodQty} | {formatMoney(row.periodCommission)}</span>
                </div>
              </div>
            ))}
            {breakdown.length === 0 && (
              <div className="collaborator-empty-state">
                Nenhum servico finalizado com este colaborador ainda.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsTab({
  bookings,
  allBookings,
  profs,
  serviceCatalog,
  analyticsSubTab,
  setAnalyticsSubTab,
  dateLabel,
  onClearHistory,
}: {
  bookings: AdminBooking[];
  allBookings: AdminBooking[];
  profs: Record<string, unknown>[];
  serviceCatalog: ServiceCatalogCategory[];
  analyticsSubTab: 'geral' | 'colaboradores';
  setAnalyticsSubTab: (tab: 'geral' | 'colaboradores') => void;
  dateLabel: string;
  onClearHistory: (masterPassword?: string) => Promise<void>;
}) {
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearHistoryModalOpen, setClearHistoryModalOpen] = useState(false);

  const collaborators = useMemo(
    () => profs.map((prof) => createCollaboratorDraft(prof, serviceCatalog)),
    [profs, serviceCatalog],
  );

  const selectedCollaborator = useMemo(
    () => collaborators.find((collaborator) => collaborator.id === selectedCollaboratorId) || null,
    [collaborators, selectedCollaboratorId],
  );

  const collaboratorRows = useMemo(() => {
    return collaborators.map((collaborator) => ({
      collaborator,
      overall: computeCollaboratorPerformance(collaborator, allBookings),
      period: computeCollaboratorPerformance(collaborator, bookings),
    }));
  }, [allBookings, bookings, collaborators]);

  const handleClearHistory = async (masterPassword?: string) => {
    setClearingHistory(true);
    try {
      await onClearHistory(masterPassword);
      setSelectedCollaboratorId(null);
      setClearHistoryModalOpen(false);
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setAnalyticsSubTab('geral')} className={analyticsSubTab === 'geral' ? 'admin-btn-primary' : 'admin-btn-outline'} style={{ padding: '6px 16px', fontSize: 12 }}>Visao Geral</button>
          <button onClick={() => setAnalyticsSubTab('colaboradores')} className={analyticsSubTab === 'colaboradores' ? 'admin-btn-primary' : 'admin-btn-outline'} style={{ padding: '6px 16px', fontSize: 12 }}>Por Colaborador</button>
        </div>
        <button
          onClick={() => setClearHistoryModalOpen(true)}
          className="admin-btn-danger"
          style={{ padding: '6px 16px', fontSize: 12 }}
          disabled={clearingHistory}
        >
          {clearingHistory ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <Trash2 style={{ width: 13, height: 13 }} />}
          Limpar historico total
        </button>
      </div>
      {analyticsSubTab === 'geral' ? (
        <div className="space-y-4">
          <AnalyticsPanel bookings={bookings} />
          <div className="grid gap-4 lg:grid-cols-2">
            <WeeklyCalendar bookings={bookings} />
            <ActivityTimeline bookings={bookings} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <StatusPieChart bookings={bookings} />
            <OccupancyBar bookings={bookings} />
            <MostProfitableService bookings={bookings} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {collaboratorRows.length === 0 ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Nenhum colaborador cadastrado.</p> : collaboratorRows.map(({ collaborator, overall, period }) => (
            <button
              key={collaborator.id || collaborator.name}
              type="button"
              className="admin-analytics-card collaborator-analytics-card"
              onClick={() => setSelectedCollaboratorId(collaborator.id || null)}
            >
              <div className="collaborator-card-top">
                <div className="admin-avatar">{collaborator.name.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <p>{collaborator.name}</p>
                  <span>{countCollaboratorCategories(collaborator)} categorias | {countCollaboratorServices(collaborator)} servicos</span>
                </div>
                <CalendarDays style={{ width: 16, height: 16, marginLeft: 'auto', color: 'var(--admin-accent)' }} />
              </div>

              <div className="collaborator-card-stats">
                <div>
                  <span>Geral</span>
                  <strong>{overall.servicesCompleted}</strong>
                </div>
                <div>
                  <span>Filtro</span>
                  <strong>{period.servicesCompleted}</strong>
                </div>
                <div>
                  <span>Comissao filtro</span>
                  <strong>{formatMoney(period.commissionTotal)}</strong>
                </div>
              </div>

              <div className="collaborator-meta-list">
                <span><Percent style={{ width: 12, height: 12 }} /> Comissao geral: {formatMoney(overall.commissionTotal)}</span>
                <span><BarChart3 style={{ width: 12, height: 12 }} /> Clique para abrir o painel detalhado</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <DangerConfirmModal
        isOpen={clearHistoryModalOpen}
        title="Limpar historico total"
        subtitle="Analytics e operacao serao zerados"
        description="Todos os agendamentos, extratos financeiros, leads, tarefas e avaliacoes serao apagados do historico operacional para reiniciar a base analitica."
        confirmText="LIMPAR HISTORICO TOTAL"
        confirmLabel="Apagar historico total"
        helperText="Esta limpeza atua direto no Supabase e remove o historico completo usado em analytics, agenda e pagamentos."
        requireMasterPassword
        passwordPlaceholder="Digite a senha master para limpar o historico total"
        busy={clearingHistory}
        onClose={() => setClearHistoryModalOpen(false)}
        onConfirm={handleClearHistory}
      />

      {selectedCollaborator && (
        <CollaboratorAnalyticsModal
          collaborator={selectedCollaborator}
          overall={computeCollaboratorPerformance(selectedCollaborator, allBookings)}
          period={computeCollaboratorPerformance(selectedCollaborator, bookings)}
          dateLabel={dateLabel}
          onClose={() => setSelectedCollaboratorId(null)}
        />
      )}
    </div>
  );
}
