import Database from 'better-sqlite3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

import '../loadEnv';
import { withTransientRetry } from './retryHelper';
import {
  type BookingBoardCounts,
  type BookingBoardResult,
  type BookingRecord,
  type BookingServiceItem,
  type BookingStatus,
  type CalendarBookingsQueryInput,
  type CalendarBookingsResult,
  type CalendarDayCounts,
  type CompletedBookingsPageResult,
  type CompletedBookingsQueryInput,
  type CreateBookingInput,
  type UnifiedHistoryPageResult,
  type UnifiedHistoryQueryInput,
  type UnifiedHistoryStatusCounts,
  type UpdateBookingProfessionalInput,
  type UpdateBookingScheduleInput,
  type UpdateBookingStatusInput,
  type UpdateBookingWhatsappThreadInput,
} from '../types';

const BOARD_SELECT_COLUMNS =
  'id,service,service_price,service_items,date,time,name,phone,professional_id,professional_name,status,whatsapp_thread_id,created_at,updated_at,confirmed_at';

const CALENDAR_SELECT_COLUMNS =
  'id,service,service_price,service_items,date,time,name,phone,professional_id,professional_name,status,rejection_reason,whatsapp_thread_id,created_at,updated_at,confirmed_at,rejected_at';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../database.sqlite');

const BLOCKING_STATUSES: BookingStatus[] = ['pending', 'confirmed'];

const bookingMutex = new Map<string, Promise<unknown>>();

const toMinuteSlot = (time: string): string => time.slice(0, 5);

const withBookingLock = async <T>(date: string, time: string, fn: () => Promise<T>): Promise<T> => {
  const key = `${date}:${toMinuteSlot(time)}`;
  const previous = bookingMutex.get(key);
  const lock = (previous || Promise.resolve()).then(fn, fn).finally(() => {
    if (bookingMutex.get(key) === lock) {
      bookingMutex.delete(key);
    }
  });
  bookingMutex.set(key, lock);
  return lock as Promise<T>;
};

const toIsoString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
};

const normalizeServiceItems = (value: unknown): BookingServiceItem[] => {
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

const parseServiceItems = (value: unknown): BookingServiceItem[] => {
  if (Array.isArray(value)) {
    return normalizeServiceItems(value);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizeServiceItems(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
};

const serializeServiceItems = (value: BookingServiceItem[] | undefined): string | null => {
  if (!value || value.length === 0) {
    return null;
  }

  return JSON.stringify(normalizeServiceItems(value));
};

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const mapSqliteBooking = (row: Record<string, unknown>): BookingRecord => ({
  id: Number(row.id),
  service: String(row.service ?? ''),
  servicePrice: row.service_price ? String(row.service_price) : null,
  serviceItems: parseServiceItems(row.service_items),
  date: String(row.date ?? ''),
  time: String(row.time ?? ''),
  name: String(row.name ?? ''),
  phone: String(row.phone ?? ''),
  professionalId: toOptionalNumber(row.professional_id),
  professionalName: row.professional_name ? String(row.professional_name) : null,
  status: (row.status as BookingStatus) || 'pending',
  googleEventId: row.google_event_id ? String(row.google_event_id) : null,
  whatsappThreadId: row.whatsapp_thread_id ? Number(row.whatsapp_thread_id) : null,
  rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
  paymentStatus: row.payment_status ? String(row.payment_status) : null,
  createdAt: toIsoString(row.created_at),
  updatedAt: row.updated_at ? toIsoString(row.updated_at) : toIsoString(row.created_at),
  confirmedAt: row.confirmed_at ? toIsoString(row.confirmed_at) : null,
  rejectedAt: row.rejected_at ? toIsoString(row.rejected_at) : null,
  completedAt: row.completed_at
    ? toIsoString(row.completed_at)
    : row.status === 'completed'
      ? toIsoString(row.updated_at ?? row.created_at)
      : null,
});

const mapSupabaseBooking = (row: Record<string, unknown>): BookingRecord => ({
  id: Number(row.id),
  service: String(row.service ?? ''),
  servicePrice: row.service_price ? String(row.service_price) : null,
  serviceItems: parseServiceItems(row.service_items),
  date: String(row.date ?? ''),
  time: String(row.time ?? ''),
  name: String(row.name ?? ''),
  phone: String(row.phone ?? ''),
  professionalId: toOptionalNumber(row.professional_id),
  professionalName: row.professional_name ? String(row.professional_name) : null,
  status: (row.status as BookingStatus) || 'pending',
  googleEventId: row.google_event_id ? String(row.google_event_id) : null,
  whatsappThreadId: row.whatsapp_thread_id ? Number(row.whatsapp_thread_id) : null,
  rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
  paymentStatus: row.payment_status ? String(row.payment_status) : null,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  confirmedAt: row.confirmed_at ? toIsoString(row.confirmed_at) : null,
  rejectedAt: row.rejected_at ? toIsoString(row.rejected_at) : null,
  completedAt: row.completed_at
    ? toIsoString(row.completed_at)
    : row.status === 'completed'
      ? toIsoString(row.updated_at ?? row.created_at)
      : null,
});

class BookingStore {
  private sqlite: Database.Database;

  private supabase: SupabaseClient | null;

  private supabaseEnabled: boolean;

  constructor() {
    this.sqlite = new Database(dbPath);
    this.setupSqliteSchema();

    const supabaseProjectRef = process.env.SUPABASE_PROJECT_REF;
    const supabaseUrl = process.env.SUPABASE_URL || (supabaseProjectRef ? `https://${supabaseProjectRef}.supabase.co` : undefined);
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceRoleKey) {
      this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false },
      });
      this.supabaseEnabled = true;
    } else {
      this.supabase = null;
      this.supabaseEnabled = false;
    }
  }

  isSupabaseEnabled(): boolean {
    return this.supabaseEnabled;
  }

  private setupSqliteSchema(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL,
        service_price TEXT,
        service_items TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        professional_id INTEGER,
        professional_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        google_event_id TEXT,
        whatsapp_thread_id INTEGER,
        rejection_reason TEXT,
        confirmed_at DATETIME,
        rejected_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.ensureSqliteColumn('service_price', 'TEXT');
    this.ensureSqliteColumn('service_items', 'TEXT');
    this.ensureSqliteColumn('status', "TEXT NOT NULL DEFAULT 'pending'");
    this.ensureSqliteColumn('professional_id', 'INTEGER');
    this.ensureSqliteColumn('professional_name', 'TEXT');
    this.ensureSqliteColumn('google_event_id', 'TEXT');
    this.ensureSqliteColumn('whatsapp_thread_id', 'INTEGER');
    this.ensureSqliteColumn('rejection_reason', 'TEXT');
    this.ensureSqliteColumn('confirmed_at', 'DATETIME');
    this.ensureSqliteColumn('rejected_at', 'DATETIME');
    this.ensureSqliteColumn('updated_at', 'DATETIME');
    this.ensureSqliteColumn('payment_status', "TEXT DEFAULT 'pendente'");
    this.ensureSqliteColumn('tenant_slug', "TEXT DEFAULT 'renovo'");

    this.sqlite.exec('UPDATE bookings SET updated_at = created_at WHERE updated_at IS NULL');
    this.sqlite.exec('CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings (date, time)');
  }

  private withRetry = <T>(fn: () => Promise<T>): Promise<T> => withTransientRetry(fn);

  private ensureSqliteColumn(name: string, definition: string): void {
    try {
      this.sqlite.exec(`ALTER TABLE bookings ADD COLUMN ${name} ${definition}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
        console.warn(`Erro ao adicionar coluna ${name} em bookings:`, err);
      }
    }
  }

  async getById(id: number): Promise<BookingRecord | null> {
    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        const { data, error } = await this.supabase!.from('bookings').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
      });
    }

    const row = this.sqlite.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapSqliteBooking(row) : null;
  }

  async listByDate(date: string, tenantSlug?: string | null): Promise<BookingRecord[]> {
    const normalizedTenant = tenantSlug ? tenantSlug.trim().toLowerCase() : null;
    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        let query = this.supabase!
          .from('bookings')
          .select('*')
          .eq('date', date);
        if (normalizedTenant) {
          query = query.eq('tenant_slug', normalizedTenant);
        }
        const { data, error } = await query
          .order('time', { ascending: true })
          .order('id', { ascending: true });

        if (error) throw error;
        return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
      });
    }

    const whereSql = normalizedTenant ? 'WHERE date = ? AND tenant_slug = ?' : 'WHERE date = ?';
    const params = normalizedTenant ? [date, normalizedTenant] : [date];
    const rows = this.sqlite
      .prepare(`SELECT * FROM bookings ${whereSql} ORDER BY time ASC, id ASC`)
      .all(...params) as Record<string, unknown>[];

    return rows.map(mapSqliteBooking);
  }

  async listAll(tenantSlug?: string | null): Promise<BookingRecord[]> {
    const normalizedTenant = tenantSlug ? tenantSlug.trim().toLowerCase() : null;
    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        let query = this.supabase!
          .from('bookings')
          .select('*');
        if (normalizedTenant) {
          query = query.eq('tenant_slug', normalizedTenant);
        }
        const { data, error } = await query
          .order('date', { ascending: true })
          .order('time', { ascending: true })
          .order('id', { ascending: true });

        if (error) throw error;
        return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
      });
    }

    const whereSql = normalizedTenant ? 'WHERE tenant_slug = ?' : '';
    const params = normalizedTenant ? [normalizedTenant] : [];
    const rows = this.sqlite
      .prepare(`SELECT * FROM bookings ${whereSql} ORDER BY date ASC, time ASC, id ASC`)
      .all(...params) as Record<string, unknown>[];

    return rows.map(mapSqliteBooking);
  }

  async listByDateRange(startDate: string, endDate: string, tenantSlug?: string | null): Promise<BookingRecord[]> {
    const normalizedTenant = tenantSlug ? tenantSlug.trim().toLowerCase() : null;
    if (this.supabaseEnabled && this.supabase) {
      let query = this.supabase
        .from('bookings')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);
      if (normalizedTenant) {
        query = query.eq('tenant_slug', normalizedTenant);
      }
      const { data, error } = await query
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
    }

    const whereSql = normalizedTenant
      ? 'WHERE date >= ? AND date <= ? AND tenant_slug = ?'
      : 'WHERE date >= ? AND date <= ?';
    const params = normalizedTenant ? [startDate, endDate, normalizedTenant] : [startDate, endDate];
    const rows = this.sqlite
      .prepare(`SELECT * FROM bookings ${whereSql} ORDER BY date ASC, time ASC, id ASC`)
      .all(...params) as Record<string, unknown>[];

    return rows.map(mapSqliteBooking);
  }

  async listCalendarBookings(input: CalendarBookingsQueryInput): Promise<CalendarBookingsResult> {
    const startDate = input.startDate.trim();
    const endDate = input.endDate.trim();
    const tenantSlug = input.tenantSlug ? input.tenantSlug.trim().toLowerCase() : null;

    let bookings: BookingRecord[] = [];
    if (this.supabaseEnabled && this.supabase) {
      await this.withRetry(async () => {
        const pageSize = 1000;
        let offset = 0;
        const collected: BookingRecord[] = [];
        while (true) {
          let query = this.supabase!
            .from('bookings')
            .select(CALENDAR_SELECT_COLUMNS)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true })
            .order('time', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (tenantSlug) {
            query = query.eq('tenant_slug', tenantSlug);
          }

          const { data, error } = await query;
          if (error) throw error;
          const batch = (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
          collected.push(...batch);
          if (batch.length < pageSize) {
            break;
          }
          offset += pageSize;
        }
        bookings = collected;
      });
    } else {
      const whereClauses = ['date >= ? AND date <= ?'];
      const params: unknown[] = [startDate, endDate];
      if (tenantSlug) {
        whereClauses.push('tenant_slug = ?');
        params.push(tenantSlug);
      }
      const rows = this.sqlite
        .prepare(`SELECT ${CALENDAR_SELECT_COLUMNS} FROM bookings WHERE ${whereClauses.join(' AND ')} ORDER BY date ASC, time ASC, id ASC`)
        .all(...params) as Record<string, unknown>[];
      bookings = rows.map(mapSqliteBooking);
    }

    const countsByDate: Record<string, CalendarDayCounts> = {};
    for (const booking of bookings) {
      const key = String(booking.date || '').trim().slice(0, 10);
      if (!key) continue;
      if (!countsByDate[key]) {
        countsByDate[key] = { total: 0, pending: 0, confirmed: 0, completed: 0, rejected: 0 };
      }
      countsByDate[key].total += 1;
      countsByDate[key][booking.status] += 1;
    }

    return {
      startDate,
      endDate,
      tenantSlug,
      total: bookings.length,
      countsByDate,
      bookings,
    };
  }

  async listBoardBookings(options?: {
    scope?: 'all' | 'range';
    startDate?: string | null;
    endDate?: string | null;
    tenantSlug?: string | null;
    completedLimit?: number;
  }): Promise<BookingBoardResult> {
    const scope = options?.scope === 'range' ? 'range' : 'all';
    const startDate = scope === 'range' && options?.startDate ? options.startDate.trim() : null;
    const endDate = scope === 'range' && options?.endDate ? options.endDate.trim() : startDate;
    const tenantSlug = options?.tenantSlug ? options.tenantSlug.trim().toLowerCase() : null;
    const completedLimit = Math.max(1, Math.min(50, Number(options?.completedLimit) || 20));

    if (this.supabaseEnabled && this.supabase) {
      const applyCommonFilters = <T extends { eq: Function; gte: Function; lte: Function }>(query: T): T => {
        let next = query;
        if (tenantSlug) {
          next = next.eq('tenant_slug', tenantSlug);
        }
        if (scope === 'range' && startDate) {
          next = next.gte('date', startDate);
          next = next.lte('date', endDate || startDate);
        }
        return next;
      };

      const activeQuery = applyCommonFilters(
        this.supabase
          .from('bookings')
          .select(BOARD_SELECT_COLUMNS)
          .in('status', ['pending', 'confirmed']),
      )
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .order('id', { ascending: true });

      const completedQuery = applyCommonFilters(
        this.supabase
          .from('bookings')
          .select(BOARD_SELECT_COLUMNS, { count: 'exact' })
          .eq('status', 'completed'),
      )
        .order('updated_at', { ascending: false })
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .order('id', { ascending: false })
        .limit(completedLimit);

      const rejectedCountQuery = applyCommonFilters(
        this.supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'rejected'),
      );

      const nonActiveAssignedCountQuery = applyCommonFilters(
        this.supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .in('status', ['completed', 'rejected'])
          .not('professional_id', 'is', null),
      );

      const [activeRes, completedRes, rejectedRes, nonActiveAssignedRes] = await this.withRetry(() =>
        Promise.all([
          activeQuery,
          completedQuery,
          rejectedCountQuery,
          nonActiveAssignedCountQuery,
        ]),
      );

      if (activeRes.error) throw activeRes.error;
      if (completedRes.error) throw completedRes.error;
      if (rejectedRes.error) throw rejectedRes.error;
      if (nonActiveAssignedRes.error) throw nonActiveAssignedRes.error;

      const activeBookings = (activeRes.data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
      const completedBookings = (completedRes.data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));

      const pendingCount = activeBookings.filter((b) => b.status === 'pending').length;
      const confirmedCount = activeBookings.filter((b) => b.status === 'confirmed').length;
      const completedTotal = completedRes.count ?? completedBookings.length;
      const rejectedCount = rejectedRes.count ?? 0;
      const activeAssignedCount = activeBookings.filter((b) => Boolean(b.professionalId)).length;
      const assignedTotal = activeAssignedCount + (nonActiveAssignedRes.count ?? 0);
      const total = pendingCount + confirmedCount + completedTotal + rejectedCount;

      return {
        bookings: [...activeBookings, ...completedBookings],
        counts: {
          total,
          pending: pendingCount,
          confirmed: confirmedCount,
          completed: completedTotal,
          rejected: rejectedCount,
          assigned: assignedTotal,
        },
        completedLimit,
        completedTotal,
        hasMoreCompleted: completedTotal > completedBookings.length,
      };
    }

    const whereClauses: string[] = [];
    const params: unknown[] = [];
    if (scope === 'range' && startDate) {
      whereClauses.push('date >= ? AND date <= ?');
      params.push(startDate, endDate || startDate);
    }
    const baseWhere = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const andPrefix = whereClauses.length > 0 ? `${baseWhere} AND` : 'WHERE';

    const activeRows = this.sqlite
      .prepare(`SELECT ${BOARD_SELECT_COLUMNS} FROM bookings ${andPrefix} status IN ('pending', 'confirmed') ORDER BY date ASC, time ASC, id ASC`)
      .all(...params) as Record<string, unknown>[];

    const completedRows = this.sqlite
      .prepare(`SELECT ${BOARD_SELECT_COLUMNS} FROM bookings ${andPrefix} status = 'completed' ORDER BY datetime(updated_at) DESC, date DESC, time DESC, id DESC LIMIT ?`)
      .all(...params, completedLimit) as Record<string, unknown>[];

    const statsRow = this.sqlite
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN professional_id IS NOT NULL THEN 1 ELSE 0 END) as assigned
         FROM bookings ${baseWhere}`,
      )
      .get(...params) as Record<string, number> | undefined;

    const activeBookings = activeRows.map(mapSqliteBooking);
    const completedBookings = completedRows.map(mapSqliteBooking);
    const completedTotal = Number(statsRow?.completed || 0);

    return {
      bookings: [...activeBookings, ...completedBookings],
      counts: {
        total: Number(statsRow?.total || 0),
        pending: Number(statsRow?.pending || 0),
        confirmed: Number(statsRow?.confirmed || 0),
        completed: completedTotal,
        rejected: Number(statsRow?.rejected || 0),
        assigned: Number(statsRow?.assigned || 0),
      },
      completedLimit,
      completedTotal,
      hasMoreCompleted: completedTotal > completedBookings.length,
    };
  }

  async listCompletedHistory(input: CompletedBookingsQueryInput): Promise<CompletedBookingsPageResult> {
    const tenantSlug = input.tenantSlug ? input.tenantSlug.trim().toLowerCase() : null;
    const rawSearch = (input.search || '').trim();
    const startDate = input.startDate ? input.startDate.trim() : null;
    const endDate = input.endDate ? input.endDate.trim() : null;
    const professionalId = input.professionalId ?? null;
    const limit = Math.max(1, Math.min(50, Number(input.limit) || 20));
    const page = Math.max(1, Number(input.page) || 1);
    const offset = (page - 1) * limit;
    const cursor = input.cursor ? input.cursor.trim() : null;

    let parsedCursorUpdatedAt: string | null = null;
    let parsedCursorId: number | null = null;
    if (cursor && cursor.includes('|')) {
      const [rawTs, rawId] = cursor.split('|');
      const idNum = Number(rawId);
      if (rawTs && Number.isFinite(idNum) && idNum > 0) {
        parsedCursorUpdatedAt = rawTs;
        parsedCursorId = idNum;
      }
    }

    const numericIdSearch = (() => {
      if (!rawSearch) return null;
      const cleaned = rawSearch.startsWith('#') ? rawSearch.slice(1).trim() : rawSearch;
      if (/^\d+$/.test(cleaned)) {
        const parsed = Number(cleaned);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
      }
      return null;
    })();

    if (this.supabaseEnabled && this.supabase) {
      let query = this.supabase
        .from('bookings')
        .select(BOARD_SELECT_COLUMNS, { count: 'exact' })
        .eq('status', 'completed');

      let overallQuery = this.supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');

      if (tenantSlug) {
        query = query.eq('tenant_slug', tenantSlug);
        overallQuery = overallQuery.eq('tenant_slug', tenantSlug);
      }

      if (startDate) {
        query = query.gte('date', startDate);
      }

      if (endDate) {
        query = query.lte('date', endDate);
      }

      if (professionalId === 'unassigned') {
        query = query.is('professional_id', null);
      } else if (typeof professionalId === 'number' && Number.isFinite(professionalId) && professionalId > 0) {
        query = query.eq('professional_id', professionalId);
      }

      if (rawSearch) {
        const escaped = rawSearch.replace(/[%_\\,()]/g, '').trim();
        if (numericIdSearch !== null && escaped) {
          query = query.or(`id.eq.${numericIdSearch},name.ilike.%${escaped}%,service.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
        } else if (numericIdSearch !== null) {
          query = query.eq('id', numericIdSearch);
        } else if (escaped) {
          query = query.or(`name.ilike.%${escaped}%,service.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
        }
      }

      query = query
        .order('updated_at', { ascending: false })
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .order('id', { ascending: false });

      if (parsedCursorUpdatedAt && parsedCursorId !== null) {
        query = query
          .or(`updated_at.lt.${parsedCursorUpdatedAt},and(updated_at.eq.${parsedCursorUpdatedAt},id.lt.${parsedCursorId})`)
          .limit(limit);
      } else {
        query = query.range(offset, offset + limit - 1);
      }

      const [filteredRes, overallRes] = await Promise.all([query, overallQuery]);
      if (filteredRes.error) throw filteredRes.error;
      if (overallRes.error) throw overallRes.error;

      const items = (filteredRes.data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
      const total = filteredRes.count ?? items.length;
      const overallCompletedTotal = overallRes.count ?? total;
      const lastItem = items[items.length - 1];
      const hasMore = parsedCursorUpdatedAt
        ? items.length === limit
        : offset + items.length < total;

      return {
        items,
        total,
        overallCompletedTotal,
        page,
        limit,
        hasMore,
        nextCursor: hasMore && lastItem ? `${lastItem.updatedAt}|${lastItem.id}` : null,
      };
    }

    const whereClauses: string[] = ["status = 'completed'"];
    const params: unknown[] = [];

    if (startDate) {
      whereClauses.push('date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push('date <= ?');
      params.push(endDate);
    }
    if (professionalId === 'unassigned') {
      whereClauses.push('professional_id IS NULL');
    } else if (typeof professionalId === 'number' && Number.isFinite(professionalId) && professionalId > 0) {
      whereClauses.push('professional_id = ?');
      params.push(professionalId);
    }
    if (rawSearch) {
      const likeTerm = `%${rawSearch}%`;
      if (numericIdSearch !== null) {
        whereClauses.push('(id = ? OR name LIKE ? OR service LIKE ? OR phone LIKE ?)');
        params.push(numericIdSearch, likeTerm, likeTerm, likeTerm);
      } else {
        whereClauses.push('(name LIKE ? OR service LIKE ? OR phone LIKE ?)');
        params.push(likeTerm, likeTerm, likeTerm);
      }
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const totalRow = this.sqlite
      .prepare(`SELECT COUNT(*) as cnt FROM bookings ${whereSql}`)
      .get(...params) as { cnt: number } | undefined;
    const overallRow = this.sqlite
      .prepare("SELECT COUNT(*) as cnt FROM bookings WHERE status = 'completed'")
      .get() as { cnt: number } | undefined;

    const rows = this.sqlite
      .prepare(
        `SELECT ${BOARD_SELECT_COLUMNS} FROM bookings ${whereSql} ORDER BY datetime(updated_at) DESC, date DESC, time DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];

    const items = rows.map(mapSqliteBooking);
    const total = Number(totalRow?.cnt || 0);
    const overallCompletedTotal = Number(overallRow?.cnt || 0);
    const lastItem = items[items.length - 1];
    const hasMore = offset + items.length < total;

    return {
      items,
      total,
      overallCompletedTotal,
      page,
      limit,
      hasMore,
      nextCursor: hasMore && lastItem ? `${lastItem.updatedAt}|${lastItem.id}` : null,
    };
  }

  async listUnifiedHistory(input: UnifiedHistoryQueryInput): Promise<UnifiedHistoryPageResult> {
    const tenantSlug = input.tenantSlug ? input.tenantSlug.trim().toLowerCase() : null;
    const statusFilter = input.statusFilter || 'all';
    const rawSearch = (input.search || '').trim();
    const startDate = input.startDate ? input.startDate.trim() : null;
    const endDate = input.endDate ? input.endDate.trim() : null;
    const professionalId = input.professionalId ?? null;
    const limit = Math.max(1, Math.min(50, Number(input.limit) || 20));
    const page = Math.max(1, Number(input.page) || 1);
    const offset = (page - 1) * limit;

    const now = new Date();
    const nowDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const numericIdSearch = (() => {
      if (!rawSearch) return null;
      const cleaned = rawSearch.startsWith('#') ? rawSearch.slice(1).trim() : rawSearch;
      if (/^\d+$/.test(cleaned)) {
        const parsed = Number(cleaned);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
      }
      return null;
    })();

    const isRowOverdue = (status: string, date: string, time: string): boolean => {
      if (status !== 'pending' && status !== 'confirmed') return false;
      const slotTime = (time || '').slice(0, 5);
      return date < nowDate || (date === nowDate && slotTime < nowTime);
    };

    if (this.supabaseEnabled && this.supabase) {
      const applySharedFilters = <T extends { eq: Function; gte: Function; lte: Function; is: Function; or: Function }>(q: T): T => {
        let next = q;
        if (tenantSlug) {
          next = next.eq('tenant_slug', tenantSlug);
        }
        if (startDate) {
          next = next.gte('date', startDate);
        }
        if (endDate) {
          next = next.lte('date', endDate);
        }
        if (professionalId === 'unassigned') {
          next = next.is('professional_id', null);
        } else if (typeof professionalId === 'number' && Number.isFinite(professionalId) && professionalId > 0) {
          next = next.eq('professional_id', professionalId);
        }
        if (rawSearch) {
          const escaped = rawSearch.replace(/[%_\\,()]/g, '').trim();
          if (numericIdSearch !== null && escaped) {
            next = next.or(`id.eq.${numericIdSearch},name.ilike.%${escaped}%,service.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
          } else if (numericIdSearch !== null) {
            next = next.eq('id', numericIdSearch);
          } else if (escaped) {
            next = next.or(`name.ilike.%${escaped}%,service.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
          }
        }
        return next;
      };

      let itemsQuery = applySharedFilters(
        this.supabase
          .from('bookings')
          .select(BOARD_SELECT_COLUMNS, { count: 'exact' }),
      );

      if (statusFilter === 'completed') {
        itemsQuery = itemsQuery.eq('status', 'completed');
      } else if (statusFilter === 'overdue') {
        itemsQuery = itemsQuery
          .in('status', ['pending', 'confirmed'])
          .or(`date.lt.${nowDate},and(date.eq.${nowDate},time.lt.${nowTime})`);
      } else if (statusFilter === 'pending') {
        itemsQuery = itemsQuery
          .eq('status', 'pending')
          .or(`date.gt.${nowDate},and(date.eq.${nowDate},time.gte.${nowTime})`);
      } else if (statusFilter === 'confirmed') {
        itemsQuery = itemsQuery
          .eq('status', 'confirmed')
          .or(`date.gt.${nowDate},and(date.eq.${nowDate},time.gte.${nowTime})`);
      } else {
        itemsQuery = itemsQuery.in('status', ['pending', 'confirmed', 'completed']);
      }

      itemsQuery = itemsQuery
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);

      const countsQuery = applySharedFilters(
        this.supabase
          .from('bookings')
          .select('status,date,time')
          .in('status', ['pending', 'confirmed', 'completed']),
      );

      let overallQuery = this.supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'confirmed', 'completed']);
      if (tenantSlug) {
        overallQuery = overallQuery.eq('tenant_slug', tenantSlug);
      }

      const [itemsRes, countsRes, overallRes] = await Promise.all([
        itemsQuery,
        countsQuery,
        overallQuery,
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (countsRes.error) throw countsRes.error;
      if (overallRes.error) throw overallRes.error;

      const statusCounts: UnifiedHistoryStatusCounts = {
        all: 0,
        pending: 0,
        overdue: 0,
        confirmed: 0,
        completed: 0,
      };

      for (const row of (countsRes.data || []) as { status?: string; date?: string; time?: string }[]) {
        const st = String(row.status || '');
        const dt = String(row.date || '');
        const tm = String(row.time || '');
        if (st === 'completed') {
          statusCounts.completed += 1;
          statusCounts.all += 1;
        } else if (st === 'pending' || st === 'confirmed') {
          if (isRowOverdue(st, dt, tm)) {
            statusCounts.overdue += 1;
          } else if (st === 'pending') {
            statusCounts.pending += 1;
          } else {
            statusCounts.confirmed += 1;
          }
          statusCounts.all += 1;
        }
      }

      const items = (itemsRes.data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
      const total = itemsRes.count ?? items.length;
      const overallTotal = overallRes.count ?? statusCounts.all;

      return {
        items,
        total,
        overallTotal,
        statusCounts,
        page,
        limit,
        hasMore: offset + items.length < total,
      };
    }

    const baseClauses: string[] = ["status IN ('pending', 'confirmed', 'completed')"];
    const baseParams: unknown[] = [];

    if (startDate) {
      baseClauses.push('date >= ?');
      baseParams.push(startDate);
    }
    if (endDate) {
      baseClauses.push('date <= ?');
      baseParams.push(endDate);
    }
    if (professionalId === 'unassigned') {
      baseClauses.push('professional_id IS NULL');
    } else if (typeof professionalId === 'number' && Number.isFinite(professionalId) && professionalId > 0) {
      baseClauses.push('professional_id = ?');
      baseParams.push(professionalId);
    }
    if (rawSearch) {
      const likeTerm = `%${rawSearch}%`;
      if (numericIdSearch !== null) {
        baseClauses.push('(id = ? OR name LIKE ? OR service LIKE ? OR phone LIKE ?)');
        baseParams.push(numericIdSearch, likeTerm, likeTerm, likeTerm);
      } else {
        baseClauses.push('(name LIKE ? OR service LIKE ? OR phone LIKE ?)');
        baseParams.push(likeTerm, likeTerm, likeTerm);
      }
    }

    const allFilteredRows = this.sqlite
      .prepare(`SELECT ${BOARD_SELECT_COLUMNS} FROM bookings WHERE ${baseClauses.join(' AND ')} ORDER BY date DESC, time DESC, datetime(updated_at) DESC, id DESC`)
      .all(...baseParams) as Record<string, unknown>[];

    const statusCounts: UnifiedHistoryStatusCounts = {
      all: 0,
      pending: 0,
      overdue: 0,
      confirmed: 0,
      completed: 0,
    };

    const matchingRows: Record<string, unknown>[] = [];
    for (const row of allFilteredRows) {
      const st = String(row.status || '');
      const dt = String(row.date || '');
      const tm = String(row.time || '');
      const overdueFlag = isRowOverdue(st, dt, tm);

      statusCounts.all += 1;
      if (st === 'completed') statusCounts.completed += 1;
      else if (overdueFlag) statusCounts.overdue += 1;
      else if (st === 'pending') statusCounts.pending += 1;
      else if (st === 'confirmed') statusCounts.confirmed += 1;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'completed' && st === 'completed') ||
        (statusFilter === 'overdue' && overdueFlag) ||
        (statusFilter === 'pending' && st === 'pending' && !overdueFlag) ||
        (statusFilter === 'confirmed' && st === 'confirmed' && !overdueFlag);

      if (matchesStatus) {
        matchingRows.push(row);
      }
    }

    const overallRow = this.sqlite
      .prepare("SELECT COUNT(*) as cnt FROM bookings WHERE status IN ('pending', 'confirmed', 'completed')")
      .get() as { cnt: number } | undefined;

    const pagedRows = matchingRows.slice(offset, offset + limit);
    const items = pagedRows.map(mapSqliteBooking);
    const total = matchingRows.length;

    return {
      items,
      total,
      overallTotal: Number(overallRow?.cnt || 0),
      statusCounts,
      page,
      limit,
      hasMore: offset + items.length < total,
    };
  }

  async getBookingStats(filters?: { startDate?: string | null; endDate?: string | null; tenantSlug?: string | null }): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    rejected: number;
    completed: number;
  }> {
    const startDate = filters?.startDate?.trim() || null;
    const endDate = filters?.endDate?.trim() || startDate;
    const tenantSlug = filters?.tenantSlug?.trim().toLowerCase() || null;

    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        let query = this.supabase!.from('bookings').select('status');
        if (tenantSlug) {
          query = query.eq('tenant_slug', tenantSlug);
        }
        if (startDate) {
          query = query.gte('date', startDate).lte('date', endDate || startDate);
        }
        const { data, error } = await query;
        if (error) throw error;
        const rows = (data || []) as { status?: string }[];
        return {
          total: rows.length,
          pending: rows.filter((r) => r.status === 'pending').length,
          confirmed: rows.filter((r) => r.status === 'confirmed').length,
          rejected: rows.filter((r) => r.status === 'rejected').length,
          completed: rows.filter((r) => r.status === 'completed').length,
        };
      });
    }

    const whereClauses: string[] = [];
    const params: unknown[] = [];
    if (tenantSlug) {
      whereClauses.push('tenant_slug = ?');
      params.push(tenantSlug);
    }
    if (startDate) {
      whereClauses.push('date >= ? AND date <= ?');
      params.push(startDate, endDate || startDate);
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const row = this.sqlite
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
         FROM bookings ${whereSql}`,
      )
      .get(...params) as Record<string, number> | undefined;

    return {
      total: Number(row?.total || 0),
      pending: Number(row?.pending || 0),
      confirmed: Number(row?.confirmed || 0),
      rejected: Number(row?.rejected || 0),
      completed: Number(row?.completed || 0),
    };
  }

  async listByWhatsappThread(threadId: number): Promise<BookingRecord[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .select('*')
        .eq('whatsapp_thread_id', threadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM bookings WHERE whatsapp_thread_id = ? ORDER BY created_at DESC, id DESC')
      .all(threadId) as Record<string, unknown>[];

    return rows.map(mapSqliteBooking);
  }

  async getLocalBusySlots(date: string): Promise<string[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .select('time')
        .eq('date', date)
        .in('status', BLOCKING_STATUSES);

      if (error) throw error;
      return (data || []).map((row) => String((row as { time: string }).time));
    }

    const statusPlaceholders = BLOCKING_STATUSES.map(() => '?').join(',');
    const rows = this.sqlite
      .prepare(`SELECT time FROM bookings WHERE date = ? AND status IN (${statusPlaceholders})`)
      .all(date, ...BLOCKING_STATUSES) as { time: string }[];

    return rows.map((row) => row.time);
  }

  async countByDate(date: string): Promise<number> {
    if (this.supabaseEnabled && this.supabase) {
      const { count, error } = await this.supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('date', date)
        .in('status', BLOCKING_STATUSES);

      if (error) throw error;
      return count || 0;
    }

    const statusPlaceholders = BLOCKING_STATUSES.map(() => '?').join(',');
    const row = this.sqlite
      .prepare(`SELECT COUNT(*) as cnt FROM bookings WHERE date = ? AND status IN (${statusPlaceholders})`)
      .get(date, ...BLOCKING_STATUSES) as { cnt: number };

    return row?.cnt || 0;
  }

  async hasConflict(date: string, time: string, excludeId?: number, tenantSlug?: string | null): Promise<boolean> {
    const minuteSlot = toMinuteSlot(time);
    const normalizedTenant = tenantSlug ? tenantSlug.trim().toLowerCase() : null;

    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        let query = this.supabase!
          .from('bookings')
          .select('id')
          .eq('date', date)
          .like('time', `${minuteSlot}%`)
          .in('status', BLOCKING_STATUSES)
          .limit(1);

        if (normalizedTenant) {
          query = query.eq('tenant_slug', normalizedTenant);
        }

        if (typeof excludeId === 'number') {
          query = query.neq('id', excludeId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).length > 0;
      });
    }

    const statusPlaceholders = BLOCKING_STATUSES.map(() => '?').join(',');
    const tenantClause = normalizedTenant ? ' AND tenant_slug = ?' : '';
    const extraParams: unknown[] = normalizedTenant ? [normalizedTenant] : [];
    if (typeof excludeId === 'number') {
      const row = this.sqlite
        .prepare(
          `SELECT id FROM bookings WHERE date = ? AND substr(time, 1, 5) = ? AND status IN (${statusPlaceholders})${tenantClause} AND id != ? LIMIT 1`,
        )
        .get(date, minuteSlot, ...BLOCKING_STATUSES, ...extraParams, excludeId) as { id: number } | undefined;
      return Boolean(row);
    }

    const row = this.sqlite
      .prepare(
        `SELECT id FROM bookings WHERE date = ? AND substr(time, 1, 5) = ? AND status IN (${statusPlaceholders})${tenantClause} LIMIT 1`,
      )
      .get(date, minuteSlot, ...BLOCKING_STATUSES, ...extraParams) as { id: number } | undefined;

    return Boolean(row);
  }

  async create(input: CreateBookingInput): Promise<BookingRecord> {
    const normalizedTenant = input.tenantSlug ? input.tenantSlug.trim().toLowerCase() : 'renovo';
    return withBookingLock(input.date, input.time, async () => {
      const conflict = await this.hasConflict(input.date, input.time, undefined, input.tenantSlug);
      if (conflict) {
        throw new Error('Horario ja reservado.');
      }

      if (this.supabaseEnabled && this.supabase) {
        return this.withRetry(async () => {
          const normalizedServiceItems = input.serviceItems && input.serviceItems.length > 0 ? input.serviceItems : [];
          const payload = {
            tenant_slug: normalizedTenant,
            service: input.service,
            service_price: input.servicePrice,
            service_items: normalizedServiceItems,
            date: input.date,
            time: input.time,
            name: input.name,
            phone: input.phone,
            professional_id: input.professionalId ?? null,
            professional_name: input.professionalName ?? null,
            status: 'pending' as BookingStatus,
          };

          const { data, error } = await this.supabase!.from('bookings').insert(payload).select('*').single();
          if (error) throw error;
          return mapSupabaseBooking(data as Record<string, unknown>);
        });
      }

      const stmt = this.sqlite.prepare(
        'INSERT INTO bookings (tenant_slug, service, service_price, service_items, date, time, name, phone, professional_id, professional_name, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      );
      const result = stmt.run(
        normalizedTenant,
        input.service,
        input.servicePrice,
        serializeServiceItems(input.serviceItems),
        input.date,
        input.time,
        input.name,
        input.phone,
        input.professionalId ?? null,
        input.professionalName ?? null,
        'pending',
      );
      const created = await this.getById(Number(result.lastInsertRowid));
      if (!created) throw new Error('Falha ao criar agendamento');
      return created;
    });
  }

  async updateStatus(input: UpdateBookingStatusInput): Promise<BookingRecord | null> {
    const existing = await this.getById(input.id).catch(() => null);
    const now = new Date().toISOString();
    const confirmedAt = input.status === 'confirmed' ? (existing?.confirmedAt || now) : null;
    const rejectedAt = input.status === 'rejected' ? (existing?.rejectedAt || now) : null;

    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        const updates = {
          status: input.status,
          rejection_reason: input.rejectionReason ?? null,
          google_event_id: input.googleEventId ?? null,
          confirmed_at: confirmedAt,
          rejected_at: rejectedAt,
          updated_at: now,
        };

        const { data, error } = await this.supabase!.from('bookings').update(updates).eq('id', input.id).select('*').maybeSingle();

        if (error) throw error;
        return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
      });
    }

    this.sqlite
      .prepare(
        'UPDATE bookings SET status = ?, rejection_reason = ?, google_event_id = ?, confirmed_at = ?, rejected_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      )
      .run(input.status, input.rejectionReason ?? null, input.googleEventId ?? null, confirmedAt, rejectedAt, input.id);

    return this.getById(input.id);
  }

  async updateWhatsappThread(input: UpdateBookingWhatsappThreadInput): Promise<BookingRecord | null> {
    const now = new Date().toISOString();

    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        const updates = {
          whatsapp_thread_id: input.whatsappThreadId,
          updated_at: now,
        };

        const { data, error } = await this.supabase!.from('bookings').update(updates).eq('id', input.id).select('*').maybeSingle();
        if (error) throw error;
        return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
      });
    }

    this.sqlite
      .prepare('UPDATE bookings SET whatsapp_thread_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(input.whatsappThreadId, input.id);

    return this.getById(input.id);
  }

  async updateProfessional(input: UpdateBookingProfessionalInput): Promise<BookingRecord | null> {
    const now = new Date().toISOString();

    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        const updates = {
          professional_id: input.professionalId,
          professional_name: input.professionalName,
          updated_at: now,
        };

        const { data, error } = await this.supabase!
          .from('bookings')
          .update(updates)
          .eq('id', input.id)
          .select('*')
          .maybeSingle();

        if (error) throw error;
        return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
      });
    }

    this.sqlite
      .prepare('UPDATE bookings SET professional_id = ?, professional_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(input.professionalId, input.professionalName, input.id);

    return this.getById(input.id);
  }

  async listByPhone(phone: string): Promise<BookingRecord[]> {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return [];

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .select('*')
        .like('phone', `%${digits.slice(-9)}%`)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM bookings WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, "(", ""), ")", ""), "-", ""), " ", "") LIKE ? ORDER BY date DESC, time DESC')
      .all(`%${digits.slice(-9)}%`) as Record<string, unknown>[];
    return rows.map(mapSqliteBooking);
  }

  async listPendingPayment(tenantSlug?: string | null): Promise<BookingRecord[]> {
    const normalizedTenant = tenantSlug ? tenantSlug.trim().toLowerCase() : null;
    if (this.supabaseEnabled && this.supabase) {
      // Try with payment_status filter first; fall back to confirmed-only if column doesn't exist
      try {
        return await this.withRetry(async () => {
          let query = this.supabase!
            .from('bookings')
            .select('*')
            .eq('status', 'confirmed')
            .neq('payment_status', 'pago');
          if (normalizedTenant) {
            query = query.eq('tenant_slug', normalizedTenant);
          }
          const { data, error } = await query.order('date', { ascending: false });
          if (error) throw error;
          return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
        });
      } catch {
        return this.withRetry(async () => {
          let query = this.supabase!
            .from('bookings')
            .select('*')
            .eq('status', 'confirmed');
          if (normalizedTenant) {
            query = query.eq('tenant_slug', normalizedTenant);
          }
          const { data, error } = await query.order('date', { ascending: false });
          if (error) throw error;
          return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
        });
      }
    }

    const whereClause = normalizedTenant
      ? "WHERE status = 'confirmed' AND (payment_status IS NULL OR payment_status != 'pago') AND tenant_slug = ?"
      : "WHERE status = 'confirmed' AND (payment_status IS NULL OR payment_status != 'pago')";
    const params = normalizedTenant ? [normalizedTenant] : [];
    const rows = this.sqlite
      .prepare(`SELECT * FROM bookings ${whereClause} ORDER BY date DESC, time DESC`)
      .all(...params) as Record<string, unknown>[];
    return rows.map(mapSqliteBooking);
  }

  async updatePaymentStatus(id: number, paymentStatus: string): Promise<BookingRecord | null> {
    const now = new Date().toISOString();

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .update({ payment_status: paymentStatus, updated_at: now })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
    }

    this.sqlite
      .prepare('UPDATE bookings SET payment_status = ?, updated_at = ? WHERE id = ?')
      .run(paymentStatus, now, id);

    return this.getById(id);
  }

  async deleteById(id: number): Promise<boolean> {
    if (this.supabaseEnabled && this.supabase) {
      const { error } = await this.supabase.from('bookings').delete().eq('id', id);
      if (error) throw error;
      return true;
    }

    this.sqlite.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    return true;
  }

  async resetAll(): Promise<number> {
    const sqliteCountRow = this.sqlite.prepare('SELECT COUNT(*) as cnt FROM bookings').get() as { cnt: number } | undefined;
    const sqliteCount = sqliteCountRow?.cnt || 0;

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase.from('bookings').delete().gte('id', 0).select('id');
      if (error) throw error;
      this.sqlite.prepare('DELETE FROM bookings').run();
      return (data || []).length;
    }

    this.sqlite.prepare('DELETE FROM bookings').run();
    return sqliteCount;
  }

  async resetAllPaymentStatuses(tenantSlug?: string | null): Promise<number> {
    const now = new Date().toISOString();
    const normalizedTenant = tenantSlug ? tenantSlug.trim().toLowerCase() : null;

    if (this.supabaseEnabled && this.supabase) {
      return this.withRetry(async () => {
        let query = this.supabase!
          .from('bookings')
          .update({ payment_status: 'pendente', updated_at: now })
          .gte('id', 0);

        if (normalizedTenant) {
          query = query.eq('tenant_slug', normalizedTenant);
        }

        const { data, error } = await query.select('id');
        if (error) {
          const msg = String((error as { message?: unknown }).message || '').toLowerCase();
          const code = String((error as { code?: unknown }).code || '');
          if (code === '42703' || msg.includes('payment_status') || msg.includes('does not exist')) {
            return 0;
          }
          throw error;
        }

        if (normalizedTenant) {
          this.sqlite.prepare("UPDATE bookings SET payment_status = 'pendente', updated_at = ? WHERE tenant_slug = ?").run(now, normalizedTenant);
        } else {
          this.sqlite.prepare("UPDATE bookings SET payment_status = 'pendente', updated_at = ?").run(now);
        }
        return (data || []).length;
      });
    }

    if (normalizedTenant) {
      const info = this.sqlite
        .prepare("UPDATE bookings SET payment_status = 'pendente', updated_at = ? WHERE tenant_slug = ?")
        .run(now, normalizedTenant);
      return Number(info.changes || 0);
    }

    const info = this.sqlite.prepare("UPDATE bookings SET payment_status = 'pendente', updated_at = ?").run(now);
    return Number(info.changes || 0);
  }

  async updateSchedule(input: UpdateBookingScheduleInput): Promise<BookingRecord | null> {
    const conflict = await this.hasConflict(input.date, input.time, input.id);
    if (conflict) {
      throw new Error('Horario ja reservado.');
    }

    const now = new Date().toISOString();

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .update({ date: input.date, time: input.time, updated_at: now })
        .eq('id', input.id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
    }

    this.sqlite
      .prepare('UPDATE bookings SET date = ?, time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(input.date, input.time, input.id);

    return this.getById(input.id);
  }
}

export const bookingStore = new BookingStore();
