import { useEffect, useState } from 'react';
import { Check, CreditCard, Loader2 } from 'lucide-react';

import { confirmBookingPaymentForAdmin, listPendingPaymentBookingsForAdmin } from './api';
import type { AdminBooking } from './types';

type Props = {
  adminKey: string;
};

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Debito' },
  { value: 'credito', label: 'Credito' },
] as const;

const formatDate = (date: string): string => {
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
};

export default function PaymentConfirmationTab({ adminKey }: Props) {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [successId, setSuccessId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listPendingPaymentBookingsForAdmin(adminKey);
      setBookings(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar agendamentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [adminKey]);

  const handleConfirm = async (bookingId: number) => {
    const method = selectedMethod[bookingId];
    if (!method) {
      setError('Selecione um metodo de pagamento.');
      return;
    }

    setBusyId(bookingId);
    setError('');
    try {
      await confirmBookingPaymentForAdmin(bookingId, method, adminKey);
      setSuccessId(bookingId);
      setTimeout(() => {
        setBookings((current) => current.filter((b) => b.id !== bookingId));
        setSuccessId(null);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar pagamento.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="admin-analytics-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard style={{ width: 16, height: 16 }} />
            Confirmacao de Pagamentos
          </h3>
          <button onClick={() => void load()} className="admin-btn-outline" style={{ padding: '6px 12px', fontSize: 11 }}>
            Atualizar
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 'var(--admin-radius-xs)', background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.2)', color: '#fb7185', fontSize: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--admin-text-muted)' }}>
            <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Carregando...
          </div>
        ) : bookings.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Nenhum agendamento pendente de pagamento.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bookings.map((b) => {
              const busy = busyId === b.id;
              const success = successId === b.id;
              const method = selectedMethod[b.id] || '';

              return (
                <div
                  key={b.id}
                  className="admin-booking-card"
                  style={{
                    padding: 16,
                    transition: 'opacity 0.3s, transform 0.3s',
                    opacity: success ? 0.5 : 1,
                    transform: success ? 'scale(0.98)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="admin-avatar">{b.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{b.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>
                          {b.phone} · {b.service}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>
                          {formatDate(b.date)} {b.time}
                          {b.servicePrice && <> · <strong style={{ color: 'var(--admin-text)' }}>{b.servicePrice}</strong></>}
                        </p>
                      </div>
                    </div>

                    {success ? (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: 'rgba(52,211,153,0.15)', color: '#059669',
                      }}>
                        <Check style={{ width: 14, height: 14 }} /> Pago
                      </span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          className="admin-input-sm"
                          value={method}
                          onChange={(e) => setSelectedMethod((c) => ({ ...c, [b.id]: e.target.value }))}
                          style={{ minWidth: 110 }}
                        >
                          <option value="">Metodo...</option>
                          {PAYMENT_METHODS.map((pm) => (
                            <option key={pm.value} value={pm.value}>{pm.label}</option>
                          ))}
                        </select>
                        <button
                          disabled={busy || !method}
                          onClick={() => void handleConfirm(b.id)}
                          className="admin-btn-success"
                          style={{ padding: '6px 14px', fontSize: 12, whiteSpace: 'nowrap' }}
                        >
                          {busy ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <Check style={{ width: 13, height: 13 }} />}
                          Confirmar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
