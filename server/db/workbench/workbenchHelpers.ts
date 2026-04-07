import type { TenantRecord, TenantRegistryValue } from './workbenchTypes';

export const TENANT_REGISTRY_KEY = 'tenants_registry';
export const LEGACY_SETTINGS_KEY = 'general';
export const TENANT_SETTINGS_PREFIX = 'tenant:';
export const TENANT_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}$/;
export const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').toLowerCase();
export const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME || 'Estudio Renovo';

export const normalizeTenantSlug = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (!TENANT_SLUG_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
};

export const normalizeTenantName = (raw: string | null | undefined): string => {
  const value = String(raw || '').trim();
  return value || 'Empresa sem nome';
};

export const toIsoNow = (): string => new Date().toISOString();

export const mapTenantRegistry = (value: unknown): TenantRecord[] => {
  const payload = (value || {}) as TenantRegistryValue;
  const tenants = Array.isArray(payload.tenants) ? payload.tenants : [];
  const now = toIsoNow();

  return tenants
    .map((tenant) => {
      const slug = normalizeTenantSlug(tenant.slug);
      if (!slug) {
        return null;
      }

      return {
        slug,
        name: normalizeTenantName(tenant.name),
        active: tenant.active !== false,
        createdAt: tenant.createdAt || now,
        updatedAt: tenant.updatedAt || now,
      };
    })
    .filter((tenant): tenant is TenantRecord => Boolean(tenant));
};

export const toTenantRegistryValue = (tenants: TenantRecord[]): TenantRegistryValue => ({
  tenants: tenants.map((tenant) => ({
    slug: tenant.slug,
    name: tenant.name,
    active: tenant.active,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  })),
});

export const settingsKeyForTenant = (tenantSlug: string | null | undefined): string => {
  const normalized = normalizeTenantSlug(tenantSlug);
  if (!normalized) {
    return LEGACY_SETTINGS_KEY;
  }

  return `${TENANT_SETTINGS_PREFIX}${normalized}`;
};
