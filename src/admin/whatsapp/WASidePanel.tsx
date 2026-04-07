import { useState } from 'react';
import {
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageCircle,
  RefreshCw,
  Tag,
  UserPlus,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';

import WAAvatar from './WAAvatar';
import type { WAContact, ConversationStatus, BookingRescheduleModal, BookingCancelModal } from './wa-types';
import type { AdminBooking, AdminInternalNote } from '../types';
import { bookingStatusLabel, formatDateTimeLabel, noteTimeLabel, inferServiceCategory, parseServicePrice } from './wa-utils';

type Props = {
  contact: WAContact;
  panelLoading: boolean;
  panelBookings: AdminBooking[];
  panelNotes: AdminInternalNote[];
  panelError: string;
  assigneeInput: string;
  onAssigneeChange: (v: string) => void;
  statusInput: ConversationStatus;
  onStatusChange: (v: ConversationStatus) => void;
  labelsInput: string;
  onLabelsChange: (v: string) => void;
  noteInput: string;
  onNoteChange: (v: string) => void;
  operationalBusy: boolean;
  actionBookingId: number | null;
  linkedClient: Record<string, unknown> | null;
  registerClientBusy: boolean;
  onRegisterClient: (name: string, phone: string, service?: string) => void;
  onSaveOperational: () => void;
  onAddNote: () => void;
  onConfirmBooking: (b: AdminBooking) => void;
  onRejectBooking: (id: number, reason: string) => void;
  onRescheduleBooking: (id: number, date: string, time: string) => void;
  onRefreshPanel: () => void;
  onClose: () => void;
};

export default function WASidePanel({
  contact,
  panelLoading,
  panelBookings,
  panelNotes,
  panelError,
  assigneeInput,
  onAssigneeChange,
  statusInput,
  onStatusChange,
  labelsInput,
  onLabelsChange,
  noteInput,
  onNoteChange,
  operationalBusy,
  actionBookingId,
  linkedClient,
  registerClientBusy,
  onRegisterClient,
  onSaveOperational,
  onAddNote,
  onConfirmBooking,
  onRejectBooking,
  onRescheduleBooking,
  onRefreshPanel,
  onClose,
}: Props) {
  const [sectionOpen, setSectionOpen] = useState({ info: true, ops: true, bookings: true, notes: true });
  const [reschedule, setReschedule] = useState<BookingRescheduleModal>({ open: false, bookingId: null, date: '', time: '' });
  const [cancel, setCancel] = useState<BookingCancelModal>({ open: false, bookingId: null, reason: '' });

  const toggleSection = (key: keyof typeof sectionOpen) => {
    setSectionOpen((s) => ({ ...s, [key]: !s[key] }));
  };

  const SectionHeader = ({ label, sectionKey }: { label: string; sectionKey: keyof typeof sectionOpen }) => (
    <button className="wa2-panel-section-header" onClick={() => toggleSection(sectionKey)}>
      {sectionOpen[sectionKey] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      <span>{label}</span>
    </button>
  );

  const statusColor = (s: string) => {
    if (s === 'pending') return 'wa2-status-pending';
    if (s === 'confirmed') return 'wa2-status-confirmed';
    return 'wa2-status-rejected';
  };

  return (
    <aside className="wa2-panel">
      {/* Close button for smaller screens */}
      <div className="wa2-panel-top">
        <span className="wa2-panel-top-title">Detalhes</span>
        <button className="wa2-icon-btn-sm" onClick={onClose}><X className="w-4 h-4" /></button>
      </div>

      {/* Contact info */}
      <div className="wa2-panel-section">
        <SectionHeader label="Contato" sectionKey="info" />
        {sectionOpen.info && (
          <div className="wa2-panel-contact">
            <WAAvatar name={contact.name} avatarUrl={contact.avatarUrl} size={52} online={contact.online} />
            <div>
              <p className="wa2-panel-contact-name">{contact.name}</p>
              <p className="wa2-panel-contact-phone">{contact.phone}</p>
            </div>
          </div>
        )}
        {sectionOpen.info && (
          <div className="wa2-chip-row">
            <span className={`wa2-chip wa2-chip-${contact.conversationStatus}`}>{contact.conversationStatus}</span>
            {(contact.labels || []).map((l) => (
              <span key={l} className="wa2-chip">#{l}</span>
            ))}
          </div>
        )}
        {sectionOpen.info && (
          <div className="wa2-panel-client-row">
            {linkedClient ? (
              <span className="wa2-client-badge registered">
                <Check className="w-3.5 h-3.5" /> Cliente cadastrado
              </span>
            ) : (
              <button
                className="wa2-panel-btn-secondary"
                disabled={registerClientBusy}
                onClick={() => onRegisterClient(
                  contact.name,
                  contact.phone,
                  panelBookings[0]?.service,
                )}
              >
                {registerClientBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Cadastrar Cliente
              </button>
            )}
          </div>
        )}
      </div>

      {/* Operational */}
      <div className="wa2-panel-section">
        <SectionHeader label="Operacional" sectionKey="ops" />
        {sectionOpen.ops && (
          <div className="wa2-panel-form">
            <label className="wa2-panel-label">
              <UserRound className="w-3.5 h-3.5" /> Responsavel
            </label>
            <input className="wa2-panel-input" value={assigneeInput} onChange={(e) => onAssigneeChange(e.target.value)} placeholder="ex.: ana.silva" />

            <label className="wa2-panel-label">
              <BadgeCheck className="w-3.5 h-3.5" /> Status
            </label>
            <select className="wa2-panel-input" value={statusInput} onChange={(e) => onStatusChange(e.target.value as ConversationStatus)}>
              <option value="open">Aberto</option>
              <option value="pending">Pendente</option>
              <option value="resolved">Resolvido</option>
            </select>

            <label className="wa2-panel-label">
              <Tag className="w-3.5 h-3.5" /> Tags
            </label>
            <input className="wa2-panel-input" value={labelsInput} onChange={(e) => onLabelsChange(e.target.value)} placeholder="vip, reagendamento" />

            <button className="wa2-panel-btn-primary" disabled={operationalBusy} onClick={onSaveOperational}>
              {operationalBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar
            </button>
          </div>
        )}
      </div>

      {/* Bookings */}
      <div className="wa2-panel-section">
        <SectionHeader label={`Agendamentos (${panelBookings.length})`} sectionKey="bookings" />
        {sectionOpen.bookings && (
          <div className="wa2-panel-bookings">
            <button className="wa2-panel-refresh" onClick={onRefreshPanel}>
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </button>
            {panelLoading ? (
              <div className="wa2-panel-empty"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : panelBookings.length === 0 ? (
              <div className="wa2-panel-empty">Nenhum agendamento</div>
            ) : (
              panelBookings.map((b) => {
                const busy = actionBookingId === b.id;
                return (
                  <div key={b.id} className="wa2-booking-card">
                    <div className="wa2-booking-card-top">
                      <div>
                        <span className="wa2-booking-title">#{b.id} — {b.service}</span>
                        <span className="wa2-booking-category">{inferServiceCategory(b.service)}</span>
                        <span className="wa2-booking-meta">
                          {formatDateTimeLabel(b.date, b.time)}
                          {b.servicePrice && <> · <strong>{parseServicePrice(b.servicePrice)}</strong></>}
                        </span>
                      </div>
                      <span className={`wa2-booking-status ${statusColor(b.status)}`}>
                        {bookingStatusLabel(b.status)}
                      </span>
                    </div>
                    <div className="wa2-booking-actions">
                      {b.status === 'pending' && (
                        <button className="wa2-booking-btn confirm" onClick={() => onConfirmBooking(b)} disabled={busy}>
                          <Check className="w-3.5 h-3.5" /> Confirmar
                        </button>
                      )}
                      {b.status !== 'rejected' && (
                        <>
                          <button
                            className="wa2-booking-btn reschedule"
                            onClick={() => setReschedule({ open: true, bookingId: b.id, date: b.date, time: b.time })}
                            disabled={busy}
                          >
                            <CalendarClock className="w-3.5 h-3.5" /> Remarcar
                          </button>
                          <button
                            className="wa2-booking-btn cancel"
                            onClick={() => setCancel({ open: true, bookingId: b.id, reason: b.rejectionReason || '' })}
                            disabled={busy}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="wa2-panel-section">
        <SectionHeader label={`Notas (${panelNotes.length})`} sectionKey="notes" />
        {sectionOpen.notes && (
          <div className="wa2-panel-notes">
            {panelNotes.length === 0 && <div className="wa2-panel-empty">Sem notas</div>}
            {panelNotes.map((n) => (
              <div key={n.id} className="wa2-note-card">
                <p className="wa2-note-text">{n.content}</p>
                <p className="wa2-note-meta">{n.author || 'sistema'} · {noteTimeLabel(n.createdAt)}</p>
              </div>
            ))}
            <textarea
              className="wa2-panel-input wa2-note-textarea"
              value={noteInput}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Nova nota interna..."
            />
            <button className="wa2-panel-btn-secondary" disabled={operationalBusy || !noteInput.trim()} onClick={onAddNote}>
              <MessageCircle className="w-3.5 h-3.5" /> Salvar nota
            </button>
          </div>
        )}
      </div>

      {panelError && <div className="wa2-panel-error">{panelError}</div>}

      {/* Reschedule modal */}
      {reschedule.open && (
        <div className="wa2-modal-overlay">
          <div className="wa2-modal">
            <div className="wa2-modal-header">
              <h3>Remarcar</h3>
              <button className="wa2-icon-btn-sm" onClick={() => setReschedule({ open: false, bookingId: null, date: '', time: '' })}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="wa2-modal-body">
              <label className="wa2-modal-label">
                Data
                <input type="date" className="wa2-panel-input" value={reschedule.date} onChange={(e) => setReschedule((s) => ({ ...s, date: e.target.value }))} />
              </label>
              <label className="wa2-modal-label">
                Horario
                <input type="time" className="wa2-panel-input" value={reschedule.time} onChange={(e) => setReschedule((s) => ({ ...s, time: e.target.value }))} />
              </label>
            </div>
            <div className="wa2-modal-footer">
              <button className="wa2-modal-btn neutral" onClick={() => setReschedule({ open: false, bookingId: null, date: '', time: '' })}>Cancelar</button>
              <button
                className="wa2-modal-btn primary"
                onClick={() => {
                  if (reschedule.bookingId && reschedule.date && reschedule.time) {
                    onRescheduleBooking(reschedule.bookingId, reschedule.date, reschedule.time);
                    setReschedule({ open: false, bookingId: null, date: '', time: '' });
                  }
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {cancel.open && (
        <div className="wa2-modal-overlay">
          <div className="wa2-modal">
            <div className="wa2-modal-header">
              <h3>Cancelar agendamento</h3>
              <button className="wa2-icon-btn-sm" onClick={() => setCancel({ open: false, bookingId: null, reason: '' })}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="wa2-modal-body">
              <label className="wa2-modal-label">
                Motivo
                <textarea className="wa2-panel-input wa2-note-textarea" value={cancel.reason} onChange={(e) => setCancel((s) => ({ ...s, reason: e.target.value }))} placeholder="Motivo do cancelamento..." />
              </label>
            </div>
            <div className="wa2-modal-footer">
              <button className="wa2-modal-btn neutral" onClick={() => setCancel({ open: false, bookingId: null, reason: '' })}>Voltar</button>
              <button
                className="wa2-modal-btn danger"
                onClick={() => {
                  if (cancel.bookingId) {
                    onRejectBooking(cancel.bookingId, cancel.reason);
                    setCancel({ open: false, bookingId: null, reason: '' });
                  }
                }}
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
