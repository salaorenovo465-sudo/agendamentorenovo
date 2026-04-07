import { CheckCircle2, Plus, X } from 'lucide-react';
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
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Tarefas ({tasks.length})</h3>
        <button onClick={() => setShowNewTask(true)} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus style={{ width: 14, height: 14 }} /> Nova Tarefa</button>
      </div>
      {showNewTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowNewTask(false)}>
          <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 24, width: '100%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>Nova Tarefa</h3>
              <button onClick={() => setShowNewTask(false)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
            </div>
            <CrudTab
              title="Tarefa"
              fields={ENTITY_FIELDS.tasks}
              rows={[]}
              loading={false}
              onCreate={async (payload) => { await onCreateEntity('tasks', { ...payload, status: payload.status || 'pendente' }); setShowNewTask(false); }}
              onUpdate={async () => {}}
              onDelete={async () => {}}
            />
          </div>
        </div>
      )}
      {loading ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
        <div className="admin-pipeline" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="admin-pipeline-col admin-pipeline-pending">
            <div className="admin-pipeline-col-header">Pendentes <span className="admin-pipeline-count">{pending.length}</span></div>
            <div className="admin-pipeline-cards">
              {pending.map((task) => (
                <div key={toNumber(task.id)} className="admin-pipeline-card admin-pipeline-card-pending">
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(task.title)}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{toStringValue(task.owner) && `${toStringValue(task.owner)} • `}{toStringValue(task.due_date) && formatDateBR(toStringValue(task.due_date))}</p>
                  {toStringValue(task.priority) && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: toStringValue(task.priority) === 'alta' ? 'rgba(239,68,68,0.1)' : toStringValue(task.priority) === 'media' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)', color: toStringValue(task.priority) === 'alta' ? '#ef4444' : toStringValue(task.priority) === 'media' ? '#f59e0b' : '#6366f1' }}>{toStringValue(task.priority)}</span>}
                  <div style={{ marginTop: 8 }}>
                    <button onClick={() => void onUpdateEntity('tasks', toNumber(task.id), { status: 'concluida' })} className="admin-btn-success" style={{ fontSize: 10, padding: '3px 8px' }}><CheckCircle2 style={{ width: 11, height: 11 }} /> Concluir</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-pipeline-col admin-pipeline-confirmed">
            <div className="admin-pipeline-col-header">Concluidas <span className="admin-pipeline-count">{done.length}</span></div>
            <div className="admin-pipeline-cards">
              {done.map((task) => (
                <div key={toNumber(task.id)} className="admin-pipeline-card admin-pipeline-card-confirmed">
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0, textDecoration: 'line-through', opacity: 0.7 }}>{toStringValue(task.title)}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{toStringValue(task.owner)}</p>
                  <button onClick={() => void onUpdateEntity('tasks', toNumber(task.id), { status: 'pendente' })} className="admin-btn-outline" style={{ fontSize: 10, padding: '3px 8px', marginTop: 4 }}>Reabrir</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
