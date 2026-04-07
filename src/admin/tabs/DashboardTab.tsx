import { useState } from 'react';
import { Calendar, CheckCircle2, Clock, Users, Trash2, X, Lock } from 'lucide-react';
import { formatDateBR } from '../AdminUtils';
import type { AdminBooking, WorkbenchOverview } from '../types';

export function DashboardTab({
  overview,
  bookings,
  bookingsLoading,
  overviewLoading,
  dateFilter,
  stageSummary,
  onResetFinance,
}: {
  overview: WorkbenchOverview;
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  overviewLoading: boolean;
  dateFilter: string;
  stageSummary: [string, unknown][];
  onResetFinance: (password: string, date?: string) => Promise<boolean>;
}) {
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetScope, setResetScope] = useState<'day' | 'all'>('day');

  const hasFinanceData = overview.finance.expected > 0 || overview.finance.received > 0;

  const handleResetConfirm = async () => {
    if (!resetPassword.trim()) {
      setResetError('Digite a senha de administrador.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const success = await onResetFinance(resetPassword, resetScope === 'day' ? dateFilter : undefined);
      if (success) {
        setShowResetModal(false);
        setResetPassword('');
        setResetError('');
        setResetScope('day');
      } else {
        setResetError('Senha incorreta.');
      }
    } catch {
      setResetError('Erro ao zerar financeiro.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="admin-stat-card">
          <div className="admin-stat-icon" style={{ background: 'linear-gradient(135deg, #3a0a1e, #4e1028)' }}><Calendar style={{ width: 20, height: 20, color: '#d4af37' }} /></div>
          <div><p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)' }}>Agendamentos</p><p style={{ fontSize: 24, fontWeight: 800, color: 'var(--admin-accent)', marginTop: 2 }}>{overview.bookingStats.total}</p></div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon" style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}><Clock style={{ width: 20, height: 20, color: '#fff' }} /></div>
          <div><p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)' }}>Pendentes</p><p style={{ fontSize: 24, fontWeight: 800, color: '#d97706', marginTop: 2 }}>{overview.bookingStats.pending}</p></div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon" style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}><CheckCircle2 style={{ width: 20, height: 20, color: '#fff' }} /></div>
          <div><p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)' }}>Confirmados</p><p style={{ fontSize: 24, fontWeight: 800, color: '#059669', marginTop: 2 }}>{overview.bookingStats.confirmed}</p></div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon" style={{ background: 'linear-gradient(135deg, #3a0a1e, #220610)' }}><Users style={{ width: 20, height: 20, color: '#d4af37' }} /></div>
          <div><p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)' }}>Leads totais</p><p style={{ fontSize: 24, fontWeight: 800, color: 'var(--admin-accent)', marginTop: 2 }}>{overview.leads.total}</p></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="admin-analytics-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Financeiro do dia ({formatDateBR(dateFilter)})</h3>
            {hasFinanceData && (
              <button
                onClick={() => { setShowResetModal(true); setResetPassword(''); setResetError(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
              >
                <Trash2 style={{ width: 12, height: 12 }} /> Zerar
              </button>
            )}
          </div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
            <div><p style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Previsto</p><p style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', marginTop: 2 }}>R$ {overview.finance.expected.toFixed(2)}</p></div>
            <div><p style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Recebido</p><p style={{ fontSize: 16, fontWeight: 700, color: '#059669', marginTop: 2 }}>R$ {overview.finance.received.toFixed(2)}</p></div>
            <div><p style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Pendente</p><p style={{ fontSize: 16, fontWeight: 700, color: '#d97706', marginTop: 2 }}>R$ {overview.finance.pending.toFixed(2)}</p></div>
          </div>
        </div>

        <div className="admin-analytics-card">
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Leads por etapa</h3>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stageSummary.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>Sem leads cadastrados.</p>
            ) : (
              stageSummary.map(([stage, count]) => (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ textTransform: 'capitalize', color: 'var(--admin-text)' }}>{stage}</span>
                  <span style={{ fontWeight: 700, color: 'var(--admin-accent)', background: 'var(--admin-accent-glow)', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>{count as string}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="admin-analytics-card">
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Proximos agendamentos</h3>
        {bookingsLoading ? (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando agenda...</p>
        ) : bookings.length === 0 ? (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--admin-text-muted)' }}>Sem agendamentos para esta data.</p>
        ) : (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bookings.slice(0, 8).map((booking) => (
              <div key={booking.id} className="admin-booking-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="admin-avatar">{booking.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>{booking.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>{booking.service} • {booking.time}</p>
                  </div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                  background: booking.status === 'confirmed' ? 'rgba(52,211,153,0.1)' : booking.status === 'rejected' ? 'rgba(251,113,133,0.1)' : 'rgba(251,191,36,0.1)',
                  color: booking.status === 'confirmed' ? '#059669' : booking.status === 'rejected' ? '#e11d48' : '#d97706',
                  border: `1px solid ${booking.status === 'confirmed' ? 'rgba(52,211,153,0.2)' : booking.status === 'rejected' ? 'rgba(251,113,133,0.2)' : 'rgba(251,191,36,0.2)'}`,
                }}>{booking.status === 'confirmed' ? 'Confirmado' : booking.status === 'rejected' ? 'Rejeitado' : 'Pendente'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {overviewLoading && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--admin-text-muted)' }}>Atualizando dashboard...</p>}

      {showResetModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowResetModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--admin-surface)', border: '1px solid var(--admin-border)',
              borderRadius: 16, padding: 28, width: '90%', maxWidth: 400,
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Lock style={{ width: 18, height: 18, color: '#ef4444' }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>Zerar Financeiro</h3>
              </div>
              <button onClick={() => setShowResetModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-muted)' }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Esta ação vai remover as entradas financeiras. Digite a senha de administrador para confirmar.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Escopo</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    onClick={() => setResetScope('day')}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.2s',
                      background: resetScope === 'day' ? 'var(--admin-accent-glow)' : 'var(--admin-bg)',
                      color: resetScope === 'day' ? 'var(--admin-accent)' : 'var(--admin-text-muted)',
                      border: `1px solid ${resetScope === 'day' ? 'var(--admin-accent)' : 'var(--admin-border)'}`,
                    }}
                  >
                    Somente {formatDateBR(dateFilter)}
                  </button>
                  <button
                    onClick={() => setResetScope('all')}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.2s',
                      background: resetScope === 'all' ? 'rgba(239,68,68,0.1)' : 'var(--admin-bg)',
                      color: resetScope === 'all' ? '#ef4444' : 'var(--admin-text-muted)',
                      border: `1px solid ${resetScope === 'all' ? 'rgba(239,68,68,0.3)' : 'var(--admin-border)'}`,
                    }}
                  >
                    Todos os dias
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Senha de administrador</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => { setResetPassword(e.target.value); setResetError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleResetConfirm()}
                  placeholder="••••••••"
                  autoFocus
                  style={{
                    width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8,
                    background: 'var(--admin-bg)', border: `1px solid ${resetError ? 'rgba(239,68,68,0.5)' : 'var(--admin-border)'}`,
                    color: 'var(--admin-text)', fontSize: 14, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {resetError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{resetError}</p>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowResetModal(false)}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 8,
                  background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
                  color: 'var(--admin-text)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleResetConfirm}
                disabled={resetLoading || !resetPassword.trim()}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 8,
                  background: resetLoading ? 'rgba(239,68,68,0.3)' : '#ef4444',
                  border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: resetLoading ? 'not-allowed' : 'pointer',
                  opacity: !resetPassword.trim() ? 0.5 : 1,
                }}
              >
                {resetLoading ? 'Zerando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
