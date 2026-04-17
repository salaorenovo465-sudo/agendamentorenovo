import type { WorkbenchEntity, WorkbenchOverview } from '../types';
import { requestAdmin } from './apiCore';

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
  filters?: { scope?: 'all' | 'range'; startDate?: string; endDate?: string },
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
  const url = query ? `/api/admin/workbench/overview?${query}` : '/api/admin/workbench/overview';
  return requestAdmin<WorkbenchOverview>(url, adminKey, { method: 'GET' });
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

export const deleteWorkbenchEntityForAdmin = async (entity: WorkbenchEntity, id: number, adminKey: string): Promise<void> => {
  await requestAdmin<{ message: string }>(`/api/admin/workbench/${entity}/${id}`, adminKey, {
    method: 'DELETE',
  });
};

export const resetFinanceForAdmin = async (
  adminKey: string,
  date?: string,
): Promise<{ deleted: number; bookingsReset?: number }> =>
  requestAdmin<{ deleted: number; bookingsReset?: number }>('/api/admin/workbench/finance/reset', adminKey, {
    method: 'POST',
    body: JSON.stringify(date ? { date } : {}),
  });

export const resetAnalyticsHistoryForAdmin = async (
  adminKey: string,
): Promise<ResetAnalyticsHistoryResponse> => {
  try {
    return await requestAdmin<ResetAnalyticsHistoryResponse>('/api/admin/history/reset', adminKey, {
      method: 'POST',
    });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    return requestAdmin<ResetAnalyticsHistoryResponse>('/api/admin/workbench/history/reset', adminKey, {
      method: 'POST',
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
