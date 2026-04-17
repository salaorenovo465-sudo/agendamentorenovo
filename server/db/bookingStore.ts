import Database from 'better-sqlite3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

import '../loadEnv';
import {
  type BookingRecord,
  type BookingServiceItem,
  type BookingStatus,
  type CreateBookingInput,
  type UpdateBookingProfessionalInput,
  type UpdateBookingScheduleInput,
  type UpdateBookingStatusInput,
  type UpdateBookingWhatsappThreadInput,
} from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../database.sqlite');

const BLOCKING_STATUSES: BookingStatus[] = ['pending', 'confirmed'];

const bookingMutex = new Map<string, Promise<unknown>>();

const withBookingLock = async <T>(date: string, time: string, fn: () => Promise<T>): Promise<T> => {
  const key = `${date}:${time}`;
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

    this.sqlite.exec('UPDATE bookings SET updated_at = created_at WHERE updated_at IS NULL');
  }

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
      const { data, error } = await this.supabase.from('bookings').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
    }

    const row = this.sqlite.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapSqliteBooking(row) : null;
  }

  async listByDate(date: string): Promise<BookingRecord[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .select('*')
        .eq('date', date)
        .order('time', { ascending: true });

      if (error) throw error;
      return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM bookings WHERE date = ? ORDER BY time ASC')
      .all(date) as Record<string, unknown>[];

    return rows.map(mapSqliteBooking);
  }

  async listAll(): Promise<BookingRecord[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .select('*')
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;
      return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM bookings ORDER BY date ASC, time ASC')
      .all() as Record<string, unknown>[];

    return rows.map(mapSqliteBooking);
  }

  async listByDateRange(startDate: string, endDate: string): Promise<BookingRecord[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;
      return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM bookings WHERE date >= ? AND date <= ? ORDER BY date ASC, time ASC')
      .all(startDate, endDate) as Record<string, unknown>[];

    return rows.map(mapSqliteBooking);
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

  async hasConflict(date: string, time: string, excludeId?: number): Promise<boolean> {
    if (this.supabaseEnabled && this.supabase) {
      let query = this.supabase
        .from('bookings')
        .select('id')
        .eq('date', date)
        .eq('time', time)
        .in('status', BLOCKING_STATUSES)
        .limit(1);

      if (typeof excludeId === 'number') {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).length > 0;
    }

    const statusPlaceholders = BLOCKING_STATUSES.map(() => '?').join(',');
    if (typeof excludeId === 'number') {
      const row = this.sqlite
        .prepare(
          `SELECT id FROM bookings WHERE date = ? AND time = ? AND status IN (${statusPlaceholders}) AND id != ? LIMIT 1`,
        )
        .get(date, time, ...BLOCKING_STATUSES, excludeId) as { id: number } | undefined;
      return Boolean(row);
    }

    const row = this.sqlite
      .prepare(`SELECT id FROM bookings WHERE date = ? AND time = ? AND status IN (${statusPlaceholders}) LIMIT 1`)
      .get(date, time, ...BLOCKING_STATUSES) as { id: number } | undefined;

    return Boolean(row);
  }

  async create(input: CreateBookingInput): Promise<BookingRecord> {
    return withBookingLock(input.date, input.time, async () => {
      const conflict = await this.hasConflict(input.date, input.time);
      if (conflict) {
        throw new Error('Horario ja reservado.');
      }

      if (this.supabaseEnabled && this.supabase) {
        const normalizedServiceItems = input.serviceItems && input.serviceItems.length > 0 ? input.serviceItems : [];
        const payload = {
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

        const { data, error } = await this.supabase.from('bookings').insert(payload).select('*').single();
        if (error) throw error;
        return mapSupabaseBooking(data as Record<string, unknown>);
      }

      const stmt = this.sqlite.prepare(
        'INSERT INTO bookings (service, service_price, service_items, date, time, name, phone, professional_id, professional_name, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      );
      const result = stmt.run(
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
    const now = new Date().toISOString();
    const confirmedAt = input.status === 'confirmed' ? now : null;
    const rejectedAt = input.status === 'rejected' ? now : null;

    if (this.supabaseEnabled && this.supabase) {
      const updates = {
        status: input.status,
        rejection_reason: input.rejectionReason ?? null,
        google_event_id: input.googleEventId ?? null,
        confirmed_at: confirmedAt,
        rejected_at: rejectedAt,
        updated_at: now,
      };

      const { data, error } = await this.supabase.from('bookings').update(updates).eq('id', input.id).select('*').maybeSingle();

      if (error) throw error;
      return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
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
      const updates = {
        whatsapp_thread_id: input.whatsappThreadId,
        updated_at: now,
      };

      const { data, error } = await this.supabase.from('bookings').update(updates).eq('id', input.id).select('*').maybeSingle();
      if (error) throw error;
      return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
    }

    this.sqlite
      .prepare('UPDATE bookings SET whatsapp_thread_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(input.whatsappThreadId, input.id);

    return this.getById(input.id);
  }

  async updateProfessional(input: UpdateBookingProfessionalInput): Promise<BookingRecord | null> {
    const now = new Date().toISOString();

    if (this.supabaseEnabled && this.supabase) {
      const updates = {
        professional_id: input.professionalId,
        professional_name: input.professionalName,
        updated_at: now,
      };

      const { data, error } = await this.supabase
        .from('bookings')
        .update(updates)
        .eq('id', input.id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data ? mapSupabaseBooking(data as Record<string, unknown>) : null;
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

  async listPendingPayment(): Promise<BookingRecord[]> {
    if (this.supabaseEnabled && this.supabase) {
      // Try with payment_status filter first; fall back to confirmed-only if column doesn't exist
      try {
        const { data, error } = await this.supabase
          .from('bookings')
          .select('*')
          .eq('status', 'confirmed')
          .neq('payment_status', 'pago')
          .order('date', { ascending: false });
        if (error) throw error;
        return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
      } catch {
        const { data, error } = await this.supabase
          .from('bookings')
          .select('*')
          .eq('status', 'confirmed')
          .order('date', { ascending: false });
        if (error) throw error;
        return (data || []).map((row) => mapSupabaseBooking(row as Record<string, unknown>));
      }
    }

    const rows = this.sqlite
      .prepare("SELECT * FROM bookings WHERE status = 'confirmed' AND (payment_status IS NULL OR payment_status != 'pago') ORDER BY date DESC, time DESC")
      .all() as Record<string, unknown>[];
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

  async resetAllPaymentStatuses(): Promise<number> {
    const now = new Date().toISOString();
    const sqliteCountRow = this.sqlite.prepare('SELECT COUNT(*) as cnt FROM bookings').get() as { cnt: number } | undefined;
    const sqliteCount = sqliteCountRow?.cnt || 0;

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .update({ payment_status: 'pendente', updated_at: now })
        .gte('id', 0)
        .select('id');

      if (error) throw error;
      this.sqlite.prepare("UPDATE bookings SET payment_status = 'pendente', updated_at = ?").run(now);
      return (data || []).length;
    }

    this.sqlite.prepare("UPDATE bookings SET payment_status = 'pendente', updated_at = ?").run(now);
    return sqliteCount;
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
