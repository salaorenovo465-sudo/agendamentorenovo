import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { CalendarDays, Mail, MapPin, Percent, Plus, Save, Sparkles, Trash2, UserRound, X } from 'lucide-react';

import { DangerConfirmModal } from '../AdminHelpers';
import { toNumber, toStringValue } from '../AdminUtils';
import {
  countCollaboratorCategories,
  countCollaboratorServices,
  createCollaboratorDraft,
  createEmptyCollaboratorDraft,
  getCollaboratorId,
  serializeCollaboratorDraft,
  type CollaboratorDraft,
  type ServiceCatalogCategory,
} from '../collaboratorUtils';

type EditorProps = {
  title: string;
  subtitle: string;
  draft: CollaboratorDraft;
  saveLabel: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDelete?: () => void;
  onChange: (next: CollaboratorDraft) => void;
};

const cloneDraft = (draft: CollaboratorDraft): CollaboratorDraft => ({
  ...draft,
  commissionProfile: draft.commissionProfile.map((category) => ({
    ...category,
    services: category.services.map((service) => ({ ...service })),
  })),
});

function CollaboratorEditorModal({
  title,
  subtitle,
  draft,
  saveLabel,
  saving,
  error,
  onClose,
  onSave,
  onDelete,
  onChange,
}: EditorProps) {
  const enabledCategories = countCollaboratorCategories(draft);
  const enabledServices = countCollaboratorServices(draft);

  const setField = <K extends keyof CollaboratorDraft>(key: K, value: CollaboratorDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  const toggleCategory = (categoryName: string) => {
    onChange({
      ...draft,
      commissionProfile: draft.commissionProfile.map((category) =>
        category.category === categoryName ? { ...category, enabled: !category.enabled } : category,
      ),
    });
  };

  const updateServiceRule = (categoryName: string, serviceName: string, patch: { active?: boolean; commissionPercent?: number }) => {
    onChange({
      ...draft,
      commissionProfile: draft.commissionProfile.map((category) => {
        if (category.category !== categoryName) return category;
        return {
          ...category,
          services: category.services.map((service) =>
            service.serviceName === serviceName
              ? {
                  ...service,
                  active: patch.active ?? service.active,
                  commissionPercent: patch.commissionPercent ?? service.commissionPercent,
                }
              : service,
          ),
        };
      }),
    });
  };

  return (
    <div className="admin-modal-root collaborator-modal-root" style={{ zIndex: 1400 }}>
      <div className="admin-modal-overlay" onClick={onClose} />
      <div className="admin-modal-card collaborator-modal-card" role="dialog" aria-modal="true">
        <div className="admin-modal-header collaborator-modal-header">
          <div className="admin-modal-title-row">
            <div className="admin-modal-icon admin-modal-icon-gold">
              <UserRound style={{ width: 18, height: 18, color: 'var(--admin-gold, #d4af37)' }} />
            </div>
            <div>
              <h3 className="admin-modal-title">{title}</h3>
              <p className="admin-modal-subtitle">{subtitle}</p>
            </div>
          </div>
          <button className="admin-btn-outline" onClick={onClose} style={{ padding: 6 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="admin-modal-body collaborator-modal-body">
          <div className="collaborator-modal-grid">
            <section className="collaborator-panel collaborator-panel-main">
              <div className="collaborator-panel-head">
                <span className="collaborator-panel-kicker">Base operacional</span>
                <h4>Identidade, jornada e cadastro</h4>
              </div>

              <div className="collaborator-form-grid">
                <div>
                  <label className="admin-label">Nome</label>
                  <input className="admin-input" value={draft.name} onChange={(event) => setField('name', event.target.value)} />
                </div>
                <div>
                  <label className="admin-label">Telefone</label>
                  <input className="admin-input" value={draft.phone} onChange={(event) => setField('phone', event.target.value)} />
                </div>
                <div>
                  <label className="admin-label">Email</label>
                  <input className="admin-input" value={draft.email} onChange={(event) => setField('email', event.target.value)} />
                </div>
                <div>
                  <label className="admin-label">CPF</label>
                  <input className="admin-input" value={draft.cpf} onChange={(event) => setField('cpf', event.target.value)} />
                </div>
                <div>
                  <label className="admin-label">Nascimento</label>
                  <input type="date" className="admin-input" value={draft.birthDate} onChange={(event) => setField('birthDate', event.target.value)} />
                </div>
                <div>
                  <label className="admin-label">Comissao base (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="admin-input"
                    value={draft.baseCommission}
                    onChange={(event) => setField('baseCommission', Number(event.target.value || 0))}
                  />
                </div>
                <div>
                  <label className="admin-label">Inicio jornada</label>
                  <input type="time" className="admin-input" value={draft.workStart} onChange={(event) => setField('workStart', event.target.value)} />
                </div>
                <div>
                  <label className="admin-label">Fim jornada</label>
                  <input type="time" className="admin-input" value={draft.workEnd} onChange={(event) => setField('workEnd', event.target.value)} />
                </div>
                <div className="collaborator-span-2">
                  <label className="admin-label">Endereco</label>
                  <input className="admin-input" value={draft.address} onChange={(event) => setField('address', event.target.value)} />
                </div>
                <div className="collaborator-span-2">
                  <label className="admin-label">Observacoes</label>
                  <textarea className="admin-input" rows={3} value={draft.notes} onChange={(event) => setField('notes', event.target.value)} />
                </div>
                <label className="collaborator-toggle">
                  <input type="checkbox" checked={draft.active} onChange={(event) => setField('active', event.target.checked)} />
                  <span>Colaborador ativo</span>
                </label>
              </div>
            </section>

            <aside className="collaborator-panel collaborator-panel-side">
              <div className="collaborator-score-card">
                <span className="collaborator-panel-kicker">Centro quantico</span>
                <h4>{draft.name || 'Novo colaborador'}</h4>
                <p>Use este painel para decidir categorias, servicos ativos e comissao individual por atendimento.</p>
              </div>

              <div className="collaborator-summary-grid">
                <div className="collaborator-summary-card">
                  <span>Categorias</span>
                  <strong>{enabledCategories}</strong>
                </div>
                <div className="collaborator-summary-card">
                  <span>Servicos ativos</span>
                  <strong>{enabledServices}</strong>
                </div>
                <div className="collaborator-summary-card">
                  <span>Comissao base</span>
                  <strong>{draft.baseCommission}%</strong>
                </div>
              </div>

              <div className="collaborator-meta-list">
                {draft.email && <span><Mail style={{ width: 12, height: 12 }} /> {draft.email}</span>}
                {draft.address && <span><MapPin style={{ width: 12, height: 12 }} /> {draft.address}</span>}
                {draft.birthDate && <span><CalendarDays style={{ width: 12, height: 12 }} /> {draft.birthDate}</span>}
              </div>
            </aside>
          </div>

          <section className="collaborator-panel collaborator-panel-matrix">
            <div className="collaborator-panel-head">
              <span className="collaborator-panel-kicker">Especialidades</span>
              <h4>Categorias e servicos com percentual por item</h4>
            </div>

            <div className="collaborator-category-grid">
              {draft.commissionProfile.map((category) => {
                const activeCount = category.services.filter((service) => service.active !== false).length;
                return (
                  <button
                    key={category.category}
                    type="button"
                    className={`collaborator-category-card ${category.enabled ? 'active' : ''}`}
                    onClick={() => toggleCategory(category.category)}
                  >
                    <span>{category.category}</span>
                    <strong>{activeCount} servicos</strong>
                  </button>
                );
              })}
            </div>

            <div className="collaborator-service-groups">
              {draft.commissionProfile.filter((category) => category.enabled).map((category) => (
                <div key={category.category} className="collaborator-service-group">
                  <div className="collaborator-service-group-head">
                    <div>
                      <span className="collaborator-panel-kicker">{category.category}</span>
                      <h5>{category.services.length} servicos configuraveis</h5>
                    </div>
                    <button type="button" className="admin-btn-outline" onClick={() => toggleCategory(category.category)}>
                      Remover categoria
                    </button>
                  </div>

                  <div className="collaborator-service-table">
                    {category.services.map((service) => (
                      <div key={`${category.category}-${service.serviceName}`} className="collaborator-service-row">
                        <label className="collaborator-service-toggle">
                          <input
                            type="checkbox"
                            checked={service.active !== false}
                            onChange={(event) => updateServiceRule(category.category, service.serviceName, { active: event.target.checked })}
                          />
                          <div>
                            <strong>{service.serviceName}</strong>
                            <span>{service.priceLabel || 'Sem valor de referencia'}</span>
                          </div>
                        </label>
                        <div className="collaborator-service-percent">
                          <Percent style={{ width: 12, height: 12 }} />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            className="admin-input"
                            value={service.commissionPercent}
                            onChange={(event) => updateServiceRule(category.category, service.serviceName, { commissionPercent: Number(event.target.value || 0) })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {draft.commissionProfile.every((category) => !category.enabled) && (
                <div className="collaborator-empty-state">
                  Escolha pelo menos uma categoria para montar a matriz de servicos e comissoes deste colaborador.
                </div>
              )}
            </div>
          </section>

          {error && <p className="settings-master-error">{error}</p>}
        </div>

        <div className="admin-modal-footer collaborator-modal-footer">
          {onDelete && (
            <button className="admin-btn-danger" onClick={onDelete} disabled={saving}>
              <Trash2 style={{ width: 14, height: 14 }} /> Excluir
            </button>
          )}
          <button className="admin-btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="admin-btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save style={{ width: 14, height: 14 }} /> {saving ? 'Salvando...' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfissionaisTab({
  profs,
  loading,
  showNewProf,
  setShowNewProf,
  selectedProf,
  setSelectedProf,
  editingProf,
  setEditingProf,
  serviceCatalog,
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
  serviceCatalog: ServiceCatalogCategory[];
  onCreateEntity: (entity: 'professionals', payload: Record<string, unknown>) => Promise<void>;
  onUpdateEntity: (entity: 'professionals', id: number, payload: Record<string, unknown>) => Promise<void>;
  onDeleteEntity: (entity: 'professionals', id: number, masterPassword?: string) => Promise<void>;
}) {
  const [newDraft, setNewDraft] = useState<CollaboratorDraft>(() => createEmptyCollaboratorDraft(serviceCatalog));
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!showNewProf) return;
    setNewDraft(createEmptyCollaboratorDraft(serviceCatalog));
    setModalError('');
  }, [serviceCatalog, showNewProf]);

  const collaborators = useMemo(
    () => profs.map((prof) => createCollaboratorDraft(prof, serviceCatalog)),
    [profs, serviceCatalog],
  );

  const editingDraft = useMemo(
    () => createCollaboratorDraft(editingProf, serviceCatalog),
    [editingProf, serviceCatalog],
  );

  const persistEditingDraft = (draft: CollaboratorDraft) => {
    const selectedId = selectedProf ? getCollaboratorId(selectedProf) : undefined;
    setEditingProf((current) => ({
      ...current,
      ...(selectedId ? { id: selectedId } : {}),
      ...serializeCollaboratorDraft(draft),
    }));
  };

  const handleOpenCollaborator = (prof: Record<string, unknown>) => {
    const draft = createCollaboratorDraft(prof, serviceCatalog);
    setSelectedProf(prof);
    setEditingProf({
      id: getCollaboratorId(prof),
      ...serializeCollaboratorDraft(draft),
    });
    setModalError('');
  };

  const handleCreateCollaborator = async () => {
    const payload = serializeCollaboratorDraft(newDraft);
    if (!toStringValue(payload.name).trim()) {
      setModalError('Informe o nome do colaborador.');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      await onCreateEntity('professionals', payload);
      setShowNewProf(false);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Erro ao criar colaborador.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCollaborator = async () => {
    const id = selectedProf ? toNumber(selectedProf.id) : 0;
    const payload = serializeCollaboratorDraft(editingDraft);
    if (!id) return;
    if (!toStringValue(payload.name).trim()) {
      setModalError('Informe o nome do colaborador.');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      await onUpdateEntity('professionals', id, payload);
      setSelectedProf(null);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Erro ao salvar colaborador.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCollaborator = () => {
    const id = selectedProf ? toNumber(selectedProf.id) : 0;
    if (!id) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteCollaborator = async (masterPassword?: string) => {
    const id = selectedProf ? toNumber(selectedProf.id) : 0;
    if (!id || !masterPassword) return;

    setSaving(true);
    try {
      await onDeleteEntity('professionals', id, masterPassword);
      setDeleteConfirmOpen(false);
      setSelectedProf(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Colaboradores ({profs.length})</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--admin-text-muted)' }}>Centro de organizacao por categoria, servico e comissao individual.</p>
        </div>
        <button onClick={() => setShowNewProf(true)} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus style={{ width: 14, height: 14 }} /> Cadastrar colaborador
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p>
      ) : (
        <div className="collaborator-card-grid">
          {collaborators.map((prof) => (
            <button key={prof.id} type="button" className={`collaborator-card ${prof.active ? 'active' : 'inactive'}`} onClick={() => {
              const raw = profs.find((row) => getCollaboratorId(row) === prof.id);
              if (raw) handleOpenCollaborator(raw);
            }}>
              <div className="collaborator-card-top">
                <div className="admin-avatar">{prof.name.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <p>{prof.name}</p>
                  <span>{prof.active ? 'Ativo' : 'Inativo'}</span>
                </div>
                <Sparkles style={{ width: 16, height: 16, marginLeft: 'auto', color: 'var(--admin-accent)' }} />
              </div>
              <div className="collaborator-card-stats">
                <div>
                  <span>Categorias</span>
                  <strong>{countCollaboratorCategories(prof)}</strong>
                </div>
                <div>
                  <span>Servicos</span>
                  <strong>{countCollaboratorServices(prof)}</strong>
                </div>
                <div>
                  <span>Base</span>
                  <strong>{prof.baseCommission}%</strong>
                </div>
              </div>
              <div className="collaborator-card-tags">
                {prof.commissionProfile.filter((category) => category.enabled).slice(0, 4).map((category) => (
                  <span key={category.category}>{category.category}</span>
                ))}
                {countCollaboratorCategories(prof) === 0 && <span>Sem categorias</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {showNewProf && (
        <CollaboratorEditorModal
          title="Novo colaborador"
          subtitle="Cadastre categorias, servicos e comissoes personalizadas para cada atendimento."
          draft={newDraft}
          saveLabel="Criar colaborador"
          saving={saving}
          error={modalError}
          onClose={() => setShowNewProf(false)}
          onSave={handleCreateCollaborator}
          onChange={(next) => setNewDraft(cloneDraft(next))}
        />
      )}

      {selectedProf && (
        <>
          <CollaboratorEditorModal
            title={editingDraft.name || 'Editar colaborador'}
            subtitle="Painel completo de especialidades, categorias e comissao por servico."
            draft={editingDraft}
            saveLabel="Salvar alteracoes"
            saving={saving}
            error={modalError}
            onClose={() => setSelectedProf(null)}
            onSave={handleSaveCollaborator}
            onDelete={handleDeleteCollaborator}
            onChange={(next) => persistEditingDraft(cloneDraft(next))}
          />
          <DangerConfirmModal
            isOpen={deleteConfirmOpen}
            title="Excluir colaborador"
            subtitle="O cadastro sera removido da central de operacao"
            description={`Digite EXCLUIR COLABORADOR para apagar ${editingDraft.name || 'este colaborador'} da base administrativa.`}
            confirmText="EXCLUIR COLABORADOR"
            confirmLabel="Excluir colaborador"
            helperText="A exclusao remove o colaborador do Supabase e encerra o cadastro operacional."
            requireMasterPassword
            passwordPlaceholder="Digite a senha master para excluir o colaborador"
            busy={saving}
            onClose={() => setDeleteConfirmOpen(false)}
            onConfirm={confirmDeleteCollaborator}
          />
        </>
      )}
    </div>
  );
}
