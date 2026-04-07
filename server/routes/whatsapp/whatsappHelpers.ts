import { bookingStore } from '../../db/bookingStore';
import { inboxStore } from '../../db/inboxStore';
import { type ConversationMeta, type ConversationOperationalStatus, whatsappWorkspaceStore } from '../../db/whatsappWorkspaceStore';
import { getChatwootOperationalForPhone } from '../../services/chatwootOperationalService';
import {
  getWhatsappContactAvatarUrl,
  getWhatsappStatus,
  sendWhatsappMessageToCustomer,
  whatsappConfig,
} from '../../services/whatsappService';

/* ------------------------------------------------------------------ */
/*  Simple helpers                                                     */
/* ------------------------------------------------------------------ */

export const parseThreadId = (rawId: unknown): number | null => {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const normalizeStatus = (value: unknown): ConversationOperationalStatus | null => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'open' || raw === 'pending' || raw === 'resolved') {
    return raw;
  }
  return null;
};

export const normalizeLabels = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 50);
};

export const getAvatarUrlSafe = async (phone: string): Promise<string | null> => {
  try {
    return await getWhatsappContactAvatarUrl(phone);
  } catch (error) {
    console.warn(`Falha ao buscar avatar do contato ${phone}:`, error);
    return null;
  }
};

export const getStringQuery = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/* ------------------------------------------------------------------ */
/*  Tenant                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();

export const resolveTenantSlug = (value: unknown): string => {
  const normalized = getStringQuery(value).toLowerCase();
  return normalized || DEFAULT_TENANT_SLUG;
};

/* ------------------------------------------------------------------ */
/*  Attachment serialisation                                           */
/* ------------------------------------------------------------------ */

const ATTACHMENT_CONTENT_PREFIX = '__ATTACHMENT__::';

export type StoredAttachmentKind = 'image' | 'video' | 'audio' | 'document' | 'link';

export type StoredAttachmentPayload = {
  kind: StoredAttachmentKind;
  fileName: string;
  mimeType: string;
  caption: string;
  source: 'upload' | 'url';
  url: string | null;
};

export const inferAttachmentKind = (mimeType: string): StoredAttachmentKind => {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized) return 'document';
  return 'document';
};

export const inferMimeTypeFromUrl = (url: string): string => {
  const normalized = url.trim().toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.mp4')) return 'video/mp4';
  if (normalized.endsWith('.mp3')) return 'audio/mpeg';
  if (normalized.endsWith('.ogg')) return 'audio/ogg';
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
};

export const serializeAttachmentContent = (payload: StoredAttachmentPayload): string =>
  `${ATTACHMENT_CONTENT_PREFIX}${JSON.stringify(payload)}`;

export const parseAttachmentContent = (content: string): StoredAttachmentPayload | null => {
  if (!content.startsWith(ATTACHMENT_CONTENT_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(content.slice(ATTACHMENT_CONTENT_PREFIX.length)) as Partial<StoredAttachmentPayload>;
    const fileName = typeof parsed.fileName === 'string' && parsed.fileName.trim() ? parsed.fileName.trim() : 'anexo';
    const mimeType = typeof parsed.mimeType === 'string' ? parsed.mimeType : 'application/octet-stream';
    const caption = typeof parsed.caption === 'string' ? parsed.caption : '';
    const source = parsed.source === 'url' ? 'url' : 'upload';
    const url = typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : null;
    const kind = parsed.kind && ['image', 'video', 'audio', 'document', 'link'].includes(parsed.kind)
      ? parsed.kind
      : inferAttachmentKind(mimeType);

    return {
      kind,
      fileName,
      mimeType,
      caption,
      source,
      url,
    };
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/*  Conversation meta / enrichment                                     */
/* ------------------------------------------------------------------ */

export const defaultConversationMeta = (threadId: number): ConversationMeta => ({
  threadId,
  assigneeId: null,
  status: 'open',
  labels: [],
  updatedAt: new Date().toISOString(),
});

export const enrichThread = async (
  thread: Awaited<ReturnType<typeof inboxStore.listThreads>>[number],
  linkedBookings: Awaited<ReturnType<typeof bookingStore.listByWhatsappThread>> | null = null,
  includeAvatar = false,
  preloadedMeta: ConversationMeta | null = null,
) => {
  const [meta, avatarUrl] = await Promise.all([
    preloadedMeta ? Promise.resolve(preloadedMeta) : whatsappWorkspaceStore.getConversationMeta(thread.id),
    includeAvatar ? getAvatarUrlSafe(thread.phone) : Promise.resolve(null),
  ]);
  const bookings = linkedBookings || [];

  return {
    id: thread.id,
    phone: thread.phone,
    contactName: thread.contactName,
    lastMessage: thread.lastMessage,
    unreadCount: thread.unreadCount,
    updatedAt: thread.updatedAt,
    avatarUrl,
    operational: meta,
    crm: {
      pendingBookingsCount: bookings.filter((booking) => booking.status === 'pending').length,
      latestBookingStatus: bookings[0]?.status || null,
      lastBookingAt: bookings[0]?.updatedAt || null,
    },
  };
};

/* ------------------------------------------------------------------ */
/*  Messaging                                                          */
/* ------------------------------------------------------------------ */

export const sendTextMessage = async (
  threadId: number,
  content: string,
): Promise<Awaited<ReturnType<typeof inboxStore.addMessage>>> => {
  if (!whatsappConfig.isConfigured) {
    throw new Error('WhatsApp (Baileys) nao configurado.');
  }

  const status = getWhatsappStatus();
  if (!status.connected) {
    throw new Error(`WhatsApp desconectado (${status.connectionState}).`);
  }

  const thread = await inboxStore.findThreadById(threadId);
  if (!thread) {
    throw new Error('Conversa nao encontrada.');
  }

  const providerMessageId = await sendWhatsappMessageToCustomer(thread.phone, content);
  return inboxStore.addMessage({
    threadId,
    direction: 'outgoing',
    content,
    providerMessageId,
    isRead: true,
  });
};

/* ------------------------------------------------------------------ */
/*  Chatwoot bridging                                                  */
/* ------------------------------------------------------------------ */

export const resolveChatwootConversationIdForThread = async (
  tenantSlug: string,
  threadId: number,
  phone: string,
): Promise<number | null> => {
  const mapped = await whatsappWorkspaceStore.getConversationMapByThreadId(threadId);
  if (mapped?.chatwootConversationId) {
    return mapped.chatwootConversationId;
  }

  const live = await getChatwootOperationalForPhone(tenantSlug, phone, { forceRefresh: true });
  if (!live) {
    return null;
  }

  await Promise.allSettled([
    whatsappWorkspaceStore.upsertConversationMap({
      threadId,
      chatwootConversationId: live.conversationId,
      lastSource: 'chatwoot',
      lastSyncedAt: new Date().toISOString(),
    }),
    whatsappWorkspaceStore.upsertConversationMeta(threadId, {
      assigneeId: live.assigneeId,
      status: live.status,
      labels: live.labels,
    }),
  ]);

  return live.conversationId;
};

/* Re-export types that route files may need */
export type { ConversationMeta, ConversationOperationalStatus } from '../../db/whatsappWorkspaceStore';
