import { inboxStore } from '../db/inboxStore';
import { bookingStore } from '../db/bookingStore';
import { workbenchStore } from '../db/workbenchStore';
import type { BookingRecord } from '../types';

import { createAdminBookingNotification } from './adminNotificationService';
import { sendEvolutionMessageToCustomer } from './evolutionIntegrationService';

const BOOKING_NOTIFICATION_SCOPE = 'booking_notifications';
const MAX_BOOKING_NOTIFICATION_LOGS = 1200;
const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();

type BookingNotificationType =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'rescheduled'
  | 'cancelled';

type BookingNotificationStatus = 'sent' | 'failed' | 'skipped';

type BookingNotificationLog = {
  id: string;
  tenantSlug: string;
  bookingId: number;
  type: BookingNotificationType;
  status: BookingNotificationStatus;
  phone: string;
  customerName: string;
  message: string;
  createdAt: string;
  sentAt: string | null;
  providerMessageId: string | null;
  reason: string | null;
};

type NotificationStoreShape = {
  items?: BookingNotificationLog[];
};

const normalizeTenantSlug = (tenantSlug?: string): string => {
  const normalized = (tenantSlug || '').trim().toLowerCase();
  return normalized || DEFAULT_TENANT_SLUG;
};

const toTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const formatBookingDate = (date: string): string => date.split('-').reverse().join('/');

const resolveBookingServiceLabel = (booking: BookingRecord): string => {
  const serviceItems = Array.isArray(booking.serviceItems) ? booking.serviceItems : [];
  const names = serviceItems
    .map((item) => toTrimmedString(item.name))
    .filter(Boolean);

  if (names.length > 0) {
    return names.join(', ');
  }

  return booking.service || 'Servico';
};

const buildPendingBookingMessage = (booking: BookingRecord): string => [
  '\u2728 *AGENDAMENTO EM CONFIRMACAO* \u2728',
  '',
  `Ola, *${booking.name}*! \u{1F496}`,
  'Somos do *Estudio Renovo* e seu agendamento ja foi recebido com sucesso. \u{1F338}',
  '',
  'No momento, ele esta na *etapa de confirmacao* \u23F3',
  'Em breve, nossa equipe enviara o retorno com a confirmacao do seu horario. \u{1F4AC}\u2728',
  '',
  'Agradecemos pela preferencia! \u{1F495}',
].join('\n');

const buildConfirmedBookingMessage = (booking: BookingRecord): string => [
  '\u2705 *AGENDAMENTO CONFIRMADO* \u2705',
  '',
  `Ola, *${booking.name}*! \u{1F496}`,
  'Seu agendamento foi *confirmado com sucesso* no *Estudio Renovo*. \u2728',
  '',
  '\u{1F451} *SERVICO:*',
  resolveBookingServiceLabel(booking),
  '',
  `\u{1F4C5} *DATA:* ${formatBookingDate(booking.date)}`,
  `\u23F0 *HORARIO:* ${booking.time}`,
  '',
  'Estamos te esperando para deixar seu visual ainda mais lindo(a)! \u{1F338}\u{1F495}',
  'Qualquer duvida, estamos a disposicao. \u{1F4AC}',
].join('\n');

const buildRejectedBookingMessage = (booking: BookingRecord): string => [
  '\u26A0\uFE0F *AGENDAMENTO NAO CONFIRMADO* \u26A0\uFE0F',
  '',
  `Ola, *${booking.name}*!`,
  'Seu agendamento nao conseguiu seguir para confirmacao neste momento.',
  '',
  `Servico: ${resolveBookingServiceLabel(booking)}`,
  `Data: ${formatBookingDate(booking.date)}`,
  `Horario: ${booking.time}`,
  booking.rejectionReason ? `Motivo: ${booking.rejectionReason}` : '',
  '',
  'Se quiser, responda esta mensagem para tentarmos um novo horario.',
].filter(Boolean).join('\n');

const buildRescheduledBookingMessage = (booking: BookingRecord): string => [
  '\u{1F504} *AGENDAMENTO REMARCADO*',
  '',
  `Ola, *${booking.name}*!`,
  'Seu horario foi atualizado no Estudio Renovo.',
  '',
  `Servico: ${resolveBookingServiceLabel(booking)}`,
  `Data: ${formatBookingDate(booking.date)}`,
  `Horario: ${booking.time}`,
  '',
  'Se precisar de outro ajuste, responda esta mensagem.',
].join('\n');

const buildCancelledBookingMessage = (booking: BookingRecord): string => [
  '\u274C *AGENDAMENTO CANCELADO*',
  '',
  `Ola, *${booking.name}*!`,
  'Seu agendamento foi cancelado conforme solicitado.',
  '',
  `Servico: ${resolveBookingServiceLabel(booking)}`,
  `Data: ${formatBookingDate(booking.date)}`,
  `Horario: ${booking.time}`,
  '',
  'Quando quiser, sera um prazer receber um novo agendamento seu.',
].join('\n');

const buildBookingMessage = (booking: BookingRecord, type: BookingNotificationType): string => {
  if (type === 'confirmed') return buildConfirmedBookingMessage(booking);
  if (type === 'rejected') return buildRejectedBookingMessage(booking);
  if (type === 'rescheduled') return buildRescheduledBookingMessage(booking);
  if (type === 'cancelled') return buildCancelledBookingMessage(booking);
  return buildPendingBookingMessage(booking);
};

const sanitizeLogs = (value: unknown): BookingNotificationLog[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const sanitized: BookingNotificationLog[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const row = item as Record<string, unknown>;
    const id = toTrimmedString(row.id);
    if (!id || seen.has(id)) {
      continue;
    }

    const typeRaw = toTrimmedString(row.type);
    const statusRaw = toTrimmedString(row.status);
    const type: BookingNotificationType | null = (
      typeRaw === 'pending'
      || typeRaw === 'confirmed'
      || typeRaw === 'rejected'
      || typeRaw === 'rescheduled'
      || typeRaw === 'cancelled'
    ) ? typeRaw : null;
    const status: BookingNotificationStatus | null = (
      statusRaw === 'sent'
      || statusRaw === 'failed'
      || statusRaw === 'skipped'
    ) ? statusRaw : null;

    if (!type || !status) {
      continue;
    }

    const bookingId = Number(row.bookingId || 0);
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      continue;
    }

    sanitized.push({
      id,
      tenantSlug: normalizeTenantSlug(toTrimmedString(row.tenantSlug)),
      bookingId,
      type,
      status,
      phone: toTrimmedString(row.phone),
      customerName: toTrimmedString(row.customerName) || 'Cliente',
      message: toTrimmedString(row.message),
      createdAt: toTrimmedString(row.createdAt) || new Date().toISOString(),
      sentAt: row.sentAt === null ? null : toTrimmedString(row.sentAt) || null,
      providerMessageId: toTrimmedString(row.providerMessageId) || null,
      reason: toTrimmedString(row.reason) || null,
    });
    seen.add(id);
  }

  return sanitized
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_BOOKING_NOTIFICATION_LOGS);
};

const loadLogs = async (tenantSlug?: string): Promise<BookingNotificationLog[]> => {
  const store = await workbenchStore.getScopedSetting(BOOKING_NOTIFICATION_SCOPE, tenantSlug);
  return sanitizeLogs((store as NotificationStoreShape).items);
};

const saveLogs = async (
  logs: BookingNotificationLog[],
  tenantSlug?: string,
): Promise<BookingNotificationLog[]> => {
  const saved = await workbenchStore.saveScopedSetting(
    BOOKING_NOTIFICATION_SCOPE,
    { items: logs.slice(0, MAX_BOOKING_NOTIFICATION_LOGS) },
    tenantSlug,
  );
  return sanitizeLogs((saved as NotificationStoreShape).items);
};

const ensureThreadId = async (booking: BookingRecord): Promise<number | null> => {
  if (booking.whatsappThreadId) {
    return booking.whatsappThreadId;
  }

  try {
    const thread = await inboxStore.ensureThread(booking.phone, booking.name);
    return thread.id;
  } catch (error) {
    console.error('Falha ao garantir thread para notificacao:', error);
    return null;
  }
};

const trackCustomerMessage = async (
  booking: BookingRecord,
  message: string,
  status: BookingNotificationStatus,
  providerMessageId: string | null,
  reason: string | null,
): Promise<void> => {
  const threadId = await ensureThreadId(booking);
  if (!threadId) {
    return;
  }

  try {
    await inboxStore.addMessage({
      threadId,
      direction: status === 'sent' ? 'outgoing' : 'system',
      content: status === 'sent' ? message : `Falha ao enviar mensagem automatica: ${reason || message}`,
      providerMessageId,
      isRead: true,
    });
  } catch (error) {
    console.error('Falha ao registrar mensagem automatica no inbox:', error);
  }
};

const persistLog = async (
  log: BookingNotificationLog,
  tenantSlug?: string,
): Promise<BookingNotificationLog[]> => {
  const logs = await loadLogs(tenantSlug);
  return saveLogs([log, ...logs], tenantSlug);
};

const sendBookingNotification = async (
  booking: BookingRecord,
  type: BookingNotificationType,
  tenantSlug?: string,
): Promise<void> => {
  const normalizedTenant = normalizeTenantSlug(tenantSlug);
  const logs = await loadLogs(normalizedTenant);
  const message = buildBookingMessage(booking, type);
  const existingSent = logs.find((log) => log.bookingId === booking.id && log.type === type && log.status === 'sent');

  if (existingSent) {
    await persistLog({
      id: `booking_notification_${booking.id}_${type}_${Date.now()}`,
      tenantSlug: normalizedTenant,
      bookingId: booking.id,
      type,
      status: 'skipped',
      phone: booking.phone,
      customerName: booking.name,
      message,
      createdAt: new Date().toISOString(),
      sentAt: null,
      providerMessageId: null,
      reason: 'Mensagem ja enviada anteriormente para este agendamento.',
    }, normalizedTenant);
    return;
  }

  try {
    const providerMessageId = await sendEvolutionMessageToCustomer(normalizedTenant, booking.phone, message);
    const sentAt = new Date().toISOString();

    await persistLog({
      id: `booking_notification_${booking.id}_${type}_${Date.now()}`,
      tenantSlug: normalizedTenant,
      bookingId: booking.id,
      type,
      status: 'sent',
      phone: booking.phone,
      customerName: booking.name,
      message,
      createdAt: sentAt,
      sentAt,
      providerMessageId,
      reason: null,
    }, normalizedTenant);

    await trackCustomerMessage(booking, message, 'sent', providerMessageId, null);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Falha ao enviar mensagem pela Evolution.';
    await persistLog({
      id: `booking_notification_${booking.id}_${type}_${Date.now()}`,
      tenantSlug: normalizedTenant,
      bookingId: booking.id,
      type,
      status: 'failed',
      phone: booking.phone,
      customerName: booking.name,
      message,
      createdAt: new Date().toISOString(),
      sentAt: null,
      providerMessageId: null,
      reason,
    }, normalizedTenant);
    await trackCustomerMessage(booking, message, 'failed', null, reason);
    throw error;
  }
};

export const notifySalonNewBooking = async (booking: BookingRecord, tenantSlug?: string): Promise<void> => {
  await createAdminBookingNotification(booking, normalizeTenantSlug(tenantSlug));
};

export const notifyCustomerPendingBooking = async (booking: BookingRecord, tenantSlug?: string): Promise<void> => {
  await sendBookingNotification(booking, 'pending', tenantSlug);
};

export const notifyCustomerConfirmedBooking = async (booking: BookingRecord, tenantSlug?: string): Promise<void> => {
  await sendBookingNotification(booking, 'confirmed', tenantSlug);
};

export const notifyCustomerRejectedBooking = async (booking: BookingRecord, tenantSlug?: string): Promise<void> => {
  await sendBookingNotification(booking, 'rejected', tenantSlug);
};

export const notifyCustomerRescheduledBooking = async (booking: BookingRecord, tenantSlug?: string): Promise<void> => {
  await sendBookingNotification(booking, 'rescheduled', tenantSlug);
};

export const notifyCustomerCancelledBooking = async (booking: BookingRecord, tenantSlug?: string): Promise<void> => {
  await sendBookingNotification(booking, 'cancelled', tenantSlug);
};

export const handleClientCancellationRequest = async (
  phone: string,
  text: string,
  tenantSlug?: string,
): Promise<boolean> => {
  const normalizedText = text.toLowerCase().trim();
  const cancelKeywords = ['cancelar', 'cancela', 'cancelamento', 'cancelo', 'quero cancelar', 'desmarcar', 'desmarco'];
  const isCancelRequest = cancelKeywords.some((keyword) => normalizedText.includes(keyword));

  if (!isCancelRequest) {
    return false;
  }

  try {
    const bookings = await bookingStore.listByPhone(phone);
    const activeBookings = bookings.filter((booking) => booking.status === 'pending' || booking.status === 'confirmed');
    if (activeBookings.length === 0) {
      return false;
    }

    const today = new Date().toISOString().slice(0, 10);
    const bookingToCancel = activeBookings
      .filter((booking) => booking.date >= today)
      .sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time))[0] || activeBookings[0];

    await bookingStore.updateStatus({
      id: bookingToCancel.id,
      status: 'rejected',
      rejectionReason: 'Cancelado a pedido do cliente.',
    });

    const updatedBooking = await bookingStore.getById(bookingToCancel.id);
    if (!updatedBooking) {
      return false;
    }

    await notifyCustomerCancelledBooking(updatedBooking, tenantSlug);
    return true;
  } catch (error) {
    console.error('Erro ao processar cancelamento via mensagem:', error);
    return false;
  }
};
