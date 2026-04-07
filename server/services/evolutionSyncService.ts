import { inboxStore } from '../db/inboxStore';
import { whatsappWorkspaceStore } from '../db/whatsappWorkspaceStore';
import { workbenchStore } from '../db/workbenchStore';
import { resolveTenantBridgeConfig } from './chatwootEvolutionBridge';
import { normalizeWhatsappPhone } from '../utils/phone';
import { type GenericObject, asObject, asArray, getString } from '../utils/helpers';

type EvolutionContact = {
  phone: string;
  waJid: string | null;
  name: string;
  avatarUrl: string | null;
  evolutionContactId: string | null;
};

type EvolutionChat = {
  waJid: string | null;
  phone: string;
  evolutionChatId: string | null;
  lastMessage: string;
  pushName: string | null;
  avatarUrl: string | null;
};

export type EvolutionSyncResult = {
  ok: boolean;
  tenantSlug: string;
  contactsSynced: number;
  chatsSynced: number;
  issues: string[];
};

type EvolutionRequestResult = { ok: true; body: unknown } | { ok: false; error: string };

type EvolutionEndpointCandidate = {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
};

type EvolutionCollectionOutcome = {
  success: boolean;
  rows: GenericObject[];
  endpoint: string | null;
  errors: string[];
};

const getFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    const raw = getString(value);
    if (raw) return raw;
  }
  return '';
};

const unwrapCollection = (value: unknown): GenericObject[] => {
  const rootArray = asArray(value).map((item) => asObject(item)).filter((item): item is GenericObject => Boolean(item));
  if (rootArray.length > 0) return rootArray;

  const rootObject = asObject(value);
  if (!rootObject) return [];

  const candidates = [
    rootObject.data,
    rootObject.contacts,
    rootObject.chats,
    rootObject.result,
    rootObject.rows,
    rootObject.payload,
    rootObject.instances,
  ];

  for (const candidate of candidates) {
    const rows = asArray(candidate).map((item) => asObject(item)).filter((item): item is GenericObject => Boolean(item));
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
};

const extractMessageText = (item: GenericObject): string => {
  const message = asObject(item.message) || asObject(item.lastMessage) || asObject(item.preview);
  return getFirstString(
    item.lastMessage,
    item.last_message,
    item.preview,
    item.message,
    message?.conversation,
    asObject(message?.extendedTextMessage)?.text,
    asObject(message?.imageMessage)?.caption,
    asObject(message?.videoMessage)?.caption,
    asObject(message?.documentMessage)?.caption,
  );
};

const normalizeJidPhone = (jidOrPhone: string): { phone: string; waJid: string | null } | null => {
  const raw = jidOrPhone.trim();
  if (!raw) return null;

  if (raw.includes('@')) {
    if (raw.includes('@g.us') || raw.includes('status@broadcast')) {
      return null;
    }

    const localPart = (raw.split('@')[0] || '').split(':')[0] || '';
    const phone = normalizeWhatsappPhone(localPart);
    if (!phone) return null;
    return { phone, waJid: raw };
  }

  const phone = normalizeWhatsappPhone(raw);
  if (!phone) return null;
  return { phone, waJid: `${phone}@s.whatsapp.net` };
};

const mapContact = (row: GenericObject): EvolutionContact | null => {
  const idRaw = getString(row.id);
  const idCandidate = idRaw.includes('@') || /\d{10,}/.test(idRaw) ? idRaw : '';
  const numberCandidate = getFirstString(
    row.remoteJid,
    row.jid,
    row.wa_id,
    row.whatsapp,
    row.number,
    row.phone,
    idCandidate,
  );

  const normalized = normalizeJidPhone(numberCandidate);
  if (!normalized) return null;

  const evolutionContactId = getFirstString(row.contactId, row.contact_id, row.id) || null;
  return {
    phone: normalized.phone,
    waJid: normalized.waJid,
    name: getFirstString(row.pushName, row.name, row.notify, row.shortName, normalized.phone) || normalized.phone,
    avatarUrl: getFirstString(row.profilePicUrl, row.profilePictureUrl, row.avatarUrl) || null,
    evolutionContactId,
  };
};

const mapChat = (row: GenericObject): EvolutionChat | null => {
  const messageNode = asObject(row.lastMessage) || asObject(row.message) || asObject(row.preview);
  const messageKey = asObject(messageNode?.key);
  const jidCandidate = getFirstString(
    row.remoteJid,
    row.jid,
    messageKey?.remoteJid,
    row.phone,
    row.number,
  );

  const normalized = normalizeJidPhone(jidCandidate);
  if (!normalized) return null;

  return {
    waJid: normalized.waJid,
    phone: normalized.phone,
    evolutionChatId: getFirstString(row.chatId, row.chat_id, row.id) || null,
    lastMessage: extractMessageText(row),
    pushName: getFirstString(row.pushName, row.name) || null,
    avatarUrl: getFirstString(row.profilePicUrl, row.avatarUrl) || null,
  };
};

const evolutionRequest = async (
  baseUrl: string,
  apiKey: string,
  candidate: EvolutionEndpointCandidate,
): Promise<EvolutionRequestResult> => {
  try {
    const response = await fetch(`${baseUrl}${candidate.path}`, {
      method: candidate.method,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: candidate.method === 'POST' ? JSON.stringify(candidate.body || {}) : undefined,
    });

    const raw = await response.text();
    let body: unknown = raw;
    try {
      body = raw ? (JSON.parse(raw) as unknown) : {};
    } catch {
      body = raw;
    }

    if (!response.ok) {
      const message = typeof body === 'string' ? body : JSON.stringify(body);
      return { ok: false, error: `${candidate.method} ${candidate.path} -> ${response.status}: ${message}` };
    }

    return { ok: true, body };
  } catch (error) {
    return {
      ok: false,
      error: `${candidate.method} ${candidate.path} -> ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const resolveEvolutionCollection = async (
  baseUrl: string,
  apiKey: string,
  candidates: EvolutionEndpointCandidate[],
): Promise<EvolutionCollectionOutcome> => {
  const errors: string[] = [];

  for (const candidate of candidates) {
    const response = await evolutionRequest(baseUrl, apiKey, candidate);
    if (response.ok === false) {
      errors.push(response.error);
      continue;
    }

    const rows = unwrapCollection(response.body);
    return {
      success: true,
      rows,
      endpoint: `${candidate.method} ${candidate.path}`,
      errors,
    };
  }

  return {
    success: false,
    rows: [],
    endpoint: null,
    errors,
  };
};

const getDefaultTenant = (): string => (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();

export const syncEvolutionWorkspace = async (tenantSlug?: string): Promise<EvolutionSyncResult> => {
  const targetTenant = (tenantSlug || getDefaultTenant()).trim().toLowerCase();
  const issues: string[] = [];

  const settings = await workbenchStore.getSettings(targetTenant);
  const resolved = resolveTenantBridgeConfig(targetTenant, settings, 'evolution');
  if (resolved.ok === false) {
    return {
      ok: false,
      tenantSlug: targetTenant,
      contactsSynced: 0,
      chatsSynced: 0,
      issues: [resolved.error],
    };
  }

  const config = resolved.config;
  const instance = encodeURIComponent(config.evolutionInstance);
  const maxRowsRaw = Number(process.env.EVOLUTION_SYNC_MAX_ROWS || 400);
  const maxRows = Number.isFinite(maxRowsRaw) ? Math.max(50, Math.min(5000, Math.floor(maxRowsRaw))) : 400;

  const contactsCandidates: EvolutionEndpointCandidate[] = [
    { method: 'POST', path: `/chat/findContacts/${instance}`, body: {} },
    { method: 'POST', path: `/chat/findContacts/${instance}`, body: { where: {}, page: 1, limit: 5000 } },
    { method: 'GET', path: `/chat/findContacts/${instance}` },
    { method: 'GET', path: `/chat/contacts/${instance}` },
  ];

  const chatsCandidates: EvolutionEndpointCandidate[] = [
    { method: 'POST', path: `/chat/findChats/${instance}`, body: {} },
    { method: 'POST', path: `/chat/findChats/${instance}`, body: { where: {}, page: 1, limit: 5000 } },
    { method: 'GET', path: `/chat/findChats/${instance}` },
    { method: 'GET', path: `/chat/chats/${instance}` },
    { method: 'GET', path: `/chats/${instance}` },
  ];

  const [contactsOutcome, chatsOutcome] = await Promise.all([
    resolveEvolutionCollection(config.evolutionUrl, config.evolutionApiKey, contactsCandidates),
    resolveEvolutionCollection(config.evolutionUrl, config.evolutionApiKey, chatsCandidates),
  ]);

  if (!contactsOutcome.success) {
    issues.push(`Falha ao obter contatos da Evolution (${targetTenant}).`);
    contactsOutcome.errors.slice(0, 2).forEach((error) => issues.push(error));
  }

  if (!chatsOutcome.success) {
    issues.push(`Falha ao obter chats da Evolution (${targetTenant}).`);
    chatsOutcome.errors.slice(0, 2).forEach((error) => issues.push(error));
  }

  const contactsRows = contactsOutcome.rows.slice(0, maxRows);
  const chatsRows = chatsOutcome.rows.slice(0, maxRows);

  const fallbackContactsRows = contactsRows.length === 0 && chatsRows.length > 0
    ? chatsRows.map((row) => ({
        remoteJid: row.remoteJid,
        pushName: row.pushName,
        profilePicUrl: row.profilePicUrl,
        id: row.id,
      }))
    : [];

  let contactsSynced = 0;
  let chatsSynced = 0;

  const seenPhones = new Set<string>();

  for (const row of [...contactsRows, ...fallbackContactsRows].slice(0, maxRows)) {
    const mapped = mapContact(row);
    if (!mapped) continue;
    if (seenPhones.has(mapped.phone)) continue;
    seenPhones.add(mapped.phone);

    const thread = await inboxStore.ensureThread(mapped.phone, mapped.name);
    await whatsappWorkspaceStore.upsertContactMap({
      threadId: thread.id,
      phone: mapped.phone,
      waJid: mapped.waJid,
      evolutionContactId: mapped.evolutionContactId,
      pushName: mapped.name,
      avatarUrl: mapped.avatarUrl,
      lastSource: 'evolution',
      lastSyncedAt: new Date().toISOString(),
    });
    contactsSynced += 1;
  }

  for (const row of chatsRows) {
    const mapped = mapChat(row);
    if (!mapped) continue;

    const thread = await inboxStore.ensureThread(mapped.phone, mapped.pushName || null);
    await Promise.all([
      whatsappWorkspaceStore.upsertConversationMap({
        threadId: thread.id,
        waJid: mapped.waJid,
        evolutionChatId: mapped.evolutionChatId,
        lastSource: 'evolution',
        lastSyncedAt: new Date().toISOString(),
      }),
      whatsappWorkspaceStore.upsertContactMap({
        threadId: thread.id,
        phone: mapped.phone,
        waJid: mapped.waJid,
        evolutionContactId: null,
        pushName: mapped.pushName,
        avatarUrl: mapped.avatarUrl,
        lastSource: 'evolution-chat',
        lastSyncedAt: new Date().toISOString(),
      }),
    ]);

    chatsSynced += 1;
  }

  const hasSuccessfulEndpoint = contactsOutcome.success || chatsOutcome.success;

  return {
    ok: hasSuccessfulEndpoint,
    tenantSlug: targetTenant,
    contactsSynced,
    chatsSynced,
    issues,
  };
};
