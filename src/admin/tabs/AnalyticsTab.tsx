import { toNumber, toStringValue } from '../AdminUtils';
import { ActivityTimeline, AnalyticsPanel, MostProfitableService, OccupancyBar, StatusPieChart, WeeklyCalendar } from '../AdminFeatures';
import type { AdminBooking } from '../types';

export function AnalyticsTab({
  bookings,
  profs,
  analyticsSubTab,
  setAnalyticsSubTab,
}: {
  bookings: AdminBooking[];
  profs: Record<string, unknown>[];
  analyticsSubTab: 'geral' | 'colaboradores';
  setAnalyticsSubTab: (tab: 'geral' | 'colaboradores') => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setAnalyticsSubTab('geral')} className={analyticsSubTab === 'geral' ? 'admin-btn-primary' : 'admin-btn-outline'} style={{ padding: '6px 16px', fontSize: 12 }}>Visao Geral</button>
        <button onClick={() => setAnalyticsSubTab('colaboradores')} className={analyticsSubTab === 'colaboradores' ? 'admin-btn-primary' : 'admin-btn-outline'} style={{ padding: '6px 16px', fontSize: 12 }}>Por Colaborador</button>
      </div>
      {analyticsSubTab === 'geral' ? (
        <div className="space-y-4">
          <AnalyticsPanel bookings={bookings} />
          <div className="grid gap-4 lg:grid-cols-2">
            <WeeklyCalendar bookings={bookings} />
            <ActivityTimeline bookings={bookings} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <StatusPieChart bookings={bookings} />
            <OccupancyBar bookings={bookings} />
            <MostProfitableService bookings={bookings} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {profs.length === 0 ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Nenhum colaborador cadastrado.</p> : profs.map((prof) => {
            const profName = toStringValue(prof.name).toLowerCase();
            const profBookings = bookings.filter((b) => b.service?.toLowerCase().includes(profName) || b.name?.toLowerCase().includes(profName));
            const totalValue = profBookings.reduce((sum, b) => {
              const price = parseFloat((b.servicePrice || '0').replace(/[^\d.,]/g, '').replace(',', '.'));
              return sum + (Number.isFinite(price) ? price : 0);
            }, 0);
            return (
              <div key={toNumber(prof.id)} className="admin-analytics-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="admin-avatar">{toStringValue(prof.name).charAt(0).toUpperCase()}</div>
                    <div>
                      <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>{toStringValue(prof.name)}</p>
                      <p style={{ fontSize: 11, color: 'var(--admin-accent)', margin: 0 }}>{toStringValue(prof.specialties) || 'Geral'}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: 0 }}>Servicos: {profBookings.length}</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-accent)', margin: 0 }}>R$ {totalValue.toFixed(2)}</p>
                  </div>
                </div>
                {profBookings.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {profBookings.slice(0, 10).map((b) => (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 10px', background: 'var(--admin-surface-2)', borderRadius: 'var(--admin-radius-xs)', border: '1px solid var(--admin-border)' }}>
                        <span style={{ color: 'var(--admin-text)' }}>{b.service} — {b.name}</span>
                        <span style={{ color: 'var(--admin-accent)', fontWeight: 600 }}>{b.servicePrice || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
