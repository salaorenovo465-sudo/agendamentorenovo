export const isTransientNetworkError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const msg = String((error as { message?: unknown }).message || '').toLowerCase();
  const details = String((error as { details?: unknown }).details || '').toLowerCase();
  const code = String((error as { code?: unknown }).code || '').toLowerCase();

  return (
    msg.includes('fetch failed') ||
    msg.includes('connecttimeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    details.includes('connecttimeout') ||
    details.includes('econnreset') ||
    details.includes('und_err_connect_timeout') ||
    code === 'econnreset' ||
    code === 'etimedout'
  );
};

export const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const withTransientRetry = async <T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isTransientNetworkError(error)) {
        await sleepMs(160 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};
