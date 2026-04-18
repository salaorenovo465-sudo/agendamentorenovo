import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { formatBrazilWhatsappInput, formatDateBR, toStringValue } from '../AdminUtils';
import { exportBookingsCSV } from '../AdminFeatures';
import { getBookingAvailability } from '../api';
import type { AdminBooking, AdminCreateBookingPayload } from '../types';
import {
  createCollaboratorDraft,
  extractBookingServiceItems,
  getCollaboratorCoverage,
  type ServiceCatalogCategory,
  type ServiceCatalogItem,
} from '../collaboratorUtils';
import { DangerConfirmModal } from '../AdminHelpers';

type SelectedAgendaService = {
  category: string;
  name: string;
  price: string;
};

type CreateBookingForm = {
  clientMode: 'existing' | 'guest';
  clientId: string;
  name: string;
  phone: string;
  category: string;
  service: string;
  servicePrice: string;
  selectedServices: SelectedAgendaService[];
  date: string;
  time: string;
  professionalId: string;
  professionalName: string;
  status: 'pending' | 'confirmed';
};

type AvailabilityState = {
  busySlots: string[];
  loading: boolean;
  error: string;
  limitReached: boolean;
};

type ExpandedAgendaPanel = {
  bookingId: number;
  top: number;
  left: number;
  width: number;
};

const AGENDA_TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
];

const STATUS_LABELS: Record<AdminBooking['status'], string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  rejected: 'Rejeitado',
  completed: 'Finalizado',
};

const normalizeDigits = (value: string): string => value.replace(/\D/g, '');

const parseMoneyAmount = (value: string | null | undefined): number => {
  if (!value) return 0;
  const match = value.match(/[\d.]+(?:,\d{2})?|\d+(?:\.\d{2})?/);
  if (!match) return 0;
  return Number(match[0].replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
};

const buildInitialForm = (catalog: ServiceCatalogCategory[], date: string): CreateBookingForm => {
  const firstCategory = catalog[0];

  return {
    clientMode: 'guest',
    clientId: '',
    name: '',
    phone: '+55',
    category: firstCategory?.category || '',
    service: '',
    servicePrice: '',
    selectedServices: [],
    date,
    time: '09:00',
    professionalId: '',
    professionalName: '',
    status: 'pending',
  };
};

const formatCollaboratorOption = (
  name: string,
  matched: number,
  total: number,
  fullMatch: boolean,
): string => {
  if (total === 0) return name;
  if (fullMatch) return `${name} - cobertura total`;
  if (matched > 0) return `${name} - ${matched}/${total} servicos`;
  return `${name} - sem cobertura mapeada`;
};

const summarizeAgendaServices = (selectedServices: SelectedAgendaService[]): { service: string; servicePrice: string } => {
  if (selectedServices.length === 0) {
    return { service: '', servicePrice: '' };
  }

  const service = selectedServices.map((item) => item.name).join(' + ');
  const total = selectedServices.reduce((sum, item) => sum + parseMoneyAmount(item.price), 0);
  const hasConsult = selectedServices.some((item) => item.price.toLowerCase().includes('sob consulta') || parseMoneyAmount(item.price) === 0);
  const totalLabel = total > 0
    ? `Total estimado ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    : 'Sob consulta';

  return {
    service,
    servicePrice: hasConsult && total > 0 ? `${totalLabel} + itens sob consulta` : totalLabel,
  };
};

export function AgendaTab({
  bookings,
  bookingsLoading,
  dateScope,
  dateLabel,
  busyBookingId,
  rescheduleMap,
  setRescheduleMap,
  onConfirm,
  onComplete,
  onReject,
  onDelete,
  onReschedule,
  onCreateBooking,
  onAssignProfessional,
  onClearHistory,
  serviceCatalog,
  clients,
  professionals,
  defaultCreateDate,
}: {
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  dateScope: 'all' | 'range';
  dateLabel: string;
  busyBookingId: number | null;
  rescheduleMap: Record<number, { date: string; time: string }>;
  setRescheduleMap: Dispatch<SetStateAction<Record<number, { date: string; time: string }>>>;
  onConfirm: (booking: AdminBooking) => Promise<void>;
  onComplete: (booking: AdminBooking) => Promise<void>;
  onReject: (booking: AdminBooking) => Promise<void>;
  onDelete: (booking: AdminBooking, masterPassword: string) => Promise<void>;
  onReschedule: (booking: AdminBooking) => Promise<void>;
  onCreateBooking: (payload: AdminCreateBookingPayload) => Promise<void>;
  onAssignProfessional: (booking: AdminBooking, professionalId: number | null) => Promise<void>;
  onClearHistory: (masterPassword?: string) => Promise<void>;
  serviceCatalog: ServiceCatalogCategory[];
  clients: Record<string, unknown>[];
  professionals: Record<string, unknown>[];
  defaultCreateDate: string;
}) {
  const now = new Date();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateBookingForm>(() => buildInitialForm(serviceCatalog, defaultCreateDate));
  const [serviceQuery, setServiceQuery] = useState('');
  const [createError, setCreateError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearHistoryModalOpen, setClearHistoryModalOpen] = useState(false);
  const [deleteBookingTarget, setDeleteBookingTarget] = useState<AdminBooking | null>(null);
  const [deletingBooking, setDeletingBooking] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<ExpandedAgendaPanel | null>(null);
  const [scrollingColumns, setScrollingColumns] = useState<Record<string, boolean>>({});
  const panelCloseTimer = useRef<number | null>(null);
  const columnScrollTimers = useRef<Record<string, number>>({});
  const [availability, setAvailability] = useState<AvailabilityState>({
    busySlots: [],
    loading: false,
    error: '',
    limitReached: false,
  });
  const expandedBookingId = expandedPanel?.bookingId ?? null;

  const collaborators = useMemo(
    () => professionals
      .map((row) => createCollaboratorDraft(row, serviceCatalog))
      .filter((row) => row.id && row.name)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR')),
    [professionals, serviceCatalog],
  );

  const availableCollaborators = useMemo(
    () => collaborators.filter((row) => row.active),
    [collaborators],
  );

  const isOverdue = (booking: AdminBooking) => {
    if (booking.status === 'completed' || booking.status === 'rejected') return false;
    const bookingDate = new Date(`${booking.date}T${booking.time}`);
    return bookingDate < now;
  };

  const pending = bookings.filter((booking) => booking.status === 'pending' && !isOverdue(booking));
  const confirmed = bookings.filter((booking) => booking.status === 'confirmed' && !isOverdue(booking));
  const overdue = bookings.filter((booking) => isOverdue(booking));
  const completed = bookings.filter((booking) => booking.status === 'completed');

  const currentCategory = serviceCatalog.find((category) => category.category === createForm.category) || serviceCatalog[0];
  const currentServices = currentCategory?.items || [];
  const serviceSummary = summarizeAgendaServices(createForm.selectedServices);
  const filteredServices = currentServices.filter((service) => {
    const query = serviceQuery.trim().toLowerCase();
    if (!query) return true;
    return `${service.name} ${service.desc || ''} ${service.price}`.toLowerCase().includes(query);
  });

  const createCollaboratorOptions = useMemo(() => {
    return [...availableCollaborators].sort((a, b) => {
      const coverageA = getCollaboratorCoverage(a, createForm.selectedServices);
      const coverageB = getCollaboratorCoverage(b, createForm.selectedServices);

      if (Number(coverageB.fullMatch) !== Number(coverageA.fullMatch)) {
        return Number(coverageB.fullMatch) - Number(coverageA.fullMatch);
      }

      if (coverageB.matched !== coverageA.matched) {
        return coverageB.matched - coverageA.matched;
      }

      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [availableCollaborators, createForm.selectedServices]);

  const sortedClients = useMemo(
    () => clients
      .slice()
      .sort((left, right) => toStringValue(left.name).localeCompare(toStringValue(right.name), 'pt-BR')),
    [clients],
  );

  const selectedClientRecord = useMemo(
    () => sortedClients.find((row) => String(row.id || '') === createForm.clientId) || null,
    [createForm.clientId, sortedClients],
  );

  const cancelClosePanel = () => {
    if (typeof panelCloseTimer.current === 'number') {
      window.clearTimeout(panelCloseTimer.current);
      panelCloseTimer.current = null;
    }
  };

  const closeExpandedPanel = () => {
    cancelClosePanel();
    setExpandedPanel(null);
  };

  const scheduleClosePanel = () => {
    cancelClosePanel();
    panelCloseTimer.current = window.setTimeout(() => {
      setExpandedPanel(null);
      panelCloseTimer.current = null;
    }, 120);
  };

  const getExpandedPanelLayout = (card: HTMLDivElement): Omit<ExpandedAgendaPanel, 'bookingId'> => {
    const rect = card.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 14;
    const maxWidth = Math.min(360, window.innerWidth - (viewportPadding * 2));
    const minWidth = Math.min(320, maxWidth);
    const width = Math.max(minWidth, Math.min(360, Math.round(window.innerWidth * 0.24)));
    const fitsRight = rect.right + gap + width <= window.innerWidth - viewportPadding;
    const left = fitsRight
      ? Math.min(rect.right + gap, window.innerWidth - width - viewportPadding)
      : Math.max(viewportPadding, rect.left - width - gap);
    const top = Math.max(viewportPadding, Math.min(rect.top, window.innerHeight - 540));

    return { top, left, width };
  };

  const handleExpandBooking = (bookingId: number, card: HTMLDivElement | null) => {
    cancelClosePanel();
    if (card) {
      setExpandedPanel({ bookingId, ...getExpandedPanelLayout(card) });
    } else {
      setExpandedPanel((current) => (current?.bookingId === bookingId ? current : {
        bookingId,
        top: 96,
        left: 16,
        width: Math.min(360, window.innerWidth - 32),
      }));
    }
  };

  const handleColumnScroll = (columnKey: string) => {
    setScrollingColumns((current) => (current[columnKey] ? current : { ...current, [columnKey]: true }));

    const existingTimer = columnScrollTimers.current[columnKey];
    if (typeof existingTimer === 'number') {
      window.clearTimeout(existingTimer);
    }

    columnScrollTimers.current[columnKey] = window.setTimeout(() => {
      setScrollingColumns((current) => {
        if (!current[columnKey]) return current;
        const next = { ...current };
        delete next[columnKey];
        return next;
      });
      delete columnScrollTimers.current[columnKey];
    }, 520);
  };

  const handleColumnWheel = (columnKey: string, event: ReactWheelEvent<HTMLDivElement>) => {
    const column = event.currentTarget;
    const hasScrollableContent = column.scrollHeight > column.clientHeight + 1;
    const isVerticalScroll = Math.abs(event.deltaY) >= Math.abs(event.deltaX);

    if (!hasScrollableContent || !isVerticalScroll) return;

    // Keep wheel scrolling inside the hovered kanban column instead of bubbling to the page.
    column.scrollTop += event.deltaY;
    handleColumnScroll(columnKey);
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    if (expandedBookingId === null || typeof document === 'undefined' || typeof window === 'undefined') return undefined;

    const card = document.querySelector(`.agenda-booking-card[data-booking-id="${expandedBookingId}"]`);
    if (!(card instanceof HTMLDivElement)) return undefined;

    setExpandedPanel((current) => (current?.bookingId === expandedBookingId
      ? { bookingId: expandedBookingId, ...getExpandedPanelLayout(card) }
      : current));

    const syncLayout = () => {
      setExpandedPanel((current) => (current?.bookingId === expandedBookingId
        ? { bookingId: expandedBookingId, ...getExpandedPanelLayout(card) }
        : current));
    };

    const followUp = window.setTimeout(syncLayout, 110);
    const settle = window.setTimeout(syncLayout, 220);

    window.addEventListener('resize', syncLayout);
    window.addEventListener('scroll', syncLayout, true);

    return () => {
      window.clearTimeout(followUp);
      window.clearTimeout(settle);
      window.removeEventListener('resize', syncLayout);
      window.removeEventListener('scroll', syncLayout, true);
    };
  }, [expandedBookingId]);

  useEffect(() => {
    return () => {
      if (typeof panelCloseTimer.current === 'number') {
        window.clearTimeout(panelCloseTimer.current);
      }
      (Object.values(columnScrollTimers.current) as number[]).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const isSlotBusy = (slot: string): boolean => availability.busySlots.includes('all') || availability.busySlots.includes(slot);
  const selectedTimeBusy = isSlotBusy(createForm.time);
  const availableSlotsCount = AGENDA_TIME_SLOTS.filter((slot) => !isSlotBusy(slot)).length;
  const selectedCreateCollaborator = createCollaboratorOptions.find((row) => String(row.id) === createForm.professionalId)
    || availableCollaborators.find((row) => String(row.id) === createForm.professionalId)
    || null;
  const selectedCreateCoverage = selectedCreateCollaborator
    ? getCollaboratorCoverage(selectedCreateCollaborator, createForm.selectedServices)
    : null;

  const agendaStats = useMemo(() => {
    const active = pending.length + confirmed.length + overdue.length;
    const assigned = bookings.filter((booking) => booking.professionalId).length;

    return [
      { label: dateScope === 'all' ? 'Total geral' : 'Total no periodo', value: bookings.length, tone: 'wine' },
      { label: 'Operacao ativa', value: active, tone: 'gold' },
      { label: 'Com colaborador', value: assigned, tone: 'green' },
    ];
  }, [bookings, dateScope, overdue.length, pending.length, confirmed.length]);

  useEffect(() => {
    if (!createOpen || !createForm.date) return;

    let active = true;
    setAvailability({ busySlots: [], loading: true, error: '', limitReached: false });

    getBookingAvailability(createForm.date)
      .then((data) => {
        if (!active) return;
        setAvailability({
          busySlots: data.busySlots || [],
          loading: false,
          error: '',
          limitReached: Boolean(data.limitReached),
        });
      })
      .catch((error) => {
        if (!active) return;
        setAvailability({
          busySlots: [],
          loading: false,
          error: error instanceof Error ? error.message : 'Erro ao consultar disponibilidade.',
          limitReached: false,
        });
      });

    return () => {
      active = false;
    };
  }, [createOpen, createForm.date]);

  const openCreateModal = () => {
    setCreateForm(buildInitialForm(serviceCatalog, defaultCreateDate));
    setServiceQuery('');
    setCreateError('');
    setCreateOpen(true);
  };

  const handleClientModeChange = (mode: 'existing' | 'guest') => {
    setCreateForm((current) => ({
      ...current,
      clientMode: mode,
      clientId: mode === 'existing' ? current.clientId : '',
      name: mode === 'existing' ? current.name : '',
      phone: mode === 'existing' ? current.phone : '+55',
    }));
  };

  const handleClientSelect = (clientId: string) => {
    const selected = sortedClients.find((row) => String(row.id || '') === clientId) || null;
    setCreateForm((current) => ({
      ...current,
      clientMode: 'existing',
      clientId,
      name: toStringValue(selected?.name),
      phone: toStringValue(selected?.phone) || '+55',
    }));
  };

  const handleClearHistory = async (masterPassword?: string) => {
    setClearingHistory(true);
    try {
      await onClearHistory(masterPassword);
      setClearHistoryModalOpen(false);
    } finally {
      setClearingHistory(false);
    }
  };

  const handleDeleteBooking = async (masterPassword?: string) => {
    if (!deleteBookingTarget || !masterPassword) {
      return;
    }

    setDeletingBooking(true);
    try {
      await onDelete(deleteBookingTarget, masterPassword);
      if (expandedBookingId === deleteBookingTarget.id) {
        closeExpandedPanel();
      }
      setDeleteBookingTarget(null);
    } finally {
      setDeletingBooking(false);
    }
  };

  const handleCategoryChange = (categoryName: string) => {
    setCreateForm((current) => ({
      ...current,
      category: categoryName,
    }));
    setServiceQuery('');
  };

  const handleServiceSelect = (service: ServiceCatalogItem) => {
    const exists = createForm.selectedServices.some((item) => item.name === service.name);
    const nextServices = exists
      ? createForm.selectedServices.filter((item) => item.name !== service.name)
      : [...createForm.selectedServices, { category: createForm.category, name: service.name, price: service.price }];
    const nextSummary = summarizeAgendaServices(nextServices);

    setCreateForm((current) => ({
      ...current,
      selectedServices: nextServices,
      service: nextSummary.service,
      servicePrice: nextSummary.servicePrice,
    }));
  };

  const handleCreateProfessionalChange = (value: string) => {
    const selected = availableCollaborators.find((row) => String(row.id) === value) || null;

    setCreateForm((current) => ({
      ...current,
      professionalId: value,
      professionalName: selected?.name || '',
      status: value ? current.status : 'pending',
    }));
  };

  const canCreate =
    createForm.name.trim().length >= 3 &&
    normalizeDigits(createForm.phone).length >= 8 &&
    (createForm.clientMode === 'guest' || Boolean(createForm.clientId)) &&
    createForm.selectedServices.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(createForm.date) &&
    /^\d{2}:\d{2}$/.test(createForm.time) &&
    !availability.loading &&
    !selectedTimeBusy &&
    (createForm.status === 'pending' || Boolean(createForm.professionalId));

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError('');

    if (createForm.status === 'confirmed' && !createForm.professionalId) {
      setCreateError('Selecione o colaborador antes de criar um agendamento ja confirmado.');
      return;
    }

    if (!canCreate) {
      setCreateError(selectedTimeBusy ? 'Escolha um horario livre para criar o agendamento.' : 'Preencha cliente, telefone, servicos, data e horario.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateBooking({
        name: createForm.name.trim(),
        phone: createForm.phone.trim(),
        service: serviceSummary.service,
        servicePrice: serviceSummary.servicePrice || null,
        serviceItems: createForm.selectedServices,
        date: createForm.date,
        time: createForm.time,
        professionalId: createForm.professionalId ? Number(createForm.professionalId) : null,
        professionalName: createForm.professionalName || null,
        status: createForm.status,
      });
      setCreateOpen(false);
      setCreateForm(buildInitialForm(serviceCatalog, defaultCreateDate));
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Erro ao criar agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBookingPanelContent = (booking: AdminBooking, showOverdueAlert?: boolean) => {
    const schedule = rescheduleMap[booking.id] || { date: booking.date, time: booking.time };
    const busy = busyBookingId === booking.id;
    const hasCollaborator = Boolean(booking.professionalId && booking.professionalName);
    const canEditCollaborator = booking.status !== 'completed' && booking.status !== 'rejected';
    const serviceItems = extractBookingServiceItems(booking);

    return (
      <div className="agenda-booking-hover-panel">
        <div className="agenda-card-meta-grid">
          <div>
            <span>Data</span>
            <strong>{formatDateBR(booking.date)}</strong>
          </div>
          <div>
            <span>Hora</span>
            <strong>{booking.time}</strong>
          </div>
          <div>
            <span>Valor</span>
            <strong>{booking.servicePrice || 'Sob consulta'}</strong>
          </div>
          <div>
            <span>Colaborador</span>
            <strong>{booking.professionalName || 'Nao definido'}</strong>
          </div>
        </div>

        <div className="agenda-phone-line">
          <Phone style={{ width: 12, height: 12 }} /> {booking.phone}
        </div>

        {serviceItems.length > 0 && (
          <div className="agenda-selected-services agenda-inline-services">
            {serviceItems.map((service) => (
              <button key={`${booking.id}-${service.name}`} type="button" disabled>
                <span>{service.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="agenda-assignee-panel">
          <label className="admin-label">Colaborador responsavel</label>
          <select
            className="admin-input"
            value={booking.professionalId ? String(booking.professionalId) : ''}
            onChange={(event) => { void onAssignProfessional(booking, event.target.value ? Number(event.target.value) : null); }}
            disabled={busy || !canEditCollaborator}
          >
            <option value="" disabled={booking.status !== 'pending'}>{booking.status === 'pending' ? 'Selecionar colaborador' : 'Colaborador obrigatorio'}</option>
            {availableCollaborators.map((collaborator) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
          <small className={`agenda-assignee-help ${hasCollaborator ? 'ok' : 'warning'}`}>
            {hasCollaborator ? `Responsavel atual: ${booking.professionalName}` : 'Obrigatorio para sair de pendente.'}
          </small>
        </div>

        {!hasCollaborator && booking.status === 'pending' && (
          <div className="agenda-booking-warning">
            <AlertTriangle style={{ width: 12, height: 12 }} /> selecione o colaborador antes de confirmar ou finalizar
          </div>
        )}

        {booking.status !== 'completed' && (
          <div className="agenda-reschedule-row">
            <input
              type="date"
              className="admin-input-sm"
              value={schedule.date}
              onChange={(event) => setRescheduleMap((current) => ({ ...current, [booking.id]: { ...schedule, date: event.target.value } }))}
            />
            <input
              type="time"
              className="admin-input-sm"
              value={schedule.time}
              onChange={(event) => setRescheduleMap((current) => ({ ...current, [booking.id]: { ...schedule, time: event.target.value } }))}
            />
          </div>
        )}

        <div className="agenda-card-actions">
          {booking.status !== 'completed' && <button disabled={busy} onClick={() => void onReschedule(booking)} className="admin-btn-outline">Remarcar</button>}
          {booking.status !== 'confirmed' && booking.status !== 'completed' && (
            <button disabled={busy || !hasCollaborator} onClick={() => void onConfirm(booking)} className="admin-btn-success">
              <CheckCircle2 style={{ width: 12, height: 12 }} /> Confirmar
            </button>
          )}
          {(booking.status === 'confirmed' || isOverdue(booking) || showOverdueAlert) && (
            <button disabled={busy || !hasCollaborator} onClick={() => void onComplete(booking)} className="admin-btn-primary">
              <Sparkles style={{ width: 12, height: 12 }} /> Finalizar
            </button>
          )}
          {booking.status !== 'rejected' && booking.status !== 'completed' && (
            <button disabled={busy} onClick={() => void onReject(booking)} className="admin-btn-danger">
              <XCircle style={{ width: 12, height: 12 }} /> Rejeitar
            </button>
          )}
          <button disabled={busy || deletingBooking} onClick={() => setDeleteBookingTarget(booking)} className="admin-btn-outline agenda-delete-btn">
            <Trash2 style={{ width: 12, height: 12 }} /> Excluir
          </button>
        </div>
      </div>
    );
  };

  const renderBookingCard = (booking: AdminBooking, showOverdueAlert?: boolean) => {
    const statusKey = showOverdueAlert ? 'overdue' : booking.status;
    const hasCollaborator = Boolean(booking.professionalId && booking.professionalName);
    const serviceItems = extractBookingServiceItems(booking);
    const leadService = serviceItems[0]?.name || booking.service;
    const additionalServices = Math.max(0, serviceItems.length - 1);
    const isExpanded = expandedBookingId === booking.id;

    return (
      <div
        key={booking.id}
        className={`agenda-booking-card agenda-booking-card-${statusKey} ${isExpanded ? 'is-expanded' : ''}`}
        data-booking-id={booking.id}
        aria-busy={busyBookingId === booking.id}
        tabIndex={0}
        onMouseEnter={(event) => handleExpandBooking(booking.id, event.currentTarget)}
        onPointerEnter={(event) => handleExpandBooking(booking.id, event.currentTarget)}
        onFocus={(event) => handleExpandBooking(booking.id, event.currentTarget)}
        onMouseLeave={scheduleClosePanel}
        onBlur={scheduleClosePanel}
      >
        <div className="agenda-booking-static">
          <div className="agenda-card-topline">
            <span className={`agenda-status-pill agenda-status-${statusKey}`}>
              {showOverdueAlert ? 'Atrasado' : STATUS_LABELS[booking.status]}
            </span>
            <span className="agenda-card-id">#{booking.id}</span>
          </div>

          {showOverdueAlert && (
            <div className="agenda-overdue-ribbon">
              <AlertTriangle style={{ width: 12, height: 12 }} /> passou do horario sem finalizacao
            </div>
          )}

          <div className="agenda-client-row">
            <div className="admin-avatar agenda-avatar">{booking.name.charAt(0).toUpperCase()}</div>
            <div className="agenda-client-copy">
              <p>{booking.name}</p>
              <span>{leadService}{additionalServices > 0 ? ` +${additionalServices}` : ''}</span>
            </div>
          </div>

          <div className="agenda-card-service-line">
            <strong>{leadService}</strong>
            {additionalServices > 0 && <span>+{additionalServices} servicos</span>}
          </div>

          <div className="agenda-card-tags">
            <span>{formatDateBR(booking.date)}</span>
            <span>{booking.time}</span>
            {hasCollaborator && <span>{booking.professionalName}</span>}
            {!hasCollaborator && <span>Sem colaborador</span>}
          </div>
        </div>
      </div>
    );
  };

  const boardColumns = [
    ...(overdue.length > 0 ? [{ key: 'overdue', label: 'Atrasados', tone: 'danger', items: overdue, overdue: true }] : []),
    { key: 'pending', label: 'Pendentes', tone: 'warning', items: pending, overdue: false },
    { key: 'confirmed', label: 'Confirmados', tone: 'success', items: confirmed, overdue: false },
    { key: 'completed', label: 'Finalizados', tone: 'done', items: completed, overdue: false },
  ];
  const expandedBooking = expandedBookingId !== null
    ? bookings.find((booking) => booking.id === expandedBookingId) || null
    : null;
  const expandedBookingOverdue = expandedBookingId !== null && overdue.some((booking) => booking.id === expandedBookingId);

  return (
    <div className="agenda-page-shell">
      <section className="agenda-command-center">
        <div className="agenda-command-copy">
          <span className="agenda-eyebrow"><Zap style={{ width: 13, height: 13 }} /> Painel quantico de agenda</span>
          <h2>Agenda operacional - {dateLabel}</h2>
          <p>Controle os horarios, resolva atrasos, confirme clientes e crie novos agendamentos sem sair desta aba.</p>
        </div>

        <div className="agenda-command-actions">
          {bookings.length > 0 && (
            <button onClick={() => exportBookingsCSV(bookings)} className="admin-btn-outline agenda-header-btn">
              <Download className="w-3 h-3" /> Exportar CSV
            </button>
          )}
          <button
            onClick={() => setClearHistoryModalOpen(true)}
            className="admin-btn-danger agenda-header-btn"
            disabled={clearingHistory}
          >
            {clearingHistory ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Limpar historico
          </button>
          <button onClick={openCreateModal} className="admin-btn-primary agenda-new-booking-btn">
            <CalendarPlus style={{ width: 16, height: 16 }} /> Novo agendamento
          </button>
        </div>

        <div className="agenda-stat-grid">
          {agendaStats.map((stat) => (
            <div key={stat.label} className={`agenda-stat-card agenda-stat-${stat.tone}`}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      </section>

      {overdue.length > 0 && (
        <div className="agenda-overdue-alert">
          <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span>{overdue.length} agendamento(s) atrasado(s) precisam de finalizacao, remarcacao ou rejeicao.</span>
        </div>
      )}

      {bookingsLoading ? (
        <div className="agenda-loading-state">
          <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" /> Carregando agenda...
        </div>
      ) : (
        <div className="agenda-board" style={{ gridTemplateColumns: `repeat(${boardColumns.length}, minmax(260px, 1fr))` }}>
          {boardColumns.map((column) => (
            <section key={column.key} className={`agenda-board-column agenda-board-${column.tone}`}>
              <header>
                <div>
                  <span>{column.label}</span>
                  <strong>{column.items.length}</strong>
                </div>
              </header>
              <div
                className={`agenda-column-scroll ${scrollingColumns[column.key] ? 'is-scrolling' : ''}`}
                onScroll={() => handleColumnScroll(column.key)}
                onWheel={(event) => handleColumnWheel(column.key, event)}
              >
                {column.items.length === 0 ? (
                  <div className="agenda-empty-column">Nenhum agendamento nesta etapa.</div>
                ) : (
                  column.items.map((booking) => renderBookingCard(booking, column.overdue))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {expandedPanel && expandedBooking && typeof document !== 'undefined' && createPortal(
        <div
          className="agenda-booking-flyout"
          style={{ top: expandedPanel.top, left: expandedPanel.left, width: expandedPanel.width }}
          onMouseEnter={cancelClosePanel}
          onMouseLeave={closeExpandedPanel}
          onFocusCapture={cancelClosePanel}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              scheduleClosePanel();
            }
          }}
        >
          <div className="agenda-booking-flyout-head">
            <div>
              <span className="agenda-flyout-kicker">{expandedBookingOverdue ? 'Atrasado' : STATUS_LABELS[expandedBooking.status]}</span>
              <strong>{expandedBooking.name}</strong>
            </div>
            <button type="button" className="agenda-flyout-close" onClick={closeExpandedPanel} aria-label="Fechar painel">
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
          {renderBookingPanelContent(expandedBooking, expandedBookingOverdue)}
        </div>,
        document.body,
      )}

      <DangerConfirmModal
        isOpen={clearHistoryModalOpen}
        title="Limpar historico da agenda"
        subtitle="Todos os agendamentos serao removidos"
        description="A central de agenda sera esvaziada, os extratos vinculados serao apagados e os eventos associados tambem serao removidos quando houver integracao ativa."
        confirmText="LIMPAR AGENDA"
        confirmLabel="Apagar agenda"
        helperText="Esta limpeza remove o historico de agendamentos diretamente do Supabase e tenta excluir os eventos vinculados da agenda externa."
        requireMasterPassword
        passwordPlaceholder="Digite a senha master para limpar a agenda"
        busy={clearingHistory}
        onClose={() => setClearHistoryModalOpen(false)}
        onConfirm={handleClearHistory}
      />

      <DangerConfirmModal
        isOpen={Boolean(deleteBookingTarget)}
        title="Excluir agendamento"
        subtitle="O registro sera removido da agenda operacional"
        description={`Digite EXCLUIR AGENDAMENTO para apagar o agendamento de ${deleteBookingTarget?.name || 'este cliente'} e remover o registro vinculado.`}
        confirmText="EXCLUIR AGENDAMENTO"
        confirmLabel="Excluir agendamento"
        helperText="Esta exclusao remove o agendamento do Supabase e tenta apagar o evento vinculado no calendario quando existir."
        requireMasterPassword
        passwordPlaceholder="Digite a senha master para excluir o agendamento"
        busy={deletingBooking}
        onClose={() => {
          if (!deletingBooking) {
            setDeleteBookingTarget(null);
          }
        }}
        onConfirm={handleDeleteBooking}
      />

      {createOpen && (
        <div className="admin-modal-root agenda-create-root">
          <div className="admin-modal-overlay" onClick={() => setCreateOpen(false)} />
          <form className="agenda-create-modal" onSubmit={handleCreateSubmit} role="dialog" aria-modal="true">
            <header className="agenda-create-header">
              <div>
                <span className="agenda-eyebrow"><ShieldCheck style={{ width: 13, height: 13 }} /> Criacao assistida</span>
                <h3>Novo agendamento na Agenda</h3>
                <p>Cliente, servicos, colaborador, disponibilidade e status em um unico painel de controle.</p>
              </div>
              <button type="button" className="agenda-modal-close" onClick={() => setCreateOpen(false)} aria-label="Fechar modal">
                <X style={{ width: 18, height: 18 }} />
              </button>
            </header>

            <div className="agenda-create-modal-body">
              <section className="agenda-create-panel agenda-client-panel">
                <div className="agenda-panel-title">
                  <UserRound style={{ width: 16, height: 16 }} /> Cliente e comando
                </div>

                <div className="agenda-status-choice agenda-client-choice">
                  <button
                    type="button"
                    className={createForm.clientMode === 'existing' ? 'active' : ''}
                    onClick={() => handleClientModeChange('existing')}
                  >
                    Cliente cadastrado
                  </button>
                  <button
                    type="button"
                    className={createForm.clientMode === 'guest' ? 'active' : ''}
                    onClick={() => handleClientModeChange('guest')}
                  >
                    Cliente avulso
                  </button>
                </div>

                {createForm.clientMode === 'existing' ? (
                  <>
                    <label className="admin-label">Selecionar cliente</label>
                    <select
                      className="admin-input"
                      value={createForm.clientId}
                      onChange={(event) => handleClientSelect(event.target.value)}
                      autoFocus
                    >
                      <option value="">Escolher cliente da base</option>
                      {sortedClients.map((client) => (
                        <option key={String(client.id || toStringValue(client.phone))} value={String(client.id || '')}>
                          {toStringValue(client.name) || 'Cliente sem nome'} | {toStringValue(client.phone) || '--'}
                        </option>
                      ))}
                    </select>

                    <label className="admin-label">Nome do cliente</label>
                    <input
                      className="admin-input"
                      value={createForm.name}
                      readOnly
                      placeholder="Escolha um cliente da base"
                    />

                    <label className="admin-label">WhatsApp</label>
                    <input
                      className="admin-input"
                      value={createForm.phone}
                      readOnly
                      placeholder="+55"
                    />

                    {selectedClientRecord && (
                      <small className="agenda-client-mode-note">
                        Historico unificado pelo cadastro selecionado. Servico preferido: {toStringValue(selectedClientRecord.preferred_service) || 'nao definido'}.
                      </small>
                    )}
                  </>
                ) : (
                  <>
                    <label className="admin-label">Nome do cliente</label>
                    <input
                      className="admin-input"
                      value={createForm.name}
                      onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Nome completo"
                      autoFocus
                    />

                    <label className="admin-label">WhatsApp</label>
                    <input
                      className="admin-input"
                      value={createForm.phone}
                      onChange={(event) => setCreateForm((current) => ({ ...current, phone: formatBrazilWhatsappInput(event.target.value) }))}
                      placeholder="+55 (11) 99999-9999"
                    />
                  </>
                )}

                <div className="agenda-two-fields">
                  <div>
                    <label className="admin-label">Data</label>
                    <input
                      type="date"
                      className="admin-input"
                      value={createForm.date}
                      onChange={(event) => setCreateForm((current) => ({ ...current, date: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="admin-label">Horario</label>
                    <input
                      type="time"
                      className="admin-input"
                      value={createForm.time}
                      onChange={(event) => setCreateForm((current) => ({ ...current, time: event.target.value }))}
                    />
                  </div>
                </div>

                <label className="admin-label">Colaborador responsavel</label>
                <select
                  className="admin-input"
                  value={createForm.professionalId}
                  onChange={(event) => handleCreateProfessionalChange(event.target.value)}
                >
                  <option value="">Atribuir depois</option>
                  {createCollaboratorOptions.map((collaborator) => {
                    const coverage = getCollaboratorCoverage(collaborator, createForm.selectedServices);
                    return (
                      <option key={collaborator.id} value={collaborator.id}>
                        {formatCollaboratorOption(collaborator.name, coverage.matched, coverage.total, coverage.fullMatch)}
                      </option>
                    );
                  })}
                </select>
                <small className={`agenda-assignee-help ${selectedCreateCollaborator ? 'ok' : 'warning'}`}>
                  {selectedCreateCollaborator
                    ? selectedCreateCoverage?.fullMatch
                      ? `${selectedCreateCollaborator.name} cobre todos os servicos selecionados.`
                      : `${selectedCreateCollaborator.name} cobre ${selectedCreateCoverage?.matched || 0}/${selectedCreateCoverage?.total || 0} servicos.`
                    : 'Obrigatorio apenas para criar ja confirmado ou para tirar do pendente depois.'}
                </small>

                <label className="admin-label">Status inicial</label>
                <div className="agenda-status-choice">
                  <button
                    type="button"
                    className={createForm.status === 'pending' ? 'active' : ''}
                    onClick={() => setCreateForm((current) => ({ ...current, status: 'pending' }))}
                  >
                    Pendente
                  </button>
                  <button
                    type="button"
                    className={createForm.status === 'confirmed' ? 'active' : ''}
                    disabled={!createForm.professionalId}
                    onClick={() => setCreateForm((current) => ({ ...current, status: 'confirmed' }))}
                  >
                    Confirmado
                  </button>
                </div>
              </section>

              <section className="agenda-create-panel agenda-service-panel">
                <div className="agenda-panel-title">
                  <Sparkles style={{ width: 16, height: 16 }} /> Servico
                </div>

                <div className="agenda-category-strip">
                  {serviceCatalog.map((category) => (
                    <button
                      key={category.category}
                      type="button"
                      className={category.category === createForm.category ? 'active' : ''}
                      onClick={() => handleCategoryChange(category.category)}
                    >
                      {category.category}
                    </button>
                  ))}
                </div>

                <div className="agenda-search-box">
                  <Search style={{ width: 14, height: 14 }} />
                  <input value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Buscar servico..." />
                </div>

	                <div className="agenda-service-list">
	                  {filteredServices.map((service) => {
	                    const isSelected = createForm.selectedServices.some((item) => item.name === service.name);
	                    return (
	                      <button
	                        key={service.name}
	                        type="button"
	                        className={`agenda-service-option ${isSelected ? 'active' : ''}`}
	                        onClick={() => handleServiceSelect(service)}
	                      >
	                        <span>{service.name}</span>
	                        <small>{service.desc || 'Servico do catalogo'}</small>
	                        <strong>{service.price}</strong>
	                      </button>
	                    );
	                  })}
	                  {filteredServices.length === 0 && <div className="agenda-empty-column">Nenhum servico encontrado.</div>}
	                </div>
	                {createForm.selectedServices.length > 0 && (
	                  <div className="agenda-selected-services">
	                    {createForm.selectedServices.map((service) => (
	                      <button key={service.name} type="button" onClick={() => handleServiceSelect(service)}>
	                        <span>{service.name}</span>
	                        <X style={{ width: 12, height: 12 }} />
	                      </button>
	                    ))}
	                  </div>
	                )}
	              </section>

              <section className="agenda-create-panel agenda-orbit-panel">
                <div className="agenda-panel-title">
                  <Clock3 style={{ width: 16, height: 16 }} /> Horarios e revisao
                </div>

                <div className="agenda-availability-card">
                  <span>{availability.loading ? 'Sincronizando disponibilidade...' : 'Disponibilidade do dia'}</span>
                  <strong>{availability.loading ? '...' : `${availableSlotsCount}/${AGENDA_TIME_SLOTS.length} livres`}</strong>
                  {availability.error && <p>{availability.error}</p>}
                  {availability.limitReached && <p>Limite diario atingido.</p>}
                </div>

                <div className="agenda-time-grid">
                  {AGENDA_TIME_SLOTS.map((slot) => {
                    const blocked = isSlotBusy(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={blocked}
                        className={`${createForm.time === slot ? 'active' : ''} ${blocked ? 'blocked' : ''}`}
                        onClick={() => setCreateForm((current) => ({ ...current, time: slot }))}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>

                <div className="agenda-review-card">
                  <span>Resumo quantico</span>
                  <h4>{createForm.name.trim() || 'Cliente ainda sem nome'}</h4>
                  <p>{serviceSummary.service || 'Selecione um ou mais servicos'}</p>
                  <div>
                    <strong>{createForm.date ? formatDateBR(createForm.date) : '--'} as {createForm.time}</strong>
                    <small>{serviceSummary.servicePrice || 'Valor sob consulta'}</small>
                  </div>
                  <div>
                    <strong>{createForm.professionalName || 'Sem colaborador definido'}</strong>
                    <small>{createForm.status === 'confirmed' ? 'Status inicial confirmado' : 'Entrara em pendente'}</small>
                  </div>
                  <div className={`agenda-review-status ${selectedTimeBusy ? 'blocked' : 'ok'}`}>
                    {selectedTimeBusy ? 'Horario indisponivel' : 'Horario liberado'}
                  </div>
                </div>
              </section>
            </div>

            <footer className="agenda-create-footer">
              <div>
                {createError && <span className="agenda-create-error">{createError}</span>}
                {!createError && <span>{createForm.status === 'confirmed' ? 'Sera criado ja com colaborador definido e pronto para operacao.' : 'Pode ficar pendente e receber o colaborador depois.'}</span>}
              </div>
              <button type="button" className="admin-btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button type="submit" className="admin-btn-primary agenda-create-submit" disabled={!canCreate || submitting}>
                {submitting ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <CalendarPlus style={{ width: 14, height: 14 }} />}
                {submitting ? 'Criando...' : 'Criar agendamento'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
