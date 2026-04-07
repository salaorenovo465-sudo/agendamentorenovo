import type { Dispatch, SetStateAction } from 'react';
import { Eye, Flower2, Heart, Palette, Scissors, Sparkles, X, Zap } from 'lucide-react';

type ServiceCategory = {
  category: string;
  items: { name: string; price: string; desc: string }[];
};

type EditingService = {
  catIdx: number;
  itemIdx: number;
  name: string;
  price: string;
  desc: string;
  priceType: 'fixed' | 'from' | 'consult';
  priceValue: string;
};

export function ServicosTab({
  localServices,
  setLocalServices,
  editingService,
  setEditingService,
}: {
  localServices: ServiceCategory[];
  setLocalServices: Dispatch<SetStateAction<ServiceCategory[]>>;
  editingService: EditingService | null;
  setEditingService: Dispatch<SetStateAction<EditingService | null>>;
}) {
  const categoryIconMap: Record<string, typeof Sparkles> = {
    'Transformação & Alinhamento': Sparkles,
    'Tratamentos Premium': Heart,
    'Corte & Finalização': Scissors,
    'Coloração & Mechas': Palette,
    'Unhas & SPA': Flower2,
    'Sobrancelhas & Cílios': Eye,
    'Depilação': Zap,
  };

  const parsePriceToEdit = (price: string): { priceType: 'fixed' | 'from' | 'consult'; priceValue: string } => {
    if (price.toLowerCase().includes('sob consulta')) return { priceType: 'consult', priceValue: '' };
    if (price.toLowerCase().includes('a partir de')) {
      const match = price.match(/[\d.,]+/);
      return { priceType: 'from', priceValue: match ? match[0].replace('.', '').replace(',', '.') : '' };
    }
    const match = price.match(/[\d.,]+/);
    return { priceType: 'fixed', priceValue: match ? match[0].replace('.', '').replace(',', '.') : '' };
  };

  const formatPriceFromEdit = (priceType: string, priceValue: string): string => {
    if (priceType === 'consult') return 'Sob consulta';
    const num = parseFloat(priceValue);
    if (isNaN(num)) return priceType === 'from' ? 'a partir de R$ 0,00' : 'R$ 0,00';
    const formatted = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return priceType === 'from' ? `a partir de R$ ${formatted}` : `R$ ${formatted}`;
  };

  return (
    <div className="space-y-6">
      {localServices.map((cat, catIdx) => {
        const IconComp = categoryIconMap[cat.category] || Sparkles;
        return (
          <div key={cat.category} className="admin-analytics-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 18px', borderBottom: '2px solid var(--admin-accent)', paddingBottom: 10 }}>
              <IconComp style={{ width: 20, height: 20, color: 'var(--admin-accent)' }} />
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat.category}</h3>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', background: 'var(--admin-surface-2)', padding: '2px 8px', borderRadius: 10 }}>{cat.items.length} {cat.items.length === 1 ? 'serviço' : 'serviços'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {cat.items.map((svc, itemIdx) => {
                const parsed = parsePriceToEdit(svc.price);
                return (
                  <div key={svc.name} onClick={() => setEditingService({ catIdx, itemIdx, name: svc.name, price: svc.price, desc: svc.desc, ...parsed })} style={{ padding: 20, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1.5px solid var(--admin-border)', transition: 'all 0.25s ease', cursor: 'pointer', position: 'relative' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--admin-accent)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(155,123,78,0.12)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--admin-border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <IconComp style={{ width: 22, height: 22, color: 'var(--admin-accent)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--admin-text)', margin: 0, lineHeight: 1.3 }}>{svc.name}</p>
                        <p style={{ fontSize: 12.5, color: 'var(--admin-text-muted)', margin: '5px 0 0', lineHeight: 1.5 }}>{svc.desc}</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--admin-bg)', display: 'inline-block' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--admin-accent)' }}>{svc.price}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {editingService && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }} onClick={() => setEditingService(null)}>
          <div style={{ background: 'var(--admin-surface)', border: '2px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 28, width: '100%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--admin-accent)', margin: 0 }}>Editar Serviço</h3>
              <button onClick={() => setEditingService(null)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="admin-label">Nome do serviço</label>
                <input className="admin-input" value={editingService.name} onChange={(e) => setEditingService((c) => c ? { ...c, name: e.target.value } : null)} />
              </div>
              <div>
                <label className="admin-label">Tipo de preço</label>
                <select className="admin-input" value={editingService.priceType} onChange={(e) => setEditingService((c) => c ? { ...c, priceType: e.target.value as 'fixed' | 'from' | 'consult' } : null)} style={{ cursor: 'pointer' }}>
                  <option value="fixed">Valor fixo</option>
                  <option value="from">A partir de</option>
                  <option value="consult">Sob consulta</option>
                </select>
              </div>
              {editingService.priceType !== 'consult' && (
                <div>
                  <label className="admin-label">Valor (R$)</label>
                  <input className="admin-input" type="number" step="0.01" min="0" value={editingService.priceValue} onChange={(e) => setEditingService((c) => c ? { ...c, priceValue: e.target.value } : null)} placeholder="Ex: 199.99" />
                </div>
              )}
              <div>
                <label className="admin-label">Descrição</label>
                <textarea className="admin-input" rows={3} value={editingService.desc} onChange={(e) => setEditingService((c) => c ? { ...c, desc: e.target.value } : null)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              <button
                onClick={() => {
                  if (!editingService) return;
                  const finalPrice = formatPriceFromEdit(editingService.priceType, editingService.priceValue);
                  setLocalServices((prev) => {
                    const next = prev.map((cat, ci) => ci === editingService.catIdx ? { ...cat, items: cat.items.map((item, ii) => ii === editingService.itemIdx ? { ...item, name: editingService.name, price: finalPrice, desc: editingService.desc } : item) } : cat);
                    return next;
                  });
                  setEditingService(null);
                }}
                className="admin-btn-primary" style={{ padding: '10px 24px', fontSize: 13.5 }}
              >Salvar alterações</button>
              <button onClick={() => setEditingService(null)} className="admin-btn-outline" style={{ padding: '10px 24px', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
