import type {
  DashboardFinanceGroupBy,
  DashboardFinanceResponse,
  DashboardFinanceStatusFilter,
  SupabaseReadinessReport,
  WorkbenchEntity,
  WorkbenchOverview,
} from '../types';
import { requestAdmin, withTenantQuery } from './apiCore';

type ResetAnalyticsHistoryResponse = {
  deleted: {
    bookings: number;
    finance: number;
    leads: number;
    reviews: number;
    tasks: number;
    calendarEvents: number;
  };
};

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error && /\b404\b/.test(error.message);

export const getWorkbenchOverviewForAdmin = async (
  adminKey: string,
  filters?: { scope?: 'all' | 'range'; startDate?: string; endDate?: string; signal?: AbortSignal },
  tenantSlug?: string,
): Promise<WorkbenchOverview> => {
  const params = new URLSearchParams();
  if (filters?.scope === 'all') {
    params.set('scope', 'all');
  } else if (filters?.startDate) {
    params.set('date', filters.startDate);
    if (filters.endDate && filters.endDate !== filters.startDate) {
      params.set('endDate', filters.endDate);
    }
  }

  const query = params.toString();
  const baseUrl = query ? `/api/admin/workbench/overview?${query}` : '/api/admin/workbench/overview';
  const url = withTenantQuery(baseUrl, tenantSlug);
  return requestAdmin<WorkbenchOverview>(url, adminKey, { method: 'GET', signal: filters?.signal });
};

export const getDashboardFinanceForAdmin = async (
  adminKey: string,
  filters?: {
    scope?: 'all' | 'range';
    startDate?: string;
    endDate?: string;
    groupBy?: DashboardFinanceGroupBy | 'auto';
    entryStatus?: DashboardFinanceStatusFilter;
    search?: string;
    page?: number;
    limit?: number;
    signal?: AbortSignal;
  },
  tenantSlug?: string,
): Promise<DashboardFinanceResponse> => {
  const params = new URLSearchParams();
  if (filters?.scope === 'all') {
    params.set('scope', 'all');
  } else if (filters?.startDate) {
    params.set('date', filters.startDate);
    if (filters.endDate && filters.endDate !== filters.startDate) {
      params.set('endDate', filters.endDate);
    }
  }
  if (filters?.groupBy) {
    params.set('groupBy', filters.groupBy);
  }
  if (filters?.entryStatus && filters.entryStatus !== 'all') {
    params.set('entryStatus', filters.entryStatus);
  }
  if (filters?.search?.trim()) {
    params.set('search', filters.search.trim());
  }
  if (filters?.page) {
    params.set('page', String(filters.page));
  }
  if (filters?.limit) {
    params.set('limit', String(filters.limit));
  }

  const query = params.toString();
  const baseUrl = query ? `/api/admin/workbench/dashboard/finance?${query}` : '/api/admin/workbench/dashboard/finance';
  const url = withTenantQuery(baseUrl, tenantSlug);
  return requestAdmin<DashboardFinanceResponse>(url, adminKey, {
    method: 'GET',
    signal: filters?.signal,
  });
};

export const getSupabaseReadinessForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
  signal?: AbortSignal,
): Promise<SupabaseReadinessReport> => {
  const url = withTenantQuery('/api/admin/workbench/supabase/status', tenantSlug);
  return requestAdmin<SupabaseReadinessReport>(url, adminKey, {
    method: 'GET',
    signal,
  });
};

export const listWorkbenchEntityForAdmin = async (
  entity: WorkbenchEntity,
  adminKey: string,
): Promise<Record<string, unknown>[]> => {
  const response = await requestAdmin<{ rows: Record<string, unknown>[] }>(`/api/admin/workbench/${entity}`, adminKey, {
    method: 'GET',
  });

  return response.rows;
};

export const createWorkbenchEntityForAdmin = async (
  entity: WorkbenchEntity,
  payload: Record<string, unknown>,
  adminKey: string,
): Promise<Record<string, unknown>> => {
  const response = await requestAdmin<{ row: Record<string, unknown> }>(`/api/admin/workbench/${entity}`, adminKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.row;
};

export const updateWorkbenchEntityForAdmin = async (
  entity: WorkbenchEntity,
  id: number,
  payload: Record<string, unknown>,
  adminKey: string,
): Promise<Record<string, unknown> | null> => {
  const response = await requestAdmin<{ row: Record<string, unknown> | null }>(
    `/api/admin/workbench/${entity}/${id}`,
    adminKey,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );

  return response.row;
};

export const deleteWorkbenchEntityForAdmin = async (
  entity: WorkbenchEntity,
  id: number,
  adminKey: string,
  options?: {
    masterPassword?: string;
    tenantSlug?: string;
  },
): Promise<void> => {
  await requestAdmin<{ message: string }>(
    withTenantQuery(`/api/admin/workbench/${entity}/${id}`, options?.tenantSlug),
    adminKey,
    {
      method: 'DELETE',
      body: options?.masterPassword ? JSON.stringify({ masterPassword: options.masterPassword }) : undefined,
    },
  );
};

export const resetFinanceForAdmin = async (
  adminKey: string,
  options?: {
    date?: string;
    masterPassword?: string;
    tenantSlug?: string;
  },
): Promise<{ deleted: number; bookingsReset?: number }> =>
  requestAdmin<{ deleted: number; bookingsReset?: number }>(withTenantQuery('/api/admin/workbench/finance/reset', options?.tenantSlug), adminKey, {
    method: 'POST',
    body: JSON.stringify({
      ...(options?.date ? { date: options.date } : {}),
      ...(options?.masterPassword ? { masterPassword: options.masterPassword } : {}),
    }),
  });

export const resetAnalyticsHistoryForAdmin = async (
  adminKey: string,
  options?: {
    masterPassword?: string;
    tenantSlug?: string;
  },
): Promise<ResetAnalyticsHistoryResponse> => {
  try {
    return await requestAdmin<ResetAnalyticsHistoryResponse>(withTenantQuery('/api/admin/history/reset', options?.tenantSlug), adminKey, {
      method: 'POST',
      body: JSON.stringify(options?.masterPassword ? { masterPassword: options.masterPassword } : {}),
    });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    return requestAdmin<ResetAnalyticsHistoryResponse>(withTenantQuery('/api/admin/workbench/history/reset', options?.tenantSlug), adminKey, {
      method: 'POST',
      body: JSON.stringify(options?.masterPassword ? { masterPassword: options.masterPassword } : {}),
    });
  }
};

export const convertLeadForAdmin = async (
  leadId: number,
  adminKey: string,
): Promise<{ lead: Record<string, unknown>; client: Record<string, unknown> }> =>
  requestAdmin<{ lead: Record<string, unknown>; client: Record<string, unknown> }>(
    `/api/admin/workbench/leads/${leadId}/convert`,
    adminKey,
    { method: 'POST' },
  );

export const markFinancePaidForAdmin = async (
  financeId: number,
  adminKey: string,
  paymentMethod?: string,
): Promise<Record<string, unknown> | null> => {
  const response = await requestAdmin<{ entry: Record<string, unknown> | null }>(
    `/api/admin/workbench/finance/${financeId}/pay`,
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify(paymentMethod ? { payment_method: paymentMethod } : {}),
    },
  );

  return response.entry;
};

export const findClientByPhoneForAdmin = async (
  phone: string,
  adminKey: string,
): Promise<Record<string, unknown> | null> => {
  const response = await requestAdmin<{ client: Record<string, unknown> | null }>(
    `/api/admin/workbench/clients/by-phone/${encodeURIComponent(phone)}`,
    adminKey,
    { method: 'GET' },
  );
  return response.client;
};

export type ClientWorkspaceStatus = 'novo' | 'ativo' | 'recorrente' | 'VIP' | 'em risco' | 'inativo';
export type ClientWorkspaceTone = 'vip' | 'risk' | 'active' | 'neutral';
export type ClientWorkspaceFocus = 'todos' | 'com-agente' | 'reativacao' | 'alto-valor' | 'sem-retorno';
export type ClientWorkspaceSort = 'proximo-aviso' | 'valor' | 'ultima-visita' | 'nome';

export type ClientWorkspaceInsight = {
  totalSpent: number;
  visitCount: number;
  avgTicket: number;
  topService: string;
  lastVisit: string | null;
  nextReminder: string | null;
  activeRuleCount: number;
  overdueRuleCount: number;
  dormancyDays: number | null;
  tone: ClientWorkspaceTone;
  toneLabel: string;
  attentionLine: string;
};

export type ClientWorkspaceItem = {
  client: Record<string, unknown>;
  insight: ClientWorkspaceInsight;
};

export type ClientWorkspaceColumnSlice = {
  status: ClientWorkspaceStatus;
  items: ClientWorkspaceItem[];
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
    upcoming: ClientWorkspaceItem[];
    hotList: ClientWorkspaceItem[];
  };
  filteredTotal: number;
  columnCounts: Record<ClientWorkspaceStatus, number>;
  columns: Record<ClientWorkspaceStatus, ClientWorkspaceColumnSlice>;
  directory: {
    items: ClientWorkspaceItem[];
    total: number;
    overallTotal: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export const getClientsWorkspaceForAdmin = async (
  adminKey: string,
  params?: {
    tenantSlug?: string;
    mode?: 'kanban' | 'directory';
    search?: string;
    status?: 'todos' | ClientWorkspaceStatus;
    focus?: ClientWorkspaceFocus;
    sort?: ClientWorkspaceSort;
    columnLimit?: number;
    columnLimits?: Partial<Record<ClientWorkspaceStatus, number>>;
    page?: number;
    limit?: number;
    refresh?: boolean;
    signal?: AbortSignal;
  },
): Promise<ClientsWorkspaceResponse> => {
  const query = new URLSearchParams();
  if (params?.tenantSlug) query.set('tenant', params.tenantSlug);
  if (params?.mode) query.set('mode', params.mode);
  if (params?.search?.trim()) query.set('search', params.search.trim());
  if (params?.status && params.status !== 'todos') query.set('status', params.status);
  if (params?.focus && params.focus !== 'todos') query.set('focus', params.focus);
  if (params?.sort) query.set('sort', params.sort);
  if (params?.columnLimit) query.set('columnLimit', String(params.columnLimit));
  if (params?.columnLimits && Object.keys(params.columnLimits).length > 0) {
    query.set('columnLimits', JSON.stringify(params.columnLimits));
  }
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.refresh) query.set('refresh', '1');

  const qs = query.toString();
  const path = qs ? `/api/admin/workbench/clients/workspace?${qs}` : '/api/admin/workbench/clients/workspace';
  return requestAdmin<ClientsWorkspaceResponse>(path, adminKey, {
    method: 'GET',
    signal: params?.signal,
  });
};

export const registerClientForAdmin = async (
  payload: { name: string; phone: string; preferred_service?: string },
  adminKey: string,
): Promise<Record<string, unknown>> => {
  return createWorkbenchEntityForAdmin('clients', {
    name: payload.name,
    phone: payload.phone,
    preferred_service: payload.preferred_service || '',
    status: 'ativo',
    tags: 'whatsapp',
  }, adminKey);
};
