import type { AdminBooking, AdminBookingServiceItem } from './types';

export type ServiceCatalogItem = {
  id?: number;
  name: string;
  price: string;
  desc?: string;
  image?: string;
  durationMin?: number;
  active?: boolean;
  persisted?: boolean;
};

export type ServiceCatalogCategory = {
  category: string;
  items: ServiceCatalogItem[];
};

export type CollaboratorServiceRule = {
  serviceName: string;
  category: string;
  priceLabel: string;
  commissionPercent: number;
  active: boolean;
};

export type CollaboratorCategoryProfile = {
  category: string;
  enabled: boolean;
  services: CollaboratorServiceRule[];
};

export type CollaboratorDraft = {
  id?: number;
  name: string;
  phone: string;
  email: string;
  cpf: string;
  birthDate: string;
  address: string;
  notes: string;
  workStart: string;
  workEnd: string;
  active: boolean;
  baseCommission: number;
  specialties: string;
  commissionProfile: CollaboratorCategoryProfile[];
};

export type CollaboratorServiceSummary = {
  serviceName: string;
  category: string;
  quantity: number;
  commissionAmount: number;
  commissionPercent: number;
};

export type CollaboratorPerformance = {
  servicesCompleted: number;
  commissionTotal: number;
  serviceBreakdown: CollaboratorServiceSummary[];
};

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const toNumberValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeServiceItem = (value: unknown): AdminBookingServiceItem | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  const name = toStringValue(row.name).trim();
  if (!name) {
    return null;
  }

  return {
    category: toStringValue(row.category).trim(),
    name,
    price: toStringValue(row.price).trim(),
  };
};

const parseRuleArray = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
};

const buildDefaultCategoryProfile = (
  category: ServiceCatalogCategory,
  baseCommission: number,
): CollaboratorCategoryProfile => ({
  category: category.category,
  enabled: false,
  services: category.items.map((item) => ({
    serviceName: item.name,
    category: category.category,
    priceLabel: item.price,
    commissionPercent: baseCommission,
    active: true,
  })),
});

const findCatalogService = (
  serviceCatalog: ServiceCatalogCategory[],
  categoryName: string,
  serviceName: string,
): ServiceCatalogItem | null => {
  const category = serviceCatalog.find((entry) => entry.category === categoryName);
  const fromCategory = category?.items.find((item) => item.name === serviceName);
  if (fromCategory) {
    return fromCategory;
  }

  for (const entry of serviceCatalog) {
    const found = entry.items.find((item) => item.name === serviceName);
    if (found) {
      return found;
    }
  }

  return null;
};

export const parsePriceAmount = (value: string | null | undefined): number => {
  if (!value) return 0;
  const match = value.match(/[\d.]+(?:,\d{2})?|\d+(?:\.\d{2})?/);
  if (!match) return 0;
  return Number(match[0].replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
};

export const getCollaboratorId = (row: Record<string, unknown>): number =>
  toNumberValue(row.id);

export const buildCommissionProfile = (
  serviceCatalog: ServiceCatalogCategory[],
  source: unknown,
  baseCommission: number,
): CollaboratorCategoryProfile[] => {
  const defaults = serviceCatalog.map((category) => buildDefaultCategoryProfile(category, baseCommission));
  const sourceCategories = parseRuleArray(source);

  for (const categoryProfile of defaults) {
    const sourceCategory = sourceCategories.find((entry) => toStringValue(entry.category).trim() === categoryProfile.category);
    if (!sourceCategory) {
      continue;
    }

    categoryProfile.enabled = sourceCategory.enabled !== false;
    const sourceServices = parseRuleArray(sourceCategory.services);

    for (const serviceRule of categoryProfile.services) {
      const sourceRule = sourceServices.find((entry) => {
        const sourceName = toStringValue(entry.serviceName || entry.name).trim();
        return sourceName === serviceRule.serviceName;
      });

      if (!sourceRule) {
        continue;
      }

      const catalogService = findCatalogService(serviceCatalog, categoryProfile.category, serviceRule.serviceName);
      serviceRule.active = sourceRule.active !== false;
      serviceRule.commissionPercent = Math.max(0, Math.min(100, toNumberValue(sourceRule.commissionPercent ?? sourceRule.percent ?? sourceRule.commission)));
      serviceRule.priceLabel = toStringValue(sourceRule.priceLabel || sourceRule.price).trim() || catalogService?.price || serviceRule.priceLabel;
    }
  }

  return defaults;
};

export const createEmptyCollaboratorDraft = (
  serviceCatalog: ServiceCatalogCategory[],
): CollaboratorDraft => ({
  name: '',
  phone: '',
  email: '',
  cpf: '',
  birthDate: '',
  address: '',
  notes: '',
  workStart: '08:00',
  workEnd: '18:00',
  active: true,
  baseCommission: 0,
  specialties: '',
  commissionProfile: buildCommissionProfile(serviceCatalog, [], 0),
});

export const createCollaboratorDraft = (
  row: Record<string, unknown>,
  serviceCatalog: ServiceCatalogCategory[],
): CollaboratorDraft => {
  const baseCommission = Math.max(0, Math.min(100, toNumberValue(row.base_commission ?? row.commission)));
  const commissionProfile = buildCommissionProfile(serviceCatalog, row.commission_profile, baseCommission);
  const enabledCategories = commissionProfile.filter((category) => category.enabled).map((category) => category.category);

  return {
    id: getCollaboratorId(row) || undefined,
    name: toStringValue(row.name).trim(),
    phone: toStringValue(row.phone).trim(),
    email: toStringValue(row.email).trim(),
    cpf: toStringValue(row.cpf).trim(),
    birthDate: toStringValue(row.birth_date).trim(),
    address: toStringValue(row.address).trim(),
    notes: toStringValue(row.notes).trim(),
    workStart: toStringValue(row.work_start).trim(),
    workEnd: toStringValue(row.work_end).trim(),
    active: row.active !== false,
    baseCommission,
    specialties: enabledCategories.join(', ') || toStringValue(row.specialties).trim(),
    commissionProfile,
  };
};

export const serializeCollaboratorDraft = (draft: CollaboratorDraft): Record<string, unknown> => {
  const enabledCategories = draft.commissionProfile
    .filter((category) => category.enabled)
    .map((category) => ({
      category: category.category,
      enabled: true,
      services: category.services.map((service) => ({
        serviceName: service.serviceName,
        category: category.category,
        priceLabel: service.priceLabel,
        commissionPercent: Math.max(0, Math.min(100, service.commissionPercent)),
        active: service.active !== false,
      })),
    }));

  return {
    name: draft.name.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim(),
    cpf: draft.cpf.trim(),
    birth_date: draft.birthDate.trim(),
    address: draft.address.trim(),
    notes: draft.notes.trim(),
    work_start: draft.workStart.trim(),
    work_end: draft.workEnd.trim(),
    active: draft.active,
    base_commission: Math.max(0, Math.min(100, draft.baseCommission)),
    specialties: enabledCategories.map((category) => category.category).join(', '),
    commission_profile: enabledCategories,
  };
};

export const countCollaboratorCategories = (draft: CollaboratorDraft): number =>
  draft.commissionProfile.filter((category) => category.enabled).length;

export const countCollaboratorServices = (draft: CollaboratorDraft): number =>
  draft.commissionProfile.reduce((total, category) => {
    if (!category.enabled) {
      return total;
    }

    return total + category.services.filter((service) => service.active !== false).length;
  }, 0);

export const extractBookingServiceItems = (
  booking: Pick<AdminBooking, 'service' | 'servicePrice' | 'serviceItems'>,
): AdminBookingServiceItem[] => {
  const normalizedItems = Array.isArray(booking.serviceItems)
    ? booking.serviceItems.map(normalizeServiceItem).filter((item): item is AdminBookingServiceItem => Boolean(item))
    : [];

  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  const serviceName = booking.service.trim();
  if (!serviceName) {
    return [];
  }

  return [
    {
      category: '',
      name: serviceName,
      price: booking.servicePrice || '',
    },
  ];
};

export const findServiceCommissionRule = (
  draft: CollaboratorDraft,
  item: Pick<AdminBookingServiceItem, 'name' | 'category'>,
): CollaboratorServiceRule | null => {
  const normalizedName = item.name.trim();
  const normalizedCategory = item.category.trim();

  for (const category of draft.commissionProfile) {
    if (!category.enabled) {
      continue;
    }

    if (normalizedCategory && category.category !== normalizedCategory) {
      continue;
    }

    const match = category.services.find((service) => service.serviceName === normalizedName);
    if (match) {
      return match;
    }
  }

  for (const category of draft.commissionProfile) {
    if (!category.enabled) {
      continue;
    }

    const match = category.services.find((service) => service.serviceName === normalizedName);
    if (match) {
      return match;
    }
  }

  return null;
};

export const getCollaboratorCoverage = (
  draft: CollaboratorDraft,
  items: Array<Pick<AdminBookingServiceItem, 'name' | 'category'>>,
): { matched: number; total: number; fullMatch: boolean } => {
  const total = items.length;
  if (total === 0) {
    return { matched: 0, total: 0, fullMatch: true };
  }

  let matched = 0;
  for (const item of items) {
    const rule = findServiceCommissionRule(draft, item);
    if (rule && rule.active !== false) {
      matched += 1;
    }
  }

  return {
    matched,
    total,
    fullMatch: matched === total,
  };
};

const isBookingAssignedToCollaborator = (booking: AdminBooking, collaboratorId?: number): boolean => {
  if (!collaboratorId || !booking.professionalId) {
    return false;
  }

  return booking.professionalId === collaboratorId;
};

export const computeCollaboratorPerformance = (
  draft: CollaboratorDraft,
  bookings: AdminBooking[],
): CollaboratorPerformance => {
  const completedBookings = bookings.filter((booking) =>
    booking.status === 'completed' && isBookingAssignedToCollaborator(booking, draft.id),
  );

  const breakdown = new Map<string, CollaboratorServiceSummary>();
  let servicesCompleted = 0;
  let commissionTotal = 0;

  for (const booking of completedBookings) {
    for (const item of extractBookingServiceItems(booking)) {
      const rule = findServiceCommissionRule(draft, item);
      const commissionPercent = rule?.active === false
        ? 0
        : rule?.commissionPercent ?? draft.baseCommission;
      const amount = parsePriceAmount(item.price);
      const commissionAmount = amount * (commissionPercent / 100);
      const key = `${item.category || rule?.category || ''}::${item.name}`;

      servicesCompleted += 1;
      commissionTotal += commissionAmount;

      const current = breakdown.get(key);
      if (current) {
        current.quantity += 1;
        current.commissionAmount += commissionAmount;
      } else {
        breakdown.set(key, {
          serviceName: item.name,
          category: item.category || rule?.category || '',
          quantity: 1,
          commissionAmount,
          commissionPercent,
        });
      }
    }
  }

  return {
    servicesCompleted,
    commissionTotal,
    serviceBreakdown: Array.from(breakdown.values()).sort((a, b) => b.commissionAmount - a.commissionAmount || b.quantity - a.quantity),
  };
};
