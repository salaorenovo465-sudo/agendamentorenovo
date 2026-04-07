import { useState, type ReactNode } from 'react';
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
}: {
  title: string;
  fields: FieldConfig[];
  rows: Record<string, unknown>[];
  loading: boolean;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: number, payload: Record<string, unknown>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  rowActions?: (row: Record<string, unknown>) => ReactNode;
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
      <div className="admin-analytics-card">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 12 }}>Novo registro — {title}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              {field.type !== 'checkbox' && <label className="text-xs font-medium text-neutral-600">{field.label}</label>}
              <FormField
                field={field}
                value={draft[field.key]}
                onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => void handleCreate()} className="admin-btn-success" style={{ padding: '8px 16px' }}>
            Salvar
          </button>
          <button onClick={resetDraft} className="admin-btn-outline" style={{ padding: '8px 16px' }}>
            Limpar
          </button>
        </div>
      </div>

      <div className="admin-analytics-card">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 12 }}>Registros</h3>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Nenhum registro encontrado.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const id = Number(row.id || 0);
              const isEditing = editingId === id;

              return (
                <div key={id} className="admin-booking-card" style={{ padding: 14 }}>
                  {!isEditing ? (
                    <>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {fields.map((field) => (
                          <div key={field.key}>
                            <p className="text-[11px] font-semibold uppercase text-neutral-500">{field.label}</p>
                            <p className="text-sm text-neutral-800">{toStringValue(row[field.key]) || '-'}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => openEdit(row)} className="admin-btn-outline">
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Deseja remover este registro?')) {
                              void onDelete(id);
                            }
                          }}
                          className="admin-btn-danger"
                        >
                          Excluir
                        </button>
                        {rowActions ? rowActions(row) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        {fields.map((field) => (
                          <div key={field.key} className="space-y-1">
                            {field.type !== 'checkbox' && <label className="text-xs font-medium text-neutral-600">{field.label}</label>}
                            <FormField
                              field={field}
                              value={editingDraft[field.key]}
                              onChange={(value) => setEditingDraft((current) => ({ ...current, [field.key]: value }))}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => void handleSaveEdit()} className="admin-btn-success" style={{ padding: '8px 16px' }}>
                          Salvar alteracoes
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingDraft({});
                          }}
                          className="admin-btn-outline" style={{ padding: '8px 16px' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
