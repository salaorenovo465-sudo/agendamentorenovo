import type { WorkbenchEntity, WorkbenchOverview } from '../types';
import { requestAdmin } from './apiCore';

export const getWorkbenchOverviewForAdmin = async (date: string, adminKey: string): Promise<WorkbenchOverview> =>
  requestAdmin<WorkbenchOverview>(`/api/admin/workbench/overview?date=${date}`, adminKey, { method: 'GET' });

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

export const resetFinanceForAdmin = async (adminKey: string, date?: string): Promise<{ deleted: number }> =>
  requestAdmin<{ deleted: number }>('/api/admin/workbench/finance/reset', adminKey, {
    method: 'POST',
    body: JSON.stringify(date ? { date } : {}),
  });

export const convertLeadForAdmin = async (
  leadId: number,
  adminKey: string,
): Promise<{ lead: Record<string, unknown>; client: Record<string, unknown> }> =>
  requestAdmin<{ lead: Record<string, unknown>; client: Record<string, unknown> }>(
    `/api/admin/workbench/leads/${leadId}/convert`,
    adminKey,
    { method: 'POST' },
  );

export const markFinancePaidForAdmin = async (financeId: number, adminKey: string): Promise<Record<string, unknown> | null> => {
  const response = await requestAdmin<{ entry: Record<string, unknown> | null }>(
    `/api/admin/workbench/finance/${financeId}/pay`,
    adminKey,
    { method: 'POST' },
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
