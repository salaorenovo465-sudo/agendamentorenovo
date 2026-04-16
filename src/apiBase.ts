const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const isLoopbackHost = (hostname: string): boolean => LOOPBACK_HOSTNAMES.has(hostname.trim().toLowerCase());

const shouldIgnoreConfiguredApiBase = (configuredApiBase: string): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const apiUrl = new URL(configuredApiBase, window.location.origin);
    const pageUrl = new URL(window.location.origin);

    return isLoopbackHost(apiUrl.hostname) && !isLoopbackHost(pageUrl.hostname);
  } catch {
    return false;
  }
};

const resolveApiBase = (): string => {
  const configuredApiBase = trimTrailingSlash((import.meta.env.VITE_API_URL || '').trim());

  if (configuredApiBase && !shouldIgnoreConfiguredApiBase(configuredApiBase)) {
    return configuredApiBase;
  }

  if (typeof window !== 'undefined') {
    return trimTrailingSlash(window.location.origin);
  }

  return '';
};

export const API_BASE = resolveApiBase();

export const apiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};
