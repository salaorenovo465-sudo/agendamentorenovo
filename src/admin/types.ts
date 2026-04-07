export type AdminBookingStatus = 'pending' | 'confirmed' | 'rejected' | 'completed';

export type AdminConversationOperationalStatus = 'open' | 'pending' | 'resolved';

export type AdminConversationOperational = {
  threadId: number;
  assigneeId: string | null;
  status: AdminConversationOperationalStatus;
  labels: string[];
  updatedAt: string;
};

export type AdminInternalNote = {
  id: number;
  threadId: number;
  content: string;
  author: string | null;
  createdAt: string;
};

export type AdminBooking = {
  id: number;
  service: string;
  servicePrice: string | null;
  date: string;
  time: string;
  name: string;
  phone: string;
  status: AdminBookingStatus;
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  whatsappThreadId?: number | null;
};

export type AdminInboxConversation = {
  id: number;
  contactName: string;
  phone: string;
  lastMessage: string;
  unreadCount: number;
  updatedAt: string;
  pendingBookingsCount?: number;
  latestBookingStatus?: AdminBookingStatus | null;
  avatarUrl?: string | null;
  assigneeId?: string | null;
  conversationStatus?: AdminConversationOperationalStatus;
  labels?: string[];
  operational?: AdminConversationOperational;
};

export type AdminInboxMessage = {
  id: number;
  content: string;
  direction: 'incoming' | 'outgoing' | 'system';
  providerMessageId?: string | null;
  deliveryStatus?: 'sent' | 'delivered' | 'read' | null;
  attachment?: {
    kind: 'image' | 'video' | 'audio' | 'document' | 'link';
    fileName: string;
    mimeType: string;
    caption: string;
    source: 'upload' | 'url';
    url: string | null;
  } | null;
  createdAt: string | null;
};

export type AdminInboxConversationPanel = {
  conversation: AdminInboxConversation;
  bookings: AdminBooking[];
  notes: AdminInternalNote[];
  operational: AdminConversationOperational | null;
};

export type AdminTenant = {
  slug: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkbenchEntity =
  | 'availability'
  | 'clients'
  | 'leads'
  | 'services'
  | 'professionals'
  | 'finance'
  | 'reviews'
  | 'tasks'
  | 'automations';

export type WorkbenchOverview = {
  date: string;
  bookingStats: {
    total: number;
    pending: number;
    confirmed: number;
    rejected: number;
  };
  leads: {
    total: number;
    byStage: Record<string, number>;
  };
  tasks: {
    total: number;
    pending: number;
    done: number;
  };
  finance: {
    expected: number;
    received: number;
    pending: number;
  };
};

export type AdminSettings = {
  companyName?: string;
  companyPhone?: string;
  timezone?: string;
  cancelPolicy?: string;
  whatsappOpenTime?: string;
  whatsappCloseTime?: string;
  whatsappProvider?: 'chatwoot' | 'legacy' | 'baileys';
  chatwootUrl?: string;
  chatwootAccountId?: string;
  chatwootInboxId?: string;
  chatwootApiToken?: string;
  chatwootAgentEmail?: string;
  chatwootWebhookSecret?: string;
  evolutionUrl?: string;
  evolutionApiKey?: string;
  evolutionInstance?: string;
  evolutionSendPath?: string;
  evolutionWebhookSecret?: string;
  [key: string]: unknown;
};

export type AdminEvolutionInstanceStatus = {
  tenantSlug: string;
  companyName: string;
  configured: boolean;
  instanceName: string;
  exists: boolean;
  connectionState: 'missing' | 'connecting' | 'open' | 'close' | 'disconnected' | 'unknown';
  connected: boolean;
  qrDataUrl: string | null;
  lastError: string | null;
};
