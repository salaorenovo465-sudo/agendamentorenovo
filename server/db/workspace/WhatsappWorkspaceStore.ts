import Database from 'better-sqlite3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

import '../../loadEnv';

import type {
  ConversationMeta,
  InternalNote,
  WhatsappContactMap,
  WhatsappConversationMap,
  WhatsappSyncState,
} from './workspaceTypes';

import {
  normalizeStatus,
  normalizeLabels,
  normalizeSyncStatus,
  mapSqliteMeta,
  mapSupabaseMeta,
  mapSqliteNote,
  mapSupabaseNote,
  mapSqliteSyncState,
  mapSupabaseSyncState,
  mapSqliteContactMap,
  mapSupabaseContactMap,
  mapSqliteConversationMap,
  mapSupabaseConversationMap,
} from './workspaceMappers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../../database.sqlite');

class WhatsappWorkspaceStore {
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
      CREATE TABLE IF NOT EXISTS whatsapp_conversation_meta (
        thread_id INTEGER PRIMARY KEY,
        assignee_id TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        labels_json TEXT NOT NULL DEFAULT '[]',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_internal_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        author TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_sync_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        source TEXT NOT NULL,
        cursor TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        last_synced_at DATETIME,
        last_error TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scope, source)
      )
    `);

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_contact_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER,
        phone TEXT NOT NULL UNIQUE,
        wa_jid TEXT,
        evolution_contact_id TEXT,
        chatwoot_contact_id INTEGER,
        crm_client_id INTEGER,
        push_name TEXT,
        avatar_url TEXT,
        last_source TEXT NOT NULL DEFAULT 'unknown',
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversation_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER NOT NULL UNIQUE,
        wa_jid TEXT,
        evolution_chat_id TEXT,
        chatwoot_conversation_id INTEGER,
        last_source TEXT NOT NULL DEFAULT 'unknown',
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getConversationMeta(threadId: number): Promise<ConversationMeta> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_conversation_meta')
        .select('*')
        .eq('thread_id', threadId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        return mapSupabaseMeta(data as Record<string, unknown>);
      }
      return {
        threadId,
        assigneeId: null,
        status: 'open',
        labels: [],
        updatedAt: new Date().toISOString(),
      };
    }

    const row = this.sqlite
      .prepare('SELECT * FROM whatsapp_conversation_meta WHERE thread_id = ? LIMIT 1')
      .get(threadId) as Record<string, unknown> | undefined;

    if (!row) {
      return {
        threadId,
        assigneeId: null,
        status: 'open',
        labels: [],
        updatedAt: new Date().toISOString(),
      };
    }

    return mapSqliteMeta(row);
  }

  async listConversationMetaByThreadIds(threadIds: number[]): Promise<Map<number, ConversationMeta>> {
    const uniqueIds = Array.from(new Set(threadIds.filter((id) => Number.isInteger(id) && id > 0)));
    if (uniqueIds.length === 0) {
      return new Map<number, ConversationMeta>();
    }

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_conversation_meta')
        .select('*')
        .in('thread_id', uniqueIds);

      if (error) throw error;

      const mapped = new Map<number, ConversationMeta>();
      for (const row of data || []) {
        const meta = mapSupabaseMeta(row as Record<string, unknown>);
        mapped.set(meta.threadId, meta);
      }

      return mapped;
    }

    const placeholders = uniqueIds.map(() => '?').join(',');
    const rows = this.sqlite
      .prepare(`SELECT * FROM whatsapp_conversation_meta WHERE thread_id IN (${placeholders})`)
      .all(...uniqueIds) as Record<string, unknown>[];

    const mapped = new Map<number, ConversationMeta>();
    for (const row of rows) {
      const meta = mapSqliteMeta(row);
      mapped.set(meta.threadId, meta);
    }

    return mapped;
  }

  async upsertConversationMeta(threadId: number, patch: Partial<Omit<ConversationMeta, 'threadId'>>): Promise<ConversationMeta> {
    const current = await this.getConversationMeta(threadId);
    const next: ConversationMeta = {
      threadId,
      assigneeId: patch.assigneeId === undefined ? current.assigneeId : patch.assigneeId,
      status: patch.status === undefined ? current.status : normalizeStatus(patch.status),
      labels: patch.labels === undefined ? current.labels : normalizeLabels(patch.labels),
      updatedAt: new Date().toISOString(),
    };

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_conversation_meta')
        .upsert(
          {
            thread_id: threadId,
            assignee_id: next.assigneeId,
            status: next.status,
            labels: next.labels,
            updated_at: next.updatedAt,
          },
          { onConflict: 'thread_id' },
        )
        .select('*')
        .single();

      if (error) throw error;
      return mapSupabaseMeta(data as Record<string, unknown>);
    }

    this.sqlite
      .prepare(
        `
        INSERT INTO whatsapp_conversation_meta (thread_id, assignee_id, status, labels_json, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(thread_id) DO UPDATE SET
          assignee_id = excluded.assignee_id,
          status = excluded.status,
          labels_json = excluded.labels_json,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run(threadId, next.assigneeId, next.status, JSON.stringify(next.labels));

    return this.getConversationMeta(threadId);
  }

  async listInternalNotes(threadId: number): Promise<InternalNote[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_internal_notes')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((row) => mapSupabaseNote(row as Record<string, unknown>));
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM whatsapp_internal_notes WHERE thread_id = ? ORDER BY created_at DESC, id DESC')
      .all(threadId) as Record<string, unknown>[];
    return rows.map(mapSqliteNote);
  }

  async addInternalNote(threadId: number, content: string, author: string | null): Promise<InternalNote> {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      throw new Error('Conteudo da nota interna nao pode ser vazio.');
    }

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_internal_notes')
        .insert({
          thread_id: threadId,
          content: normalizedContent,
          author,
        })
        .select('*')
        .single();

      if (error) throw error;
      return mapSupabaseNote(data as Record<string, unknown>);
    }

    const result = this.sqlite
      .prepare('INSERT INTO whatsapp_internal_notes (thread_id, content, author) VALUES (?, ?, ?)')
      .run(threadId, normalizedContent, author);

    const created = this.sqlite
      .prepare('SELECT * FROM whatsapp_internal_notes WHERE id = ? LIMIT 1')
      .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
    return mapSqliteNote(created);
  }

  async upsertSyncState(
    scope: string,
    source: string,
    patch: Partial<Omit<WhatsappSyncState, 'id' | 'scope' | 'source' | 'updatedAt'>>,
  ): Promise<WhatsappSyncState> {
    const normalizedScope = scope.trim().toLowerCase() || 'global';
    const normalizedSource = source.trim().toLowerCase() || 'manual';
    const nextStatus = normalizeSyncStatus(patch.status);
    const lastSyncedAt = patch.lastSyncedAt || null;
    const cursor = patch.cursor || null;
    const lastError = patch.lastError || null;

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_sync_state')
        .upsert(
          {
            scope: normalizedScope,
            source: normalizedSource,
            cursor,
            status: nextStatus,
            last_synced_at: lastSyncedAt,
            last_error: lastError,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'scope,source' },
        )
        .select('*')
        .single();

      if (error) throw error;
      return mapSupabaseSyncState(data as Record<string, unknown>);
    }

    this.sqlite
      .prepare(
        `
        INSERT INTO whatsapp_sync_state (scope, source, cursor, status, last_synced_at, last_error, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(scope, source) DO UPDATE SET
          cursor = excluded.cursor,
          status = excluded.status,
          last_synced_at = excluded.last_synced_at,
          last_error = excluded.last_error,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run(normalizedScope, normalizedSource, cursor, nextStatus, lastSyncedAt, lastError);

    const row = this.sqlite
      .prepare('SELECT * FROM whatsapp_sync_state WHERE scope = ? AND source = ? LIMIT 1')
      .get(normalizedScope, normalizedSource) as Record<string, unknown>;

    return mapSqliteSyncState(row);
  }

  async listSyncStates(): Promise<WhatsappSyncState[]> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase.from('whatsapp_sync_state').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => mapSupabaseSyncState(row as Record<string, unknown>));
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM whatsapp_sync_state ORDER BY updated_at DESC, id DESC')
      .all() as Record<string, unknown>[];
    return rows.map(mapSqliteSyncState);
  }

  async upsertContactMap(input: {
    threadId: number | null;
    phone: string;
    waJid?: string | null;
    evolutionContactId?: string | null;
    chatwootContactId?: number | null;
    crmClientId?: number | null;
    pushName?: string | null;
    avatarUrl?: string | null;
    lastSource: string;
    lastSyncedAt?: string;
  }): Promise<WhatsappContactMap> {
    const phone = input.phone.trim();
    if (!phone) {
      throw new Error('Phone obrigatorio para contato.');
    }

    const payload = {
      thread_id: input.threadId,
      phone,
      wa_jid: input.waJid || null,
      evolution_contact_id: input.evolutionContactId || null,
      chatwoot_contact_id: input.chatwootContactId || null,
      crm_client_id: input.crmClientId || null,
      push_name: input.pushName || null,
      avatar_url: input.avatarUrl || null,
      last_source: input.lastSource || 'unknown',
      last_synced_at: input.lastSyncedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_contact_map')
        .upsert(payload, { onConflict: 'phone' })
        .select('*')
        .single();

      if (error) throw error;
      return mapSupabaseContactMap(data as Record<string, unknown>);
    }

    this.sqlite
      .prepare(
        `
        INSERT INTO whatsapp_contact_map (
          thread_id, phone, wa_jid, evolution_contact_id, chatwoot_contact_id, crm_client_id,
          push_name, avatar_url, last_source, last_synced_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(phone) DO UPDATE SET
          thread_id = excluded.thread_id,
          wa_jid = excluded.wa_jid,
          evolution_contact_id = excluded.evolution_contact_id,
          chatwoot_contact_id = excluded.chatwoot_contact_id,
          crm_client_id = excluded.crm_client_id,
          push_name = excluded.push_name,
          avatar_url = excluded.avatar_url,
          last_source = excluded.last_source,
          last_synced_at = excluded.last_synced_at,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run(
        payload.thread_id,
        payload.phone,
        payload.wa_jid,
        payload.evolution_contact_id,
        payload.chatwoot_contact_id,
        payload.crm_client_id,
        payload.push_name,
        payload.avatar_url,
        payload.last_source,
        payload.last_synced_at,
      );

    const row = this.sqlite
      .prepare('SELECT * FROM whatsapp_contact_map WHERE phone = ? LIMIT 1')
      .get(phone) as Record<string, unknown>;
    return mapSqliteContactMap(row);
  }

  async upsertConversationMap(input: {
    threadId: number;
    waJid?: string | null;
    evolutionChatId?: string | null;
    chatwootConversationId?: number | null;
    lastSource: string;
    lastSyncedAt?: string;
  }): Promise<WhatsappConversationMap> {
    const payload = {
      thread_id: input.threadId,
      wa_jid: input.waJid || null,
      evolution_chat_id: input.evolutionChatId || null,
      chatwoot_conversation_id: input.chatwootConversationId || null,
      last_source: input.lastSource || 'unknown',
      last_synced_at: input.lastSyncedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_conversation_map')
        .upsert(payload, { onConflict: 'thread_id' })
        .select('*')
        .single();

      if (error) throw error;
      return mapSupabaseConversationMap(data as Record<string, unknown>);
    }

    this.sqlite
      .prepare(
        `
        INSERT INTO whatsapp_conversation_map (
          thread_id, wa_jid, evolution_chat_id, chatwoot_conversation_id, last_source, last_synced_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(thread_id) DO UPDATE SET
          wa_jid = excluded.wa_jid,
          evolution_chat_id = excluded.evolution_chat_id,
          chatwoot_conversation_id = excluded.chatwoot_conversation_id,
          last_source = excluded.last_source,
          last_synced_at = excluded.last_synced_at,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run(
        payload.thread_id,
        payload.wa_jid,
        payload.evolution_chat_id,
        payload.chatwoot_conversation_id,
        payload.last_source,
        payload.last_synced_at,
      );

    const row = this.sqlite
      .prepare('SELECT * FROM whatsapp_conversation_map WHERE thread_id = ? LIMIT 1')
      .get(input.threadId) as Record<string, unknown>;
    return mapSqliteConversationMap(row);
  }

  async getConversationMapByThreadId(threadId: number): Promise<WhatsappConversationMap | null> {
    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_conversation_map')
        .select('*')
        .eq('thread_id', threadId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapSupabaseConversationMap(data as Record<string, unknown>) : null;
    }

    const row = this.sqlite
      .prepare('SELECT * FROM whatsapp_conversation_map WHERE thread_id = ? LIMIT 1')
      .get(threadId) as Record<string, unknown> | undefined;

    return row ? mapSqliteConversationMap(row) : null;
  }

  async listConversationMapByThreadIds(threadIds: number[]): Promise<Map<number, WhatsappConversationMap>> {
    const uniqueIds = Array.from(new Set(threadIds.filter((id) => Number.isInteger(id) && id > 0)));
    if (uniqueIds.length === 0) {
      return new Map<number, WhatsappConversationMap>();
    }

    if (this.supabaseEnabled && this.supabase) {
      const { data, error } = await this.supabase
        .from('whatsapp_conversation_map')
        .select('*')
        .in('thread_id', uniqueIds);

      if (error) throw error;

      const mapped = new Map<number, WhatsappConversationMap>();
      for (const row of data || []) {
        const item = mapSupabaseConversationMap(row as Record<string, unknown>);
        mapped.set(item.threadId, item);
      }

      return mapped;
    }

    const placeholders = uniqueIds.map(() => '?').join(',');
    const rows = this.sqlite
      .prepare(`SELECT * FROM whatsapp_conversation_map WHERE thread_id IN (${placeholders})`)
      .all(...uniqueIds) as Record<string, unknown>[];

    const mapped = new Map<number, WhatsappConversationMap>();
    for (const row of rows) {
      const item = mapSqliteConversationMap(row);
      mapped.set(item.threadId, item);
    }

    return mapped;
  }
}

export const whatsappWorkspaceStore = new WhatsappWorkspaceStore();
