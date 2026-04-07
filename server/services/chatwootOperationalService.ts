import { workbenchStore } from '../db/workbenchStore';
import { type ConversationOperationalStatus } from '../db/whatsappWorkspaceStore';
import { resolveTenantBridgeConfig } from './chatwootEvolutionBridge';
import { normalizeWhatsappPhone } from '../utils/phone';
import { type GenericObject, asObject, asArray, getString, getPositiveInt } from '../utils/helpers';

type TenantChatwootConfig = {
  tenantSlug: string;
  chatwootUrl: string;
  chatwootAccountId: number;
  chatwootInboxId: number;
  chatwootApiToken: string;
};

export type ChatwootOperationalSnapshot = {
  phone: string;
  conversationId: number;
  assigneeId: string | null;
  status: ConversationOperationalStatus;
  labels: string[];
};

export type ChatwootPrivateNote = {
  id: number;
  content: string;
  author: string | null;
  createdAt: string;
};

type SnapshotCacheEntry = {
  expiresAt: number;
  rows: Map<string, ChatwootOperationalSnapshot>;
};

const SNAPSHOT_TTL_MS = 1000 * 20;
const snapshotCache = new Map<string, SnapshotCacheEntry>();


const normalizeStatus = (value: unknown): ConversationOperationalStatus => {
  const normalized = getString(value).toLowerCase();
  if (normalized === 'resolved') return 'resolved';
  if (normalized === 'pending' || normalized === 'snoozed') return 'pending';
  return 'open';
};

const extractLabels = (conversation: GenericObject): string[] => {
  const rawLabels = asArray(conversation.labels);
  if (rawLabels.length === 0) return [];

  return rawLabels
    .map((label) => {
      if (typeof label === 'string') return label.trim();
      const labelObject = asObject(label);
      return getString(labelObject?.title || labelObject?.name || labelObject?.label);
    })
    .filter(Boolean)
    .slice(0, 50);
};

const extractConversationRows = (payload: unknown): GenericObject[] => {
  const rawArray = asArray(payload).map((row) => asObject(row)).filter((row): row is GenericObject => Boolean(row));
  if (rawArray.length > 0) {
    return rawArray;
  }

  const root = asObject(payload);
  if (!root) {
    return [];
  }

  const candidates = [root.payload, root.data, root.conversations, root.rows, root.result];
  for (const candidate of candidates) {
    const rows = asArray(candidate).map((row) => asObject(row)).filter((row): row is GenericObject => Boolean(row));
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
};

const getConversationPhone = (conversation: GenericObject): string => {
  const meta = asObject(conversation.meta);
  const sender = asObject(meta?.sender);
  const contact = asObject(conversation.contact);
  const contactInbox = asObject(conversation.contact_inbox);

  const candidate =
    getString(contactInbox?.source_id) ||
    getString(contact?.phone_number) ||
    getString(sender?.phone_number) ||
    getString(conversation.phone_number);

  return normalizeWhatsappPhone(candidate);
};

const mapConversationSnapshot = (conversation: GenericObject): ChatwootOperationalSnapshot | null => {
  const conversationId = getPositiveInt(conversation.id);
  if (!conversationId) {
    return null;
  }

  const phone = getConversationPhone(conversation);
  if (!phone) {
    return null;
  }

  const assignee = asObject(conversation.assignee);

  return {
    phone,
    conversationId,
    assigneeId: String(assignee?.id || conversation.assignee_id || '').trim() || null,
    status: normalizeStatus(conversation.status),
    labels: extractLabels(conversation),
  };
};

const getDefaultTenant = (): string => (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();

const resolveConfig = async (tenantSlug?: string): Promise<TenantChatwootConfig | null> => {
  const targetTenant = (tenantSlug || getDefaultTenant()).trim().toLowerCase();
  const settings = await workbenchStore.getSettings(targetTenant);
  const resolved = resolveTenantBridgeConfig(targetTenant, settings, 'chatwoot');
  if (resolved.ok === false) {
    return null;
  }

  return {
    tenantSlug: targetTenant,
    chatwootUrl: resolved.config.chatwootUrl,
    chatwootAccountId: resolved.config.chatwootAccountId,
    chatwootInboxId: resolved.config.chatwootInboxId,
    chatwootApiToken: resolved.config.chatwootApiToken,
  };
};

const chatwootRequest = async (
  config: TenantChatwootConfig,
  path: string,
  options: RequestInit = {},
): Promise<GenericObject> => {
  const response = await fetch(`${config.chatwootUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      api_access_token: config.chatwootApiToken,
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  let body: GenericObject = {};
  if (raw) {
    try {
      body = JSON.parse(raw) as GenericObject;
    } catch {
      body = {};
    }
  }

  if (!response.ok) {
    const message = getString(body.message || body.error) || raw || `Erro Chatwoot ${response.status}`;
    throw new Error(message);
  }

  return body;
};

const loadSnapshotFromChatwoot = async (config: TenantChatwootConfig): Promise<Map<string, ChatwootOperationalSnapshot>> => {
  const mapped = new Map<string, ChatwootOperationalSnapshot>();
  const maxPagesRaw = Number(process.env.CHATWOOT_OPERATIONAL_MAX_PAGES || 20);
  const maxPages = Number.isFinite(maxPagesRaw) ? Math.max(1, Math.min(40, Math.floor(maxPagesRaw))) : 20;

  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await chatwootRequest(
      config,
      `/api/v1/accounts/${config.chatwootAccountId}/conversations?inbox_id=${config.chatwootInboxId}&page=${page}`,
      { method: 'GET' },
    );

    const rows = extractConversationRows(payload);
    if (rows.length === 0) {
      break;
    }

    rows.forEach((conversation) => {
      const normalized = mapConversationSnapshot(conversation);
      if (normalized) {
        mapped.set(normalized.phone, normalized);
      }
    });

    if (rows.length < 20) {
      break;
    }
  }

  return mapped;
};

const getSnapshot = async (tenantSlug?: string, forceRefresh = false): Promise<Map<string, ChatwootOperationalSnapshot>> => {
  const config = await resolveConfig(tenantSlug);
  if (!config) {
    return new Map<string, ChatwootOperationalSnapshot>();
  }

  const cacheKey = config.tenantSlug;
  const cached = snapshotCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }

  try {
    const rows = await loadSnapshotFromChatwoot(config);
    snapshotCache.set(cacheKey, {
      rows,
      expiresAt: Date.now() + SNAPSHOT_TTL_MS,
    });
    return rows;
  } catch (error) {
    console.warn(`[Chatwoot Bridge] Falha ao carregar snapshot operacional para tenant ${config.tenantSlug}. Chatwoot pode estar offline:`, error instanceof Error ? error.message : String(error));
    if (cached) {
      return cached.rows;
    }
    return new Map<string, ChatwootOperationalSnapshot>();
  }
};

export const getChatwootOperationalByPhones = async (
  tenantSlug: string | undefined,
  phones: string[],
  options: { forceRefresh?: boolean } = {},
): Promise<Map<string, ChatwootOperationalSnapshot>> => {
  const snapshot = await getSnapshot(tenantSlug, options.forceRefresh === true);
  if (phones.length === 0) {
    return snapshot;
  }

  const filterSet = new Set(phones.map((phone) => normalizeWhatsappPhone(phone)).filter(Boolean));
  const filtered = new Map<string, ChatwootOperationalSnapshot>();
  snapshot.forEach((value, key) => {
    if (filterSet.has(key)) {
      filtered.set(key, value);
    }
  });

  return filtered;
};

export const getChatwootOperationalForPhone = async (
  tenantSlug: string | undefined,
  phone: string,
  options: { forceRefresh?: boolean } = {},
): Promise<ChatwootOperationalSnapshot | null> => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    return null;
  }

  const snapshot = await getSnapshot(tenantSlug, options.forceRefresh === true);
  return snapshot.get(normalizedPhone) || null;
};

const getConversationConfig = async (tenantSlug?: string): Promise<TenantChatwootConfig> => {
  const config = await resolveConfig(tenantSlug);
  if (!config) {
    throw new Error('Chatwoot nao configurado para este tenant.');
  }

  return config;
};

export const assignChatwootConversation = async (
  tenantSlug: string | undefined,
  conversationId: number,
  assigneeId: string | null,
): Promise<void> => {
  const config = await getConversationConfig(tenantSlug);
  const parsedAssignee = assigneeId && /^\d+$/.test(assigneeId) ? Number(assigneeId) : null;

  await chatwootRequest(config, `/api/v1/accounts/${config.chatwootAccountId}/conversations/${conversationId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ assignee_id: parsedAssignee }),
  });

  snapshotCache.delete(config.tenantSlug);
};

export const updateChatwootConversationStatus = async (
  tenantSlug: string | undefined,
  conversationId: number,
  status: ConversationOperationalStatus,
): Promise<void> => {
  const config = await getConversationConfig(tenantSlug);

  await chatwootRequest(config, `/api/v1/accounts/${config.chatwootAccountId}/conversations/${conversationId}/toggle_status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });

  snapshotCache.delete(config.tenantSlug);
};

export const updateChatwootConversationLabels = async (
  tenantSlug: string | undefined,
  conversationId: number,
  labels: string[],
): Promise<void> => {
  const config = await getConversationConfig(tenantSlug);
  await chatwootRequest(config, `/api/v1/accounts/${config.chatwootAccountId}/conversations/${conversationId}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels }),
  });

  snapshotCache.delete(config.tenantSlug);
};

export const addChatwootPrivateNote = async (
  tenantSlug: string | undefined,
  conversationId: number,
  content: string,
): Promise<void> => {
  const config = await getConversationConfig(tenantSlug);
  await chatwootRequest(config, `/api/v1/accounts/${config.chatwootAccountId}/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      private: true,
      message_type: 'outgoing',
    }),
  });
};

export const listChatwootPrivateNotes = async (
  tenantSlug: string | undefined,
  conversationId: number,
): Promise<ChatwootPrivateNote[]> => {
  const config = await getConversationConfig(tenantSlug);
  const payload = await chatwootRequest(config, `/api/v1/accounts/${config.chatwootAccountId}/conversations/${conversationId}/messages`, {
    method: 'GET',
  });

  const rows = extractConversationRows(payload);
  return rows
    .filter((row) => row.private === true)
    .map((row) => ({
      id: getPositiveInt(row.id) || Date.now(),
      content: getString(row.content),
      author: getString(asObject(row.sender)?.name || asObject(row.sender)?.available_name || row.sender_id) || 'chatwoot',
      createdAt: getString(row.created_at || row.createdAt) || new Date().toISOString(),
    }))
    .filter((row) => row.content.length > 0);
};
