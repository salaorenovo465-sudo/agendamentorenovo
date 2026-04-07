import type { Dispatch, SetStateAction } from 'react';
import { Mail, Percent, Plus, Save, X } from 'lucide-react';
import { toNumber, toStringValue, ENTITY_FIELDS } from '../AdminUtils';
import { CrudTab } from '../CrudTab';

export function ProfissionaisTab({
  profs,
  loading,
  showNewProf,
  setShowNewProf,
  selectedProf,
  setSelectedProf,
  editingProf,
  setEditingProf,
  onCreateEntity,
  onUpdateEntity,
  onDeleteEntity,
}: {
  profs: Record<string, unknown>[];
  loading: boolean;
  showNewProf: boolean;
  setShowNewProf: (show: boolean) => void;
  selectedProf: Record<string, unknown> | null;
  setSelectedProf: (prof: Record<string, unknown> | null) => void;
  editingProf: Record<string, unknown>;
  setEditingProf: Dispatch<SetStateAction<Record<string, unknown>>>;
  onCreateEntity: (entity: 'professionals', payload: Record<string, unknown>) => Promise<void>;
  onUpdateEntity: (entity: 'professionals', id: number, payload: Record<string, unknown>) => Promise<void>;
  onDeleteEntity: (entity: 'professionals', id: number) => Promise<void>;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Colaboradores ({profs.length})</h3>
        <button onClick={() => setShowNewProf(true)} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus style={{ width: 14, height: 14 }} /> Cadastrar Colaborador</button>
      </div>
      {showNewProf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowNewProf(false)}>
          <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 24, width: '100%', maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>Cadastrar Colaborador</h3>
              <button onClick={() => setShowNewProf(false)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
            </div>
            <CrudTab
              title="Colaborador"
              fields={ENTITY_FIELDS.professionals}
              rows={[]}
              loading={false}
              onCreate={async (payload) => { await onCreateEntity('professionals', { ...payload, active: payload.active ?? true }); setShowNewProf(false); }}
              onUpdate={async () => {}}
              onDelete={async () => {}}
            />
          </div>
        </div>
      )}
      {loading ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {profs.map((prof) => (
            <div key={toNumber(prof.id)} className="admin-pipeline-card" style={{ borderLeft: `3px solid ${prof.active !== false ? '#10b981' : '#94a3b8'}`, cursor: 'pointer' }} onClick={() => { setSelectedProf(prof); setEditingProf({ ...prof }); }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div className="admin-avatar">{toStringValue(prof.name).charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(prof.name)}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-accent)', margin: 0, fontWeight: 500 }}>{toStringValue(prof.specialties) || 'Geral'}</p>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: prof.active !== false ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)', color: prof.active !== false ? '#10b981' : '#94a3b8' }}>{prof.active !== false ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {toStringValue(prof.email) && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail style={{ width: 10, height: 10 }} /> {toStringValue(prof.email)}</span>}
                {toStringValue(prof.cpf) && <span>CPF: {toStringValue(prof.cpf)}</span>}
                {toNumber(prof.commission) > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Percent style={{ width: 10, height: 10 }} /> Comissão: {toNumber(prof.commission)}%</span>}
                {(toStringValue(prof.work_start) || toStringValue(prof.work_end)) && <span>Jornada: {toStringValue(prof.work_start)} - {toStringValue(prof.work_end)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Painel de edição do colaborador */}
      {selectedProf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSelectedProf(null)}>
          <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="admin-avatar" style={{ width: 44, height: 44, fontSize: 18 }}>{toStringValue(editingProf.name).charAt(0).toUpperCase()}</div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(editingProf.name) || 'Colaborador'}</h3>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: 0 }}>Editar informações</p>
                </div>
              </div>
              <button onClick={() => setSelectedProf(null)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
            </div>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
              <div><label className="admin-label">Nome</label><input className="admin-input" value={toStringValue(editingProf.name)} onChange={(e) => setEditingProf((c) => ({ ...c, name: e.target.value }))} /></div>
              <div><label className="admin-label">CPF</label><input className="admin-input" value={toStringValue(editingProf.cpf)} onChange={(e) => setEditingProf((c) => ({ ...c, cpf: e.target.value }))} /></div>
              <div><label className="admin-label">Data de Nascimento</label><input type="date" className="admin-input" value={toStringValue(editingProf.birth_date)} onChange={(e) => setEditingProf((c) => ({ ...c, birth_date: e.target.value }))} /></div>
              <div><label className="admin-label">Email</label><input className="admin-input" value={toStringValue(editingProf.email)} onChange={(e) => setEditingProf((c) => ({ ...c, email: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label className="admin-label">Endereço</label><input className="admin-input" value={toStringValue(editingProf.address)} onChange={(e) => setEditingProf((c) => ({ ...c, address: e.target.value }))} /></div>
              <div><label className="admin-label">Especialidades</label><input className="admin-input" value={toStringValue(editingProf.specialties)} onChange={(e) => setEditingProf((c) => ({ ...c, specialties: e.target.value }))} /></div>
              <div>
                <label className="admin-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Percent style={{ width: 12, height: 12, color: 'var(--admin-accent)' }} /> Comissão (%)</label>
                <input type="number" min="0" max="100" className="admin-input" value={toStringValue(editingProf.commission)} onChange={(e) => setEditingProf((c) => ({ ...c, commission: Number(e.target.value || 0) }))} placeholder="Ex: 30" />
              </div>
              <div><label className="admin-label">Início jornada</label><input type="time" className="admin-input" value={toStringValue(editingProf.work_start)} onChange={(e) => setEditingProf((c) => ({ ...c, work_start: e.target.value }))} /></div>
              <div><label className="admin-label">Fim jornada</label><input type="time" className="admin-input" value={toStringValue(editingProf.work_end)} onChange={(e) => setEditingProf((c) => ({ ...c, work_end: e.target.value }))} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="admin-label" style={{ margin: 0 }}>Ativo</label>
                <input type="checkbox" checked={editingProf.active !== false} onChange={(e) => setEditingProf((c) => ({ ...c, active: e.target.checked }))} />
              </div>
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  const id = toNumber(selectedProf.id);
                  if (!id) return;
                  await onUpdateEntity('professionals', id, editingProf);
                  setSelectedProf(null);
                }}
                className="admin-btn-success" style={{ padding: '10px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              ><Save style={{ width: 14, height: 14 }} /> Salvar alterações</button>
              <button
                onClick={() => {
                  if (window.confirm('Deseja remover este colaborador?')) {
                    const id = toNumber(selectedProf.id);
                    if (id) { void onDeleteEntity('professionals', id); setSelectedProf(null); }
                  }
                }}
                className="admin-btn-danger" style={{ padding: '10px 20px', fontSize: 13 }}
              >Excluir</button>
              <button onClick={() => setSelectedProf(null)} className="admin-btn-outline" style={{ padding: '10px 20px', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
