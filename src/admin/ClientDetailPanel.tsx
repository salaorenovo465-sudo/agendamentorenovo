import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Loader2, Mail, MapPin, Phone, Save, Sparkles, User, X, XCircle } from 'lucide-react';

import { DangerConfirmModal } from './AdminHelpers';
import { listBookingsByPhoneForAdmin, updateWorkbenchEntityForAdmin, deleteWorkbenchEntityForAdmin } from './api';
import type { AdminBooking } from './types';

type Props = {
  client: Record<string, unknown>;
  adminKey: string;
  onClose: () => void;
  onUpdated?: () => void;
};

const toStr = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const toNum = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

const statusBadge = (status: string) => {
  if (status === 'confirmed') return { label: 'Confirmado', bg: 'rgba(52,211,153,0.1)', color: '#059669', border: 'rgba(52,211,153,0.2)' };
  if (status === 'rejected') return { label: 'Rejeitado', bg: 'rgba(251,113,133,0.1)', color: '#e11d48', border: 'rgba(251,113,133,0.2)' };
  return { label: 'Pendente', bg: 'rgba(251,191,36,0.1)', color: '#d97706', border: 'rgba(251,191,36,0.2)' };
};

const clientStatusColor = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'vip') return { bg: 'linear-gradient(135deg, #9b7b4e, #c9a96e)', color: '#fff' };
  if (s === 'ativo' || s === 'recorrente') return { bg: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' };
  if (s === 'inativo' || s === 'em risco') return { bg: 'linear-gradient(135deg, #94a3b8, #64748b)', color: '#fff' };
  return { bg: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' };
};

const formatDate = (date: string): string => {
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
};

const STATUS_OPTIONS = ['novo', 'ativo', 'recorrente', 'VIP', 'inativo', 'em risco'];

export default function ClientDetailPanel({ client, adminKey, onClose, onUpdated }: Props) {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...client });
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'info' | 'historico' | 'analytics'>('info');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const phone = toStr(client.phone);

  useEffect(() => {
    if (!phone) { setLoading(false); return; }
    setLoading(true);
    void listBookingsByPhoneForAdmin(phone, adminKey)
      .then(setBookings)
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [phone, adminKey]);

  const analytics = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === 'confirmed');
    const totalValue = confirmed.reduce((sum, b) => {
      const price = parseFloat((b.servicePrice || '0').replace(/[^\d.,]/g, '').replace(',', '.'));
      return sum + (Number.isFinite(price) ? price : 0);
    }, 0);
    const serviceCount: Record<string, number> = {};
    confirmed.forEach((b) => {
      const svc = b.service || 'Outro';
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
    });
    const topServices = Object.entries(serviceCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const lastVisit = confirmed.length > 0 ? confirmed.sort((a, b) => b.date.localeCompare(a.date))[0] : null;
    return { totalBookings: bookings.length, confirmedCount: confirmed.length, totalValue, topServices, lastVisit };
  }, [bookings]);

  const handleSave = async () => {
    const id = toNum(client.id);
    if (!id) return;
    setSaving(true);
    try {
      await updateWorkbenchEntityForAdmin('clients', id, draft, adminKey);
      setEditing(false);
      onUpdated?.();
    } catch { /* silent */ } finally { setSaving(false); }
  };

  const handleDelete = async (masterPassword?: string) => {
    const id = toNum(client.id);
    if (!id || !masterPassword) return;
    await deleteWorkbenchEntityForAdmin('clients', id, adminKey, { masterPassword });
    onUpdated?.();
    onClose();
  };

  const stColor = clientStatusColor(toStr(draft.status));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

        {/* Header premium */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: stColor.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: stColor.color, flexShrink: 0 }}>
                {toStr(client.name).charAt(0).toUpperCase() || '?'}
              </div>
              <div>
                <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>{toStr(client.name)}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Phone style={{ width: 11, height: 11 }} /> {phone || '—'}</span>
                  {toStr(client.email) && <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Mail style={{ width: 11, height: 11 }} /> {toStr(client.email)}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ padding: '4px 12px', borderRadius: 14, fontSize: 11, fontWeight: 700, background: stColor.bg, color: stColor.color }}>{toStr(client.status) || 'novo'}</span>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-muted)', padding: 4 }}><X style={{ width: 18, height: 18 }} /></button>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--admin-border)', background: 'var(--admin-surface)' }}>
          {([['info', 'Informações'], ['historico', 'Histórico'], ['analytics', 'Analytics']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveSection(key)} style={{ flex: 1, padding: '10px 0', fontSize: 12, fontWeight: activeSection === key ? 700 : 400, color: activeSection === key ? 'var(--admin-accent)' : 'var(--admin-text-muted)', background: 'none', border: 'none', borderBottom: activeSection === key ? '2px solid var(--admin-accent)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }} className="admin-scroll">

          {/* ── INFO ── */}
          {activeSection === 'info' && (
            <div>
              {!editing ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Nome</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0' }}>{toStr(client.name) || '—'}</p>
                    </div>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Telefone</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}><Phone style={{ width: 12, height: 12 }} /> {phone || '—'}</p>
                    </div>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>CPF</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0' }}>{toStr(client.cpf) || '—'}</p>
                    </div>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Email</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}><Mail style={{ width: 12, height: 12 }} /> {toStr(client.email) || '—'}</p>
                    </div>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)', gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Endereço</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin style={{ width: 12, height: 12 }} /> {toStr(client.address) || '—'}</p>
                    </div>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Nascimento</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0' }}>{toStr(client.birth_date) ? formatDate(toStr(client.birth_date)) : '—'}</p>
                    </div>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Status</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0' }}>{toStr(client.status) || 'novo'}</p>
                    </div>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Serviço preferido</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0' }}>{toStr(client.preferred_service) || '—'}</p>
                    </div>
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Profissional preferido</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0' }}>{toStr(client.preferred_professional) || '—'}</p>
                    </div>
                  </div>
                  {toStr(client.notes) && (
                    <div style={{ padding: 12, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)', marginBottom: 16 }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Observações</p>
                      <p style={{ fontSize: 12, color: 'var(--admin-text)', margin: '6px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{toStr(client.notes)}</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setDraft({ ...client }); setEditing(true); }} className="admin-btn-primary" style={{ padding: '9px 20px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><User style={{ width: 13, height: 13 }} /> Editar informações</button>
                    <button onClick={() => setDeleteOpen(true)} className="admin-btn-danger" style={{ padding: '9px 20px', fontSize: 12 }}>Excluir</button>
                  </div>
                </div>
              ) : (
                /* ── MODO EDIÇÃO ── */
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label className="admin-label">Nome</label><input className="admin-input" value={toStr(draft.name)} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} /></div>
                    <div><label className="admin-label">Telefone</label><input className="admin-input" value={toStr(draft.phone)} onChange={(e) => setDraft((c) => ({ ...c, phone: e.target.value }))} /></div>
                    <div><label className="admin-label">CPF</label><input className="admin-input" value={toStr(draft.cpf)} onChange={(e) => setDraft((c) => ({ ...c, cpf: e.target.value }))} /></div>
                    <div><label className="admin-label">Email</label><input className="admin-input" value={toStr(draft.email)} onChange={(e) => setDraft((c) => ({ ...c, email: e.target.value }))} /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label className="admin-label">Endereço</label><input className="admin-input" value={toStr(draft.address)} onChange={(e) => setDraft((c) => ({ ...c, address: e.target.value }))} /></div>
                    <div><label className="admin-label">Data de Nascimento</label><input type="date" className="admin-input" value={toStr(draft.birth_date)} onChange={(e) => setDraft((c) => ({ ...c, birth_date: e.target.value }))} /></div>
                    <div>
                      <label className="admin-label">Status</label>
                      <select className="admin-input" value={toStr(draft.status)} onChange={(e) => setDraft((c) => ({ ...c, status: e.target.value }))}>
                        <option value="">Selecione</option>
                        {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div><label className="admin-label">Serviço preferido</label><input className="admin-input" value={toStr(draft.preferred_service)} onChange={(e) => setDraft((c) => ({ ...c, preferred_service: e.target.value }))} /></div>
                    <div><label className="admin-label">Profissional preferido</label><input className="admin-input" value={toStr(draft.preferred_professional)} onChange={(e) => setDraft((c) => ({ ...c, preferred_professional: e.target.value }))} /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label className="admin-label">Observações</label><textarea className="admin-input" rows={3} value={toStr(draft.notes)} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button disabled={saving} onClick={() => void handleSave()} className="admin-btn-success" style={{ padding: '9px 20px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Save style={{ width: 13, height: 13 }} /> {saving ? 'Salvando...' : 'Salvar alterações'}</button>
                    <button onClick={() => setEditing(false)} className="admin-btn-outline" style={{ padding: '9px 20px', fontSize: 12 }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── HISTÓRICO ── */}
          {activeSection === 'historico' && (
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--admin-text)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar style={{ width: 14, height: 14 }} /> Agendamentos ({bookings.length})
              </h4>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--admin-text-muted)' }}><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Carregando...</div>
              ) : bookings.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>Nenhum agendamento encontrado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {bookings.map((b) => {
                    const badge = statusBadge(b.status);
                    const price = parseFloat((b.servicePrice || '0').replace(/[^\d.,]/g, '').replace(',', '.'));
                    return (
                      <div key={b.id} style={{ padding: '12px 16px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{b.service}</p>
                          <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Calendar style={{ width: 10, height: 10 }} /> {formatDate(b.date)}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock style={{ width: 10, height: 10 }} /> {b.time}</span>
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {Number.isFinite(price) && price > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--admin-accent)' }}>R$ {price.toFixed(2)}</span>}
                          <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {activeSection === 'analytics' && (
            <div>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--admin-text-muted)' }}><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Carregando...</div>
              ) : (
                <div className="space-y-4">
                  {/* Stats cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div style={{ padding: 16, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)', textAlign: 'center' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}><Calendar style={{ width: 16, height: 16, color: '#fff' }} /></div>
                      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>{analytics.totalBookings}</p>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>Total agendamentos</p>
                    </div>
                    <div style={{ padding: 16, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)', textAlign: 'center' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}><CheckCircle2 style={{ width: 16, height: 16, color: '#fff' }} /></div>
                      <p style={{ fontSize: 22, fontWeight: 800, color: '#059669', margin: 0 }}>{analytics.confirmedCount}</p>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>Confirmados</p>
                    </div>
                    <div style={{ padding: 16, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)', textAlign: 'center' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #9b7b4e, #c9a96e)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}><Sparkles style={{ width: 16, height: 16, color: '#fff' }} /></div>
                      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--admin-accent)', margin: 0 }}>R$ {analytics.totalValue.toFixed(2)}</p>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>Valor total</p>
                    </div>
                  </div>

                  {/* Última visita */}
                  {analytics.lastVisit && (
                    <div style={{ padding: 14, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--admin-text-muted)', margin: 0 }}>Última visita</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '4px 0 0' }}>{analytics.lastVisit.service} — {formatDate(analytics.lastVisit.date)} às {analytics.lastVisit.time}</p>
                    </div>
                  )}

                  {/* Top serviços */}
                  <div style={{ padding: 16, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--admin-text)', margin: '0 0 12px' }}>Serviços mais utilizados</p>
                    {analytics.topServices.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>Sem dados.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {analytics.topServices.map(([svc, count]) => {
                          const pct = analytics.confirmedCount > 0 ? Math.round((count / analytics.confirmedCount) * 100) : 0;
                          return (
                            <div key={svc}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                                <span style={{ color: 'var(--admin-text)', fontWeight: 500 }}>{svc}</span>
                                <span style={{ color: 'var(--admin-accent)', fontWeight: 700 }}>{count}x ({pct}%)</span>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: 'var(--admin-border)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--admin-accent), #c9a96e)', borderRadius: 3, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <DangerConfirmModal
        isOpen={deleteOpen}
        title="Excluir cliente"
        subtitle="O cadastro sera removido desta central"
        description={`Digite EXCLUIR CLIENTE para remover ${toStr(client.name) || 'este cliente'} da base administrativa.`}
        confirmText="EXCLUIR CLIENTE"
        confirmLabel="Excluir cliente"
        helperText="A exclusao remove o cadastro do Supabase e encerra este registro na carteira."
        requireMasterPassword
        passwordPlaceholder="Digite a senha master para excluir o cliente"
        busy={saving}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
