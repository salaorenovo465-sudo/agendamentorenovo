import type { AdminBooking } from '../types';
import { requestAdmin } from './apiCore';

export const listAdminBookings = async (date: string, adminKey: string, endDate?: string): Promise<AdminBooking[]> => {
  const url = endDate
    ? `/api/admin/bookings?date=${date}&endDate=${endDate}`
    : `/api/admin/bookings?date=${date}`;
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(url, adminKey);
  return response.bookings;
};

export const deleteAdminBooking = async (id: number, adminKey: string): Promise<void> => {
  await requestAdmin<{ message: string }>(`/api/admin/bookings/${id}`, adminKey, {
    method: 'DELETE',
  });
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
