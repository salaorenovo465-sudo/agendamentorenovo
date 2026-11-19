import { useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { DangerConfirmModal } from '../AdminHelpers';
import { toNumber, toStringValue, ENTITY_FIELDS } from '../AdminUtils';
import { CrudTab } from '../CrudTab';

export function DisponibilidadeTab({
  rules,
  loading,
  showNewRule,
  setShowNewRule,
  onCreateEntity,
  onDeleteEntity,
}: {
  rules: Record<string, unknown>[];
  loading: boolean;
  showNewRule: boolean;
  setShowNewRule: (show: boolean) => void;
  onCreateEntity: (entity: 'availability', payload: Record<string, unknown>) => Promise<void>;
  onDeleteEntity: (entity: 'availability', id: number, masterPassword?: string) => Promise<void>;
}) {
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const folgas = rules.filter((r) => toStringValue(r.type) === 'folga');
  const horarios = rules.filter((r) => toStringValue(r.type) === 'horario' || toStringValue(r.type) === 'pausa');
  const bloqueios = rules.filter((r) => toStringValue(r.type) === 'feriado' || toStringValue(r.type) === 'bloqueio');
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const handleConfirmDelete = async (masterPassword?: string) => {
    const id = deleteTarget ? toNumber(deleteTarget.id) : 0;
    if (!id || !masterPassword) return;

    setDeleting(true);
    try {
      await onDeleteEntity('availability', id, masterPassword);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="agenda-command-center">
        <div className="agenda-command-top">
          <div className="agenda-command-copy">
            <h2>Regras de Disponibilidade</h2>
            <p>Configure janelas de atendimento, pausas, folgas semanais e bloqueios de agenda.</p>
          </div>
          <div className="agenda-command-actions">
            <button onClick={() => setShowNewRule(true)} className="admin-btn-primary agenda-new-booking-btn">
              <Plus style={{ width: 15, height: 15 }} /> Nova regra
            </button>
          </div>
        </div>

        <div className="agenda-command-bottom">
          <div className="agenda-toolbar-left">
            <div className="agenda-stat-grid">
              <div className="agenda-stat-card agenda-stat-wine">
                <span>Total de regras</span>
                <strong>{rules.length}</strong>
              </div>
              <div className="agenda-stat-card agenda-stat-green">
                <span>Horários / Pausas</span>
                <strong>{horarios.length}</strong>
              </div>
              <div className="agenda-stat-card agenda-stat-gold">
                <span>Folgas</span>
                <strong>{folgas.length}</strong>
              </div>
              <div className="agenda-stat-card agenda-stat-wine">
                <span>Bloqueios</span>
                <strong>{bloqueios.length}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showNewRule && (
        <div className="admin-modal-root" onClick={() => setShowNewRule(false)}>
          <div className="admin-modal-overlay" />
          <div
            className="admin-modal-card admin-modal-card-md"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">Nova regra de disponibilidade</h3>
                <p className="admin-modal-subtitle">Defina o tipo de regra, dia da semana, faixa de horário e limite diário.</p>
              </div>
              <button onClick={() => setShowNewRule(false)} className="admin-btn-outline" style={{ padding: 6 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div className="admin-modal-body">
              <CrudTab
                title="Regra"
                fields={ENTITY_FIELDS.availability}
                rows={[]}
                loading={false}
                hideRecordsList
                onCreate={async (p) => {
                  await onCreateEntity('availability', p);
                  setShowNewRule(false);
                }}
                onUpdate={async () => {}}
                onDelete={async () => {}}
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="agenda-loading-state">
          <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" /> Carregando disponibilidade...
        </div>
      ) : (
        <div className="admin-pipeline">
          <section className="admin-pipeline-col admin-pipeline-confirmed">
            <div className="admin-pipeline-col-header">
              <span>Horários e Pausas</span>
              <span className="admin-pipeline-count">{horarios.length}</span>
            </div>
            <div className="admin-pipeline-cards">
              {horarios.length === 0 ? (
                <div className="agenda-empty-column">Nenhuma regra de horário cadastrada.</div>
              ) : (
                horarios.map((r) => (
                  <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-confirmed">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span className="historico-badge historico-badge-confirmed">{toStringValue(r.type) || 'Horário'}</span>
                    </div>
                    <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                    <p style={{ fontSize: 11.5, color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
                      {weekdays[toNumber(r.weekday)] || 'Todos os dias'} • {toStringValue(r.start_time)} - {toStringValue(r.end_time)}
                    </p>
                    <div style={{ marginTop: 10 }}>
                      <button onClick={() => setDeleteTarget(r)} className="admin-btn-outline agenda-delete-btn" style={{ fontSize: 11, padding: '4px 9px' }}>
                        <Trash2 style={{ width: 12, height: 12 }} /> Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="admin-pipeline-col admin-pipeline-pending">
            <div className="admin-pipeline-col-header">
              <span>Folgas</span>
              <span className="admin-pipeline-count">{folgas.length}</span>
            </div>
            <div className="admin-pipeline-cards">
              {folgas.length === 0 ? (
                <div className="agenda-empty-column">Nenhuma folga cadastrada.</div>
              ) : (
                folgas.map((r) => (
                  <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-pending">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span className="historico-badge historico-badge-pending">Folga</span>
                    </div>
                    <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                    <p style={{ fontSize: 11.5, color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
                      {weekdays[toNumber(r.weekday)] || 'Todos os dias'}
                    </p>
                    <div style={{ marginTop: 10 }}>
                      <button onClick={() => setDeleteTarget(r)} className="admin-btn-outline agenda-delete-btn" style={{ fontSize: 11, padding: '4px 9px' }}>
                        <Trash2 style={{ width: 12, height: 12 }} /> Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="admin-pipeline-col admin-pipeline-rejected">
            <div className="admin-pipeline-col-header">
              <span>Feriados e Bloqueios</span>
              <span className="admin-pipeline-count">{bloqueios.length}</span>
            </div>
            <div className="admin-pipeline-cards">
              {bloqueios.length === 0 ? (
                <div className="agenda-empty-column">Nenhum bloqueio cadastrado.</div>
              ) : (
                bloqueios.map((r) => (
                  <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-rejected">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span className="historico-badge historico-badge-overdue">{toStringValue(r.type) || 'Bloqueio'}</span>
                    </div>
                    <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                    <p style={{ fontSize: 11.5, color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
                      {weekdays[toNumber(r.weekday)] || 'Todos os dias'}
                    </p>
                    <div style={{ marginTop: 10 }}>
                      <button onClick={() => setDeleteTarget(r)} className="admin-btn-outline agenda-delete-btn" style={{ fontSize: 11, padding: '4px 9px' }}>
                        <Trash2 style={{ width: 12, height: 12 }} /> Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      <DangerConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Excluir regra de disponibilidade"
        subtitle="A disponibilidade sera alterada imediatamente"
        description={`Digite EXCLUIR REGRA para remover ${toStringValue(deleteTarget?.title) || 'esta regra'} da operacao.`}
        confirmText="EXCLUIR REGRA"
        confirmLabel="Excluir regra"
        helperText="A regra sera removida do Supabase e deixa de impactar horarios, folgas e bloqueios."
        requireMasterPassword
        passwordPlaceholder="Digite a senha master para excluir a regra"
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
