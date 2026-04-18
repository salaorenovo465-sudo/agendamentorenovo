import type {
  AdminEvolutionInstanceStatus,
  AdminEvolutionIntegrationSavePayload,
  AdminEvolutionIntegrationState,
  AdminEvolutionTestMessageResult,
  AdminEvolutionIntegrationTestResult,
} from '../types';
import { requestAdmin, withTenantQuery } from './apiCore';

export const getEvolutionIntegrationForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminEvolutionIntegrationState> =>
  requestAdmin<AdminEvolutionIntegrationState>(
    withTenantQuery('/api/admin/workbench/settings/integrations/evolution', tenantSlug),
    adminKey,
    { method: 'GET' },
  );

export const saveEvolutionIntegrationForAdmin = async (
  payload: AdminEvolutionIntegrationSavePayload,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminEvolutionIntegrationState> =>
  requestAdmin<AdminEvolutionIntegrationState>(
    withTenantQuery('/api/admin/workbench/settings/integrations/evolution', tenantSlug),
    adminKey,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );

export const testEvolutionIntegrationForAdmin = async (
  adminKey: string,
  payload?: Partial<AdminEvolutionIntegrationSavePayload>,
  tenantSlug?: string,
): Promise<AdminEvolutionIntegrationTestResult> => {
  const response = await requestAdmin<{ result: AdminEvolutionIntegrationTestResult }>(
    withTenantQuery('/api/admin/workbench/settings/integrations/evolution/test', tenantSlug),
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    },
  );

  return response.result;
};

export const getEvolutionInstanceStatusForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminEvolutionInstanceStatus> => {
  const response = await requestAdmin<{ status: AdminEvolutionInstanceStatus }>(
    withTenantQuery('/api/whatsapp/instance/status', tenantSlug),
    adminKey,
    { method: 'GET' },
  );

  return response.status;
};

export const createEvolutionInstanceForAdmin = async (
  adminKey: string,
  tenantSlug: string,
  companyName: string,
): Promise<AdminEvolutionInstanceStatus> => {
  const response = await requestAdmin<{ status: AdminEvolutionInstanceStatus }>(
    withTenantQuery('/api/whatsapp/instance/create', tenantSlug),
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify({ companyName }),
    },
  );

  return response.status;
};

export const getEvolutionInstanceQrForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminEvolutionInstanceStatus> => {
  const response = await requestAdmin<{ status: AdminEvolutionInstanceStatus }>(
    withTenantQuery('/api/whatsapp/instance/qr', tenantSlug),
    adminKey,
    { method: 'GET' },
  );

  return response.status;
};

export const refreshEvolutionInstanceQrForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminEvolutionInstanceStatus> => {
  const response = await requestAdmin<{ status: AdminEvolutionInstanceStatus }>(
    withTenantQuery('/api/whatsapp/instance/refresh-qr', tenantSlug),
    adminKey,
    { method: 'POST' },
  );

  return response.status;
};

export const sendEvolutionTestMessageForAdmin = async (
  adminKey: string,
  payload: {
    phone: string;
    text: string;
    settings?: Partial<AdminEvolutionIntegrationSavePayload>;
  },
  tenantSlug?: string,
): Promise<AdminEvolutionTestMessageResult> => {
  const response = await requestAdmin<{ result: AdminEvolutionTestMessageResult }>(
    withTenantQuery('/api/admin/workbench/settings/integrations/evolution/test-message', tenantSlug),
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );

  return response.result;
};
