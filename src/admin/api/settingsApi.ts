import type { AdminSettings, AdminTenant } from '../types';
import { requestAdmin, withTenantQuery } from './apiCore';

export const getAdminSettings = async (adminKey: string, tenantSlug?: string): Promise<AdminSettings> => {
  const response = await requestAdmin<{ settings: AdminSettings }>(
    withTenantQuery('/api/admin/workbench/settings', tenantSlug),
    adminKey,
    { method: 'GET' },
  );
  return response.settings;
};

export const saveAdminSettings = async (settings: AdminSettings, adminKey: string, tenantSlug?: string): Promise<AdminSettings> => {
  const response = await requestAdmin<{ settings: AdminSettings }>(
    withTenantQuery('/api/admin/workbench/settings', tenantSlug),
    adminKey,
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    },
  );

  return response.settings;
};

export const verifyMasterPasswordForAdmin = async (password: string, adminKey: string, tenantSlug?: string): Promise<boolean> => {
  const response = await requestAdmin<{ ok: boolean }>(
    withTenantQuery('/api/admin/workbench/settings/master-password/verify', tenantSlug),
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
  );

  return response.ok;
};

export const updateMasterPasswordForAdmin = async (
  payload: { currentPassword: string; newPassword: string },
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminSettings> => {
  const response = await requestAdmin<{ ok: boolean; settings: AdminSettings }>(
    withTenantQuery('/api/admin/workbench/settings/master-password', tenantSlug),
    adminKey,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );

  return response.settings;
};

export const listAdminTenants = async (adminKey: string): Promise<AdminTenant[]> => {
  const response = await requestAdmin<{ tenants: AdminTenant[] }>('/api/admin/workbench/tenants', adminKey, { method: 'GET' });
  return response.tenants;
};

export const createAdminTenant = async (
  payload: { slug: string; name: string; active?: boolean },
  adminKey: string,
): Promise<AdminTenant> => {
  const response = await requestAdmin<{ tenant: AdminTenant }>('/api/admin/workbench/tenants', adminKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.tenant;
};

export const updateAdminTenant = async (
  slug: string,
  payload: { name?: string; active?: boolean },
  adminKey: string,
): Promise<AdminTenant> => {
  const response = await requestAdmin<{ tenant: AdminTenant }>(`/api/admin/workbench/tenants/${encodeURIComponent(slug)}`, adminKey, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.tenant;
};
