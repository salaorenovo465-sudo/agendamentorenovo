import { useState } from 'react';
import { Plus } from 'lucide-react';
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
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

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
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Disponibilidade</h3>
        <button onClick={() => setShowNewRule(true)} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus style={{ width: 14, height: 14 }} /> Nova Regra</button>
      </div>
      {showNewRule && (
        <div className="admin-analytics-card" style={{ marginBottom: 16 }}>
          <CrudTab title="Regra" fields={ENTITY_FIELDS.availability} rows={[]} loading={false} onCreate={async (p) => { await onCreateEntity('availability', p); setShowNewRule(false); }} onUpdate={async () => {}} onDelete={async () => {}} />
        </div>
      )}
      {loading ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
        <div className="admin-pipeline">
          <div className="admin-pipeline-col admin-pipeline-confirmed">
            <div className="admin-pipeline-col-header">Horarios <span className="admin-pipeline-count">{horarios.length}</span></div>
            <div className="admin-pipeline-cards">
              {horarios.map((r) => (
                <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-confirmed">
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{weekdays[toNumber(r.weekday)] || ''} • {toStringValue(r.start_time)} - {toStringValue(r.end_time)}</p>
                  <button onClick={() => setDeleteTarget(r)} className="admin-btn-danger" style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}>Remover</button>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-pipeline-col admin-pipeline-pending">
            <div className="admin-pipeline-col-header">Folgas <span className="admin-pipeline-count">{folgas.length}</span></div>
            <div className="admin-pipeline-cards">
              {folgas.map((r) => (
                <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-pending">
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{weekdays[toNumber(r.weekday)] || 'Todos'}</p>
                  <button onClick={() => setDeleteTarget(r)} className="admin-btn-danger" style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}>Remover</button>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-pipeline-col admin-pipeline-rejected">
            <div className="admin-pipeline-col-header">Feriados/Bloqueios <span className="admin-pipeline-count">{bloqueios.length}</span></div>
            <div className="admin-pipeline-cards">
              {bloqueios.map((r) => (
                <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-rejected">
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{toStringValue(r.type)} • {weekdays[toNumber(r.weekday)] || ''}</p>
                  <button onClick={() => setDeleteTarget(r)} className="admin-btn-danger" style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}>Remover</button>
                </div>
              ))}
            </div>
          </div>
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
