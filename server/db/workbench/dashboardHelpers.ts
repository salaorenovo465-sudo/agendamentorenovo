import type { BookingRecord, BookingStatus } from '../../types';
import type {
  DashboardFinanceEntryRow,
  DashboardFinanceGroupBy,
  DashboardFinanceSeriesPoint,
  DashboardFinanceStatusFilter,
  DashboardFinanceSummary,
} from './workbenchTypes';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_REGEX = /^\d{4}-\d{2}$/;

const SHORT_MONTHS_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

export const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const getDaysInMonth = (year: number, month1Based: number): number => {
  if (month1Based === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month1Based)) {
    return 30;
  }
  return 31;
};

export const parseIsoDateParts = (
  value: string | null | undefined,
): { year: number; month: number; day: number } | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().slice(0, 10);
  if (!ISO_DATE_REGEX.test(normalized)) {
    return null;
  }

  const [yStr, mStr, dStr] = normalized.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  const maxDay = getDaysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }

  return { year, month, day };
};

export const isValidIsoDate = (value: string | null | undefined): boolean =>
  parseIsoDateParts(value) !== null;

export const formatIsoDateParts = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const formatDateBrFromIso = (isoDate: string | null | undefined): string => {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) {
    return isoDate || '--';
  }
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${String(parts.year).padStart(4, '0')}`;
};

export const getMonthBounds = (
  monthParam: string,
): { month: string; year: number; monthNumber: number; startDate: string; endDate: string; daysInMonth: number } | null => {
  const trimmed = monthParam.trim();
  if (!ISO_MONTH_REGEX.test(trimmed)) {
    return null;
  }
  const [yStr, mStr] = trimmed.split('-');
  const year = Number(yStr);
  const monthNumber = Number(mStr);
  if (!Number.isInteger(year) || year < 1970 || year > 2100 || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  const daysInMonth = getDaysInMonth(year, monthNumber);
  return {
    month: trimmed,
    year,
    monthNumber,
    startDate: formatIsoDateParts(year, monthNumber, 1),
    endDate: formatIsoDateParts(year, monthNumber, daysInMonth),
    daysInMonth,
  };
};

export const addDaysIso = (isoDate: string, deltaDays: number): string => {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) {
    return isoDate;
  }
  // Using UTC noon on an explicit year/month/day avoids DST or local TZ day shifts.
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays, 12, 0, 0));
  return formatIsoDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

export const diffDaysIso = (startIso: string, endIso: string): number => {
  const startParts = parseIsoDateParts(startIso);
  const endParts = parseIsoDateParts(endIso);
  if (!startParts || !endParts) {
    return 0;
  }
  const startUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day, 12, 0, 0);
  const endUtc = Date.UTC(endParts.year, endParts.month - 1, endParts.day, 12, 0, 0);
  return Math.round((endUtc - startUtc) / 86_400_000);
};

export const getMondayWeekStartIso = (isoDate: string): string => {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) {
    return isoDate;
  }
  const utcDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)).getUTCDay();
  const offsetFromMonday = utcDay === 0 ? -6 : 1 - utcDay;
  return addDaysIso(isoDate, offsetFromMonday);
};

export const resolveFinanceReferenceDate = (row: {
  dueDate: string | null;
  createdAt: string;
}): string | null => {
  const dueParts = parseIsoDateParts(row.dueDate);
  if (dueParts) {
    return formatIsoDateParts(dueParts.year, dueParts.month, dueParts.day);
  }
  const createdParts = parseIsoDateParts(row.createdAt);
  if (createdParts) {
    return formatIsoDateParts(createdParts.year, createdParts.month, createdParts.day);
  }
  return null;
};

export const resolveRecommendedFinanceGroupBy = (
  entries: Pick<DashboardFinanceEntryRow, 'dueDate' | 'createdAt'>[],
  requestedGroupBy?: DashboardFinanceGroupBy | 'auto',
  startDate?: string | null,
  endDate?: string | null,
): DashboardFinanceGroupBy => {
  if (requestedGroupBy === 'day' || requestedGroupBy === 'week' || requestedGroupBy === 'month') {
    return requestedGroupBy;
  }

  let effectiveStart = startDate && isValidIsoDate(startDate) ? startDate : null;
  let effectiveEnd = endDate && isValidIsoDate(endDate) ? endDate : null;

  if (!effectiveStart || !effectiveEnd) {
    const dates = entries
      .map((entry) => resolveFinanceReferenceDate(entry))
      .filter((value): value is string => Boolean(value))
      .sort();
    if (dates.length > 0) {
      effectiveStart = dates[0];
      effectiveEnd = dates[dates.length - 1];
    }
  }

  if (!effectiveStart || !effectiveEnd) {
    return 'day';
  }

  const spanDays = Math.abs(diffDaysIso(effectiveStart, effectiveEnd)) + 1;
  if (spanDays > 92) {
    return 'month';
  }
  if (spanDays > 35) {
    return 'week';
  }
  return 'day';
};

export const roundMoney = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const computeFinanceSummary = (
  entries: Pick<DashboardFinanceEntryRow, 'amount' | 'status'>[],
): DashboardFinanceSummary => {
  let expected = 0;
  let received = 0;
  let pending = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let zeroAmountCount = 0;
  let negativeCount = 0;

  for (const entry of entries) {
    const amount = Number.isFinite(entry.amount) ? entry.amount : 0;
    expected += amount;
    if (amount === 0) {
      zeroAmountCount += 1;
    } else if (amount < 0) {
      negativeCount += 1;
    }

    if (entry.status === 'pago') {
      received += amount;
      paidCount += 1;
    } else {
      pending += amount;
      pendingCount += 1;
    }
  }

  return {
    expected: roundMoney(expected),
    received: roundMoney(received),
    pending: roundMoney(pending),
    totalCount: entries.length,
    paidCount,
    pendingCount,
    zeroAmountCount,
    negativeCount,
  };
};

const buildBucketInfo = (
  dateStr: string,
  groupBy: DashboardFinanceGroupBy,
): { key: string; label: string; fullLabel: string; startDate: string; endDate: string } => {
  const parts = parseIsoDateParts(dateStr);
  if (!parts) {
    return {
      key: dateStr,
      label: dateStr,
      fullLabel: dateStr,
      startDate: dateStr,
      endDate: dateStr,
    };
  }

  if (groupBy === 'month') {
    const monthKey = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`;
    const shortMonth = SHORT_MONTHS_PT[parts.month - 1] || String(parts.month);
    const bounds = getMonthBounds(monthKey);
    return {
      key: monthKey,
      label: `${shortMonth}/${String(parts.year).slice(-2)}`,
      fullLabel: `${shortMonth.toUpperCase()} ${parts.year}`,
      startDate: bounds?.startDate || dateStr,
      endDate: bounds?.endDate || dateStr,
    };
  }

  if (groupBy === 'week') {
    const weekStart = getMondayWeekStartIso(dateStr);
    const weekEnd = addDaysIso(weekStart, 6);
    const startParts = parseIsoDateParts(weekStart);
    const endParts = parseIsoDateParts(weekEnd);
    const shortLabel = startParts
      ? `${String(startParts.day).padStart(2, '0')}/${String(startParts.month).padStart(2, '0')}`
      : weekStart;
    const endShort = endParts
      ? `${String(endParts.day).padStart(2, '0')}/${String(endParts.month).padStart(2, '0')}`
      : weekEnd;

    return {
      key: weekStart,
      label: `Sem ${shortLabel}`,
      fullLabel: `${shortLabel} a ${endShort}`,
      startDate: weekStart,
      endDate: weekEnd,
    };
  }

  const shortDay = `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}`;
  return {
    key: dateStr,
    label: shortDay,
    fullLabel: formatDateBrFromIso(dateStr),
    startDate: dateStr,
    endDate: dateStr,
  };
};

export const aggregateFinanceSeriesWithScale = (
  entries: DashboardFinanceEntryRow[],
  requestedGroupBy: DashboardFinanceGroupBy | 'auto' = 'auto',
  startDate?: string | null,
  endDate?: string | null,
  maxPointsBeforeUpgrade = 45,
): { groupBy: DashboardFinanceGroupBy; autoAdjusted: boolean; series: DashboardFinanceSeriesPoint[] } => {
  const initialGroupBy = resolveRecommendedFinanceGroupBy(entries, requestedGroupBy, startDate, endDate);
  let effectiveGroupBy = initialGroupBy;
  let series = aggregateFinanceSeries(entries, effectiveGroupBy);

  if (series.length > maxPointsBeforeUpgrade && effectiveGroupBy === 'day') {
    effectiveGroupBy = 'week';
    series = aggregateFinanceSeries(entries, effectiveGroupBy);
  }
  if (series.length > maxPointsBeforeUpgrade && effectiveGroupBy === 'week') {
    effectiveGroupBy = 'month';
    series = aggregateFinanceSeries(entries, effectiveGroupBy);
  }

  return {
    groupBy: effectiveGroupBy,
    autoAdjusted: requestedGroupBy !== 'auto' && effectiveGroupBy !== requestedGroupBy,
    series,
  };
};

export const aggregateFinanceSeries = (
  entries: DashboardFinanceEntryRow[],
  groupBy: DashboardFinanceGroupBy,
): DashboardFinanceSeriesPoint[] => {
  const buckets = new Map<string, DashboardFinanceSeriesPoint>();

  for (const entry of entries) {
    const refDate = resolveFinanceReferenceDate(entry);
    if (!refDate) {
      continue;
    }

    const info = buildBucketInfo(refDate, groupBy);
    let bucket = buckets.get(info.key);
    if (!bucket) {
      bucket = {
        key: info.key,
        label: info.label,
        fullLabel: info.fullLabel,
        startDate: info.startDate,
        endDate: info.endDate,
        expected: 0,
        received: 0,
        pending: 0,
        count: 0,
        paidCount: 0,
        pendingCount: 0,
      };
      buckets.set(info.key, bucket);
    }

    const amount = Number.isFinite(entry.amount) ? entry.amount : 0;
    bucket.expected += amount;
    bucket.count += 1;
    if (entry.status === 'pago') {
      bucket.received += amount;
      bucket.paidCount += 1;
    } else {
      bucket.pending += amount;
      bucket.pendingCount += 1;
    }
  }

  return Array.from(buckets.values())
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((point) => ({
      ...point,
      expected: roundMoney(point.expected),
      received: roundMoney(point.received),
      pending: roundMoney(point.pending),
    }));
};

export type CalendarDayCounts = {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  rejected: number;
};

export const summarizeBookingsByDate = (
  bookings: Pick<BookingRecord, 'date' | 'status'>[],
): Record<string, CalendarDayCounts> => {
  const result: Record<string, CalendarDayCounts> = {};

  for (const booking of bookings) {
    const dateKey = String(booking.date || '').trim().slice(0, 10);
    if (!dateKey) {
      continue;
    }

    if (!result[dateKey]) {
      result[dateKey] = {
        total: 0,
        pending: 0,
        confirmed: 0,
        completed: 0,
        rejected: 0,
      };
    }

    const bucket = result[dateKey];
    bucket.total += 1;
    const status = (booking.status || 'pending') as BookingStatus;
    if (status === 'pending' || status === 'confirmed' || status === 'completed' || status === 'rejected') {
      bucket[status] += 1;
    }
  }

  return result;
};

export const filterFinanceEntriesForTable = (
  entries: DashboardFinanceEntryRow[],
  options?: {
    entryStatus?: DashboardFinanceStatusFilter;
    search?: string | null;
  },
): DashboardFinanceEntryRow[] => {
  const statusFilter: DashboardFinanceStatusFilter =
    options?.entryStatus === 'pago' || options?.entryStatus === 'pendente' ? options.entryStatus : 'all';
  const searchTerm = (options?.search || '').trim().toLowerCase();
  const normalizedNumericSearch = searchTerm.startsWith('#') ? searchTerm.slice(1).trim() : searchTerm;

  return entries.filter((entry) => {
    if (statusFilter !== 'all' && entry.status !== statusFilter) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const haystack = [
      entry.clientName,
      entry.serviceName,
      entry.paymentMethod || '',
      entry.dueDate || '',
      formatDateBrFromIso(entry.dueDate),
      String(entry.id),
      entry.bookingId ? `#${entry.bookingId}` : '',
    ]
      .join(' ')
      .toLowerCase();

    if (haystack.includes(searchTerm)) {
      return true;
    }

    if (normalizedNumericSearch && /^\d+$/.test(normalizedNumericSearch)) {
      return String(entry.id) === normalizedNumericSearch || String(entry.bookingId || '') === normalizedNumericSearch;
    }

    return false;
  });
};
