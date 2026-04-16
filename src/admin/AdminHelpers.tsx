import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, XCircle, Clock, AlertTriangle, Copy, Check } from 'lucide-react';

/* ═══ 1. SAUDAÇÃO DINÂMICA ═══ */
export function getGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Bom dia', emoji: '☀️' };
  if (h < 18) return { text: 'Boa tarde', emoji: '🌅' };
  return { text: 'Boa noite', emoji: '🌙' };
}

/* ═══ 2. AVATAR GRADIENTE ÚNICO ═══ */
const GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#fccb90,#d57eeb)',
  'linear-gradient(135deg,#e0c3fc,#8ec5fc)',
  'linear-gradient(135deg,#f5576c,#ff6a00)',
  'linear-gradient(135deg,#13547a,#80d0c7)',
];
export function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

/* ═══ 8. TOAST SYSTEM ═══ */
type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; type: ToastType };
let toastId = 0;
let toastListener: ((t: Toast[]) => void) | null = null;
let toasts: Toast[] = [];

function pushToast(message: string, type: ToastType) {
  const t: Toast = { id: ++toastId, message, type };
  toasts = [...toasts, t];
  toastListener?.(toasts);
  setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); toastListener?.(toasts); }, 3500);
}
export const toast = {
  success: (m: string) => pushToast(m, 'success'),
  error: (m: string) => pushToast(m, 'error'),
  info: (m: string) => pushToast(m, 'info'),
};

const iconMap = { success: CheckCircle, error: XCircle, info: Clock };
const colorMap = { success: 'border-emerald-400 bg-emerald-50 text-emerald-700', error: 'border-rose-400 bg-rose-50 text-rose-700', info: 'border-blue-400 bg-blue-50 text-blue-700' };

export function ToastContainer() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => { toastListener = setItems; return () => { toastListener = null; }; }, []);
  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
      <AnimatePresence>
        {items.map(t => {
          const Icon = iconMap[t.type];
          return (
            <motion.div key={t.id} initial={{ opacity: 0, x: 80, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 80, scale: 0.9 }} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium ${colorMap[t.type]}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{t.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ═══ 18. TEMPO RELATIVO ═══ */
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (isNaN(then)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

/* ═══ 24. BADGE "NOVO" ═══ */
export function isNew(createdAt: string, thresholdMin = 5): boolean {
  return (Date.now() - new Date(createdAt).getTime()) < thresholdMin * 60000;
}

/* ═══ 25. COPIAR TELEFONE ═══ */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (err) { console.warn('Erro ao copiar:', err); }
  };
  return (
    <button onClick={handleCopy} className="admin-btn-ghost p-1" title="Copiar">
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

/* ═══ 27. ATALHOS DE TECLADO ═══ */
export function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') handlers['refresh']?.();
      if (e.key === '1') handlers['tab1']?.();
      if (e.key === '2') handlers['tab2']?.();
      if (e.key === '3') handlers['tab3']?.();
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); handlers['search']?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlers]);
}

/* ═══ 28. AUTO-REFRESH ═══ */
export function useAutoRefresh(callback: () => void, intervalMs = 30000) {
  useEffect(() => {
    const id = setInterval(callback, intervalMs);
    return () => clearInterval(id);
  }, [callback, intervalMs]);
}

/* ═══ 33. CONFETTI ═══ */
export function triggerConfetti() {
  const colors = ['#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#3b82f6'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;overflow:hidden';
  document.body.appendChild(container);
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    const size = Math.random() * 8 + 4;
    p.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${colors[i % colors.length]};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};left:${Math.random() * 100}%;top:-10px;opacity:1;`;
    container.appendChild(p);
    const duration = Math.random() * 1500 + 1000;
    const xDrift = (Math.random() - 0.5) * 200;
    p.animate([
      { transform: 'translateY(0) rotate(0)', opacity: 1 },
      { transform: `translateY(${window.innerHeight + 100}px) translateX(${xDrift}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], { duration, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)' });
  }
  setTimeout(() => container.remove(), 3000);
}

/* ═══ 35. SERVICE COLOR TAGS ═══ */
const SERVICE_COLORS: Record<string, string> = {
  'Transformação': 'bg-purple-100 text-purple-700 border-purple-200',
  'Tratamentos': 'bg-blue-100 text-blue-700 border-blue-200',
  'Corte': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Coloração': 'bg-amber-100 text-amber-700 border-amber-200',
  'Unhas': 'bg-pink-100 text-pink-700 border-pink-200',
  'Depilação': 'bg-rose-100 text-rose-700 border-rose-200',
};
export function getServiceColor(service: string): string {
  for (const [key, val] of Object.entries(SERVICE_COLORS)) {
    if (service.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

/* ═══ 37. COUNTDOWN PRÓXIMO ATENDIMENTO ═══ */
export function getNextBookingCountdown(bookings: { date: string; time: string; status: string }[]): string | null {
  const now = Date.now();
  const upcoming = bookings
    .filter(b => b.status === 'confirmed')
    .map(b => new Date(`${b.date}T${b.time}`).getTime())
    .filter(t => t > now)
    .sort((a, b) => a - b);
  if (!upcoming[0]) return null;
  const diff = upcoming[0] - now;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `${hrs}h ${mins}min`;
  return `${mins}min`;
}

/* ═══ 38. OCUPAÇÃO DO DIA ═══ */
export function getDayOccupancy(bookings: { status: string }[]): number {
  const totalSlots = 24; // 8 hours * 3 slots
  const confirmed = bookings.filter(b => b.status !== 'rejected').length;
  return Math.min(Math.round((confirmed / totalSlots) * 100), 100);
}

/* ═══ 12. REJECT MODAL ═══ */
export function RejectModal({ isOpen, onClose, onConfirm }: { isOpen: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const prevOpen = useRef(false);
  if (isOpen && !prevOpen.current) setReason('');
  prevOpen.current = isOpen;
  if (!isOpen) return null;
  return (
    <div className="admin-modal-root">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="admin-modal-overlay" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="admin-modal-card admin-modal-card-sm" role="dialog" aria-modal="true">
        <div className="admin-modal-header admin-modal-header-compact">
          <div className="admin-modal-icon admin-modal-icon-danger">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h3 className="admin-modal-title">Rejeitar Agendamento</h3>
            <p className="admin-modal-subtitle">Esta ação não pode ser desfeita</p>
          </div>
        </div>
        <div className="admin-modal-body">
        <textarea
          value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Motivo da rejeição (opcional)..."
          className="admin-input min-h-[96px] resize-none"
        />
        </div>
        <div className="admin-modal-footer">
          <button onClick={onClose} className="admin-btn-outline px-4 py-2 text-sm">Cancelar</button>
          <button onClick={() => { onConfirm(reason); setReason(''); }} className="admin-btn-danger px-4 py-2 text-sm">
            <XCircle className="w-3.5 h-3.5" /> Rejeitar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══ 36. SEARCH MODAL (Ctrl+K) ═══ */
export function SearchModal({ isOpen, onClose, onSearch }: { isOpen: boolean; onClose: () => void; onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('');
  useEffect(() => { if (isOpen) setQuery(''); }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="admin-modal-root admin-modal-root-start">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="admin-modal-overlay admin-modal-overlay-soft" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="admin-modal-card admin-modal-card-search" role="dialog" aria-modal="true">
        <input
          autoFocus value={query}
          onChange={e => { setQuery(e.target.value); onSearch(e.target.value); }}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          placeholder="Buscar clientes, serviços..."
          className="admin-modal-search-input"
        />
        <div className="admin-modal-shortcuts">
          <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--admin-surface-2)] text-[9px] font-mono">ESC</kbd> fechar</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--admin-surface-2)] text-[9px] font-mono">1-3</kbd> trocar tab</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--admin-surface-2)] text-[9px] font-mono">R</kbd> atualizar</span>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══ 10. THEME TOGGLE ═══ */
export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('admin-theme') === 'dark');
  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.style.setProperty('--admin-bg', '#0a0a0f');
      root.style.setProperty('--admin-surface', '#12121a');
      root.style.setProperty('--admin-surface-2', '#1a1a26');
      root.style.setProperty('--admin-surface-3', '#222230');
      root.style.setProperty('--admin-border', 'rgba(255,255,255,0.06)');
      root.style.setProperty('--admin-border-hover', 'rgba(255,255,255,0.12)');
      root.style.setProperty('--admin-text', '#e8e4df');
      root.style.setProperty('--admin-text-muted', '#6b6b7b');
    } else {
      root.style.setProperty('--admin-bg', '#f4f5f7');
      root.style.setProperty('--admin-surface', '#ffffff');
      root.style.setProperty('--admin-surface-2', '#f0f1f4');
      root.style.setProperty('--admin-surface-3', '#e5e7ec');
      root.style.setProperty('--admin-border', 'rgba(0,0,0,0.07)');
      root.style.setProperty('--admin-border-hover', 'rgba(0,0,0,0.14)');
      root.style.setProperty('--admin-text', '#1a1a2e');
      root.style.setProperty('--admin-text-muted', '#7c7e8a');
    }
    localStorage.setItem('admin-theme', dark ? 'dark' : 'light');
  }, [dark]);
  return { dark, toggle: () => setDark(d => !d) };
}
