import { apiUrl } from '../../apiBase';
import type {
  AdminBooking,
  AdminBookingBoardCounts,
  AdminBookingBoardResponse,
  AdminBookingCalendarResponse,
  AdminCompletedHistoryFilters,
  AdminCompletedHistoryResponse,
  AdminCreateBookingPayload,
  AdminUnifiedHistoryFilters,
  AdminUnifiedHistoryResponse,
} from '../types';
import { requestAdmin, withTenantQuery } from './apiCore';

type BookingAvailability = {
  busySlots: string[];
  limitReached?: boolean;
};

export const listAdminBookings = async (
  adminKey: string,
  filters?: { scope?: 'all' | 'range'; startDate?: string; endDate?: string; mode?: 'board' | 'full'; completedLimit?: number },
  tenantSlug?: string,
): Promise<AdminBooking[]> => {
  const params = new URLSearchParams();
  if (filters?.scope === 'all') {
    params.set('scope', 'all');
  } else if (filters?.startDate) {
    params.set('date', filters.startDate);
    if (filters.endDate && filters.endDate !== filters.startDate) {
      params.set('endDate', filters.endDate);
    }
  }
  if (filters?.mode) {
    params.set('mode', filters.mode);
  }
  if (filters?.completedLimit) {
    params.set('completedLimit', String(filters.completedLimit));
  }

  const query = params.toString();
  const url = withTenantQuery(query ? `/api/admin/bookings?${query}` : '/api/admin/bookings', tenantSlug);
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(url, adminKey);
  return response.bookings;
};

export const listAdminBookingsBoard = async (
  adminKey: string,
  filters?: { scope?: 'all' | 'range'; startDate?: string; endDate?: string; completedLimit?: number },
  tenantSlug?: string,
): Promise<AdminBookingBoardResponse> => {
  const params = new URLSearchParams();
  params.set('mode', 'board');
  params.set('completedLimit', String(filters?.completedLimit ?? 20));
  if (filters?.scope === 'all') {
    params.set('scope', 'all');
  } else if (filters?.startDate) {
    params.set('date', filters.startDate);
    if (filters.endDate && filters.endDate !== filters.startDate) {
      params.set('endDate', filters.endDate);
    }
  }

  const url = withTenantQuery(`/api/admin/bookings?${params.toString()}`, tenantSlug);
  const response = await requestAdmin<{
    bookings: AdminBooking[];
    counts?: AdminBookingBoardCounts;
    completedLimit?: number;
    completedTotal?: number;
    hasMoreCompleted?: boolean;
  }>(url, adminKey);

  const bookings = response.bookings || [];
  const completedInPayload = bookings.filter((b) => b.status === 'completed').length;
  const completedTotal = response.completedTotal ?? response.counts?.completed ?? completedInPayload;
  const completedLimit = response.completedLimit ?? (filters?.completedLimit ?? 20);

  return {
    bookings,
    counts: response.counts ?? {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === 'pending').length,
      confirmed: bookings.filter((b) => b.status === 'confirmed').length,
      completed: completedTotal,
      rejected: bookings.filter((b) => b.status === 'rejected').length,
      assigned: bookings.filter((b) => Boolean(b.professionalId)).length,
    },
    completedLimit,
    completedTotal,
    hasMoreCompleted: response.hasMoreCompleted ?? completedTotal > completedInPayload,
  };
};

export const getAdminBookingsCalendar = async (
  adminKey: string,
  filters: { month?: string; startDate?: string; endDate?: string; signal?: AbortSignal },
  tenantSlug?: string,
): Promise<AdminBookingCalendarResponse> => {
  const params = new URLSearchParams();
  if (filters.month) {
    params.set('month', filters.month);
  } else if (filters.startDate) {
    params.set('startDate', filters.startDate);
    if (filters.endDate && filters.endDate !== filters.startDate) {
      params.set('endDate', filters.endDate);
    }
  }

  const url = withTenantQuery(`/api/admin/bookings/calendar?${params.toString()}`, tenantSlug);
  return requestAdmin<AdminBookingCalendarResponse>(url, adminKey, {
    method: 'GET',
    signal: filters.signal,
  });
};

export const listCompletedAdminBookings = async (
  adminKey: string,
  filters: AdminCompletedHistoryFilters,
  tenantSlug?: string,
  signal?: AbortSignal,
): Promise<AdminCompletedHistoryResponse> => {
  const params = new URLSearchParams();
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 20));
  if (filters.search?.trim()) {
    params.set('search', filters.search.trim());
  }
  if (filters.startDate?.trim()) {
    params.set('startDate', filters.startDate.trim());
  }
  if (filters.endDate?.trim()) {
    params.set('endDate', filters.endDate.trim());
  }
  if (filters.professionalId?.trim()) {
    params.set('professionalId', filters.professionalId.trim());
  }
  if (filters.cursor?.trim()) {
    params.set('cursor', filters.cursor.trim());
  }

  const url = withTenantQuery(`/api/admin/bookings/completed?${params.toString()}`, tenantSlug);
  return requestAdmin<AdminCompletedHistoryResponse>(url, adminKey, { method: 'GET', signal });
};

export const listUnifiedAdminBookingsHistory = async (
  adminKey: string,
  filters: AdminUnifiedHistoryFilters,
  tenantSlug?: string,
  signal?: AbortSignal,
): Promise<AdminUnifiedHistoryResponse> => {
  const params = new URLSearchParams();
  params.set('status', filters.status ?? 'all');
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 20));
  if (filters.search?.trim()) {
    params.set('search', filters.search.trim());
  }
  if (filters.startDate?.trim()) {
    params.set('startDate', filters.startDate.trim());
  }
  if (filters.endDate?.trim()) {
    params.set('endDate', filters.endDate.trim());
  }
  if (filters.professionalId?.trim()) {
    params.set('professionalId', filters.professionalId.trim());
  }

  const url = withTenantQuery(`/api/admin/bookings/history?${params.toString()}`, tenantSlug);
  return requestAdmin<AdminUnifiedHistoryResponse>(url, adminKey, { method: 'GET', signal });
};

export const deleteAdminBooking = async (
  id: number,
  adminKey: string,
  options?: { masterPassword?: string; tenantSlug?: string },
): Promise<void> => {
  await requestAdmin<{ message: string }>(withTenantQuery(`/api/admin/bookings/${id}`, options?.tenantSlug), adminKey, {
    method: 'DELETE',
    body: options?.masterPassword ? JSON.stringify({ masterPassword: options.masterPassword }) : undefined,
  });
};

export const resetAdminBookingsHistory = async (
  adminKey: string,
  options?: { masterPassword?: string; tenantSlug?: string },
): Promise<{ deleted: number; linkedFinanceDeleted: number; calendarEventsRemoved: number }> => {
  return requestAdmin<{ deleted: number; linkedFinanceDeleted: number; calendarEventsRemoved: number }>(
    withTenantQuery('/api/admin/bookings/reset', options?.tenantSlug),
    adminKey,
    {
      method: 'POST',
      body: options?.masterPassword ? JSON.stringify({ masterPassword: options.masterPassword }) : undefined,
    },
  );
};

export const getBookingAvailability = async (date: string): Promise<BookingAvailability> => {
  const response = await fetch(apiUrl(`/api/availability?date=${encodeURIComponent(date)}`));
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // noop
    }
    throw new Error(message);
  }
  return (await response.json()) as BookingAvailability;
};

export const createAdminBooking = async (
  payload: AdminCreateBookingPayload,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminBooking> => {
  const { status: _status, ...bookingPayload } = payload;
  const response = await requestAdmin<{ booking: AdminBooking; message: string }>(withTenantQuery('/api/admin/bookings', tenantSlug), adminKey, {
    method: 'POST',
    body: JSON.stringify(bookingPayload),
  });
  return response.booking;
};

export const assignProfessionalToAdminBooking = async (
  id: number,
  professionalId: number | null,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(withTenantQuery(`/api/admin/bookings/${id}/professional`, tenantSlug), adminKey, {
    method: 'POST',
    body: JSON.stringify({ professionalId }),
  });
  return response.booking;
};

export const completeAdminBooking = async (id: number, adminKey: string, tenantSlug?: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(withTenantQuery(`/api/admin/bookings/${id}/complete`, tenantSlug), adminKey, {
    method: 'POST',
  });
  return response.booking;
};

export const reopenAdminBooking = async (id: number, adminKey: string, tenantSlug?: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(withTenantQuery(`/api/admin/bookings/${id}/reopen`, tenantSlug), adminKey, {
    method: 'POST',
  });
  return response.booking;
};

export const confirmAdminBooking = async (id: number, adminKey: string, tenantSlug?: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(withTenantQuery(`/api/admin/bookings/${id}/confirm`, tenantSlug), adminKey, {
    method: 'POST',
  });
  return response.booking;
};

export const rejectAdminBooking = async (id: number, reason: string, adminKey: string, tenantSlug?: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(withTenantQuery(`/api/admin/bookings/${id}/reject`, tenantSlug), adminKey, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return response.booking;
};

export const rescheduleAdminBooking = async (
  id: number,
  date: string,
  time: string,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(withTenantQuery(`/api/admin/bookings/${id}/reschedule`, tenantSlug), adminKey, {
    method: 'POST',
    body: JSON.stringify({ date, time }),
  });
  return response.booking;
};

export const listBookingsByPhoneForAdmin = async (
  phone: string,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminBooking[]> => {
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(
    withTenantQuery(`/api/admin/bookings/by-phone/${encodeURIComponent(phone)}`, tenantSlug),
    adminKey,
    { method: 'GET' },
  );
  return response.bookings;
};

export const listPendingPaymentBookingsForAdmin = async (
  adminKey: string,
): Promise<AdminBooking[]> => {
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(
    '/api/admin/bookings/pending-payment',
    adminKey,
    { method: 'GET' },
  );
  return response.bookings;
};

export const confirmBookingPaymentForAdmin = async (
  bookingId: number,
  paymentMethod: string,
  adminKey: string,
): Promise<Record<string, unknown>> => {
  const response = await requestAdmin<{ entry: Record<string, unknown> }>(
    '/api/admin/workbench/finance/confirm-booking-payment',
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify({ booking_id: bookingId, payment_method: paymentMethod }),
    },
  );
  return response.entry;
};
