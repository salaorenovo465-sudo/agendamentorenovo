import { Router } from 'express';

import { bookingStore } from '../db/bookingStore';
import { inboxStore } from '../db/inboxStore';
import { type ConversationMeta, type ConversationOperationalStatus, whatsappWorkspaceStore } from '../db/whatsappWorkspaceStore';
import { createRateLimit } from '../middleware/rateLimit';
import {
  addChatwootPrivateNote,
  assignChatwootConversation,
  getChatwootOperationalByPhones,
  getChatwootOperationalForPhone,
  listChatwootPrivateNotes,
  updateChatwootConversationLabels,
  updateChatwootConversationStatus,
} from '../services/chatwootOperationalService';
import { publishInboxUpdated } from '../services/inboxRealtime';
import { getOutgoingDeliveryStatus } from '../services/whatsappDeliveryStatus';
import {
  getWhatsappContactAvatarUrl,
  getWhatsappStatus,
  sendWhatsappAttachmentToCustomer,
  sendWhatsappMessageToCustomer,
  whatsappConfig,
} from '../services/whatsappService';
import { createEvolutionInstance, getEvolutionInstanceStatus, refreshEvolutionInstanceQr } from '../services/evolutionInstanceService';
import { syncEvolutionWorkspace } from '../services/evolutionSyncService';
import { toPositiveInt } from '../utils/helpers';

const whatsappSendRateLimit = createRateLimit({
  windowMs: toPositiveInt(process.env.WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toPositiveInt(process.env.WHATSAPP_SEND_RATE_LIMIT_MAX, 40),
  message: 'Limite de envio temporariamente excedido. Aguarde e tente novamente.',
  keyPrefix: 'whatsapp-send-v2',
});

const parseThreadId = (rawId: unknown): number | null => {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeStatus = (value: unknown): ConversationOperationalStatus | null => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'open' || raw === 'pending' || raw === 'resolved') {
    return raw;
  }
  return null;
};

const normalizeLabels = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 50);
};

const getAvatarUrlSafe = async (phone: string): Promise<string | null> => {
  try {
    return await getWhatsappContactAvatarUrl(phone);
  } catch (error) {
    console.warn(`Falha ao buscar avatar do contato ${phone}:`, error);
    return null;
  }
};

const getStringQuery = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();
const ATTACHMENT_CONTENT_PREFIX = '__ATTACHMENT__::';

type StoredAttachmentKind = 'image' | 'video' | 'audio' | 'document' | 'link';

type StoredAttachmentPayload = {
  kind: StoredAttachmentKind;
  fileName: string;
  mimeType: string;
  caption: string;
  source: 'upload' | 'url';
  url: string | null;
};

const resolveTenantSlug = (value: unknown): string => {
  const normalized = getStringQuery(value).toLowerCase();
  return normalized || DEFAULT_TENANT_SLUG;
};

const inferAttachmentKind = (mimeType: string): StoredAttachmentKind => {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized) return 'document';
  return 'document';
};

const inferMimeTypeFromUrl = (url: string): string => {
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

const serializeAttachmentContent = (payload: StoredAttachmentPayload): string =>
  `${ATTACHMENT_CONTENT_PREFIX}${JSON.stringify(payload)}`;

const parseAttachmentContent = (content: string): StoredAttachmentPayload | null => {
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

const defaultConversationMeta = (threadId: number): ConversationMeta => ({
  threadId,
  assigneeId: null,
  status: 'open',
  labels: [],
  updatedAt: new Date().toISOString(),
});

const enrichThread = async (
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

export const whatsappRoutes = Router();

whatsappRoutes.get('/instance/status', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const status = await getEvolutionInstanceStatus(tenantSlug, { includeQr: false });
    return res.json({ status });
  } catch (error) {
    console.error('Erro ao consultar status da instancia Evolution:', error);
    return res.status(500).json({ error: 'Erro ao consultar status da instancia.' });
  }
});

whatsappRoutes.post('/instance/create', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const companyName = typeof req.body?.companyName === 'string' ? req.body.companyName.trim() : '';
    const status = await createEvolutionInstance(tenantSlug, companyName || undefined);
    if (!status.configured) {
      return res.status(400).json({ error: status.lastError || 'Configuracao da Evolution incompleta.', status });
    }

    return res.status(201).json({ status });
  } catch (error) {
    console.error('Erro ao criar instancia Evolution:', error);
    return res.status(500).json({ error: 'Erro ao criar instancia na Evolution.' });
  }
});

whatsappRoutes.get('/instance/qr', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const status = await getEvolutionInstanceStatus(tenantSlug, { includeQr: true });
    if (!status.configured) {
      return res.status(400).json({ error: status.lastError || 'Configuracao da Evolution incompleta.', status });
    }

    return res.json({ status });
  } catch (error) {
    console.error('Erro ao gerar QR da instancia Evolution:', error);
    return res.status(500).json({ error: 'Erro ao gerar QR da instancia.' });
  }
});

whatsappRoutes.post('/instance/refresh-qr', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const status = await refreshEvolutionInstanceQr(tenantSlug);
    if (!status.configured) {
      return res.status(400).json({ error: status.lastError || 'Configuracao da Evolution incompleta.', status });
    }

    return res.json({ status });
  } catch (error) {
    console.error('Erro ao atualizar QR da instancia Evolution:', error);
    return res.status(500).json({ error: 'Erro ao atualizar QR da instancia.' });
  }
});

const sendTextMessage = async (
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

const resolveChatwootConversationIdForThread = async (
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

whatsappRoutes.get('/conversations', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const rows = await inboxStore.listThreads();
    const metaMap = await whatsappWorkspaceStore.listConversationMetaByThreadIds(rows.map((row) => row.id));

    let chatwootOperationalByPhone = new Map<string, { assigneeId: string | null; status: ConversationOperationalStatus; labels: string[] }>();
    try {
      const snapshot = await getChatwootOperationalByPhones(tenantSlug, rows.map((row) => row.phone));
      snapshot.forEach((item, phone) => {
        chatwootOperationalByPhone.set(phone, {
          assigneeId: item.assigneeId,
          status: item.status,
          labels: item.labels,
        });
      });
    } catch (error) {
      console.warn(`Falha ao carregar estado operacional do Chatwoot (${tenantSlug}):`, error);
    }

    const conversations = await Promise.all(
      rows.map((row) => {
        const chatwootOperational = chatwootOperationalByPhone.get(row.phone);
        const effectiveMeta = chatwootOperational
          ? {
              threadId: row.id,
              assigneeId: chatwootOperational.assigneeId,
              status: chatwootOperational.status,
              labels: chatwootOperational.labels,
              updatedAt: new Date().toISOString(),
            }
          : (metaMap.get(row.id) || defaultConversationMeta(row.id));

        return enrichThread(row, null, false, effectiveMeta);
      }),
    );

    const filter = getStringQuery(req.query.filter).toLowerCase();
    const assignee = getStringQuery(req.query.assignee);
    const tag = getStringQuery(req.query.tag).toLowerCase();

    const filtered = conversations.filter((conversation) => {
      if (filter === 'unread' && conversation.unreadCount <= 0) return false;
      if (filter === 'resolved' && conversation.operational.status !== 'resolved') return false;
      if (filter === 'pending' && conversation.operational.status !== 'pending') return false;
      if (filter === 'unassigned' && conversation.operational.assigneeId) return false;
      if (filter === 'mine' && assignee && conversation.operational.assigneeId !== assignee) return false;
      if (tag && !conversation.operational.labels.some((label) => label.toLowerCase() === tag)) return false;
      return true;
    });

    return res.json({ conversations: filtered });
  } catch (error) {
    console.error('Erro ao listar conversas WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao listar conversas.' });
  }
});

whatsappRoutes.get('/conversations/:id', async (req, res) => {
  const threadId = parseThreadId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa invalido.' });
  }

  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversa nao encontrada.' });
    }

    const [bookings, localNotes, localMeta, mappedConversation, chatwootOperational] = await Promise.all([
      bookingStore.listByWhatsappThread(threadId),
      whatsappWorkspaceStore.listInternalNotes(threadId),
      whatsappWorkspaceStore.getConversationMeta(threadId),
      whatsappWorkspaceStore.getConversationMapByThreadId(threadId),
      getChatwootOperationalForPhone(tenantSlug, thread.phone),
    ]);

    let effectiveMeta = localMeta;
    let chatwootConversationId = mappedConversation?.chatwootConversationId || null;

    if (chatwootOperational) {
      effectiveMeta = {
        threadId,
        assigneeId: chatwootOperational.assigneeId,
        status: chatwootOperational.status,
        labels: chatwootOperational.labels,
        updatedAt: new Date().toISOString(),
      };
      chatwootConversationId = chatwootOperational.conversationId;

      await Promise.allSettled([
        whatsappWorkspaceStore.upsertConversationMeta(threadId, {
          assigneeId: effectiveMeta.assigneeId,
          status: effectiveMeta.status,
          labels: effectiveMeta.labels,
        }),
        whatsappWorkspaceStore.upsertConversationMap({
          threadId,
          chatwootConversationId: chatwootConversationId,
          lastSource: 'chatwoot',
          lastSyncedAt: new Date().toISOString(),
        }),
      ]);
    }

    let chatwootNotes: Array<{ id: number; threadId: number; content: string; author: string | null; createdAt: string }> = [];
    if (chatwootConversationId) {
      try {
        const rows = await listChatwootPrivateNotes(tenantSlug, chatwootConversationId);
        chatwootNotes = rows.map((row, index) => ({
          id: 900000000 + row.id + index,
          threadId,
          content: row.content,
          author: row.author,
          createdAt: row.createdAt,
        }));
      } catch (error) {
        console.warn(`Falha ao carregar notas privadas do Chatwoot para thread ${threadId}:`, error);
      }
    }

    const noteRows = [...localNotes, ...chatwootNotes].sort((a, b) => {
      const left = new Date(b.createdAt).getTime();
      const right = new Date(a.createdAt).getTime();
      if (Number.isNaN(left) || Number.isNaN(right)) {
        return b.id - a.id;
      }
      return left - right;
    });

    return res.json({
      conversation: await enrichThread({ ...thread, lastMessage: '' }, bookings, true, effectiveMeta),
      panel: {
        bookings,
        notes: noteRows,
      },
    });
  } catch (error) {
    console.error('Erro ao carregar conversa WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao carregar conversa.' });
  }
});

whatsappRoutes.get('/conversations/:id/messages', async (req, res) => {
  const threadId = parseThreadId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa invalido.' });
  }

  try {
    await inboxStore.markThreadAsRead(threadId);
    const messages = await inboxStore.listMessages(threadId);
    return res.json({
      messages: messages.map((message) => {
        const attachment = parseAttachmentContent(message.content);
        return {
          ...message,
          content: attachment?.caption || attachment?.fileName || message.content,
          attachment,
          deliveryStatus: message.direction === 'outgoing' ? getOutgoingDeliveryStatus(message.providerMessageId) || 'sent' : undefined,
        };
      }),
    });
  } catch (error) {
    console.error('Erro ao listar mensagens WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao listar mensagens.' });
  }
});

whatsappRoutes.post('/messages', whatsappSendRateLimit, async (req, res) => {
  const threadId = parseThreadId(typeof req.body?.conversationId === 'number' ? String(req.body.conversationId) : req.body?.conversationId);
  if (!threadId) {
    return res.status(400).json({ error: 'conversationId invalido.' });
  }

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) {
    return res.status(400).json({ error: 'Conteudo da mensagem e obrigatorio.' });
  }

  try {
    const message = await sendTextMessage(threadId, content);
    return res.json({ message });
  } catch (error) {
    console.error('Erro ao enviar mensagem WhatsApp v2:', error);
    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.';
    if (message.includes('nao configurado')) return res.status(503).json({ error: message });
    if (message.includes('desconectado')) return res.status(409).json({ error: message });
    if (message.includes('nao encontrada')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

whatsappRoutes.post('/messages/attachment', whatsappSendRateLimit, async (req, res) => {
  const threadId = parseThreadId(typeof req.body?.conversationId === 'number' ? String(req.body.conversationId) : req.body?.conversationId);
  if (!threadId) {
    return res.status(400).json({ error: 'conversationId invalido.' });
  }

  const attachmentUrl = typeof req.body?.attachmentUrl === 'string' ? req.body.attachmentUrl.trim() : '';
  const attachmentBase64 = typeof req.body?.attachmentBase64 === 'string' ? req.body.attachmentBase64.trim() : '';
  const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim() : '';
  const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
  const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
  if (!attachmentUrl && !attachmentBase64) {
    return res.status(400).json({ error: 'attachmentUrl ou attachmentBase64 e obrigatorio.' });
  }

  const thread = await inboxStore.findThreadById(threadId);
  if (!thread) {
    return res.status(404).json({ error: 'Conversa nao encontrada.' });
  }

  if (attachmentBase64) {
    const effectiveMimeType = mimeType || 'application/octet-stream';
    const effectiveFileName = fileName || `anexo-${Date.now()}`;

    try {
      const providerMessageId = await sendWhatsappAttachmentToCustomer(thread.phone, {
        dataBase64: attachmentBase64,
        mimeType: effectiveMimeType,
        fileName: effectiveFileName,
        caption,
      });

      const dataUrl = attachmentBase64.includes(',')
        ? attachmentBase64
        : `data:${effectiveMimeType};base64,${attachmentBase64}`;

      const serializedContent = serializeAttachmentContent({
        kind: inferAttachmentKind(effectiveMimeType),
        fileName: effectiveFileName,
        mimeType: effectiveMimeType,
        caption,
        source: 'upload',
        url: dataUrl,
      });

      const created = await inboxStore.addMessage({
        threadId,
        direction: 'outgoing',
        content: serializedContent,
        providerMessageId,
        isRead: true,
      });

      return res.json({
        message: {
          ...created,
          content: caption || effectiveFileName,
          attachment: parseAttachmentContent(serializedContent),
        },
      });
    } catch (error) {
      console.error('Erro ao enviar anexo binario WhatsApp v2:', error);
      const message = error instanceof Error ? error.message : 'Erro ao enviar anexo.';
      if (message.includes('nao configurado')) return res.status(503).json({ error: message });
      if (message.includes('desconectado')) return res.status(409).json({ error: message });
      return res.status(500).json({ error: 'Erro ao enviar anexo.' });
    }
  }

  const syntheticContent = caption ? `${caption}\n${attachmentUrl}` : attachmentUrl;

  try {
    const providerMessageId = await sendWhatsappMessageToCustomer(thread.phone, syntheticContent);
    const serializedContent = serializeAttachmentContent({
      kind: inferAttachmentKind(mimeType || inferMimeTypeFromUrl(attachmentUrl)),
      fileName: fileName || attachmentUrl.split('/').pop() || 'anexo-url',
      mimeType: mimeType || inferMimeTypeFromUrl(attachmentUrl),
      caption,
      source: 'url',
      url: attachmentUrl,
    });

    const created = await inboxStore.addMessage({
      threadId,
      direction: 'outgoing',
      content: serializedContent,
      isRead: true,
      providerMessageId,
    });

    return res.json({
      message: {
        ...created,
        content: caption || fileName || attachmentUrl,
        attachment: parseAttachmentContent(serializedContent),
      },
      attachment: {
        mode: 'url-fallback',
        attachmentUrl,
      },
    });
  } catch (error) {
    console.error('Erro ao enviar anexo WhatsApp v2:', error);
    const message = error instanceof Error ? error.message : 'Erro ao enviar anexo.';
    if (message.includes('nao configurado')) return res.status(503).json({ error: message });
    if (message.includes('desconectado')) return res.status(409).json({ error: message });
    if (message.includes('nao encontrada')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: 'Erro ao enviar anexo.' });
  }
});

whatsappRoutes.patch('/conversations/:id/assign', async (req, res) => {
  const threadId = parseThreadId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa invalido.' });
  }

  const assigneeId = typeof req.body?.assigneeId === 'string' ? req.body.assigneeId.trim() : null;

  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversa nao encontrada.' });
    }

    const chatwootConversationId = await resolveChatwootConversationIdForThread(tenantSlug, threadId, thread.phone);
    if (chatwootConversationId) {
      try {
        await assignChatwootConversation(tenantSlug, chatwootConversationId, assigneeId);
      } catch (error) {
        console.warn(`Falha ao sincronizar assignee no Chatwoot (${tenantSlug}):`, error);
      }
    }

    const operational = await whatsappWorkspaceStore.upsertConversationMeta(threadId, { assigneeId });
    publishInboxUpdated('thread-updated', threadId);
    return res.json({ operational });
  } catch (error) {
    console.error('Erro ao atribuir conversa WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao atribuir conversa.' });
  }
});

whatsappRoutes.patch('/conversations/:id/status', async (req, res) => {
  const threadId = parseThreadId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa invalido.' });
  }

  const status = normalizeStatus(req.body?.status);
  if (!status) {
    return res.status(400).json({ error: 'Status invalido. Use open, pending ou resolved.' });
  }

  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversa nao encontrada.' });
    }

    const chatwootConversationId = await resolveChatwootConversationIdForThread(tenantSlug, threadId, thread.phone);
    if (chatwootConversationId) {
      try {
        await updateChatwootConversationStatus(tenantSlug, chatwootConversationId, status);
      } catch (error) {
        console.warn(`Falha ao sincronizar status no Chatwoot (${tenantSlug}):`, error);
      }
    }

    const operational = await whatsappWorkspaceStore.upsertConversationMeta(threadId, { status });
    publishInboxUpdated('thread-updated', threadId);
    return res.json({ operational });
  } catch (error) {
    console.error('Erro ao atualizar status da conversa WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao atualizar status da conversa.' });
  }
});

whatsappRoutes.patch('/conversations/:id/tags', async (req, res) => {
  const threadId = parseThreadId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa invalido.' });
  }

  const labels = normalizeLabels(req.body?.labels);

  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversa nao encontrada.' });
    }

    const chatwootConversationId = await resolveChatwootConversationIdForThread(tenantSlug, threadId, thread.phone);
    if (chatwootConversationId) {
      try {
        await updateChatwootConversationLabels(tenantSlug, chatwootConversationId, labels);
      } catch (error) {
        console.warn(`Falha ao sincronizar labels no Chatwoot (${tenantSlug}):`, error);
      }
    }

    const operational = await whatsappWorkspaceStore.upsertConversationMeta(threadId, { labels });
    publishInboxUpdated('thread-updated', threadId);
    return res.json({ operational });
  } catch (error) {
    console.error('Erro ao atualizar tags da conversa WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao atualizar tags da conversa.' });
  }
});

whatsappRoutes.post('/conversations/:id/notes', async (req, res) => {
  const threadId = parseThreadId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa invalido.' });
  }

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const author = typeof req.body?.author === 'string' ? req.body.author.trim() : null;
  if (!content) {
    return res.status(400).json({ error: 'Conteudo da nota e obrigatorio.' });
  }

  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversa nao encontrada.' });
    }

    const chatwootConversationId = await resolveChatwootConversationIdForThread(tenantSlug, threadId, thread.phone);
    if (chatwootConversationId) {
      try {
        await addChatwootPrivateNote(tenantSlug, chatwootConversationId, content);
      } catch (error) {
        console.warn(`Falha ao sincronizar nota interna no Chatwoot (${tenantSlug}):`, error);
      }
    }

    const note = await whatsappWorkspaceStore.addInternalNote(threadId, content, author);
    await inboxStore.addMessage({
      threadId,
      direction: 'system',
      content: `Nota interna: ${content}`,
      isRead: true,
    });

    return res.status(201).json({ note });
  } catch (error) {
    console.error('Erro ao adicionar nota interna WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao adicionar nota interna.' });
  }
});

whatsappRoutes.get('/contacts', async (_req, res) => {
  try {
    const rows = await inboxStore.listThreads();
    const contacts = await Promise.all(
      rows.map(async (thread) => ({
        id: thread.id,
        phone: thread.phone,
        name: thread.contactName || thread.phone,
        avatarUrl: await getAvatarUrlSafe(thread.phone),
        unreadCount: thread.unreadCount,
        updatedAt: thread.updatedAt,
      })),
    );

    return res.json({ contacts });
  } catch (error) {
    console.error('Erro ao listar contatos WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao listar contatos.' });
  }
});

whatsappRoutes.get('/contact/:id', async (req, res) => {
  const threadId = parseThreadId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de contato invalido.' });
  }

  try {
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Contato nao encontrado.' });
    }

    return res.json({
      contact: {
        id: thread.id,
        phone: thread.phone,
        name: thread.contactName || thread.phone,
        avatarUrl: await getAvatarUrlSafe(thread.phone),
      },
    });
  } catch (error) {
    console.error('Erro ao carregar contato WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao carregar contato.' });
  }
});

whatsappRoutes.get('/search', async (req, res) => {
  const term = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  if (!term) {
    return res.json({ conversations: [] });
  }

  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const rows = await inboxStore.listThreads();
    const metaMap = await whatsappWorkspaceStore.listConversationMetaByThreadIds(rows.map((row) => row.id));
    const filtered = rows.filter((row) => {
      const name = (row.contactName || '').toLowerCase();
      const phone = row.phone.toLowerCase();
      const lastMessage = (row.lastMessage || '').toLowerCase();
      return name.includes(term) || phone.includes(term) || lastMessage.includes(term);
    });

    let chatwootOperationalByPhone = new Map<string, { assigneeId: string | null; status: ConversationOperationalStatus; labels: string[] }>();
    try {
      const snapshot = await getChatwootOperationalByPhones(tenantSlug, filtered.map((row) => row.phone));
      snapshot.forEach((item, phone) => {
        chatwootOperationalByPhone.set(phone, {
          assigneeId: item.assigneeId,
          status: item.status,
          labels: item.labels,
        });
      });
    } catch (error) {
      console.warn(`Falha ao carregar estado operacional do Chatwoot para busca (${tenantSlug}):`, error);
    }

    const conversations = await Promise.all(
      filtered.map((row) => {
        const chatwootOperational = chatwootOperationalByPhone.get(row.phone);
        const effectiveMeta = chatwootOperational
          ? {
              threadId: row.id,
              assigneeId: chatwootOperational.assigneeId,
              status: chatwootOperational.status,
              labels: chatwootOperational.labels,
              updatedAt: new Date().toISOString(),
            }
          : (metaMap.get(row.id) || defaultConversationMeta(row.id));

        return enrichThread(row, null, false, effectiveMeta);
      }),
    );
    return res.json({ conversations });
  } catch (error) {
    console.error('Erro ao buscar conversas WhatsApp v2:', error);
    return res.status(500).json({ error: 'Erro ao buscar conversas.' });
  }
});

whatsappRoutes.post('/sync', async (_req, res) => {
  try {
    const tenant = getStringQuery(_req.query.tenant).toLowerCase() || undefined;

    const started = await whatsappWorkspaceStore.upsertSyncState(tenant || 'global', 'manual', {
      status: 'running',
      lastError: null,
    });

    const syncResult = await syncEvolutionWorkspace(tenant);

    const finished = await whatsappWorkspaceStore.upsertSyncState(tenant || 'global', 'manual',
      syncResult.ok
        ? {
            status: 'idle',
            lastSyncedAt: new Date().toISOString(),
            lastError: syncResult.issues.join(' | ') || null,
          }
        : {
            status: 'error',
            lastError: syncResult.issues.join(' | ') || 'Falha de sincronizacao.',
          });

    const states = await whatsappWorkspaceStore.listSyncStates();

    return res.json({
      ok: true,
      syncResult,
      started,
      finished,
      states,
      message: 'Sincronizacao registrada. Evolution segue como origem primaria de contatos/chats quando configurada.',
    });
  } catch (error) {
    console.error('Erro ao registrar sincronizacao WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao executar sincronizacao.' });
  }
});
