import { useState, type ReactNode } from 'react';
import { Check, Edit3, Loader2, RotateCcw, Star, Trash2 } from 'lucide-react';
import { toStringValue } from './AdminUtils';
import type { FieldConfig } from './AdminUtils';
import { FormField } from './FormField';

export function CrudTab({
  title,
  fields,
  rows,
  loading,
  onCreate,
  onUpdate,
  onDelete,
  rowActions,
  hideRecordsList = false,
}: {
  title: string;
  fields: FieldConfig[];
  rows: Record<string, unknown>[];
  loading: boolean;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: number, payload: Record<string, unknown>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  rowActions?: (row: Record<string, unknown>) => ReactNode;
  hideRecordsList?: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<Record<string, unknown>>({});

  const resetDraft = () => {
    setDraft({});
  };

  const handleCreate = async () => {
    await onCreate(draft);
    resetDraft();
  };

  const openEdit = (row: Record<string, unknown>) => {
    const id = Number(row.id || 0);
    if (!id) return;
    setEditingId(id);
    setEditingDraft(row);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await onUpdate(editingId, editingDraft);
    setEditingId(null);
    setEditingDraft({});
  };

  return (
    <div className="space-y-4">
      {!hideRecordsList && (
        <section className="agenda-command-center">
          <div className="agenda-command-top">
            <div className="agenda-command-copy">
              <h2>Gestão de {title}</h2>
              <p>Cadastre novos registros, consulte feedbacks e mantenha os dados atualizados.</p>
            </div>
          </div>

          <div className="agenda-command-bottom">
            <div className="agenda-toolbar-left">
              <div className="agenda-stat-grid">
                <div className="agenda-stat-card agenda-stat-wine">
                  <span>Total de registros</span>
                  <strong>{rows.length}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="admin-analytics-card" style={{ background: '#ffffff' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--admin-text)', margin: '0 0 12px' }}>
          Novo registro — {title}
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              {field.type !== 'checkbox' && <label className="admin-label">{field.label}</label>}
              <FormField
                field={field}
                value={draft[field.key]}
                onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => void handleCreate()} className="admin-btn-primary agenda-header-btn">
            <Check style={{ width: 14, height: 14 }} /> Salvar registro
          </button>
          <button onClick={resetDraft} className="admin-btn-outline agenda-header-btn">
            <RotateCcw style={{ width: 13, height: 13 }} /> Limpar
          </button>
        </div>
      </div>

      {!hideRecordsList && (
        <div className="admin-analytics-card" style={{ background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>
              Registros cadastrados ({rows.length})
            </h3>
          </div>
          {loading ? (
            <div className="agenda-loading-state">
              <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" /> Carregando registros...
            </div>
          ) : rows.length === 0 ? (
            <div className="agenda-empty-column">Nenhum registro encontrado.</div>
          ) : (
            <div className="historico-list">
              {rows.map((row) => {
                const id = Number(row.id || 0);
                const isEditing = editingId === id;
                const scoreVal = Number(row.score || 0);

                return (
                  <article key={id} className="historico-card">
                    {!isEditing ? (
                      <>
                        <div className="historico-card-top">
                          <span className="historico-badge historico-badge-completed">#{id}</span>
                          {scoreVal > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 800, color: 'var(--admin-wine)' }}>
                              <Star style={{ width: 13, height: 13, fill: 'var(--admin-wine)' }} /> {scoreVal}/5
                            </span>
                          )}
                        </div>

                        <div className="grid gap-2">
                          {fields.map((field) => (
                            <div key={field.key}>
                              <span style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--admin-text-muted)' }}>
                                {field.label}
                              </span>
                              <strong style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--admin-text)', marginTop: 1 }}>
                                {toStringValue(row[field.key]) || '—'}
                              </strong>
                            </div>
                          ))}
                        </div>

                        <div className="historico-card-actions">
                          <button onClick={() => openEdit(row)} className="admin-btn-outline historico-action-btn">
                            <Edit3 style={{ width: 12, height: 12 }} /> Editar
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Deseja remover este registro?')) {
                                void onDelete(id);
                              }
                            }}
                            className="admin-btn-outline historico-action-btn historico-delete-btn"
                          >
                            <Trash2 style={{ width: 12, height: 12 }} /> Excluir
                          </button>
                          {rowActions ? rowActions(row) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid gap-3">
                          {fields.map((field) => (
                            <div key={field.key} className="space-y-1">
                              {field.type !== 'checkbox' && <label className="admin-label">{field.label}</label>}
                              <FormField
                                field={field}
                                value={editingDraft[field.key]}
                                onChange={(value) => setEditingDraft((current) => ({ ...current, [field.key]: value }))}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="historico-card-actions">
                          <button onClick={() => void handleSaveEdit()} className="admin-btn-primary historico-action-btn">
                            Salvar alterações
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditingDraft({});
                            }}
                            className="admin-btn-outline historico-action-btn"
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
