import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Eye, Flower2, Heart, Loader2, Palette, Plus, Scissors, Sparkles, Trash2, X, Zap } from 'lucide-react';

import { toast } from '../AdminHelpers';
import type { ServiceCatalogCategory, ServiceCatalogItem } from '../collaboratorUtils';

type PriceType = 'fixed' | 'from' | 'consult';
type EditorMode = 'create-category' | 'create-service' | 'edit-service';

type ServiceEditor = {
  mode: EditorMode;
  catIdx: number | null;
  itemIdx: number | null;
  serviceId?: number;
  category: string;
  name: string;
  priceType: PriceType;
  priceValue: string;
  desc: string;
  durationMin: string;
  active: boolean;
  persisted: boolean;
};

const resolveCategoryIcon = (categoryName: string) => {
  const normalized = categoryName.toLocaleLowerCase('pt-BR');

  if (normalized.includes('trat')) return Heart;
  if (normalized.includes('corte')) return Scissors;
  if (normalized.includes('color') || normalized.includes('mecha')) return Palette;
  if (normalized.includes('unha') || normalized.includes('spa')) return Flower2;
  if (normalized.includes('sobrancelha') || normalized.includes('cilio')) return Eye;
  if (normalized.includes('depila')) return Zap;
  return Sparkles;
};

const parsePriceToEdit = (price: string): { priceType: PriceType; priceValue: string } => {
  const normalized = price.toLocaleLowerCase('pt-BR');
  if (normalized.includes('sob consulta')) {
    return { priceType: 'consult', priceValue: '' };
  }

  if (normalized.includes('a partir de')) {
    const match = price.match(/[\d.,]+/);
    return { priceType: 'from', priceValue: match ? match[0].replace(/\./g, '').replace(',', '.') : '' };
  }

  const match = price.match(/[\d.,]+/);
  return { priceType: 'fixed', priceValue: match ? match[0].replace(/\./g, '').replace(',', '.') : '' };
};

const formatPriceLabel = (priceType: PriceType, priceValue: string): string => {
  if (priceType === 'consult') {
    return 'Sob consulta';
  }

  const amount = Number(priceValue || 0);
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0,00';

  return priceType === 'from' ? `a partir de R$ ${formatted}` : `R$ ${formatted}`;
};

const buildCreateCategoryEditor = (): ServiceEditor => ({
  mode: 'create-category',
  catIdx: null,
  itemIdx: null,
  category: '',
  name: '',
  priceType: 'fixed',
  priceValue: '',
  desc: '',
  durationMin: '60',
  active: true,
  persisted: false,
});

const buildCreateServiceEditor = (category: string, catIdx: number): ServiceEditor => ({
  mode: 'create-service',
  catIdx,
  itemIdx: null,
  category,
  name: '',
  priceType: 'fixed',
  priceValue: '',
  desc: '',
  durationMin: '60',
  active: true,
  persisted: false,
});

const buildEditServiceEditor = (
  category: string,
  catIdx: number,
  itemIdx: number,
  service: ServiceCatalogItem,
): ServiceEditor => {
  const parsedPrice = parsePriceToEdit(service.price);

  return {
    mode: 'edit-service',
    catIdx,
    itemIdx,
    serviceId: service.id,
    category,
    name: service.name,
    priceType: parsedPrice.priceType,
    priceValue: parsedPrice.priceValue,
    desc: service.desc || '',
    durationMin: service.durationMin ? String(service.durationMin) : '60',
    active: service.active ?? true,
    persisted: Boolean(service.persisted || service.id),
  };
};

const buildServicePayload = (editor: ServiceEditor): Record<string, unknown> => ({
  category: editor.category.trim(),
  name: editor.name.trim(),
  duration_min: Math.max(0, Number(editor.durationMin || 0)),
  price: editor.priceType === 'consult' ? 0 : Number(editor.priceValue || 0),
  description: editor.desc.trim(),
  active: editor.active,
});

export function ServicosTab({
  localServices,
  setLocalServices,
  loading,
  onCreateService,
  onUpdateService,
  onDeleteService,
}: {
  localServices: ServiceCatalogCategory[];
  setLocalServices: Dispatch<SetStateAction<ServiceCatalogCategory[]>>;
  loading: boolean;
  onCreateService: (payload: Record<string, unknown>) => Promise<void>;
  onUpdateService: (id: number, payload: Record<string, unknown>) => Promise<void>;
  onDeleteService: (id: number) => Promise<void>;
}) {
  const [editor, setEditor] = useState<ServiceEditor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const summary = useMemo(() => ({
    categories: localServices.length,
    services: localServices.reduce((total, category) => total + category.items.length, 0),
  }), [localServices]);

  const closeEditor = () => {
    if (submitting) return;
    setEditor(null);
    setModalError('');
  };

  const saveEditor = async () => {
    if (!editor || submitting) {
      return;
    }

    const category = editor.category.trim();
    const name = editor.name.trim();
    const durationMin = Number(editor.durationMin || 0);

    if (!category) {
      setModalError('Informe o nome da categoria.');
      return;
    }

    if (!name) {
      setModalError('Informe o nome do servico.');
      return;
    }

    if (editor.priceType !== 'consult') {
      const amount = Number(editor.priceValue);
      if (!Number.isFinite(amount) || amount < 0) {
        setModalError('Informe um valor valido para o servico.');
        return;
      }
    }

    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      setModalError('Informe a duracao em minutos.');
      return;
    }

    const payload = buildServicePayload(editor);
    setSubmitting(true);
    setModalError('');

    try {
      if (editor.mode === 'edit-service' && editor.serviceId) {
        await onUpdateService(editor.serviceId, payload);
        toast.success('Servico atualizado com sucesso.');
        closeEditor();
        return;
      }

      if (editor.mode === 'create-category' || editor.mode === 'create-service') {
        await onCreateService(payload);
        toast.success(editor.mode === 'create-category' ? 'Categoria criada com o primeiro servico.' : 'Servico adicionado a categoria.');
        closeEditor();
        return;
      }

      if (editor.mode === 'edit-service' && editor.catIdx !== null && editor.itemIdx !== null) {
        const nextPrice = formatPriceLabel(editor.priceType, editor.priceValue);
        setLocalServices((current) => current.map((categoryEntry, categoryIndex) => {
          if (categoryIndex !== editor.catIdx) {
            return categoryEntry;
          }

          return {
            ...categoryEntry,
            items: categoryEntry.items.map((serviceEntry, serviceIndex) => (
              serviceIndex === editor.itemIdx
                ? {
                    ...serviceEntry,
                    name,
                    price: nextPrice,
                    desc: editor.desc.trim(),
                    durationMin,
                    active: editor.active,
                  }
                : serviceEntry
            )),
          };
        }));
        toast.success('Servico ajustado localmente nesta sessao.');
        closeEditor();
      }
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Nao foi possivel salvar o servico.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editor?.serviceId || submitting) {
      return;
    }

    if (!window.confirm(`Remover o servico "${editor.name}" do catalogo?`)) {
      return;
    }

    setSubmitting(true);
    setModalError('');

    try {
      await onDeleteService(editor.serviceId);
      toast.success('Servico removido do catalogo.');
      closeEditor();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Nao foi possivel remover o servico.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="admin-analytics-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 900, color: 'var(--admin-accent)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Catalogo operacional</p>
          <h3 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--admin-text)' }}>Categorias e servicos do salao</h3>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--admin-text-muted)', lineHeight: 1.55 }}>
            Crie novas categorias ja com o primeiro servico e adicione novos servicos dentro de cada bloco.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)', minWidth: 120 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Categorias</span>
            <strong style={{ display: 'block', marginTop: 4, fontSize: 20, color: 'var(--admin-text)' }}>{summary.categories}</strong>
          </div>
          <div style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)', minWidth: 120 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Servicos</span>
            <strong style={{ display: 'block', marginTop: 4, fontSize: 20, color: 'var(--admin-text)' }}>{summary.services}</strong>
          </div>
          <button className="admin-btn-primary" onClick={() => setEditor(buildCreateCategoryEditor())} disabled={loading} style={{ padding: '11px 16px' }}>
            {loading ? <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> : <Plus style={{ width: 15, height: 15 }} />}
            Nova categoria
          </button>
        </div>
      </section>

      {localServices.length === 0 ? (
        <div className="admin-analytics-card">
          <div className="admin-empty-state">
            <p style={{ margin: 0 }}>Nenhuma categoria cadastrada ainda.</p>
          </div>
        </div>
      ) : (
        localServices.map((category, catIdx) => {
          const IconComp = resolveCategoryIcon(category.category);
          return (
            <section key={`${category.category}-${catIdx}`} className="admin-analytics-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18, paddingBottom: 12, borderBottom: '1.5px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--admin-accent-glow)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <IconComp style={{ width: 19, height: 19, color: 'var(--admin-accent)' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--admin-accent)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{category.category}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--admin-text-muted)' }}>{category.items.length} {category.items.length === 1 ? 'servico' : 'servicos'} nesta categoria</p>
                  </div>
                </div>
                <button className="admin-btn-outline" onClick={() => setEditor(buildCreateServiceEditor(category.category, catIdx))} disabled={loading} style={{ padding: '10px 14px' }}>
                  <Plus style={{ width: 14, height: 14 }} />
                  Adicionar servico
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {category.items.map((service, itemIdx) => (
                  <button
                    key={`${category.category}-${service.id ?? service.name}-${itemIdx}`}
                    type="button"
                    onClick={() => setEditor(buildEditServiceEditor(category.category, catIdx, itemIdx, service))}
                    className="admin-btn-outline"
                    style={{
                      padding: 0,
                      borderRadius: 'var(--admin-radius-sm)',
                      textAlign: 'left',
                      background: 'var(--admin-surface-2)',
                      display: 'block',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(58,10,30,0.08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <IconComp style={{ width: 20, height: 20, color: 'var(--admin-accent)' }} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--admin-text)', lineHeight: 1.35 }}>{service.name}</p>
                            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--admin-text-muted)', lineHeight: 1.5 }}>
                              {service.desc || 'Sem descricao detalhada por enquanto.'}
                            </p>
                          </div>
                        </div>
                        <span style={{
                          flexShrink: 0,
                          padding: '5px 10px',
                          borderRadius: 999,
                          fontSize: 10.5,
                          fontWeight: 900,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          background: service.active === false ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                          color: service.active === false ? '#b91c1c' : '#047857',
                        }}>
                          {service.active === false ? 'Inativo' : 'Ativo'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ padding: '8px 12px', borderRadius: 12, background: 'var(--admin-bg)', fontSize: 13, fontWeight: 800, color: 'var(--admin-accent)' }}>
                          {service.price}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid var(--admin-border)', background: '#fff', fontSize: 11.5, fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                            {service.durationMin || 60} min
                          </span>
                          <span style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid var(--admin-border)', background: '#fff', fontSize: 11.5, fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                            {service.persisted || service.id ? 'Persistido' : 'Padrao local'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })
      )}

      {editor && (
        <div className="admin-modal-root" style={{ zIndex: 1400 }}>
          <div className="admin-modal-overlay" onClick={closeEditor} />
          <div className="admin-modal-card" role="dialog" aria-modal="true" style={{ maxWidth: 560 }}>
            <div className="admin-modal-header">
              <div className="admin-modal-title-row">
                <div className="admin-modal-icon admin-modal-icon-gold">
                  {editor.mode === 'edit-service' ? <Sparkles style={{ width: 18, height: 18, color: 'var(--admin-accent)' }} /> : <Plus style={{ width: 18, height: 18, color: 'var(--admin-accent)' }} />}
                </div>
                <div>
                  <h3 className="admin-modal-title">
                    {editor.mode === 'create-category' && 'Nova categoria'}
                    {editor.mode === 'create-service' && 'Novo servico'}
                    {editor.mode === 'edit-service' && 'Editar servico'}
                  </h3>
                  <p className="admin-modal-subtitle">
                    {editor.mode === 'create-category' && 'A categoria nasce junto com o primeiro servico do catalogo.'}
                    {editor.mode === 'create-service' && `Novo servico dentro de ${editor.category}.`}
                    {editor.mode === 'edit-service' && 'Ajuste nome, valor, descricao e duracao do servico.'}
                  </p>
                </div>
              </div>
              <button className="admin-btn-outline" onClick={closeEditor} disabled={submitting} style={{ padding: 6 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div style={{ display: 'grid', gap: 16 }}>
                {editor.mode === 'edit-service' && !editor.persisted && (
                  <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(212,175,55,0.24)', background: 'rgba(212,175,55,0.08)', fontSize: 12.5, fontWeight: 700, color: 'var(--admin-text-muted)', lineHeight: 1.5 }}>
                    Este servico veio do catalogo padrao local. Se voce salvar, a alteracao vale nesta sessao. Para persistir de forma oficial, prefira criar um novo servico ou editar um item ja persistido.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="admin-label">Categoria</label>
                    <input
                      className="admin-input"
                      value={editor.category}
                      onChange={(event) => setEditor((current) => current ? { ...current, category: event.target.value } : null)}
                      disabled={editor.mode !== 'create-category'}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="admin-label">Nome do servico</label>
                    <input
                      className="admin-input"
                      value={editor.name}
                      onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : null)}
                    />
                  </div>

                  <div>
                    <label className="admin-label">Tipo de preco</label>
                    <select
                      className="admin-input"
                      value={editor.priceType}
                      onChange={(event) => setEditor((current) => current ? { ...current, priceType: event.target.value as PriceType } : null)}
                    >
                      <option value="fixed">Valor fixo</option>
                      <option value="from">A partir de</option>
                      <option value="consult">Sob consulta</option>
                    </select>
                  </div>

                  <div>
                    <label className="admin-label">Duracao (min)</label>
                    <input
                      className="admin-input"
                      type="number"
                      min="5"
                      step="5"
                      value={editor.durationMin}
                      onChange={(event) => setEditor((current) => current ? { ...current, durationMin: event.target.value } : null)}
                    />
                  </div>

                  {editor.priceType !== 'consult' && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="admin-label">Valor em reais</label>
                      <input
                        className="admin-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Ex: 149.90"
                        value={editor.priceValue}
                        onChange={(event) => setEditor((current) => current ? { ...current, priceValue: event.target.value } : null)}
                      />
                    </div>
                  )}

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="admin-label">Descricao</label>
                    <textarea
                      className="admin-input"
                      rows={4}
                      value={editor.desc}
                      onChange={(event) => setEditor((current) => current ? { ...current, desc: event.target.value } : null)}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: 'var(--admin-text)' }}>
                  <input
                    type="checkbox"
                    checked={editor.active}
                    onChange={(event) => setEditor((current) => current ? { ...current, active: event.target.checked } : null)}
                  />
                  Servico ativo para uso no catalogo
                </label>

                <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)' }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 900, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pre-visualizacao</span>
                  <strong style={{ display: 'block', marginTop: 8, fontSize: 16, color: 'var(--admin-text)' }}>{editor.name || 'Novo servico'}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--admin-text-muted)' }}>{editor.desc || 'Sem descricao por enquanto.'}</p>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '7px 12px', borderRadius: 999, background: '#fff', border: '1px solid var(--admin-border)', fontSize: 12.5, fontWeight: 800, color: 'var(--admin-accent)' }}>
                      {formatPriceLabel(editor.priceType, editor.priceValue)}
                    </span>
                    <span style={{ padding: '7px 12px', borderRadius: 999, background: '#fff', border: '1px solid var(--admin-border)', fontSize: 12, fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                      {editor.durationMin || '0'} min
                    </span>
                    <span style={{ padding: '7px 12px', borderRadius: 999, background: '#fff', border: '1px solid var(--admin-border)', fontSize: 12, fontWeight: 700, color: editor.active ? '#047857' : '#b91c1c' }}>
                      {editor.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>

                {modalError && <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{modalError}</p>}
              </div>
            </div>

            <div className="admin-modal-footer" style={{ justifyContent: editor.serviceId ? 'space-between' : 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {editor.serviceId && (
                  <button className="admin-btn-danger" onClick={() => { void handleDelete(); }} disabled={submitting}>
                    {submitting ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Trash2 style={{ width: 14, height: 14 }} />}
                    Remover
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="admin-btn-outline" onClick={closeEditor} disabled={submitting}>Cancelar</button>
                <button className="admin-btn-primary" onClick={() => { void saveEditor(); }} disabled={submitting || loading}>
                  {(submitting || loading) ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : null}
                  {editor.mode === 'create-category' && 'Criar categoria'}
                  {editor.mode === 'create-service' && 'Adicionar servico'}
                  {editor.mode === 'edit-service' && (editor.persisted ? 'Salvar servico' : 'Salvar nesta sessao')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
