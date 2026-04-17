import { Router } from 'express';

import { bookingStore } from '../db/bookingStore';
import { inboxStore } from '../db/inboxStore';
import { workbenchStore } from '../db/workbenchStore';
import type { BookingServiceItem } from '../types';
import {
  calendarConfig,
  fetchBusySlotsFromCalendarApi,
  fetchBusySlotsFromIcs,
  hasCalendarReadAccess,
} from '../services/calendarService';
import { getWhatsappStatus, whatsappConfig } from '../services/whatsappService';
import {
  notifyCustomerPendingBooking,
  notifySalonNewBooking,
} from '../services/notificationService';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

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
  allowedSlots: Set<string> | null;
  limitPerDay: number | null;
}> => {
  const dateObj = new Date(date + 'T12:00:00');
  const weekday = dateObj.getDay(); // 0=Sunday, 6=Saturday

  const rules = await workbenchStore.getActiveAvailabilityRules(weekday);
  if (rules.length === 0) {
    return { allowedSlots: null, limitPerDay: null };
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
      // Generate hourly slots between start_time and end_time
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      const startMinutes = startH * 60 + (startM || 0);
      const endMinutes = endH * 60 + (endM || 0);

      for (let m = startMinutes; m < endMinutes; m += 60) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        allowedSlots.add(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
      }
    }
  }

  return {
    allowedSlots: allowedSlots.size > 0 ? allowedSlots : null,
    limitPerDay,
  };
};

export const publicRoutes = Router();

publicRoutes.get('/integration-status', async (_req, res) => {
  const calendarReadAccess = await hasCalendarReadAccess();
  const whatsappStatus = getWhatsappStatus();

  res.json({
    calendarId: calendarConfig.calendarId,
    calendarApiConfigured: calendarConfig.hasApiCredentials,
    calendarIcsConfigured: calendarConfig.hasIcsUrl,
    whatsappConfigured: whatsappConfig.isConfigured,
    whatsappProvider: whatsappConfig.isConfigured ? whatsappStatus.provider : null,
    whatsappConnectionState: whatsappConfig.isConfigured ? whatsappStatus.connectionState : 'disabled',
    whatsappConnected: whatsappConfig.isConfigured ? whatsappStatus.connected : false,
    calendarReadAccess,
    calendarWriteAccess: 'on-confirm',
    storage: bookingStore.isSupabaseEnabled() ? 'supabase' : 'sqlite-fallback',
  });
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

    // If limit_per_day is set and we've reached it, mark all slots as busy
    if (constraints.limitPerDay) {
      const bookingsOnDate = await bookingStore.countByDate(date);
      if (bookingsOnDate >= constraints.limitPerDay) {
        return res.json({ busySlots: ['all'], limitReached: true });
      }
    }

    // If availability rules define allowed slots, add non-allowed slots to busy
    const disallowedSlots: string[] = [];
    if (constraints.allowedSlots) {
      // Common salon time slots
      const allPossibleSlots = [
        '08:00', '09:00', '10:00', '11:00', '12:00',
        '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
      ];
      for (const slot of allPossibleSlots) {
        if (!constraints.allowedSlots.has(slot)) {
          disallowedSlots.push(slot);
        }
      }
    }

    const allBusySlots = Array.from(new Set([...busySlots, ...disallowedSlots])).sort();
    return res.json({ busySlots: allBusySlots });
  } catch (error) {
    console.error('Erro ao consultar disponibilidade:', error);
    return res.status(500).json({ error: 'Erro ao consultar disponibilidade.' });
  }
});

publicRoutes.post('/bookings', async (req, res) => {
  const { service, servicePrice, date, time, name, phone } = req.body;
  const serviceValue = typeof service === 'string' ? service.trim() : '';
  const servicePriceValue = typeof servicePrice === 'string' && servicePrice.trim() ? servicePrice.trim() : null;
  const customerName = typeof name === 'string' ? name.trim() : '';
  const customerPhone = typeof phone === 'string' ? phone.trim() : '';
  const normalizedTime = typeof time === 'string' ? time.slice(0, 5) : '';
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

  if (typeof time !== 'string' || !TIME_REGEX.test(normalizedTime)) {
    return res.status(400).json({ error: 'Horário inválido. Use HH:mm.' });
  }

  try {
    const constraints = await getAvailabilityConstraints(date);
    if (constraints.allowedSlots && !constraints.allowedSlots.has(normalizedTime)) {
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

    if (remoteBusySlots.has(normalizedTime)) {
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
      notifySalonNewBooking(normalizedBooking),
      notifyCustomerPendingBooking(normalizedBooking),
    ]);

    return res.status(201).json({
      message: 'Solicitação enviada com sucesso. Aguardando confirmação do salão.',
      booking: normalizedBooking,
    });
  } catch (error) {
    console.error('Erro ao criar solicitação de agendamento:', error);
    return res.status(500).json({ error: 'Erro ao criar solicitação de agendamento.' });
  }
});
