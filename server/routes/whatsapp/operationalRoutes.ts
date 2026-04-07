import { Router } from 'express';

import { inboxStore } from '../../db/inboxStore';
import { whatsappWorkspaceStore } from '../../db/whatsappWorkspaceStore';
import {
  addChatwootPrivateNote,
  assignChatwootConversation,
  updateChatwootConversationLabels,
  updateChatwootConversationStatus,
} from '../../services/chatwootOperationalService';
import { publishInboxUpdated } from '../../services/inboxRealtime';
import {
  normalizeLabels,
  normalizeStatus,
  parseThreadId,
  resolveChatwootConversationIdForThread,
  resolveTenantSlug,
} from './whatsappHelpers';

export const operationalRoutes = Router();

operationalRoutes.patch('/conversations/:id/assign', async (req, res) => {
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

operationalRoutes.patch('/conversations/:id/status', async (req, res) => {
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

operationalRoutes.patch('/conversations/:id/tags', async (req, res) => {
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

operationalRoutes.post('/conversations/:id/notes', async (req, res) => {
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
