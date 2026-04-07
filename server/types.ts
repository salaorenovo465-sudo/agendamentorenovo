export type BookingStatus = 'pending' | 'confirmed' | 'rejected';

export type BookingRecord = {
  id: number;
  service: string;
  servicePrice: string | null;
  date: string;
  time: string;
  name: string;
  phone: string;
  status: BookingStatus;
  googleEventId: string | null;
  whatsappThreadId: number | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
};

export type CreateBookingInput = {
  service: string;
  servicePrice: string | null;
  date: string;
  time: string;
  name: string;
  phone: string;
};

export type UpdateBookingScheduleInput = {
  id: number;
  date: string;
  time: string;
};

export type UpdateBookingStatusInput = {
  id: number;
  status: BookingStatus;
  rejectionReason?: string | null;
  googleEventId?: string | null;
};

export type UpdateBookingWhatsappThreadInput = {
  id: number;
  whatsappThreadId: number | null;
};
