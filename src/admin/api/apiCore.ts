const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const ADMIN_KEY_STORAGE = 'renovo_admin_api_key';
export const ADMIN_AUTH_ERROR_EVENT = 'renovo-admin-auth-error';
export const ADMIN_TENANT_STORAGE = 'renovo_admin_tenant';

export { API_BASE };

export const withTenantQuery = (path: string, tenantSlug?: string): string => {
  const tenant = (tenantSlug || '').trim().toLowerCase();
  if (!tenant) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}tenant=${encodeURIComponent(tenant)}`;
};

export const requestAdmin = async <T>(
  path: string,
  adminKey: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // noop
    }

    if (response.status === 401 && typeof window !== 'undefined') {
      window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      window.dispatchEvent(new CustomEvent(ADMIN_AUTH_ERROR_EVENT, { detail: { message } }));
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
};
