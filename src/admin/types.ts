export type AdminBookingStatus = 'pending' | 'confirmed' | 'rejected' | 'completed';

export type AdminBookingServiceItem = {
  category: string;
  name: string;
  price: string;
};

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
  serviceItems: AdminBookingServiceItem[];
  date: string;
  time: string;
  name: string;
  phone: string;
  professionalId?: number | null;
  professionalName?: string | null;
  status: AdminBookingStatus;
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  whatsappThreadId?: number | null;
};

export type AdminCreateBookingPayload = {
  service: string;
  servicePrice: string | null;
  serviceItems?: AdminBookingServiceItem[];
  date: string;
  time: string;
  name: string;
  phone: string;
  professionalId?: number | null;
  professionalName?: string | null;
  status?: 'pending' | 'confirmed';
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

export type AdminFinanceStatus = 'pendente' | 'pago';

export type AdminFinanceEntry = {
  id: number;
  bookingId: number | null;
  clientName: string;
  serviceName: string;
  amount: number;
  paymentMethod: string | null;
  status: AdminFinanceStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  masterPasswordUpdatedAt?: string;
  serviceCatalogManaged?: boolean;
  whatsappProvider?: 'chatwoot' | 'legacy' | 'baileys' | 'evolution';
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

export type AdminEvolutionIntegrationSettings = {
  provider: 'evolution';
  configured: boolean;
  evolutionUrl: string;
  evolutionInstance: string;
  evolutionSendPath: string;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  hasWebhookSecret: boolean;
  webhookSecretPreview: string | null;
};

export type AdminEvolutionChecklistStatus = 'ok' | 'warn' | 'error' | 'pending';

export type AdminEvolutionChecklistItem = {
  id: string;
  label: string;
  status: AdminEvolutionChecklistStatus;
  detail: string;
};

export type AdminEvolutionIntegrationDiagnostics = {
  checkedAt: string;
  tenantSlug: string;
  overallStatus: 'ready' | 'attention' | 'error' | 'missing';
  readinessScore: number;
  apiReachable: boolean;
  secureUrl: boolean;
  sendPathResolved: string;
  sendUrlPreview: string | null;
  webhookUrl: string | null;
  instanceFound: boolean;
  availableInstances: string[];
  instancesCount: number;
  checklist: AdminEvolutionChecklistItem[];
  issues: string[];
  warnings: string[];
  recommendations: string[];
};

export type AdminEvolutionIntegrationState = {
  integration: AdminEvolutionIntegrationSettings;
  status: AdminEvolutionInstanceStatus;
  diagnostics: AdminEvolutionIntegrationDiagnostics;
};

export type AdminEvolutionIntegrationSavePayload = {
  evolutionUrl: string;
  evolutionInstance: string;
  evolutionSendPath?: string;
  evolutionApiKey?: string;
  evolutionWebhookSecret?: string;
  clearApiKey?: boolean;
  clearWebhookSecret?: boolean;
};

export type AdminEvolutionIntegrationTestResult = {
  ok: boolean;
  reachable: boolean;
  instanceFound: boolean;
  instancesCount: number;
  error: string | null;
  diagnostics: AdminEvolutionIntegrationDiagnostics;
};

export type AdminEvolutionTestMessagePayload = {
  phone: string;
  text: string;
  settings?: Partial<AdminEvolutionIntegrationSavePayload>;
};

export type AdminEvolutionTestMessageResult = {
  ok: boolean;
  normalizedPhone: string;
  providerMessageId: string | null;
  sentAt: string;
  diagnostics: AdminEvolutionIntegrationDiagnostics;
};
