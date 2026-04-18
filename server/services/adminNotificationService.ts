import { workbenchStore } from '../db/workbenchStore';
import type { BookingRecord } from '../types';

import { publishAdminNotification } from './inboxRealtime';

const ADMIN_NOTIFICATIONS_SCOPE = 'admin_notifications';
const MAX_ADMIN_NOTIFICATIONS = 200;

export type AdminOperationalNotificationType = 'booking-created';
export type AdminOperationalNotificationSound = 'booking-alert';

export type AdminOperationalNotification = {
  id: string;
  type: AdminOperationalNotificationType;
  tenantSlug: string;
  createdAt: string;
  readAt: string | null;
  sound: AdminOperationalNotificationSound;
  title: string;
  message: string;
  bookingId: number | null;
  customerName: string;
  bookingDate: string | null;
  bookingTime: string | null;
};

type NotificationStoreShape = {
  items?: AdminOperationalNotification[];
};

const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();

const normalizeTenantSlug = (tenantSlug?: string): string => {
  const normalized = (tenantSlug || '').trim().toLowerCase();
  return normalized || DEFAULT_TENANT_SLUG;
};

const toTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const sanitizeAdminNotifications = (value: unknown): AdminOperationalNotification[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const sanitized: AdminOperationalNotification[] = [];
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

    const type = row.type === 'booking-created' ? 'booking-created' : null;
    if (!type) {
      continue;
    }

    const tenantSlug = normalizeTenantSlug(toTrimmedString(row.tenantSlug));
    const createdAt = toTrimmedString(row.createdAt) || new Date().toISOString();
    const readAt = row.readAt === null ? null : toTrimmedString(row.readAt) || null;
    const sound = row.sound === 'booking-alert' ? 'booking-alert' : 'booking-alert';
    const title = toTrimmedString(row.title) || 'Nova solicitacao de agendamento';
    const message = toTrimmedString(row.message) || 'Uma nova solicitacao chegou pela pagina publica.';
    const bookingId = Number(row.bookingId || 0);

    sanitized.push({
      id,
      type,
      tenantSlug,
      createdAt,
      readAt,
      sound,
      title,
      message,
      bookingId: Number.isFinite(bookingId) && bookingId > 0 ? bookingId : null,
      customerName: toTrimmedString(row.customerName) || 'Cliente',
      bookingDate: toTrimmedString(row.bookingDate) || null,
      bookingTime: toTrimmedString(row.bookingTime) || null,
    });
    seen.add(id);
  }

  return sanitized
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_ADMIN_NOTIFICATIONS);
};

const loadStore = async (tenantSlug?: string): Promise<AdminOperationalNotification[]> => {
  const scoped = await workbenchStore.getScopedSetting(ADMIN_NOTIFICATIONS_SCOPE, tenantSlug);
  return sanitizeAdminNotifications((scoped as NotificationStoreShape).items);
};

const saveStore = async (
  items: AdminOperationalNotification[],
  tenantSlug?: string,
): Promise<AdminOperationalNotification[]> => {
  const saved = await workbenchStore.saveScopedSetting(
    ADMIN_NOTIFICATIONS_SCOPE,
    { items: items.slice(0, MAX_ADMIN_NOTIFICATIONS) },
    tenantSlug,
  );

  return sanitizeAdminNotifications((saved as NotificationStoreShape).items);
};

const buildBookingCreatedNotification = (
  booking: BookingRecord,
  tenantSlug?: string,
): AdminOperationalNotification => {
  const normalizedTenant = normalizeTenantSlug(tenantSlug);
  return {
    id: `admin_notification_${booking.id}_${Date.now()}`,
    type: 'booking-created',
    tenantSlug: normalizedTenant,
    createdAt: new Date().toISOString(),
    readAt: null,
    sound: 'booking-alert',
    title: 'Novo agendamento recebido',
    message: `${booking.name} solicitou ${booking.service} para ${booking.date.split('-').reverse().join('/')} as ${booking.time}.`,
    bookingId: booking.id,
    customerName: booking.name,
    bookingDate: booking.date,
    bookingTime: booking.time,
  };
};

export const listAdminNotifications = async (tenantSlug?: string): Promise<AdminOperationalNotification[]> =>
  loadStore(tenantSlug);

export const markAdminNotificationAsRead = async (
  notificationId: string,
  tenantSlug?: string,
): Promise<AdminOperationalNotification[]> => {
  const items = await loadStore(tenantSlug);
  const nowIso = new Date().toISOString();
  const nextItems = items.map((item) => (
    item.id === notificationId && !item.readAt
      ? { ...item, readAt: nowIso }
      : item
  ));
  return saveStore(nextItems, tenantSlug);
};

export const createAdminBookingNotification = async (
  booking: BookingRecord,
  tenantSlug?: string,
): Promise<AdminOperationalNotification> => {
  const items = await loadStore(tenantSlug);
  const existing = items.find((item) => item.type === 'booking-created' && item.bookingId === booking.id);
  if (existing) {
    return existing;
  }

  const notification = buildBookingCreatedNotification(booking, tenantSlug);
  await saveStore([notification, ...items], tenantSlug);
  publishAdminNotification(notification);
  return notification;
};
