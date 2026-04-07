import Database from 'better-sqlite3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

import '../loadEnv';
import { normalizeWhatsappPhone, normalizeWhatsappPhoneWithPlus } from '../utils/phone';
import { publishInboxUpdated } from '../services/inboxRealtime';

export type InboxDirection = 'incoming' | 'outgoing' | 'system';

export type InboxThread = {
  id: number;
  phone: string;
  contactName: string | null;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type InboxThreadSummary = InboxThread & {
  lastMessage: string;
};

export type InboxMessage = {
  id: number;
  threadId: number;
  direction: InboxDirection;
  content: string;
  providerMessageId: string | null;
  isRead: boolean;
  createdAt: string;
};

type AddInboxMessageInput = {
  threadId: number;
  direction: InboxDirection;
  content: string;
  providerMessageId?: string | null;
  isRead?: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../database.sqlite');

const toIsoString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
};

const parseNumeric = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value);
  return 0;
};

const mapSqliteThread = (row: Record<string, unknown>): InboxThread => ({
  id: Number(row.id),
  phone: String(row.phone || ''),
  contactName: row.contact_name ? String(row.contact_name) : null,
  unreadCount: Number(row.unread_count || 0),
  lastMessageAt: toIsoString(row.last_message_at),
  createdAt: toIsoString(row.created_at),
  updatedAt: row.updated_at ? toIsoString(row.updated_at) : toIsoString(row.created_at),
});

const mapSupabaseThread = (row: Record<string, unknown>): InboxThread => ({
  id: Number(row.id),
  phone: String(row.phone || ''),
  contactName: row.contact_name ? String(row.contact_name) : null,
  unreadCount: Number(row.unread_count || 0),
  lastMessageAt: toIsoString(row.last_message_at),
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
});

const mapSqliteMessage = (row: Record<string, unknown>): InboxMessage => ({
  id: Number(row.id),
  threadId: Number(row.thread_id),
  direction: String(row.direction || 'incoming') as InboxDirection,
  content: String(row.content || ''),
  providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
  isRead: Number(row.is_read || 0) === 1,
  createdAt: toIsoString(row.created_at),
});

const mapSupabaseMessage = (row: Record<string, unknown>): InboxMessage => ({
  id: Number(row.id),
  threadId: Number(row.thread_id),
  direction: String(row.direction || 'incoming') as InboxDirection,
  content: String(row.content || ''),
  providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
  isRead: Boolean(row.is_read),
  createdAt: toIsoString(row.created_at),
});

class InboxStore {
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

  private setupSqliteSchema(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL UNIQUE,
        contact_name TEXT,
        unread_count INTEGER NOT NULL DEFAULT 0,
        last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER NOT NULL,
        direction TEXT NOT NULL,
        content TEXT NOT NULL,
        provider_message_id TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(thread_id) REFERENCES whatsapp_threads(id) ON DELETE CASCADE
      )
    `);

    this.ensureSqliteThreadColumn('unread_count', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureSqliteThreadColumn('last_message_at', 'DATETIME');
    this.ensureSqliteThreadColumn('updated_at', 'DATETIME');

    this.ensureSqliteMessageColumn('provider_message_id', 'TEXT');
    this.ensureSqliteMessageColumn('is_read', 'INTEGER NOT NULL DEFAULT 0');

    this.sqlite.exec('UPDATE whatsapp_threads SET updated_at = created_at WHERE updated_at IS NULL');
    this.sqlite.exec('UPDATE whatsapp_threads SET last_message_at = created_at WHERE last_message_at IS NULL');

    this.sqlite.exec('CREATE INDEX IF NOT EXISTS whatsapp_threads_phone_idx ON whatsapp_threads(phone)');
    this.sqlite.exec('CREATE INDEX IF NOT EXISTS whatsapp_threads_last_message_idx ON whatsapp_threads(last_message_at DESC)');
    this.sqlite.exec('CREATE INDEX IF NOT EXISTS whatsapp_messages_thread_idx ON whatsapp_messages(thread_id, created_at DESC)');
  }

  private ensureSqliteThreadColumn(name: string, definition: string): void {
    try {
      this.sqlite.exec(`ALTER TABLE whatsapp_threads ADD COLUMN ${name} ${definition}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
        console.warn(`Erro ao adicionar coluna ${name} em whatsapp_threads:`, err);
      }
    }
  }

  private ensureSqliteMessageColumn(name: string, definition: string): void {
    try {
      this.sqlite.exec(`ALTER TABLE whatsapp_messages ADD COLUMN ${name} ${definition}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
        console.warn(`Erro ao adicionar coluna ${name} em whatsapp_messages:`, err);
      }
    }
  }

  async ensureThread(phone: string, contactName?: string | null): Promise<InboxThread> {
    const normalizedPhone = normalizeWhatsappPhone(phone);
    if (!normalizedPhone) {
      throw new Error('Telefone inválido para criar thread de inbox.');
    }

    if (this.supabaseEnabled && this.supabase) {
      const found = await this.findThreadByPhone(normalizedPhone);
      if (found) {
        if (contactName && contactName.trim() && found.contactName !== contactName.trim()) {
          const { data, error } = await this.supabase
            .from('whatsapp_threads')
            .update({ contact_name: contactName.trim(), updated_at: new Date().toISOString() })
            .eq('id', found.id)
            .select('*')
            .single();

          if (error) throw error;
          return mapSupabaseThread(data as Record<string, unknown>);
        }

        return found;
      }

      const { data, error } = await this.supabase
        .from('whatsapp_threads')
        .insert({
          phone: normalizedPhone,
          contact_name: contactName?.trim() || null,
          unread_count: 0,
          last_message_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error) throw error;
      return mapSupabaseThread(data as Record<string, unknown>);
    }

    const existing = this.sqlite
      .prepare('SELECT * FROM whatsapp_threads WHERE phone = ? LIMIT 1')
      .get(normalizedPhone) as Record<string, unknown> | undefined;

    if (existing) {
      if (contactName && contactName.trim() && String(existing.contact_name || '') !== contactName.trim()) {
        this.sqlite
          .prepare('UPDATE whatsapp_threads SET contact_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(contactName.trim(), existing.id);
      }

      const row = this.sqlite
        .prepare('SELECT * FROM whatsapp_threads WHERE id = ? LIMIT 1')
        .get(existing.id) as Record<string, unknown>;

      return mapSqliteThread(row);
    }

    const result = this.sqlite
      .prepare(
        'INSERT INTO whatsapp_threads (phone, contact_name, unread_count, last_message_at, updated_at) VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      )
      .run(normalizedPhone, contactName?.trim() || null);

    const created = this.sqlite
      .prepare('SELECT * FROM whatsapp_threads WHERE id = ? LIMIT 1')
      .get(Number(result.lastInsertRowid)) as Record<string, unknown>;

    return mapSqliteThread(created);
  }

  async findThreadById(threadId: number): Promise<InboxThread | null> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase.from('whatsapp_threads').select('*').eq('id', threadId).maybeSingle();
      if (error) throw error;
      return data ? mapSupabaseThread(data as Record<string, unknown>) : null;
    }

    const row = this.sqlite
      .prepare('SELECT * FROM whatsapp_threads WHERE id = ? LIMIT 1')
      .get(threadId) as Record<string, unknown> | undefined;

    return row ? mapSqliteThread(row) : null;
  }

  async findThreadByPhone(phone: string): Promise<InboxThread | null> {
    const normalizedPhone = normalizeWhatsappPhone(phone);
    if (!normalizedPhone) return null;

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_threads')
        .select('*')
        .eq('phone', normalizedPhone)
        .maybeSingle();
      if (error) throw error;
      return data ? mapSupabaseThread(data as Record<string, unknown>) : null;
    }

    const row = this.sqlite
      .prepare('SELECT * FROM whatsapp_threads WHERE phone = ? LIMIT 1')
      .get(normalizedPhone) as Record<string, unknown> | undefined;

    return row ? mapSqliteThread(row) : null;
  }

  async addMessage(input: AddInboxMessageInput): Promise<InboxMessage> {
    const normalizedContent = input.content.trim();
    if (!normalizedContent) {
      throw new Error('Conteúdo da mensagem não pode ser vazio.');
    }

    if (this.supabaseEnabled && this.supabase) {
      if (input.providerMessageId) {
        const { data: existingMessage } = await this.supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('thread_id', input.threadId)
          .eq('provider_message_id', input.providerMessageId)
          .maybeSingle();

        if (existingMessage) {
          return mapSupabaseMessage(existingMessage as Record<string, unknown>);
        }
      }

      const { data, error } = await this.supabase
        .from('whatsapp_messages')
        .insert({
          thread_id: input.threadId,
          direction: input.direction,
          content: normalizedContent,
          provider_message_id: input.providerMessageId ?? null,
          is_read: input.direction === 'incoming' ? Boolean(input.isRead) : true,
        })
        .select('*')
        .single();

      if (error) throw error;

      const thread = await this.findThreadById(input.threadId);
      const unreadIncrement = input.direction === 'incoming' && !Boolean(input.isRead) ? 1 : 0;
      const nextUnread = (thread?.unreadCount || 0) + unreadIncrement;

      const { error: threadUpdateError } = await this.supabase
        .from('whatsapp_threads')
        .update({
          unread_count: nextUnread,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.threadId);

      if (threadUpdateError) throw threadUpdateError;

      publishInboxUpdated('message-created', input.threadId);

      return mapSupabaseMessage(data as Record<string, unknown>);
    }

    if (input.providerMessageId) {
      const existing = this.sqlite
        .prepare('SELECT * FROM whatsapp_messages WHERE thread_id = ? AND provider_message_id = ? LIMIT 1')
        .get(input.threadId, input.providerMessageId) as Record<string, unknown> | undefined;

      if (existing) {
        return mapSqliteMessage(existing);
      }
    }

    const result = this.sqlite
      .prepare(
        'INSERT INTO whatsapp_messages (thread_id, direction, content, provider_message_id, is_read) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        input.threadId,
        input.direction,
        normalizedContent,
        input.providerMessageId ?? null,
        input.direction === 'incoming' ? (input.isRead ? 1 : 0) : 1,
      );

    const unreadIncrement = input.direction === 'incoming' && !input.isRead ? 1 : 0;
    this.sqlite
      .prepare(
        'UPDATE whatsapp_threads SET unread_count = unread_count + ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      )
      .run(unreadIncrement, input.threadId);

    const created = this.sqlite
      .prepare('SELECT * FROM whatsapp_messages WHERE id = ? LIMIT 1')
      .get(Number(result.lastInsertRowid)) as Record<string, unknown>;

    publishInboxUpdated('message-created', input.threadId);

    return mapSqliteMessage(created);
  }

  async listThreads(): Promise<InboxThreadSummary[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_threads')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      const threads = (data || []).map((item) => mapSupabaseThread(item as Record<string, unknown>));
      if (threads.length === 0) {
        return [];
      }

      const threadIds = threads.map((thread) => thread.id);
      const { data: messageRows, error: messagesError } = await this.supabase
        .from('whatsapp_messages')
        .select('thread_id,content,created_at,id')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      if (messagesError) throw messagesError;

      const lastMessageByThread = new Map<number, string>();
      for (const row of messageRows || []) {
        const typedRow = row as { thread_id?: number | string; content?: string };
        const threadId = Number(typedRow.thread_id || 0);
        if (threadId > 0 && !lastMessageByThread.has(threadId)) {
          lastMessageByThread.set(threadId, String(typedRow.content || ''));
        }
      }

      // Only return threads that have at least one message
      return threads
        .filter((thread) => lastMessageByThread.has(thread.id))
        .map((thread) => ({
          ...thread,
          lastMessage: lastMessageByThread.get(thread.id) || '',
        }));
    }

    const rows = this.sqlite
      .prepare(
        `
        SELECT
          t.*,
          (
            SELECT m.content
            FROM whatsapp_messages m
            WHERE m.thread_id = t.id
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT 1
          ) AS last_message
        FROM whatsapp_threads t
        WHERE EXISTS (
          SELECT 1 FROM whatsapp_messages m WHERE m.thread_id = t.id
        )
        ORDER BY t.last_message_at DESC, t.id DESC
      `,
      )
      .all() as Record<string, unknown>[];

    return rows.map((row) => ({
      ...mapSqliteThread(row),
      lastMessage: String(row.last_message || ''),
    }));
  }

  async listContacts(search?: string): Promise<Array<{ id: number; phone: string; name: string }>> {
    const q = (search || '').trim().toLowerCase();

    if (this.supabaseEnabled && this.supabase) {
      let query = this.supabase
        .from('whatsapp_threads')
        .select('id,phone,contact_name')
        .order('contact_name', { ascending: true });

      if (q) {
        query = query.or(`contact_name.ilike.%${q}%,phone.ilike.%${q}%`);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;

      return (data || []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        phone: String(row.phone || ''),
        name: row.contact_name ? String(row.contact_name) : String(row.phone || ''),
      }));
    }

    let rows: Record<string, unknown>[];
    if (q) {
      rows = this.sqlite
        .prepare(
          `SELECT id, phone, contact_name FROM whatsapp_threads
           WHERE LOWER(contact_name) LIKE ? OR phone LIKE ?
           ORDER BY contact_name ASC LIMIT 100`,
        )
        .all(`%${q}%`, `%${q}%`) as Record<string, unknown>[];
    } else {
      rows = this.sqlite
        .prepare('SELECT id, phone, contact_name FROM whatsapp_threads ORDER BY contact_name ASC LIMIT 100')
        .all() as Record<string, unknown>[];
    }

    return rows.map((row) => ({
      id: Number(row.id),
      phone: String(row.phone || ''),
      name: row.contact_name ? String(row.contact_name) : String(row.phone || ''),
    }));
  }

  async getLastMessageContent(threadId: number): Promise<string> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_messages')
        .select('content')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return '';
      return data ? String((data as { content?: string }).content || '') : '';
    }

    const row = this.sqlite
      .prepare('SELECT content FROM whatsapp_messages WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
      .get(threadId) as { content?: string } | undefined;

    return row ? String(row.content || '') : '';
  }

  async listMessages(threadId: number): Promise<InboxMessage[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      return (data || []).map((row) => mapSupabaseMessage(row as Record<string, unknown>));
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM whatsapp_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC')
      .all(threadId) as Record<string, unknown>[];

    return rows.map(mapSqliteMessage);
  }

  async markThreadAsRead(threadId: number): Promise<void> {
    if (this.supabaseEnabled && this.supabase) {
      const { error: messagesError } = await this.supabase
        .from('whatsapp_messages')
        .update({ is_read: true })
        .eq('thread_id', threadId)
        .eq('is_read', false);

      if (messagesError) throw messagesError;

      const { error: threadError } = await this.supabase
        .from('whatsapp_threads')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', threadId);

      if (threadError) throw threadError;

      publishInboxUpdated('thread-read', threadId);
      return;
    }

    this.sqlite.prepare('UPDATE whatsapp_messages SET is_read = 1 WHERE thread_id = ? AND is_read = 0').run(threadId);
    this.sqlite.prepare('UPDATE whatsapp_threads SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(threadId);
    publishInboxUpdated('thread-read', threadId);
  }

  async deleteThread(threadId: number): Promise<void> {
    if (this.supabaseEnabled && this.supabase) {
      // Delete messages first, then thread
      const { error: messagesError } = await this.supabase
        .from('whatsapp_messages')
        .delete()
        .eq('thread_id', threadId);

      if (messagesError) throw messagesError;

      const { error: threadError } = await this.supabase
        .from('whatsapp_threads')
        .delete()
        .eq('id', threadId);

      if (threadError) throw threadError;

      publishInboxUpdated('thread-deleted', threadId);
      return;
    }

    // SQLite: CASCADE should handle messages, but be explicit
    this.sqlite.prepare('DELETE FROM whatsapp_messages WHERE thread_id = ?').run(threadId);
    this.sqlite.prepare('DELETE FROM whatsapp_threads WHERE id = ?').run(threadId);
    publishInboxUpdated('thread-deleted', threadId);
  }

  toPublicPhone(thread: InboxThread): string {
    return normalizeWhatsappPhoneWithPlus(thread.phone);
  }
}

export const inboxStore = new InboxStore();
