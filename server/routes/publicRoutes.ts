import { Router } from 'express';

import { bookingStore } from '../db/bookingStore';
import { inboxStore } from '../db/inboxStore';
import { workbenchStore } from '../db/workbenchStore';
import { createRateLimit } from '../middleware/rateLimit';
import type { BookingServiceItem } from '../types';
import {
  calendarConfig,
  fetchBusySlotsFromCalendarApi,
  fetchBusySlotsFromIcs,
  hasCalendarReadAccess,
} from '../services/calendarService';
import { inspectEvolutionIntegration } from '../services/evolutionIntegrationService';
import { getEvolutionInstanceStatus } from '../services/evolutionInstanceService';
import {
  notifyCustomerPendingBooking,
  notifySalonNewBooking,
} from '../services/notificationService';
import { normalizeWhatsappPhoneWithPlus } from '../utils/phone';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;
const TENANT_REGEX = /^[a-z0-9-]{2,50}$/;
const DEFAULT_OPEN_START_MINUTE = 8 * 60;
const DEFAULT_OPEN_END_MINUTE = 21 * 60;

const parseTenantFromQuery = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return TENANT_REGEX.test(normalized) ? normalized : null;
};

const normalizeBookingTime = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!TIME_REGEX.test(trimmed)) {
    return '';
  }

  return trimmed;
};

const toMinuteSlot = (time: string): string => time.slice(0, 5);

const formatMinuteSlot = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const parseTimeToMinute = (value: string | null): number | null => {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const buildMinuteSlots = (startMinute: number, endMinute: number): Set<string> => {
  const slots = new Set<string>();
  for (let current = startMinute; current < endMinute; current += 1) {
    slots.add(formatMinuteSlot(current));
  }
  return slots;
};

const getCurrentTimezoneDateTime = (timeZone = calendarConfig.timezone): { date: string; time: string } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value || '';

  const rawHour = getPart('hour');
  const hour = rawHour === '24' ? '00' : rawHour;

  return {
    date: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
    time: `${hour}:${getPart('minute')}`,
  };
};

const filterFutureSlotsIfToday = (slots: Set<string>, date: string, nowTz: { date: string; time: string }): Set<string> => {
  if (date !== nowTz.date) {
    return slots;
  }

  return new Set(Array.from(slots).filter((slot) => slot > nowTz.time));
};

const isBookingConflictError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return error instanceof Error && /horario ja reservado/i.test(error.message);
  }
  const err = error as { code?: string; message?: string };
  if (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return true;
  }
  return typeof err.message === 'string' && (/horario ja reservado|bookings_unique_active_slot_idx/i.test(err.message));
};

const parseBookingServiceItems = (value: unknown): BookingServiceItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) {
        return null;
      }

      return {
        category: typeof row.category === 'string' ? row.category.trim() : '',
        name,
        price: typeof row.price === 'string' ? row.price.trim() : '',
      } satisfies BookingServiceItem;
    })
    .filter((item): item is BookingServiceItem => Boolean(item));
};

/**
 * Check availability rules for a given date.
 * Returns the set of allowed time slots based on active rules,
 * or null if no rules are defined (meaning all slots are allowed).
 */
const getAvailabilityConstraints = async (date: string): Promise<{
  allowedSlots: Set<string>;
  limitPerDay: number | null;
  hasConfiguredRules: boolean;
}> => {
  const nowTz = getCurrentTimezoneDateTime();
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=Sunday, 6=Saturday

  if (date < nowTz.date || weekday === 0) {
    return {
      allowedSlots: new Set<string>(),
      limitPerDay: null,
      hasConfiguredRules: true,
    };
  }

  const [allRules, rules] = await Promise.all([
    workbenchStore.getActiveAvailabilityRules(),
    workbenchStore.getActiveAvailabilityRules(weekday),
  ]);
  const hasConfiguredRules = allRules.length > 0;

  if (rules.length === 0) {
    return {
      allowedSlots: hasConfiguredRules
        ? new Set<string>()
        : filterFutureSlotsIfToday(buildMinuteSlots(DEFAULT_OPEN_START_MINUTE, DEFAULT_OPEN_END_MINUTE), date, nowTz),
      limitPerDay: null,
      hasConfiguredRules,
    };
  }

  const allowedSlots = new Set<string>();
  let limitPerDay: number | null = null;

  for (const rule of rules) {
    const startTime = typeof rule.start_time === 'string' ? rule.start_time : null;
    const endTime = typeof rule.end_time === 'string' ? rule.end_time : null;
    const ruleLimit = typeof rule.limit_per_day === 'number' ? rule.limit_per_day : null;

    if (ruleLimit && ruleLimit > 0) {
      limitPerDay = limitPerDay ? Math.min(limitPerDay, ruleLimit) : ruleLimit;
    }

    if (startTime && endTime) {
      const startMinutes = parseTimeToMinute(startTime);
      const endMinutes = parseTimeToMinute(endTime);
      if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
        buildMinuteSlots(startMinutes, endMinutes).forEach((slot) => allowedSlots.add(slot));
      }
    }
  }

  return {
    allowedSlots: filterFutureSlotsIfToday(allowedSlots, date, nowTz),
    limitPerDay,
    hasConfiguredRules,
  };
};

const formatPublicServicePrice = (price: unknown): string => {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Sob consulta';
  }

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const publicRoutes = Router();

/**
 * Public endpoint to fetch the service catalog.
 * Returns categories with their services, matching the format used by the landing page.
 * Only active services are returned. The frontend uses this to stay in sync with admin changes.
 */
publicRoutes.get('/services', async (_req, res) => {
  try {
    const rows = await workbenchStore.list('services');

    if (!rows || rows.length === 0) {
      return res.json({ catalog: [], managed: false });
    }

    const categoryMap = new Map<string, { category: string; items: Array<{ name: string; price: string; desc: string; durationMin: number }> }>();

    for (const row of rows) {
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) continue;

      // Skip inactive services
      if (row.active === false || row.active === 'false') continue;

      const categoryName = (typeof row.category === 'string' ? row.category.trim() : '') || 'Sem categoria';
      const normalizedKey = categoryName.toLowerCase();

      let category = categoryMap.get(normalizedKey);
      if (!category) {
        category = { category: categoryName, items: [] };
        categoryMap.set(normalizedKey, category);
      }

      category.items.push({
        name,
        price: formatPublicServicePrice(row.price),
        desc: typeof row.description === 'string' ? row.description.trim() : '',
        durationMin: Number(row.duration_min) || 60,
      });
    }

    // Sort categories and services alphabetically
    const catalog = Array.from(categoryMap.values())
      .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'))
      .map((cat) => ({
        ...cat,
        items: cat.items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      }));

    return res.json({ catalog, managed: true });
  } catch (error) {
    console.error('Erro ao carregar catalogo publico de servicos:', error);
    return res.json({ catalog: [], managed: false });
  }
});

const maskEmail = (email: string | null | undefined): string | null => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `*@${domain}`;
  return `${user.slice(0, 2)}***${user.slice(-1)}@${domain}`;
};

publicRoutes.get('/integration-status', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);
  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  try {
    const [calendarReadAccess, evolutionStatus, evolutionDiagnostics] = await Promise.all([
      hasCalendarReadAccess(),
      getEvolutionInstanceStatus(tenant || undefined, { includeQr: false }),
      inspectEvolutionIntegration(tenant || undefined),
    ]);

    res.json({
      calendarId: maskEmail(calendarConfig.calendarId),
      calendarApiConfigured: calendarConfig.hasApiCredentials,
      calendarIcsConfigured: calendarConfig.hasIcsUrl,
      whatsappConfigured: evolutionStatus.configured,
      whatsappProvider: evolutionStatus.configured ? 'evolution' : null,
      whatsappConnectionState: evolutionStatus.configured ? evolutionStatus.connectionState : 'disabled',
      whatsappConnected: evolutionStatus.configured ? evolutionStatus.connected : false,
      evolutionInstance: evolutionStatus.configured ? 'connected' : null,
      evolutionInstanceFound: evolutionDiagnostics.instanceFound,
      evolutionReadinessScore: evolutionDiagnostics.readinessScore,
      evolutionStatus: evolutionDiagnostics.overallStatus,
      calendarReadAccess,
      calendarWriteAccess: 'on-confirm',
      storage: bookingStore.isSupabaseEnabled() ? 'supabase' : 'sqlite-fallback',
    });
  } catch (error) {
    console.error('Erro ao carregar status de integracao publica:', error);
    return res.status(500).json({ error: 'Erro ao carregar status de integracao.' });
  }
});

publicRoutes.get('/availability', async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string' || !DATE_REGEX.test(date)) {
    return res.status(400).json({ error: 'Data inválida. Envie no formato YYYY-MM-DD.' });
  }

  try {
    const [localBusySlots, constraints] = await Promise.all([
      bookingStore.getLocalBusySlots(date),
      getAvailabilityConstraints(date),
    ]);

    const remoteBusySlots = new Set<string>();

    try {
      const icsBusySlots = await fetchBusySlotsFromIcs(date);
      icsBusySlots.forEach((slot) => remoteBusySlots.add(slot));
    } catch (error) {
      console.error('Erro ao ler agenda ICS:', error);
    }

    try {
      const apiBusySlots = await fetchBusySlotsFromCalendarApi(date);
      apiBusySlots.forEach((slot) => remoteBusySlots.add(slot));
    } catch (error) {
      console.error('Erro ao ler agenda via Calendar API:', error);
    }

    const busySlots = Array.from(new Set([...remoteBusySlots, ...localBusySlots])).sort();
    const busyMinuteSlots = new Set(busySlots.map(toMinuteSlot));
    const availableSlots = Array.from(constraints.allowedSlots)
      .filter((slot) => !busyMinuteSlots.has(slot))
      .sort();

    // If limit_per_day is set and we've reached it, mark all slots as busy
    if (constraints.limitPerDay) {
      const bookingsOnDate = await bookingStore.countByDate(date);
      if (bookingsOnDate >= constraints.limitPerDay) {
        return res.json({
          busySlots: ['all'],
          availableSlots: [],
          dateAvailable: false,
          limitReached: true,
          availabilityConfigured: constraints.hasConfiguredRules,
        });
      }
    }

    return res.json({
      busySlots,
      availableSlots,
      dateAvailable: availableSlots.length > 0,
      limitReached: false,
      availabilityConfigured: constraints.hasConfiguredRules,
    });
  } catch (error) {
    console.error('Erro ao consultar disponibilidade:', error);
    return res.status(500).json({ error: 'Erro ao consultar disponibilidade.' });
  }
});

const publicBookingRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 15,
  message: 'Muitas tentativas de agendamento em pouco tempo. Aguarde 1 minuto e tente novamente.',
  keyPrefix: 'public-booking',
});

publicRoutes.post('/bookings', publicBookingRateLimit, async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);
  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const { service, servicePrice, date, time, name, phone } = req.body;
  const serviceValue = typeof service === 'string' ? service.trim() : '';
  const servicePriceValue = typeof servicePrice === 'string' && servicePrice.trim() ? servicePrice.trim() : null;
  const customerName = typeof name === 'string' ? name.trim() : '';
  const customerPhone = typeof phone === 'string' ? (normalizeWhatsappPhoneWithPlus(phone) || phone.trim()) : '';
  const normalizedTime = normalizeBookingTime(time);
  const normalizedMinuteSlot = toMinuteSlot(normalizedTime);
  const parsedServiceItems = parseBookingServiceItems(req.body?.serviceItems ?? req.body?.selectedServices);
  const serviceItems = parsedServiceItems.length > 0
    ? parsedServiceItems
    : serviceValue
      ? [{ category: '', name: serviceValue, price: servicePriceValue || '' }]
      : [];

  if (!serviceValue || !date || !normalizedTime || !customerName || !customerPhone) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  if (typeof date !== 'string' || !DATE_REGEX.test(date)) {
    return res.status(400).json({ error: 'Data inválida. Use YYYY-MM-DD.' });
  }

  const nowTz = getCurrentTimezoneDateTime();
  if (date < nowTz.date) {
    return res.status(400).json({ error: 'Não é possível realizar agendamentos em datas passadas.' });
  }

  if (!normalizedTime) {
    return res.status(400).json({ error: 'Horario invalido. Use HH:mm.' });
  }

  if (date === nowTz.date && toMinuteSlot(normalizedTime) <= nowTz.time) {
    return res.status(400).json({ error: 'Não é possível realizar agendamentos em horários que já passaram.' });
  }

  try {
    const constraints = await getAvailabilityConstraints(date);
    if (!constraints.allowedSlots.has(normalizedMinuteSlot)) {
      return res.status(409).json({ error: 'Horario indisponivel pelas regras de disponibilidade.' });
    }

    if (constraints.limitPerDay) {
      const bookingsOnDate = await bookingStore.countByDate(date);
      if (bookingsOnDate >= constraints.limitPerDay) {
        return res.status(409).json({ error: 'Limite de agendamentos do dia atingido.' });
      }
    }

    const remoteBusySlots = new Set<string>();

    try {
      const icsBusySlots = await fetchBusySlotsFromIcs(date);
      icsBusySlots.forEach((slot) => remoteBusySlots.add(slot));
    } catch (error) {
      console.error('Erro ao validar conflito via agenda ICS:', error);
    }

    try {
      const apiBusySlots = await fetchBusySlotsFromCalendarApi(date);
      apiBusySlots.forEach((slot) => remoteBusySlots.add(slot));
    } catch (error) {
      console.error('Erro ao validar conflito via Calendar API:', error);
    }

    if (Array.from(remoteBusySlots).some((slot) => toMinuteSlot(slot) === normalizedMinuteSlot)) {
      return res.status(409).json({ error: 'Horário indisponível na agenda.' });
    }

    const booking = await bookingStore.create({
      service: serviceValue,
      servicePrice: servicePriceValue,
      serviceItems,
      date,
      time: normalizedTime,
      name: customerName,
      phone: customerPhone,
    });

    let normalizedBooking = booking;
    try {
      const thread = await inboxStore.ensureThread(booking.phone, booking.name);
      normalizedBooking =
        (await bookingStore.updateWhatsappThread({ id: booking.id, whatsappThreadId: thread.id })) || booking;
    } catch (error) {
      console.error('Erro ao vincular thread do inbox no agendamento publico:', error);
    }

    await Promise.allSettled([
      notifySalonNewBooking(normalizedBooking, tenant || undefined),
      notifyCustomerPendingBooking(normalizedBooking, tenant || undefined),
    ]);

    return res.status(201).json({
      message: 'Solicitação enviada com sucesso. Aguardando confirmação do salão.',
      booking: normalizedBooking,
    });
  } catch (error) {
    if (isBookingConflictError(error)) {
      return res.status(409).json({ error: 'Horário já reservado.' });
    }
    console.error('Erro ao criar solicitação de agendamento:', error);
    return res.status(500).json({ error: 'Erro ao criar solicitação de agendamento.' });
  }
});
