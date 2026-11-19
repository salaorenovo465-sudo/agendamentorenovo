import { CheckCircle2, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import { formatDateBR, toNumber, toStringValue, ENTITY_FIELDS } from '../AdminUtils';
import { CrudTab } from '../CrudTab';

export function TarefasTab({
  tasks,
  loading,
  showNewTask,
  setShowNewTask,
  onCreateEntity,
  onUpdateEntity,
}: {
  tasks: Record<string, unknown>[];
  loading: boolean;
  showNewTask: boolean;
  setShowNewTask: (show: boolean) => void;
  onCreateEntity: (entity: 'tasks', payload: Record<string, unknown>) => Promise<void>;
  onUpdateEntity: (entity: 'tasks', id: number, payload: Record<string, unknown>) => Promise<void>;
}) {
  const pending = tasks.filter((t) => toStringValue(t.status).toLowerCase() !== 'concluida');
  const done = tasks.filter((t) => toStringValue(t.status).toLowerCase() === 'concluida');

  return (
    <div className="space-y-4">
      <section className="agenda-command-center">
        <div className="agenda-command-top">
          <div className="agenda-command-copy">
            <h2>Gestão de Tarefas</h2>
            <p>Organize pendências operacionais, responsáveis, prazos e prioridades da equipe.</p>
          </div>
          <div className="agenda-command-actions">
            <button onClick={() => setShowNewTask(true)} className="admin-btn-primary agenda-new-booking-btn">
              <Plus style={{ width: 15, height: 15 }} /> Nova tarefa
            </button>
          </div>
        </div>

        <div className="agenda-command-bottom">
          <div className="agenda-toolbar-left">
            <div className="agenda-stat-grid">
              <div className="agenda-stat-card agenda-stat-wine">
                <span>Total</span>
                <strong>{tasks.length}</strong>
              </div>
              <div className="agenda-stat-card agenda-stat-gold">
                <span>Pendentes</span>
                <strong>{pending.length}</strong>
              </div>
              <div className="agenda-stat-card agenda-stat-green">
                <span>Concluídas</span>
                <strong>{done.length}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showNewTask && (
        <div className="admin-modal-root" onClick={() => setShowNewTask(false)}>
          <div className="admin-modal-overlay" />
          <div
            className="admin-modal-card admin-modal-card-md"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">Nova tarefa operacional</h3>
                <p className="admin-modal-subtitle">Defina título, responsável, prazo e prioridade.</p>
              </div>
              <button onClick={() => setShowNewTask(false)} className="admin-btn-outline" style={{ padding: 6 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div className="admin-modal-body">
              <CrudTab
                title="Tarefa"
                fields={ENTITY_FIELDS.tasks}
                rows={[]}
                loading={false}
                hideRecordsList
                onCreate={async (payload) => {
                  await onCreateEntity('tasks', { ...payload, status: payload.status || 'pendente' });
                  setShowNewTask(false);
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
          <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" /> Carregando tarefas...
        </div>
      ) : (
        <div className="admin-pipeline" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <section className="admin-pipeline-col admin-pipeline-pending">
            <div className="admin-pipeline-col-header">
              <span>Pendentes</span>
              <span className="admin-pipeline-count">{pending.length}</span>
            </div>
            <div className="admin-pipeline-cards">
              {pending.length === 0 ? (
                <div className="agenda-empty-column">Nenhuma tarefa pendente.</div>
              ) : (
                pending.map((task) => {
                  const priority = toStringValue(task.priority).toLowerCase();
                  return (
                    <div key={toNumber(task.id)} className="admin-pipeline-card admin-pipeline-card-pending">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <span className="historico-badge historico-badge-pending">Pendente</span>
                        {priority && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 999,
                              textTransform: 'uppercase',
                              border: '1px solid #e5e7eb',
                              background: '#ffffff',
                              color: priority === 'alta' ? '#b91c1c' : priority === 'media' ? '#92400e' : '#374151',
                            }}
                          >
                            Prioridade {priority}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>
                        {toStringValue(task.title)}
                      </p>
                      <p style={{ fontSize: 11.5, color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
                        {toStringValue(task.owner) ? `Responsável: ${toStringValue(task.owner)}` : 'Sem responsável'}
                        {toStringValue(task.due_date) ? ` • Prazo: ${formatDateBR(toStringValue(task.due_date))}` : ''}
                      </p>
                      <div style={{ marginTop: 10 }}>
                        <button
                          onClick={() => void onUpdateEntity('tasks', toNumber(task.id), { status: 'concluida' })}
                          className="admin-btn-primary"
                          style={{ fontSize: 11, padding: '5px 10px', minHeight: 28 }}
                        >
                          <CheckCircle2 style={{ width: 12, height: 12 }} /> Concluir
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="admin-pipeline-col admin-pipeline-confirmed">
            <div className="admin-pipeline-col-header">
              <span>Concluídas</span>
              <span className="admin-pipeline-count">{done.length}</span>
            </div>
            <div className="admin-pipeline-cards">
              {done.length === 0 ? (
                <div className="agenda-empty-column">Nenhuma tarefa concluída.</div>
              ) : (
                done.map((task) => (
                  <div key={toNumber(task.id)} className="admin-pipeline-card admin-pipeline-card-confirmed">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <span className="historico-badge historico-badge-confirmed">Concluída</span>
                    </div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>
                      {toStringValue(task.title)}
                    </p>
                    <p style={{ fontSize: 11.5, color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
                      {toStringValue(task.owner) || 'Sem responsável'}
                    </p>
                    <div style={{ marginTop: 10 }}>
                      <button
                        onClick={() => void onUpdateEntity('tasks', toNumber(task.id), { status: 'pendente' })}
                        className="admin-btn-outline"
                        style={{ fontSize: 11, padding: '5px 10px', minHeight: 28 }}
                      >
                        <RotateCcw style={{ width: 12, height: 12 }} /> Reabrir
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
