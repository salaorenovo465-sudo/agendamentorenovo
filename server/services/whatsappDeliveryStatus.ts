export type OutgoingDeliveryStatus = 'sent' | 'delivered' | 'read';

type DeliveryStatusEntry = {
  status: OutgoingDeliveryStatus;
  updatedAt: number;
  expiresAt: number;
};

const STATUS_WEIGHT: Record<OutgoingDeliveryStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
};

const STATUS_TTL_MS = 1000 * 60 * 60 * 48;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 10;
const store = new Map<string, DeliveryStatusEntry>();

const cleanupExpired = (): void => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
};

const cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

const canPromoteStatus = (current: OutgoingDeliveryStatus, next: OutgoingDeliveryStatus): boolean =>
  STATUS_WEIGHT[next] >= STATUS_WEIGHT[current];

export const setOutgoingDeliveryStatus = (providerMessageId: string, status: OutgoingDeliveryStatus): boolean => {
  const id = providerMessageId.trim();
  if (!id) {
    return false;
  }

  const now = Date.now();
  const existing = store.get(id);

  if (existing && !canPromoteStatus(existing.status, status)) {
    return false;
  }

  store.set(id, {
    status,
    updatedAt: now,
    expiresAt: now + STATUS_TTL_MS,
  });

  return !existing || existing.status !== status;
};

export const getOutgoingDeliveryStatus = (providerMessageId: string | null | undefined): OutgoingDeliveryStatus | null => {
  if (!providerMessageId) {
    return null;
  }

  const entry = store.get(providerMessageId);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(providerMessageId);
    return null;
  }

  return entry.status;
};
