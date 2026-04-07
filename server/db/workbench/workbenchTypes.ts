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
    fields: ['name', 'specialties', 'work_start', 'work_end', 'active'],
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
