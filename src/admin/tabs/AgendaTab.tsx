import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, CheckCircle2, Download, Sparkles, Trash2, XCircle } from 'lucide-react';
import { formatDateBR } from '../AdminUtils';
import { exportBookingsCSV } from '../AdminFeatures';
import type { AdminBooking } from '../types';

export function AgendaTab({
  bookings,
  bookingsLoading,
  dateFilter,
  dateFilterEnd,
  busyBookingId,
  rescheduleMap,
  setRescheduleMap,
  onConfirm,
  onComplete,
  onReject,
  onDelete,
  onReschedule,
}: {
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  dateFilter: string;
  dateFilterEnd: string;
  busyBookingId: number | null;
  rescheduleMap: Record<number, { date: string; time: string }>;
  setRescheduleMap: Dispatch<SetStateAction<Record<number, { date: string; time: string }>>>;
  onConfirm: (booking: AdminBooking) => Promise<void>;
  onComplete: (booking: AdminBooking) => Promise<void>;
  onReject: (booking: AdminBooking) => Promise<void>;
  onDelete: (booking: AdminBooking) => Promise<void>;
  onReschedule: (booking: AdminBooking) => Promise<void>;
}) {
  const now = new Date();
  const isOverdue = (b: AdminBooking) => {
    if (b.status === 'completed' || b.status === 'rejected') return false;
    const bookingDate = new Date(`${b.date}T${b.time}`);
    return bookingDate < now;
  };
  const pending = bookings.filter((b) => b.status === 'pending' && !isOverdue(b));
  const confirmed = bookings.filter((b) => b.status === 'confirmed' && !isOverdue(b));
  const overdue = bookings.filter((b) => isOverdue(b));
  const completed = bookings.filter((b) => b.status === 'completed');

  const renderBookingCard = (booking: AdminBooking, showOverdueAlert?: boolean) => {
    const schedule = rescheduleMap[booking.id] || { date: booking.date, time: booking.time };
    const busy = busyBookingId === booking.id;
    return (
      <div key={booking.id} className={`admin-pipeline-card ${showOverdueAlert ? 'admin-pipeline-card-pending' : `admin-pipeline-card-${booking.status}`}`} style={showOverdueAlert ? { borderLeft: '4px solid #dc2626', background: 'rgba(220,38,38,0.03)' } : undefined}>
        {showOverdueAlert && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, padding: '3px 8px', borderRadius: 6, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)', fontSize: 10, fontWeight: 700, color: '#dc2626' }}>
            <AlertTriangle style={{ width: 11, height: 11 }} /> Atrasado — sem finalização
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div className="admin-avatar">{booking.name.charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{booking.name}</p>
            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: 0 }}>{booking.service} • {formatDateBR(booking.date)} {booking.time}</p>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '0 0 8px' }}>{booking.phone} • {booking.servicePrice || 'Sob consulta'}</p>
        {booking.status !== 'completed' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <input type="date" className="admin-input-sm" style={{ fontSize: 10, padding: '2px 6px', width: 110 }} value={schedule.date} onChange={(e) => setRescheduleMap((c) => ({ ...c, [booking.id]: { ...schedule, date: e.target.value } }))} />
            <input type="time" className="admin-input-sm" style={{ fontSize: 10, padding: '2px 6px', width: 80 }} value={schedule.time} onChange={(e) => setRescheduleMap((c) => ({ ...c, [booking.id]: { ...schedule, time: e.target.value } }))} />
          </div>
        )}
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {booking.status !== 'completed' && <button disabled={busy} onClick={() => void onReschedule(booking)} className="admin-btn-outline" style={{ fontSize: 11, padding: '6px 10px' }}>Remarcar</button>}
          {booking.status !== 'confirmed' && booking.status !== 'completed' && <button disabled={busy} onClick={() => void onConfirm(booking)} className="admin-btn-success" style={{ fontSize: 11, padding: '6px 10px' }}><CheckCircle2 style={{ width: 12, height: 12 }} /> Confirmar</button>}
          {(booking.status === 'confirmed' || isOverdue(booking)) && <button disabled={busy} onClick={() => void onComplete(booking)} className="admin-btn-primary" style={{ fontSize: 11, padding: '6px 10px' }}><Sparkles style={{ width: 12, height: 12 }} /> Finalizar</button>}
          {booking.status !== 'rejected' && booking.status !== 'completed' && <button disabled={busy} onClick={() => void onReject(booking)} className="admin-btn-danger" style={{ fontSize: 11, padding: '6px 10px' }}><XCircle style={{ width: 12, height: 12 }} /> Rejeitar</button>}
          <button disabled={busy} onClick={() => void onDelete(booking)} className="admin-btn-outline" style={{ fontSize: 11, padding: '6px 10px', color: '#dc2626', borderColor: '#dc2626' }}><Trash2 style={{ width: 12, height: 12 }} /> Excluir</button>
        </div>
      </div>
    );
  };

  const dateLabel = dateFilter === dateFilterEnd ? formatDateBR(dateFilter) : `${formatDateBR(dateFilter)} — ${formatDateBR(dateFilterEnd)}`;

  return (
    <div>
      {overdue.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--admin-radius-sm)', background: 'rgba(220,38,38,0.06)', border: '1.5px solid rgba(220,38,38,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle style={{ width: 18, height: 18, color: '#dc2626', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>{overdue.length} agendamento(s) atrasado(s) — passaram da data/hora e não foram finalizados nem rejeitados</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Agenda — {dateLabel}</h3>
        {bookings.length > 0 && (
          <button onClick={() => exportBookingsCSV(bookings)} className="admin-btn-outline" style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}><Download className="w-3 h-3" /> CSV</button>
        )}
      </div>
      {bookingsLoading ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
        <div className="admin-pipeline" style={{ gridTemplateColumns: overdue.length > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
          {overdue.length > 0 && (
            <div className="admin-pipeline-col" style={{ borderTop: '3px solid #dc2626' }}>
              <div className="admin-pipeline-col-header" style={{ color: '#dc2626' }}>Atrasados <span className="admin-pipeline-count" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>{overdue.length}</span></div>
              <div className="admin-pipeline-cards">{overdue.map((b) => renderBookingCard(b, true))}</div>
            </div>
          )}
          <div className="admin-pipeline-col admin-pipeline-pending">
            <div className="admin-pipeline-col-header">Pendentes <span className="admin-pipeline-count">{pending.length}</span></div>
            <div className="admin-pipeline-cards">{pending.map((b) => renderBookingCard(b))}</div>
          </div>
          <div className="admin-pipeline-col admin-pipeline-confirmed">
            <div className="admin-pipeline-col-header">Confirmados <span className="admin-pipeline-count">{confirmed.length}</span></div>
            <div className="admin-pipeline-cards">{confirmed.map((b) => renderBookingCard(b))}</div>
          </div>
          <div className="admin-pipeline-col" style={{ borderTop: '3px solid #6366f1', background: 'linear-gradient(135deg, rgba(99,102,241,0.04), transparent)' }}>
            <div className="admin-pipeline-col-header" style={{ color: '#6366f1' }}>Finalizados <span className="admin-pipeline-count" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>{completed.length}</span></div>
            <div className="admin-pipeline-cards">{completed.map((b) => renderBookingCard(b))}</div>
          </div>
        </div>
      )}
    </div>
  );
}
