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
  updatedAt?: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  completedAt?: string | null;
  rejectionReason: string | null;
  whatsappThreadId?: number | null;
};

export type AdminBookingBoardCounts = {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  rejected: number;
  assigned: number;
};

export type AdminBookingBoardResponse = {
  bookings: AdminBooking[];
  counts: AdminBookingBoardCounts;
  completedLimit: number;
  completedTotal: number;
  hasMoreCompleted: boolean;
};

export type AdminCompletedHistoryFilters = {
  search?: string;
  startDate?: string;
  endDate?: string;
  professionalId?: string;
  page?: number;
  limit?: number;
  cursor?: string | null;
};

export type AdminCompletedHistoryResponse = {
  items: AdminBooking[];
  total: number;
  overallCompletedTotal: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type AdminUnifiedHistoryStatus = 'all' | 'pending' | 'overdue' | 'confirmed' | 'completed';

export type AdminUnifiedHistoryStatusCounts = {
  all: number;
  pending: number;
  overdue: number;
  confirmed: number;
  completed: number;
};

export type AdminUnifiedHistoryFilters = {
  status?: AdminUnifiedHistoryStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
  professionalId?: string;
  page?: number;
  limit?: number;
};

export type AdminUnifiedHistoryResponse = {
  items: AdminBooking[];
  total: number;
  overallTotal: number;
  statusCounts: AdminUnifiedHistoryStatusCounts;
  page: number;
  limit: number;
  hasMore: boolean;
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
  tenantSlug?: string;
  bookingStats: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    rejected: number;
  };
  leads: {
    total: number;
    byStage: Record<string, number>;
    filteredByPeriod?: boolean;
  };
  tasks: {
    total: number;
    pending: number;
    done: number;
    filteredByPeriod?: boolean;
  };
  finance: {
    expected: number;
    received: number;
    pending: number;
    totalCount?: number;
    paidCount?: number;
    pendingCount?: number;
    temporalBasis?: 'due_date';
  };
};

export type DashboardFinanceGroupBy = 'day' | 'week' | 'month';

export type DashboardFinanceStatusFilter = 'all' | 'pago' | 'pendente';

export type DashboardFinanceSummary = {
  expected: number;
  received: number;
  pending: number;
  totalCount: number;
  paidCount: number;
  pendingCount: number;
  zeroAmountCount: number;
  negativeCount: number;
};

export type DashboardFinanceSeriesPoint = {
  key: string;
  label: string;
  fullLabel: string;
  startDate: string;
  endDate: string;
  expected: number;
  received: number;
  pending: number;
  count: number;
  paidCount: number;
  pendingCount: number;
};

export type DashboardFinanceEntryRow = {
  id: number;
  bookingId: number | null;
  clientName: string;
  serviceName: string;
  amount: number;
  paymentMethod: string | null;
  status: 'pendente' | 'pago';
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type DashboardFinanceResponse = {
  tenantSlug: string;
  scope: 'all' | 'range';
  startDate: string | null;
  endDate: string | null;
  temporalBasis: 'due_date';
  groupBy: DashboardFinanceGroupBy;
  autoAdjustedGroupBy: boolean;
  tableFilters?: {
    entryStatus: DashboardFinanceStatusFilter;
    search: string;
  };
  summary: DashboardFinanceSummary;
  series: DashboardFinanceSeriesPoint[];
  entries: DashboardFinanceEntryRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export type SupabaseReadinessReport = {
  checkedAt: string;
  configured: boolean;
  connected: boolean;
  latencyMs: number;
  projectRef: string | null;
  hasDirectDbUrl: boolean;
  expectedTenantSlug: string;
  tenantRegistered: boolean;
  readyForProduction: boolean;
  tablesChecked: number;
  tablesReady: number;
  tableCounts: Record<string, number | null>;
  missingTables: string[];
  missingColumns: Array<{
    table: string;
    column: string;
    reason: string;
  }>;
  pendingMigrations: string[];
  notes: string[];
};

export type CalendarDayCounts = {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  rejected: number;
};

export type AdminBookingCalendarResponse = {
  startDate: string;
  endDate: string;
  tenantSlug: string | null;
  total: number;
  countsByDate: Record<string, CalendarDayCounts>;
  bookings: AdminBooking[];
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
  whatsappProvider?: 'chatwoot' | 'legacy' | 'evolution';
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
