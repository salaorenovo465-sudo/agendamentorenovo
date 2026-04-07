import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  TrendingUp, DollarSign, Users, Calendar, Clock,
  Star, BarChart3, Percent,
} from 'lucide-react';
import type { AdminBooking } from './types';

/* ─── REVENUE CALCULATION ─── */
function extractPrice(priceStr: string | null): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/(\d+)[,.]?(\d{0,2})/);
  if (!match) return 0;
  return parseFloat(`${match[1]}.${match[2] || '0'}`);
}

/* ─── ANALYTICS PANEL ─── */
export function AnalyticsPanel({ bookings }: { bookings: AdminBooking[] }) {
  const stats = useMemo(() => {
    const confirmed = bookings.filter(b => b.status === 'confirmed');
    const pending = bookings.filter(b => b.status === 'pending');
    const revenue = confirmed.reduce((sum, b) => sum + extractPrice(b.servicePrice), 0);
    const pendingRevenue = pending.reduce((sum, b) => sum + extractPrice(b.servicePrice), 0);
    const conversionRate = bookings.length > 0
      ? Math.round((confirmed.length / bookings.length) * 100) : 0;

    // Top services
    const serviceCounts: Record<string, number> = {};
    bookings.forEach(b => { serviceCounts[b.service] = (serviceCounts[b.service] || 0) + 1; });
    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxCount = topServices[0]?.[1] || 1;

    // Repeat clients
    const clientCounts: Record<string, { name: string; phone: string; count: number }> = {};
    bookings.forEach(b => {
      const key = b.phone.replace(/\D/g, '');
      if (!clientCounts[key]) clientCounts[key] = { name: b.name, phone: b.phone, count: 0 };
      clientCounts[key].count++;
    });
    const repeatClients = Object.values(clientCounts)
      .filter(c => c.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Hourly distribution
    const hourly: Record<string, number> = {};
    bookings.forEach(b => {
      const h = b.time.split(':')[0] || '00';
      hourly[h] = (hourly[h] || 0) + 1;
    });
    const peakHour = Object.entries(hourly).sort((a, b) => b[1] - a[1])[0];

    return { revenue, pendingRevenue, conversionRate, topServices, maxCount, repeatClients, peakHour, confirmed, pending };
  }, [bookings]);

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={DollarSign} label="Receita Confirmada" value={`R$ ${stats.revenue.toFixed(2)}`} accent="emerald" delay={0} />
        <KPICard icon={TrendingUp} label="Receita Pendente" value={`R$ ${stats.pendingRevenue.toFixed(2)}`} accent="amber" delay={0.05} />
        <KPICard icon={Percent} label="Taxa de Conversão" value={`${stats.conversionRate}%`} accent="violet" delay={0.1} />
        <KPICard icon={Clock} label="Horário Pico" value={stats.peakHour ? `${stats.peakHour[0]}:00` : '—'} accent="blue" delay={0.15} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top Services */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="admin-analytics-card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[var(--admin-accent)]" />
            <h3 className="text-sm font-bold text-[var(--admin-text)]">Top Serviços</h3>
          </div>
          {stats.topServices.length === 0 ? (
            <p className="text-xs text-[var(--admin-text-muted)]">Sem dados suficientes</p>
          ) : (
            <div className="space-y-3">
              {stats.topServices.map(([name, count], i) => (
                <div key={name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--admin-text)] font-medium flex items-center gap-1.5">
                      {i === 0 && <Star className="w-3 h-3 text-amber-500" />}
                      {name}
                    </span>
                    <span className="text-[var(--admin-text-muted)]">{count}x</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--admin-surface-2)] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / stats.maxCount) * 100}%` }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }}
                      className="h-full rounded-full"
                      style={{ background: i === 0 ? 'var(--admin-accent)' : `rgba(155,123,78,${0.6 - i * 0.1})` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Repeat Clients (VIPs) */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="admin-analytics-card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[var(--admin-accent)]" />
            <h3 className="text-sm font-bold text-[var(--admin-text)]">Clientes Recorrentes (VIP)</h3>
          </div>
          {stats.repeatClients.length === 0 ? (
            <p className="text-xs text-[var(--admin-text-muted)]">Nenhum cliente recorrente ainda</p>
          ) : (
            <div className="space-y-2">
              {stats.repeatClients.map((client, i) => (
                <div key={client.phone} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--admin-surface-2)] border border-[var(--admin-border)]">
                  <div className="w-8 h-8 rounded-full bg-[var(--admin-accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--admin-accent)]">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--admin-text)] truncate">{client.name}</p>
                    <p className="text-[10px] text-[var(--admin-text-muted)]">{client.phone}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--admin-accent)]/10 text-[var(--admin-accent)]">
                    {client.count}x
                  </span>
                  {i === 0 && <Star className="w-3.5 h-3.5 text-amber-500" />}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/* ─── KPI CARD ─── */
function KPICard({ icon: Icon, label, value, accent, delay = 0 }: {
  icon: typeof DollarSign; label: string; value: string; accent: string; delay?: number;
}) {
  const colors: Record<string, string> = {
    emerald: 'from-emerald-400 to-teal-500',
    amber: 'from-amber-400 to-orange-500',
    violet: 'from-violet-400 to-purple-500',
    blue: 'from-blue-400 to-indigo-500',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="admin-stat-card group"
    >
      <div className={`admin-stat-icon bg-gradient-to-br ${colors[accent]}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-[var(--admin-text-muted)] uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-[var(--admin-text)] mt-0.5 tracking-tight">{value}</p>
      </div>
    </motion.div>
  );
}

/* ─── WEEKLY MINI CALENDAR ─── */
export function WeeklyCalendar({ bookings }: { bookings: AdminBooking[] }) {
  const days = useMemo(() => {
    const today = new Date();
    const result = [];
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const count = bookings.filter(b => b.date === dateStr).length;
      result.push({ day: d.getDate(), name: dayNames[d.getDay()], count, isToday: i === 0, dateStr });
    }
    return result;
  }, [bookings]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="admin-analytics-card">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-[var(--admin-accent)]" />
        <h3 className="text-sm font-bold text-[var(--admin-text)]">Próximos 7 Dias</h3>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => (
          <div key={d.dateStr} className={`text-center p-2 rounded-xl transition-all ${d.isToday ? 'bg-[var(--admin-accent)]/10 border border-[var(--admin-accent)]/20' : 'bg-[var(--admin-surface-2)]'}`}>
            <p className="text-[10px] font-bold text-[var(--admin-text-muted)] uppercase">{d.name}</p>
            <p className={`text-lg font-bold mt-0.5 ${d.isToday ? 'text-[var(--admin-accent)]' : 'text-[var(--admin-text)]'}`}>{d.day}</p>
            {d.count > 0 && (
              <p className="text-[10px] font-bold text-[var(--admin-accent)] mt-1">{d.count} agend.</p>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── EXPORT CSV ─── */
export function exportBookingsCSV(bookings: AdminBooking[]) {
  const headers = ['Nome', 'Telefone', 'Serviço', 'Valor', 'Data', 'Horário', 'Status'];
  const rows = bookings.map(b => [
    b.name, b.phone, b.service, b.servicePrice || 'N/A', b.date, b.time, b.status
  ]);
  const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agendamentos_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── ACTIVITY TIMELINE ─── */
export function ActivityTimeline({ bookings }: { bookings: AdminBooking[] }) {
  const recent = useMemo(() => {
    return [...bookings]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);
  }, [bookings]);

  const statusLabels: Record<string, string> = { pending: 'agendou', confirmed: 'foi confirmado', rejected: 'foi rejeitado' };
  const statusColors: Record<string, string> = { pending: 'text-amber-500', confirmed: 'text-emerald-500', rejected: 'text-rose-500' };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="admin-analytics-card">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-[var(--admin-accent)]" />
        <h3 className="text-sm font-bold text-[var(--admin-text)]">Atividade Recente</h3>
      </div>
      {recent.length === 0 ? (
        <p className="text-xs text-[var(--admin-text-muted)]">Sem atividade</p>
      ) : (
        <div className="space-y-0">
          {recent.map((b, i) => (
            <div key={b.id} className="flex gap-3 py-2.5 border-b border-[var(--admin-border)] last:border-0">
              <div className="flex flex-col items-center">
                <div className={`w-2 h-2 rounded-full mt-1.5 ${statusColors[b.status]?.replace('text-', 'bg-') || 'bg-gray-400'}`} />
                {i < recent.length - 1 && <div className="w-px flex-1 bg-[var(--admin-border)] mt-1" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--admin-text)]">
                  <span className="font-semibold">{b.name}</span>{' '}
                  <span className={statusColors[b.status]}>{statusLabels[b.status]}</span>{' '}
                  <span className="text-[var(--admin-text-muted)]">— {b.service}</span>
                </p>
                <p className="text-[10px] text-[var(--admin-text-muted)] mt-0.5">{b.date} às {b.time}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ─── 19. STATUS PIE CHART ─── */
export function StatusPieChart({ bookings }: { bookings: AdminBooking[] }) {
  const data = useMemo(() => {
    const p = bookings.filter(b => b.status === 'pending').length;
    const c = bookings.filter(b => b.status === 'confirmed').length;
    const r = bookings.filter(b => b.status === 'rejected').length;
    const total = p + c + r || 1;
    return { p, c, r, total, pPct: (p / total) * 100, cPct: (c / total) * 100, rPct: (r / total) * 100 };
  }, [bookings]);

  const radius = 40, cx = 50, cy = 50, stroke = 10;
  const circ = 2 * Math.PI * radius;
  const pLen = (data.pPct / 100) * circ;
  const cLen = (data.cPct / 100) * circ;
  const rLen = (data.rPct / 100) * circ;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="admin-analytics-card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-[var(--admin-accent)]" />
        <h3 className="text-sm font-bold text-[var(--admin-text)]">Distribuição por Status</h3>
      </div>
      <div className="flex items-center gap-6">
        <svg width="100" height="100" viewBox="0 0 100 100" className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--admin-surface-2)" strokeWidth={stroke} />
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f59e0b" strokeWidth={stroke} strokeDasharray={`${pLen} ${circ - pLen}`} strokeDashoffset={0} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#10b981" strokeWidth={stroke} strokeDasharray={`${cLen} ${circ - cLen}`} strokeDashoffset={-pLen} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f43f5e" strokeWidth={stroke} strokeDasharray={`${rLen} ${circ - rLen}`} strokeDashoffset={-(pLen + cLen)} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
          <text x={cx} y={cy - 4} textAnchor="middle" className="text-2xl font-bold" fill="var(--admin-text)" fontSize="18">{data.total}</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--admin-text-muted)" fontSize="8">total</text>
        </svg>
        <div className="space-y-2 flex-1">
          {[
            { label: 'Pendentes', val: data.p, pct: data.pPct, color: '#f59e0b' },
            { label: 'Confirmados', val: data.c, pct: data.cPct, color: '#10b981' },
            { label: 'Rejeitados', val: data.r, pct: data.rPct, color: '#f43f5e' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="text-[var(--admin-text)] font-medium flex-1">{item.label}</span>
              <span className="text-[var(--admin-text-muted)]">{item.val}</span>
              <span className="text-[var(--admin-text-muted)] w-10 text-right">{item.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── 38. OCCUPANCY BAR ─── */
export function OccupancyBar({ bookings }: { bookings: AdminBooking[] }) {
  const occupancy = useMemo(() => {
    const totalSlots = 24;
    const filled = bookings.filter(b => b.status !== 'rejected').length;
    return Math.min(Math.round((filled / totalSlots) * 100), 100);
  }, [bookings]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="admin-analytics-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[var(--admin-text)]">Ocupação do Dia</h3>
        <span className="text-lg font-bold text-[var(--admin-accent)]">{occupancy}%</span>
      </div>
      <div className="h-3 rounded-full bg-[var(--admin-surface-2)] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${occupancy}%` }}
          transition={{ duration: 1, delay: 0.5 }}
          className="h-full rounded-full"
          style={{ background: occupancy > 80 ? '#f43f5e' : occupancy > 50 ? '#f59e0b' : '#10b981' }}
        />
      </div>
      <p className="text-[10px] text-[var(--admin-text-muted)] mt-2">
        {occupancy > 80 ? '🔥 Dia quase lotado!' : occupancy > 50 ? '📊 Dia moderado' : '✅ Bastante disponibilidade'}
      </p>
    </motion.div>
  );
}

/* ─── 21. MOST PROFITABLE SERVICE ─── */
export function MostProfitableService({ bookings }: { bookings: AdminBooking[] }) {
  const best = useMemo(() => {
    const revenues: Record<string, { total: number; count: number }> = {};
    bookings.filter(b => b.status === 'confirmed').forEach(b => {
      const price = extractPrice(b.servicePrice);
      if (!revenues[b.service]) revenues[b.service] = { total: 0, count: 0 };
      revenues[b.service].total += price;
      revenues[b.service].count++;
    });
    const sorted = Object.entries(revenues).sort((a, b) => b[1].total - a[1].total);
    return sorted[0] ? { name: sorted[0][0], total: sorted[0][1].total, count: sorted[0][1].count } : null;
  }, [bookings]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="admin-analytics-card">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4 text-[var(--admin-accent)]" />
        <h3 className="text-sm font-bold text-[var(--admin-text)]">Serviço Mais Rentável</h3>
      </div>
      {best ? (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Star className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-[var(--admin-text)]">{best.name}</p>
            <p className="text-xs text-[var(--admin-text-muted)]">R$ {best.total.toFixed(2)} em {best.count} atendimentos</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--admin-text-muted)]">Sem dados suficientes</p>
      )}
    </motion.div>
  );
}
