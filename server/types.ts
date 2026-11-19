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
  completedAt?: string | null;
};

export type BookingBoardCounts = {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  rejected: number;
  assigned: number;
};

export type BookingBoardResult = {
  bookings: BookingRecord[];
  counts: BookingBoardCounts;
  completedLimit: number;
  completedTotal: number;
  hasMoreCompleted: boolean;
};

export type CompletedBookingsQueryInput = {
  tenantSlug?: string | null;
  search?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  professionalId?: number | 'unassigned' | null;
  page?: number;
  limit?: number;
  cursor?: string | null;
};

export type CompletedBookingsPageResult = {
  items: BookingRecord[];
  total: number;
  overallCompletedTotal: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type UnifiedHistoryStatusFilter = 'all' | 'pending' | 'overdue' | 'confirmed' | 'completed';

export type UnifiedHistoryStatusCounts = {
  all: number;
  pending: number;
  overdue: number;
  confirmed: number;
  completed: number;
};

export type UnifiedHistoryQueryInput = {
  tenantSlug?: string | null;
  statusFilter?: UnifiedHistoryStatusFilter;
  search?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  professionalId?: number | 'unassigned' | null;
  page?: number;
  limit?: number;
};

export type UnifiedHistoryPageResult = {
  items: BookingRecord[];
  total: number;
  overallTotal: number;
  statusCounts: UnifiedHistoryStatusCounts;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type CreateBookingInput = {
  tenantSlug?: string | null;
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

export type CalendarDayCounts = {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  rejected: number;
};

export type CalendarBookingsQueryInput = {
  startDate: string;
  endDate: string;
  tenantSlug?: string | null;
};

export type CalendarBookingsResult = {
  startDate: string;
  endDate: string;
  tenantSlug: string | null;
  total: number;
  countsByDate: Record<string, CalendarDayCounts>;
  bookings: BookingRecord[];
};
