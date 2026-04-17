import { apiUrl } from '../../apiBase';
import type { AdminBooking, AdminCreateBookingPayload } from '../types';
import { requestAdmin } from './apiCore';

type BookingAvailability = {
  busySlots: string[];
  limitReached?: boolean;
};

export const listAdminBookings = async (
  adminKey: string,
  filters?: { scope?: 'all' | 'range'; startDate?: string; endDate?: string },
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

  const query = params.toString();
  const url = query ? `/api/admin/bookings?${query}` : '/api/admin/bookings';
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(url, adminKey);
  return response.bookings;
};

export const deleteAdminBooking = async (id: number, adminKey: string): Promise<void> => {
  await requestAdmin<{ message: string }>(`/api/admin/bookings/${id}`, adminKey, {
    method: 'DELETE',
  });
};

export const resetAdminBookingsHistory = async (
  adminKey: string,
): Promise<{ deleted: number; linkedFinanceDeleted: number; calendarEventsRemoved: number }> => {
  return requestAdmin<{ deleted: number; linkedFinanceDeleted: number; calendarEventsRemoved: number }>(
    '/api/admin/bookings/reset',
    adminKey,
    {
      method: 'POST',
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
): Promise<AdminBooking> => {
  const { status: _status, ...bookingPayload } = payload;
  const response = await requestAdmin<{ booking: AdminBooking; message: string }>('/api/admin/bookings', adminKey, {
    method: 'POST',
    body: JSON.stringify(bookingPayload),
  });
  return response.booking;
};

export const assignProfessionalToAdminBooking = async (
  id: number,
  professionalId: number | null,
  adminKey: string,
): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/professional`, adminKey, {
    method: 'POST',
    body: JSON.stringify({ professionalId }),
  });
  return response.booking;
};

export const completeAdminBooking = async (id: number, adminKey: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/complete`, adminKey, {
    method: 'POST',
  });
  return response.booking;
};

export const confirmAdminBooking = async (id: number, adminKey: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/confirm`, adminKey, {
    method: 'POST',
  });
  return response.booking;
};

export const rejectAdminBooking = async (id: number, reason: string, adminKey: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/reject`, adminKey, {
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
): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/reschedule`, adminKey, {
    method: 'POST',
    body: JSON.stringify({ date, time }),
  });
  return response.booking;
};

export const listBookingsByPhoneForAdmin = async (
  phone: string,
  adminKey: string,
): Promise<AdminBooking[]> => {
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(
    `/api/admin/bookings/by-phone/${encodeURIComponent(phone)}`,
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
