export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'completed';

export type BookingServiceItem = {
  category: string;
  name: string;
  price: string;
};

export type BookingRecord = {
  id: number;
  service: string;
  servicePrice: string | null;
  serviceItems: BookingServiceItem[];
  date: string;
  time: string;
  name: string;
  phone: string;
  professionalId: number | null;
  professionalName: string | null;
  status: BookingStatus;
  googleEventId: string | null;
  whatsappThreadId: number | null;
  rejectionReason: string | null;
  paymentStatus: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
};

export type CreateBookingInput = {
  service: string;
  servicePrice: string | null;
  serviceItems?: BookingServiceItem[];
  date: string;
  time: string;
  name: string;
  phone: string;
  professionalId?: number | null;
  professionalName?: string | null;
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

export type UpdateBookingProfessionalInput = {
  id: number;
  professionalId: number | null;
  professionalName: string | null;
};

export type UpdateBookingWhatsappThreadInput = {
  id: number;
  whatsappThreadId: number | null;
};
