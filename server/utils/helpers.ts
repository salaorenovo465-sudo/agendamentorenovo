/**
 * Shared utility helpers used across routes and services.
 */

/** Parse a string to a positive integer, returning fallback if invalid. */
export const toPositiveInt = (raw: string | number | undefined, fallback: number): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

/** Parse an ID string, returning null if invalid. */
export const parseId = (rawId: string): number | null => {
  const parsedId = Number(rawId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }
  return parsedId;
};

/** Get today's date as YYYY-MM-DD string. */
export const getTodayDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Type-safe helpers for parsing unknown objects (used in webhook/API responses). */
export type GenericObject = Record<string, unknown>;

export const asObject = (value: unknown): GenericObject | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as GenericObject;
  }
  return null;
};

export const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

/** Extract a trimmed string from an unknown value. */
export const getString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Extract a positive integer from an unknown value, or return 0. */
export const getPositiveInt = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
};
