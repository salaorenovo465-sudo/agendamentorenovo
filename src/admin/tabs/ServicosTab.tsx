import { useMemo, useState } from 'react';
import { Eye, Flower2, Heart, Loader2, Lock, Palette, Plus, Scissors, Sparkles, Trash2, WandSparkles, X, Zap } from 'lucide-react';

import { toast } from '../AdminHelpers';
import type { ServiceCatalogCategory, ServiceCatalogItem } from '../collaboratorUtils';

type PriceType = 'fixed' | 'from' | 'consult';
type CategoryMode = 'existing' | 'new';
type EditorMode = 'create' | 'edit';

type ServiceEditor = {
  mode: EditorMode;
  catIdx: number | null;
  itemIdx: number | null;
  serviceId?: number;
  persisted: boolean;
  categoryMode: CategoryMode;
  selectedCategory: string;
  newCategory: string;
  name: string;
  priceType: PriceType;
  priceValue: string;
  desc: string;
  durationMin: string;
  active: boolean;
};

type DeleteIntent =
  | {
      kind: 'service';
      name: string;
      serviceId?: number;
      catIdx: number;
      itemIdx: number;
    }
  | {
      kind: 'category';
      categoryName: string;
      serviceIds: number[];
      serviceCount: number;
      catIdx: number;
    };

const cloneCatalog = (catalog: ServiceCatalogCategory[]): ServiceCatalogCategory[] =>
  catalog.map((category) => ({
    ...category,
    items: category.items.map((item) => ({ ...item })),
  }));

const normalizeCatalogKey = (value: string): string => value.trim().toLocaleLowerCase('pt-BR');

const resolveCategoryIcon = (categoryName: string) => {
  const normalized = normalizeCatalogKey(categoryName);

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

const buildCreateEditor = (categories: ServiceCatalogCategory[], preferredCategory?: string): ServiceEditor => {
  const hasPreferredCategory = Boolean(preferredCategory && categories.some((entry) => entry.category === preferredCategory));

  return {
    mode: 'create',
    catIdx: null,
    itemIdx: null,
    persisted: false,
    categoryMode: hasPreferredCategory || categories.length > 0 ? 'existing' : 'new',
    selectedCategory: hasPreferredCategory ? preferredCategory || '' : categories[0]?.category || '',
    newCategory: hasPreferredCategory ? '' : '',
    name: '',
    priceType: 'fixed',
    priceValue: '',
    desc: '',
    durationMin: '60',
    active: true,
  };
};

const buildEditEditor = (
  categoryName: string,
  catIdx: number,
  itemIdx: number,
  service: ServiceCatalogItem,
): ServiceEditor => {
  const parsedPrice = parsePriceToEdit(service.price);

  return {
    mode: 'edit',
    catIdx,
    itemIdx,
    serviceId: service.id,
    persisted: Boolean(service.persisted || service.id),
    categoryMode: 'existing',
    selectedCategory: categoryName,
    newCategory: '',
    name: service.name,
    priceType: parsedPrice.priceType,
    priceValue: parsedPrice.priceValue,
    desc: service.desc || '',
    durationMin: service.durationMin ? String(service.durationMin) : '60',
    active: service.active ?? true,
  };
};

const resolveEditorCategory = (editor: ServiceEditor): string =>
  (editor.categoryMode === 'new' ? editor.newCategory : editor.selectedCategory).trim();

const buildServicePayload = (editor: ServiceEditor): Record<string, unknown> => ({
  category: resolveEditorCategory(editor),
  name: editor.name.trim(),
  duration_min: Math.max(5, Number(editor.durationMin || 0)),
  price: editor.priceType === 'consult' ? 0 : Number(editor.priceValue || 0),
  description: editor.desc.trim(),
  active: editor.active,
});

const normalizeCatalog = (catalog: ServiceCatalogCategory[]): ServiceCatalogCategory[] =>
  catalog
    .filter((category) => category.items.length > 0)
    .map((category) => ({
      ...category,
      items: [...category.items].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
    }))
    .sort((left, right) => left.category.localeCompare(right.category, 'pt-BR'));

const upsertCatalogService = (
  catalog: ServiceCatalogCategory[],
  categoryName: string,
  service: ServiceCatalogItem,
): ServiceCatalogCategory[] => {
  const nextCatalog = cloneCatalog(catalog);
  const normalizedCategory = normalizeCatalogKey(categoryName);
  let category = nextCatalog.find((entry) => normalizeCatalogKey(entry.category) === normalizedCategory);

  if (!category) {
    category = { category: categoryName, items: [] };
    nextCatalog.push(category);
  }

  category.items.push(service);
  return normalizeCatalog(nextCatalog);
};

const applyEditorToCatalog = (
  catalog: ServiceCatalogCategory[],
  editor: ServiceEditor,
): ServiceCatalogCategory[] => {
  const categoryName = resolveEditorCategory(editor);
  const nextService: ServiceCatalogItem = {
    id: editor.serviceId,
    name: editor.name.trim(),
    price: formatPriceLabel(editor.priceType, editor.priceValue),
    desc: editor.desc.trim(),
    durationMin: Math.max(5, Number(editor.durationMin || 0)),
    active: editor.active,
    persisted: editor.persisted,
  };

  if (editor.mode === 'create') {
    return upsertCatalogService(catalog, categoryName, nextService);
  }

  const nextCatalog = cloneCatalog(catalog);
  if (editor.catIdx !== null && editor.itemIdx !== null && nextCatalog[editor.catIdx]?.items[editor.itemIdx]) {
    nextCatalog[editor.catIdx].items.splice(editor.itemIdx, 1);
  }

  return upsertCatalogService(nextCatalog, categoryName, nextService);
};

const removeServiceFromCatalog = (
  catalog: ServiceCatalogCategory[],
  catIdx: number,
  itemIdx: number,
): ServiceCatalogCategory[] => {
  const nextCatalog = cloneCatalog(catalog);
  if (nextCatalog[catIdx]?.items[itemIdx]) {
    nextCatalog[catIdx].items.splice(itemIdx, 1);
  }

  return normalizeCatalog(nextCatalog);
};

export function ServicosTab({
  localServices,
  loading,
  managedCatalog,
  onCreateService,
  onUpdateService,
  onDeleteService,
  onDeleteCategory,
  onBootstrapCatalog,
  onVerifyMasterPassword,
}: {
  localServices: ServiceCatalogCategory[];
  loading: boolean;
  managedCatalog: boolean;
  onCreateService: (payload: Record<string, unknown>) => Promise<void>;
  onUpdateService: (id: number, payload: Record<string, unknown>) => Promise<void>;
  onDeleteService: (id: number, masterPassword: string) => Promise<void>;
  onDeleteCategory: (serviceIds: number[], masterPassword: string) => Promise<void>;
  onBootstrapCatalog: (catalog: ServiceCatalogCategory[]) => Promise<void>;
  onVerifyMasterPassword: (password: string) => Promise<boolean>;
}) {
  const [editor, setEditor] = useState<ServiceEditor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const categoryNames = useMemo(
    () => localServices.map((category) => category.category),
    [localServices],
  );
  const summary = useMemo(() => ({
    categories: localServices.length,
    services: localServices.reduce((total, category) => total + category.items.length, 0),
    persisted: localServices.reduce((total, category) => total + category.items.filter((service) => service.persisted || service.id).length, 0),
  }), [localServices]);

  const closeEditor = (force = false) => {
    if (submitting && !force) return;
    setEditor(null);
    setModalError('');
  };

  const closeDeleteDialog = (force = false) => {
    if (deleteSubmitting && !force) return;
    setDeleteIntent(null);
    setDeletePassword('');
    setDeleteError('');
  };

  const openCreateEditor = (preferredCategory?: string) => {
    setModalError('');
    setEditor(buildCreateEditor(localServices, preferredCategory));
  };

  const validateEditor = (current: ServiceEditor): string => {
    const categoryName = resolveEditorCategory(current);
    if (!categoryName) {
      return 'Informe ou selecione a categoria.';
    }

    if (current.categoryMode === 'new') {
      const duplicatedCategory = categoryNames.some((category) => normalizeCatalogKey(category) === normalizeCatalogKey(categoryName));
      if (duplicatedCategory && (current.mode === 'create' || normalizeCatalogKey(current.selectedCategory) !== normalizeCatalogKey(categoryName))) {
        return 'Ja existe uma categoria com esse nome.';
      }
    }

    if (!current.name.trim()) {
      return 'Informe o nome do servico.';
    }

    if (current.priceType !== 'consult') {
      const amount = Number(current.priceValue);
      if (!Number.isFinite(amount) || amount < 0) {
        return 'Informe um valor valido para o servico.';
      }
    }

    const durationMin = Number(current.durationMin || 0);
    if (!Number.isFinite(durationMin) || durationMin < 5) {
      return 'Informe uma duracao valida em minutos.';
    }

    return '';
  };

  const saveEditor = async () => {
    if (!editor || submitting) {
      return;
    }

    const validationError = validateEditor(editor);
    if (validationError) {
      setModalError(validationError);
      return;
    }

    const payload = buildServicePayload(editor);
    const nextCatalog = applyEditorToCatalog(localServices, editor);

    setSubmitting(true);
    setModalError('');

    try {
      if (!managedCatalog) {
        await onBootstrapCatalog(nextCatalog);
        toast.success(editor.mode === 'create' ? 'Catalogo quantico ativado com o novo servico.' : 'Catalogo quantico ativado com a atualizacao do servico.');
        closeEditor(true);
        return;
      }

      if (editor.mode === 'edit' && editor.serviceId) {
        await onUpdateService(editor.serviceId, payload);
        toast.success('Servico atualizado com sucesso.');
        closeEditor(true);
        return;
      }

      await onCreateService(payload);
      toast.success('Servico adicionado ao catalogo.');
      closeEditor(true);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Nao foi possivel salvar o servico.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteServiceDialog = () => {
    if (!editor || submitting || deleteSubmitting || editor.catIdx === null || editor.itemIdx === null) {
      return;
    }

    setDeleteError('');
    setDeletePassword('');
    setDeleteIntent({
      kind: 'service',
      name: editor.name,
      serviceId: editor.serviceId,
      catIdx: editor.catIdx,
      itemIdx: editor.itemIdx,
    });
  };

  const openDeleteCategoryDialog = (category: ServiceCatalogCategory, catIdx: number) => {
    if (deleteIntent || deleteSubmitting || submitting) {
      return;
    }

    setDeleteError('');
    setDeletePassword('');
    setDeleteIntent({
      kind: 'category',
      categoryName: category.category,
      serviceIds: category.items
        .map((service) => service.id)
        .filter((value): value is number => typeof value === 'number'),
      serviceCount: category.items.length,
      catIdx,
    });
  };

  const confirmDeleteIntent = async () => {
    if (!deleteIntent || deleteSubmitting) {
      return;
    }

    const password = deletePassword.trim();
    if (!password) {
      setDeleteError('Digite a senha master para confirmar a exclusao.');
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError('');

    try {
      const allowed = await onVerifyMasterPassword(password);
      if (!allowed) {
        setDeleteError('Senha master invalida.');
        return;
      }

      if (deleteIntent.kind === 'service') {
        if (!managedCatalog) {
          const nextCatalog = removeServiceFromCatalog(localServices, deleteIntent.catIdx, deleteIntent.itemIdx);
          await onBootstrapCatalog(nextCatalog);
          toast.success('Servico removido e catalogo persistido no Supabase.');
          closeEditor(true);
          closeDeleteDialog(true);
          return;
        }

        if (!deleteIntent.serviceId) {
          setDeleteError('Este servico ainda nao possui identificador persistido para exclusao.');
          return;
        }

        await onDeleteService(deleteIntent.serviceId, password);
        toast.success('Servico removido do catalogo e do Supabase.');
        closeEditor(true);
        closeDeleteDialog(true);
        return;
      }

      if (!managedCatalog) {
        const nextCatalog = normalizeCatalog(localServices.filter((_, index) => index !== deleteIntent.catIdx));
        await onBootstrapCatalog(nextCatalog);
        toast.success('Categoria removida e catalogo persistido no Supabase.');
        closeDeleteDialog(true);
        return;
      }

      if (deleteIntent.serviceIds.length === 0) {
        setDeleteError('Esta categoria nao possui servicos persistidos para exclusao.');
        return;
      }

      await onDeleteCategory(deleteIntent.serviceIds, password);
      toast.success('Categoria removida com todos os servicos associados no Supabase.');
      closeDeleteDialog(true);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Nao foi possivel concluir a exclusao.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const editorCategoryName = editor ? resolveEditorCategory(editor) : '';
  const editorPreviewPrice = editor ? formatPriceLabel(editor.priceType, editor.priceValue) : 'Sob consulta';
  const deletionLocked = deleteSubmitting || Boolean(deleteIntent);
  const deleteIntentLabel = deleteIntent?.kind === 'service'
    ? deleteIntent.name
    : deleteIntent?.categoryName || '';

  return (
    <div className="space-y-6">
      <section className="admin-analytics-card" style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 900, color: 'var(--admin-accent)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Orquestrador quantico</p>
            <h3 style={{ margin: '6px 0 0', fontSize: 21, fontWeight: 900, color: 'var(--admin-text)' }}>Arquitetura de categorias e servicos</h3>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--admin-text-muted)', lineHeight: 1.55 }}>
              Cadastre servicos escolhendo categoria existente ou criando uma nova, com exclusao completa de servicos e categorias.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="admin-btn-outline" onClick={() => openCreateEditor()} disabled={loading || submitting || deletionLocked} style={{ padding: '11px 16px' }}>
              <WandSparkles style={{ width: 15, height: 15 }} />
              Novo servico
            </button>
            <button
              className="admin-btn-primary"
              onClick={() => {
                const editorState = buildCreateEditor(localServices);
                setEditor({ ...editorState, categoryMode: 'new', selectedCategory: '', newCategory: '' });
              }}
              disabled={loading || submitting || deletionLocked}
              style={{ padding: '11px 16px' }}
            >
              <Plus style={{ width: 15, height: 15 }} />
              Nova categoria
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <div style={{ padding: '12px 14px', borderRadius: 16, border: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)' }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 900, color: 'var(--admin-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Categorias</span>
            <strong style={{ display: 'block', marginTop: 4, fontSize: 22, color: 'var(--admin-text)' }}>{summary.categories}</strong>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 16, border: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)' }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 900, color: 'var(--admin-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Servicos</span>
            <strong style={{ display: 'block', marginTop: 4, fontSize: 22, color: 'var(--admin-text)' }}>{summary.services}</strong>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 16, border: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)' }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 900, color: 'var(--admin-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Persistidos</span>
            <strong style={{ display: 'block', marginTop: 4, fontSize: 22, color: 'var(--admin-text)' }}>{summary.persisted}</strong>
          </div>
          <div style={{
            padding: '12px 14px',
            borderRadius: 16,
            border: managedCatalog ? '1px solid rgba(16,185,129,0.22)' : '1px solid rgba(212,175,55,0.24)',
            background: managedCatalog ? 'rgba(16,185,129,0.08)' : 'rgba(212,175,55,0.08)',
          }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 900, color: 'var(--admin-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Modo</span>
            <strong style={{ display: 'block', marginTop: 4, fontSize: 18, color: managedCatalog ? '#047857' : 'var(--admin-accent)' }}>
              {managedCatalog ? 'Quantico gerenciado' : 'Catalogo base'}
            </strong>
          </div>
        </div>

        <div style={{
          padding: '14px 16px',
          borderRadius: 16,
          border: managedCatalog ? '1px solid rgba(16,185,129,0.22)' : '1px solid rgba(212,175,55,0.24)',
          background: managedCatalog
            ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))'
            : 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(58,10,30,0.05))',
        }}>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--admin-text-muted)', fontWeight: 700 }}>
            {managedCatalog
              ? 'Todas as operacoes agora usam o catalogo persistido do backend. Excluir categoria remove todos os servicos dela.'
              : 'O catalogo ainda esta na base padrao. Na primeira alteracao estrutural, o sistema migra o snapshot atual para o modo quantico gerenciado.'}
          </p>
        </div>
      </section>

      {localServices.length === 0 ? (
        <section className="admin-analytics-card">
          <div className="admin-empty-state">
            <p style={{ margin: 0 }}>Nenhuma categoria cadastrada. Use "Novo servico" para iniciar um catalogo do zero.</p>
          </div>
        </section>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button className="admin-btn-outline" onClick={() => openCreateEditor(category.category)} disabled={loading || submitting || deletionLocked} style={{ padding: '10px 14px' }}>
                    <Plus style={{ width: 14, height: 14 }} />
                    Adicionar servico
                  </button>
                  <button
                    className="admin-btn-danger"
                    onClick={() => openDeleteCategoryDialog(category, catIdx)}
                    disabled={loading || submitting || deletionLocked}
                    style={{ padding: '10px 14px' }}
                  >
                    {deleteSubmitting && deleteIntent?.kind === 'category' && deleteIntent.categoryName === category.category
                      ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                      : <Trash2 style={{ width: 14, height: 14 }} />}
                    Excluir categoria
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {category.items.map((service, itemIdx) => (
                  <button
                    key={`${category.category}-${service.id ?? service.name}-${itemIdx}`}
                    type="button"
                    onClick={() => {
                      setModalError('');
                      setEditor(buildEditEditor(category.category, catIdx, itemIdx, service));
                    }}
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
                            {service.persisted || service.id ? 'Persistido' : 'Base local'}
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
          <div className="admin-modal-overlay" onClick={() => closeEditor()} />
          <div className="admin-modal-card" role="dialog" aria-modal="true" style={{ maxWidth: 620 }}>
            <div className="admin-modal-header">
              <div className="admin-modal-title-row">
                <div className="admin-modal-icon admin-modal-icon-gold">
                  {editor.mode === 'edit' ? <Sparkles style={{ width: 18, height: 18, color: 'var(--admin-accent)' }} /> : <WandSparkles style={{ width: 18, height: 18, color: 'var(--admin-accent)' }} />}
                </div>
                <div>
                  <h3 className="admin-modal-title">{editor.mode === 'create' ? 'Novo servico quantico' : 'Editar servico quantico'}</h3>
                  <p className="admin-modal-subtitle">
                    {editor.mode === 'create'
                      ? 'Escolha uma categoria existente ou abra uma nova categoria dentro do mesmo fluxo.'
                      : 'Ajuste o servico, mova para outra categoria ou crie uma categoria nova para ele.'}
                  </p>
                </div>
              </div>
              <button className="admin-btn-outline" onClick={() => closeEditor()} disabled={submitting} style={{ padding: 6 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div style={{ display: 'grid', gap: 16 }}>
                {!managedCatalog && (
                  <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(212,175,55,0.24)', background: 'rgba(212,175,55,0.08)', fontSize: 12.5, fontWeight: 700, color: 'var(--admin-text-muted)', lineHeight: 1.55 }}>
                    Esta acao vai migrar o catalogo atual para o modo quantico gerenciado, tornando as alteracoes persistentes e liberando exclusao real de categorias e servicos.
                  </div>
                )}

                <div style={{ display: 'grid', gap: 10 }}>
                  <span className="admin-label" style={{ marginBottom: 0 }}>Destino da categoria</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={editor.categoryMode === 'existing' ? 'admin-btn-primary' : 'admin-btn-outline'}
                      onClick={() => setEditor((current) => {
                        if (!current) return null;
                        return {
                          ...current,
                          categoryMode: 'existing',
                          selectedCategory: current.selectedCategory || categoryNames[0] || '',
                        };
                      })}
                      disabled={categoryNames.length === 0}
                    >
                      Categoria existente
                    </button>
                    <button
                      type="button"
                      className={editor.categoryMode === 'new' ? 'admin-btn-primary' : 'admin-btn-outline'}
                      onClick={() => setEditor((current) => current ? { ...current, categoryMode: 'new' } : null)}
                    >
                      Criar nova categoria
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  {editor.categoryMode === 'existing' ? (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="admin-label">Categoria existente</label>
                      <select
                        className="admin-input"
                        value={editor.selectedCategory}
                        onChange={(event) => setEditor((current) => current ? { ...current, selectedCategory: event.target.value } : null)}
                      >
                        <option value="">Selecione</option>
                        {categoryNames.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="admin-label">Nova categoria</label>
                      <input
                        className="admin-input"
                        value={editor.newCategory}
                        onChange={(event) => setEditor((current) => current ? { ...current, newCategory: event.target.value } : null)}
                        placeholder="Ex: Terapias Capilares Avancadas"
                      />
                    </div>
                  )}

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
                        value={editor.priceValue}
                        onChange={(event) => setEditor((current) => current ? { ...current, priceValue: event.target.value } : null)}
                        placeholder="Ex: 149.90"
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
                  Servico ativo para operacao, agenda e catalogo
                </label>

                <div style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)' }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 900, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview quantico</span>
                  <strong style={{ display: 'block', marginTop: 8, fontSize: 16, color: 'var(--admin-text)' }}>{editor.name || 'Novo servico'}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--admin-text-muted)' }}>{editor.desc || 'Sem descricao por enquanto.'}</p>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '7px 12px', borderRadius: 999, background: '#fff', border: '1px solid var(--admin-border)', fontSize: 12.5, fontWeight: 800, color: 'var(--admin-accent)' }}>
                      {editorPreviewPrice}
                    </span>
                    <span style={{ padding: '7px 12px', borderRadius: 999, background: '#fff', border: '1px solid var(--admin-border)', fontSize: 12, fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                      {editor.durationMin || '0'} min
                    </span>
                    <span style={{ padding: '7px 12px', borderRadius: 999, background: '#fff', border: '1px solid var(--admin-border)', fontSize: 12, fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                      {editorCategoryName || 'Categoria pendente'}
                    </span>
                    <span style={{ padding: '7px 12px', borderRadius: 999, background: '#fff', border: '1px solid var(--admin-border)', fontSize: 12, fontWeight: 700, color: editor.active ? '#047857' : '#b91c1c' }}>
                      {editor.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>

                {modalError && <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{modalError}</p>}
              </div>
            </div>

            <div className="admin-modal-footer" style={{ justifyContent: editor.mode === 'edit' ? 'space-between' : 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {editor.mode === 'edit' && (
                  <button className="admin-btn-danger" onClick={openDeleteServiceDialog} disabled={submitting || deletionLocked}>
                    {deleteSubmitting && deleteIntent?.kind === 'service'
                      ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                      : <Trash2 style={{ width: 14, height: 14 }} />}
                    Excluir servico
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="admin-btn-outline" onClick={() => closeEditor()} disabled={submitting}>Cancelar</button>
                <button className="admin-btn-primary" onClick={() => { void saveEditor(); }} disabled={submitting || loading}>
                  {(submitting || loading) ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : null}
                  {editor.mode === 'create' ? 'Salvar servico' : 'Atualizar servico'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteIntent && (
        <div className="admin-modal-root" style={{ zIndex: 1410 }}>
          <div className="admin-modal-overlay" onClick={() => closeDeleteDialog()} />
          <div className="admin-modal-card admin-modal-card-sm" role="dialog" aria-modal="true" style={{ maxWidth: 520 }}>
            <div className="admin-modal-header admin-modal-header-compact">
              <div className="admin-modal-icon admin-modal-icon-gold">
                <Lock style={{ width: 17, height: 17, color: 'var(--admin-accent)' }} />
              </div>
              <div>
                <h3 className="admin-modal-title">
                  {deleteIntent.kind === 'service' ? 'Excluir servico com senha master' : 'Excluir categoria com senha master'}
                </h3>
                <p className="admin-modal-subtitle">
                  {managedCatalog
                    ? 'A exclusao sera aplicada diretamente no Supabase.'
                    : 'A exclusao vai migrar o catalogo resultante para o modo gerenciado no Supabase.'}
                </p>
              </div>
            </div>

            <div className="admin-modal-body">
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(220,38,38,0.16)', background: 'rgba(220,38,38,0.05)' }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 900, color: '#991b1b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Confirmacao critica</span>
                  <strong style={{ display: 'block', marginTop: 6, fontSize: 15, color: 'var(--admin-text)' }}>{deleteIntentLabel}</strong>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--admin-text-muted)' }}>
                    {deleteIntent.kind === 'service'
                      ? 'O servico sera removido do catalogo administrativo.'
                      : `${deleteIntent.serviceCount} servico(s) da categoria serao removidos em conjunto.`}
                  </p>
                </div>

                <label className="admin-label" style={{ marginBottom: 0 }}>Senha master</label>
                <input
                  type="password"
                  className="admin-input"
                  value={deletePassword}
                  onChange={(event) => {
                    setDeletePassword(event.target.value);
                    if (deleteError) setDeleteError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void confirmDeleteIntent();
                    }
                  }}
                  placeholder="Digite a senha master para excluir"
                  disabled={deleteSubmitting}
                  autoFocus
                />

                {deleteError && <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{deleteError}</p>}
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn-outline" onClick={() => closeDeleteDialog()} disabled={deleteSubmitting}>
                Cancelar
              </button>
              <button className="admin-btn-danger" onClick={() => { void confirmDeleteIntent(); }} disabled={deleteSubmitting}>
                {deleteSubmitting ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Trash2 style={{ width: 14, height: 14 }} />}
                Confirmar exclusao
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
