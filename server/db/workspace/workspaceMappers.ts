import type {
  ConversationMeta,
  ConversationOperationalStatus,
  InternalNote,
  WhatsappContactMap,
  WhatsappConversationMap,
  WhatsappSyncState,
  WhatsappSyncStatus,
} from './workspaceTypes';

export const toIsoString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
};

export const normalizeStatus = (value: unknown): ConversationOperationalStatus => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'pending' || raw === 'resolved') {
    return raw;
  }
  return 'open';
};

export const normalizeLabels = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 50);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  return [];
};

export const parseLabelsJson = (value: unknown): string[] => {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    return normalizeLabels(JSON.parse(value));
  } catch {
    return [];
  }
};

export const mapSqliteMeta = (row: Record<string, unknown>): ConversationMeta => ({
  threadId: Number(row.thread_id),
  assigneeId: row.assignee_id ? String(row.assignee_id) : null,
  status: normalizeStatus(row.status),
  labels: parseLabelsJson(row.labels_json),
  updatedAt: toIsoString(row.updated_at),
});

export const mapSupabaseMeta = (row: Record<string, unknown>): ConversationMeta => ({
  threadId: Number(row.thread_id),
  assigneeId: row.assignee_id ? String(row.assignee_id) : null,
  status: normalizeStatus(row.status),
  labels: normalizeLabels(row.labels),
  updatedAt: toIsoString(row.updated_at),
});

export const mapSqliteNote = (row: Record<string, unknown>): InternalNote => ({
  id: Number(row.id),
  threadId: Number(row.thread_id),
  content: String(row.content || ''),
  author: row.author ? String(row.author) : null,
  createdAt: toIsoString(row.created_at),
});

export const mapSupabaseNote = (row: Record<string, unknown>): InternalNote => ({
  id: Number(row.id),
  threadId: Number(row.thread_id),
  content: String(row.content || ''),
  author: row.author ? String(row.author) : null,
  createdAt: toIsoString(row.created_at),
});

export const normalizeSyncStatus = (value: unknown): WhatsappSyncStatus => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'running' || raw === 'error') {
    return raw;
  }
  return 'idle';
};

export const mapSqliteSyncState = (row: Record<string, unknown>): WhatsappSyncState => ({
  id: Number(row.id),
  scope: String(row.scope || ''),
  source: String(row.source || ''),
  cursor: row.cursor ? String(row.cursor) : null,
  status: normalizeSyncStatus(row.status),
  lastSyncedAt: row.last_synced_at ? toIsoString(row.last_synced_at) : null,
  lastError: row.last_error ? String(row.last_error) : null,
  updatedAt: toIsoString(row.updated_at),
});

export const mapSupabaseSyncState = (row: Record<string, unknown>): WhatsappSyncState => ({
  id: Number(row.id),
  scope: String(row.scope || ''),
  source: String(row.source || ''),
  cursor: row.cursor ? String(row.cursor) : null,
  status: normalizeSyncStatus(row.status),
  lastSyncedAt: row.last_synced_at ? toIsoString(row.last_synced_at) : null,
  lastError: row.last_error ? String(row.last_error) : null,
  updatedAt: toIsoString(row.updated_at),
});

export const mapSqliteContactMap = (row: Record<string, unknown>): WhatsappContactMap => ({
  id: Number(row.id),
  threadId: row.thread_id ? Number(row.thread_id) : null,
  phone: String(row.phone || ''),
  waJid: row.wa_jid ? String(row.wa_jid) : null,
  evolutionContactId: row.evolution_contact_id ? String(row.evolution_contact_id) : null,
  chatwootContactId: row.chatwoot_contact_id ? Number(row.chatwoot_contact_id) : null,
  crmClientId: row.crm_client_id ? Number(row.crm_client_id) : null,
  pushName: row.push_name ? String(row.push_name) : null,
  avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  lastSource: String(row.last_source || 'unknown'),
  lastSyncedAt: toIsoString(row.last_synced_at),
  updatedAt: toIsoString(row.updated_at),
});

export const mapSupabaseContactMap = (row: Record<string, unknown>): WhatsappContactMap => ({
  id: Number(row.id),
  threadId: row.thread_id ? Number(row.thread_id) : null,
  phone: String(row.phone || ''),
  waJid: row.wa_jid ? String(row.wa_jid) : null,
  evolutionContactId: row.evolution_contact_id ? String(row.evolution_contact_id) : null,
  chatwootContactId: row.chatwoot_contact_id ? Number(row.chatwoot_contact_id) : null,
  crmClientId: row.crm_client_id ? Number(row.crm_client_id) : null,
  pushName: row.push_name ? String(row.push_name) : null,
  avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  lastSource: String(row.last_source || 'unknown'),
  lastSyncedAt: toIsoString(row.last_synced_at),
  updatedAt: toIsoString(row.updated_at),
});

export const mapSqliteConversationMap = (row: Record<string, unknown>): WhatsappConversationMap => ({
  id: Number(row.id),
  threadId: Number(row.thread_id),
  waJid: row.wa_jid ? String(row.wa_jid) : null,
  evolutionChatId: row.evolution_chat_id ? String(row.evolution_chat_id) : null,
  chatwootConversationId: row.chatwoot_conversation_id ? Number(row.chatwoot_conversation_id) : null,
  lastSource: String(row.last_source || 'unknown'),
  lastSyncedAt: toIsoString(row.last_synced_at),
  updatedAt: toIsoString(row.updated_at),
});

export const mapSupabaseConversationMap = (row: Record<string, unknown>): WhatsappConversationMap => ({
  id: Number(row.id),
  threadId: Number(row.thread_id),
  waJid: row.wa_jid ? String(row.wa_jid) : null,
  evolutionChatId: row.evolution_chat_id ? String(row.evolution_chat_id) : null,
  chatwootConversationId: row.chatwoot_conversation_id ? Number(row.chatwoot_conversation_id) : null,
  lastSource: String(row.last_source || 'unknown'),
  lastSyncedAt: toIsoString(row.last_synced_at),
  updatedAt: toIsoString(row.updated_at),
});
