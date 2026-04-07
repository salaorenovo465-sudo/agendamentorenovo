import { Calendar, CheckCircle2, Clock, Users } from 'lucide-react';
import { formatDateBR } from '../AdminUtils';
import type { AdminBooking, WorkbenchOverview } from '../types';

export function DashboardTab({
  overview,
  bookings,
  bookingsLoading,
  overviewLoading,
  dateFilter,
  stageSummary,
}: {
  overview: WorkbenchOverview;
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  overviewLoading: boolean;
  dateFilter: string;
  stageSummary: [string, unknown][];
}) {
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
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Financeiro do dia ({formatDateBR(dateFilter)})</h3>
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
    </div>
  );
}
