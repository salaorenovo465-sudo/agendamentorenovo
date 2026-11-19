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

export const ENTITY_CONFIG: Record<
  WorkbenchEntity,
  {
    table: string;
    fields: string[];
    orderBy: string;
    orderAscending?: boolean;
    defaults?: Record<string, unknown>;
  }
> = {
  availability: {
    table: 'availability_rules',
    fields: ['title', 'type', 'weekday', 'start_time', 'end_time', 'limit_per_day', 'active'],
    orderBy: 'updated_at',
    defaults: { active: true },
  },
  clients: {
    table: 'clients',
    fields: [
      'name',
      'phone',
      'email',
      'birth_date',
      'notes',
      'status',
      'tags',
      'preferred_service',
      'preferred_professional',
    ],
    orderBy: 'updated_at',
    defaults: { status: 'ativo' },
  },
  leads: {
    table: 'leads',
    fields: ['name', 'phone', 'source', 'stage', 'owner', 'next_contact_at', 'notes'],
    orderBy: 'updated_at',
    defaults: { stage: 'novo' },
  },
  services: {
    table: 'services_catalog',
    fields: ['name', 'category', 'duration_min', 'price', 'description', 'active'],
    orderBy: 'updated_at',
    defaults: { active: true },
  },
  professionals: {
    table: 'professionals',
    fields: [
      'name',
      'phone',
      'email',
      'cpf',
      'birth_date',
      'address',
      'notes',
      'specialties',
      'work_start',
      'work_end',
      'base_commission',
      'commission_profile',
      'active',
    ],
    orderBy: 'updated_at',
    defaults: { active: true },
  },
  finance: {
    table: 'financial_entries',
    fields: ['booking_id', 'client_name', 'service_name', 'amount', 'payment_method', 'status', 'due_date', 'paid_at'],
    orderBy: 'created_at',
    orderAscending: false,
    defaults: { status: 'pendente' },
  },
  reviews: {
    table: 'reviews',
    fields: ['client_name', 'professional_name', 'score', 'comment'],
    orderBy: 'created_at',
    orderAscending: false,
  },
  tasks: {
    table: 'tasks',
    fields: ['title', 'owner', 'due_date', 'priority', 'status', 'notes', 'related_client'],
    orderBy: 'updated_at',
    defaults: { priority: 'media', status: 'pendente' },
  },
  automations: {
    table: 'automations',
    fields: ['name', 'trigger_type', 'message_template', 'active'],
    orderBy: 'updated_at',
    defaults: { active: true },
  },
};

export type OverviewData = {
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
    filteredByPeriod: boolean;
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

export type TenantRecord = {
  slug: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TenantRegistryValue = {
  tenants?: Array<{
    slug?: string;
    name?: string;
    active?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
};

export type ClientStatus = 'novo' | 'ativo' | 'recorrente' | 'VIP' | 'em risco' | 'inativo';
export type ClientTone = 'vip' | 'risk' | 'active' | 'neutral';
export type ClientFocusFilter = 'todos' | 'com-agente' | 'reativacao' | 'alto-valor' | 'sem-retorno';
export type ClientSortMode = 'proximo-aviso' | 'valor' | 'ultima-visita' | 'nome';

export type ClientInsight = {
  totalSpent: number;
  visitCount: number;
  avgTicket: number;
  topService: string;
  lastVisit: string | null;
  nextReminder: string | null;
  activeRuleCount: number;
  overdueRuleCount: number;
  dormancyDays: number | null;
  tone: ClientTone;
  toneLabel: string;
  attentionLine: string;
};

export type ClientBoardItem = {
  client: Record<string, unknown>;
  insight: ClientInsight;
};

export type ClientsWorkspaceQuery = {
  tenantSlug?: string;
  mode?: 'kanban' | 'directory';
  search?: string;
  status?: 'todos' | ClientStatus;
  focus?: ClientFocusFilter;
  sort?: ClientSortMode;
  columnLimit?: number;
  columnLimits?: Partial<Record<ClientStatus, number>>;
  page?: number;
  limit?: number;
};

export type ClientsWorkspaceColumnSlice = {
  status: ClientStatus;
  items: ClientBoardItem[];
  total: number;
  limit: number;
  hasMore: boolean;
};

export type ClientsWorkspaceResponse = {
  mode: 'kanban' | 'directory';
  overview: {
    total: number;
    active: number;
    upcoming: number;
    vip: number;
    risk: number;
    totalRevenue: number;
    averageTicket: number;
  };
  radar: {
    upcoming: ClientBoardItem[];
    hotList: ClientBoardItem[];
  };
  filteredTotal: number;
  columnCounts: Record<ClientStatus, number>;
  columns: Record<ClientStatus, ClientsWorkspaceColumnSlice>;
  directory: {
    items: ClientBoardItem[];
    total: number;
    overallTotal: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
};

