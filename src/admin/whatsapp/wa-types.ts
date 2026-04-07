import type { AdminBooking, AdminBookingStatus, AdminConversationOperationalStatus, AdminInboxMessage, AdminInternalNote } from '../types';

/* ── Local view-model types ── */

export type WAContact = {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  online?: boolean;
  avatarUrl: string | null;
  pendingBookingsCount: number;
  latestBookingStatus: AdminBookingStatus | null;
  assigneeId: string | null;
  conversationStatus: AdminConversationOperationalStatus;
  labels: string[];
};

export type WAMessage = {
  id: string;
  from: 'me' | 'them' | 'system';
  text: string;
  time: string;
  dayKey: string;
  status: 'sent' | 'delivered' | 'read' | 'pending';
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'link';
  attachment?: AdminInboxMessage['attachment'];
  providerMessageId?: string | null;
};

export type PendingAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  base64: string;
  previewUrl: string | null;
  kind: 'image' | 'video' | 'audio' | 'document';
};

export type ConversationStatus = 'open' | 'pending' | 'resolved';
export type ConversationFilter = 'all' | 'unread' | 'mine' | 'unassigned' | 'resolved';

export type BookingRescheduleModal = {
  open: boolean;
  bookingId: number | null;
  date: string;
  time: string;
};

export type BookingCancelModal = {
  open: boolean;
  bookingId: number | null;
  reason: string;
};

export type PanelData = {
  bookings: AdminBooking[];
  notes: AdminInternalNote[];
  assigneeId: string;
  status: ConversationStatus;
  labels: string;
};
