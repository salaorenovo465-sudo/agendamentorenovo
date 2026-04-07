import { Router } from 'express';

import { bookingStore } from '../../db/bookingStore';
import { inboxStore } from '../../db/inboxStore';
import { type ConversationOperationalStatus, whatsappWorkspaceStore } from '../../db/whatsappWorkspaceStore';
import {
  getChatwootOperationalByPhones,
  getChatwootOperationalForPhone,
  listChatwootPrivateNotes,
} from '../../services/chatwootOperationalService';
import { getOutgoingDeliveryStatus } from '../../services/whatsappDeliveryStatus';
import {
  defaultConversationMeta,
  enrichThread,
  getStringQuery,
  parseAttachmentContent,
  parseThreadId,
  resolveTenantSlug,
} from './whatsappHelpers';

export const conversationRoutes = Router();

conversationRoutes.get('/conversations', async (req, res) => {
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

conversationRoutes.get('/conversations/:id', async (req, res) => {
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

conversationRoutes.get('/conversations/:id/messages', async (req, res) => {
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
