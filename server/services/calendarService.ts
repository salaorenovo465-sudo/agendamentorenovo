import { google } from 'googleapis';

import '../loadEnv';
import type { BookingRecord } from '../types';
import { workbenchStore } from '../db/workbenchStore';

const DEFAULT_DURATION_MIN = 60;

const getServiceDurationMin = async (serviceName: string): Promise<number> => {
  try {
    const services = await workbenchStore.list('services');
    const match = services.find(
      (s) => String(s.name || '').trim().toLowerCase() === serviceName.trim().toLowerCase(),
    );
    if (match && typeof match.duration_min === 'number' && match.duration_min > 0) {
      return match.duration_min;
    }
  } catch (err) {
    console.warn('Falha ao buscar duração do serviço, usando padrão:', err);
  }
  return DEFAULT_DURATION_MIN;
};

const CALENDAR_TIMEZONE = process.env.CALENDAR_TIMEZONE || 'America/Sao_Paulo';
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const GOOGLE_CALENDAR_ICS_URL = process.env.GOOGLE_CALENDAR_ICS_URL;

const TZ_OFFSET_HOURS = (() => {
  const offsetStr = process.env.TZ_OFFSET_HOURS;
  const offset = offsetStr ? Number(offsetStr) : -3;
  return Number.isFinite(offset) ? offset : -3;
})();

const auth = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
    })
  : null;

const calendar = auth ? google.calendar({ version: 'v3', auth }) : null;

type IcsDateProperty = {
  value: string;
  tzid?: string;
};

export const calendarConfig = {
  calendarId: GOOGLE_CALENDAR_ID,
  timezone: CALENDAR_TIMEZONE,
  hasApiCredentials: Boolean(calendar),
  hasIcsUrl: Boolean(GOOGLE_CALENDAR_ICS_URL),
};

const unfoldIcsText = (icsText: string): string => icsText.replace(/\r?\n[ \t]/g, '');

const getIcsDateProperty = (eventBlock: string, propertyName: 'DTSTART' | 'DTEND'): IcsDateProperty | null => {
  const lines = eventBlock.split(/\r?\n/);
  const line = lines.find((currentLine) => currentLine.startsWith(`${propertyName}`));
  if (!line) {
    return null;
  }

  const separatorIndex = line.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  const descriptor = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1).trim();
  const descriptorParts = descriptor.split(';');

  let tzid: string | undefined;
  for (const descriptorPart of descriptorParts.slice(1)) {
    const [key, rawValue] = descriptorPart.split('=');
    if (key === 'TZID' && rawValue) {
      tzid = rawValue.replace(/^"|"$/g, '');
      break;
    }
  }

  return { value, tzid };
};

const parseIcsDateValue = (value: string, tzid?: string): Date | null => {
  const dateOnlyMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), -TZ_OFFSET_HOURS, 0, 0));
  }

  const utcMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z$/);
  if (utcMatch) {
    const [, year, month, day, hour, minute, second = '00'] = utcMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }

  const localMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (!localMatch) {
    return null;
  }

  const [, year, month, day, hour, minute, second = '00'] = localMatch;
  const normalizedTzid = tzid?.trim().replace(/"/g, '');
  const isKnownTimezone = !normalizedTzid || normalizedTzid.includes('America/');

  if (isKnownTimezone) {
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - TZ_OFFSET_HOURS, Number(minute), Number(second)));
  }

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
};

const toTimeSlot = (date: Date): string =>
  date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: CALENDAR_TIMEZONE,
  });

export const hasCalendarReadAccess = async (): Promise<boolean> => {
  if (!calendar) {
    return false;
  }

  try {
    await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      maxResults: 1,
      singleEvents: true,
      timeMin: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
};

const tzOffsetStr = `${TZ_OFFSET_HOURS >= 0 ? '+' : ''}${String(TZ_OFFSET_HOURS).padStart(2, '0')}:00`;
const buildDayBoundary = (date: string, isEnd: boolean): Date => {
  const time = isEnd ? '23:59:59.999' : '00:00:00';
  return new Date(`${date}T${time}${tzOffsetStr}`);
};

export const fetchBusySlotsFromIcs = async (date: string): Promise<string[]> => {
  if (!GOOGLE_CALENDAR_ICS_URL) {
    return [];
  }

  const response = await fetch(GOOGLE_CALENDAR_ICS_URL);
  if (!response.ok) {
    throw new Error(`ICS indisponível: ${response.status}`);
  }

  const rawIcs = await response.text();
  const unfoldedIcs = unfoldIcsText(rawIcs);
  const eventBlocks = unfoldedIcs.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const dayStart = buildDayBoundary(date, false);
  const dayEnd = buildDayBoundary(date, true);
  const busySlots = new Set<string>();

  for (const eventBlock of eventBlocks) {
    const startProp = getIcsDateProperty(eventBlock, 'DTSTART');
    const endProp = getIcsDateProperty(eventBlock, 'DTEND');

    if (!startProp || !endProp) {
      continue;
    }

    const eventStart = parseIcsDateValue(startProp.value, startProp.tzid);
    const eventEnd = parseIcsDateValue(endProp.value, endProp.tzid);

    if (!eventStart || !eventEnd || eventEnd <= eventStart) {
      continue;
    }

    const overlapStart = eventStart > dayStart ? eventStart : dayStart;
    const overlapEnd = eventEnd < dayEnd ? eventEnd : dayEnd;

    if (overlapStart >= overlapEnd) {
      continue;
    }

    let current = new Date(overlapStart);
    current.setSeconds(0, 0);

    while (current < overlapEnd) {
      busySlots.add(toTimeSlot(current));
      current = new Date(current.getTime() + 60000);
    }
  }

  return Array.from(busySlots).sort();
};

export const fetchBusySlotsFromCalendarApi = async (date: string): Promise<string[]> => {
  if (!calendar) {
    return [];
  }

  const timeMin = buildDayBoundary(date, false).toISOString();
  const timeMax = buildDayBoundary(date, true).toISOString();

  const response = await calendar.events.list({
    calendarId: GOOGLE_CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];
  const busySlots = new Set<string>();

  events.forEach((event) => {
    const start = event.start?.dateTime;
    const end = event.end?.dateTime;

    if (!start || !end) {
      return;
    }

    let current = new Date(start);
    const endTime = new Date(end);

    while (current < endTime) {
      busySlots.add(toTimeSlot(current));
      current = new Date(current.getTime() + 60000);
    }
  });

  return Array.from(busySlots).sort();
};

const formatEventDescription = (booking: BookingRecord): string => {
  const formattedDate = booking.date.split('-').reverse().join('/');
  const normalizedPrice = booking.servicePrice?.trim() || 'Sob consulta';

  return [
    `Nome: ${booking.name}`,
    `Serviço: ${booking.service}`,
    `Valor: ${normalizedPrice}`,
    `Data: ${formattedDate}`,
    `Horário: ${booking.time}`,
    `WhatsApp: ${booking.phone}`,
  ].join('\n');
};

export const createCalendarEventForBooking = async (booking: BookingRecord): Promise<string | null> => {
  if (!calendar) {
    return null;
  }

  const startDateTime = new Date(`${booking.date}T${booking.time}:00${tzOffsetStr}`);
  const durationMin = await getServiceDurationMin(booking.service);
  const endDateTime = new Date(startDateTime.getTime() + durationMin * 60 * 1000);

  const response = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: `💇‍♀️ Agendamento: ${booking.name}`,
      description: formatEventDescription(booking),
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: CALENDAR_TIMEZONE,
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: CALENDAR_TIMEZONE,
      },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 60 }],
      },
    },
  });

  return response.data.id || null;
};

export const updateCalendarEventForBooking = async (eventId: string, booking: BookingRecord): Promise<void> => {
  if (!calendar) {
    return;
  }

  const startDateTime = new Date(`${booking.date}T${booking.time}:00${tzOffsetStr}`);
  const durationMin = await getServiceDurationMin(booking.service);
  const endDateTime = new Date(startDateTime.getTime() + durationMin * 60 * 1000);

  await calendar.events.patch({
    calendarId: GOOGLE_CALENDAR_ID,
    eventId,
    requestBody: {
      summary: `💇‍♀️ Agendamento: ${booking.name}`,
      description: formatEventDescription(booking),
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: CALENDAR_TIMEZONE,
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: CALENDAR_TIMEZONE,
      },
    },
  });
};

export const deleteCalendarEventById = async (eventId: string): Promise<void> => {
  if (!calendar) {
    return;
  }

  await calendar.events.delete({
    calendarId: GOOGLE_CALENDAR_ID,
    eventId,
    sendUpdates: 'none',
  });
};
