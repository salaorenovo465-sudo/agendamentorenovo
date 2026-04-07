import { Router } from 'express';

import { inboxStore } from '../../db/inboxStore';
import { type ConversationOperationalStatus, whatsappWorkspaceStore } from '../../db/whatsappWorkspaceStore';
import { getChatwootOperationalByPhones } from '../../services/chatwootOperationalService';
import { syncEvolutionWorkspace } from '../../services/evolutionSyncService';
import {
  defaultConversationMeta,
  enrichThread,
  getAvatarUrlSafe,
  getStringQuery,
  parseThreadId,
  resolveTenantSlug,
} from './whatsappHelpers';

export const contactRoutes = Router();

contactRoutes.get('/contacts', async (_req, res) => {
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

contactRoutes.get('/contact/:id', async (req, res) => {
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

contactRoutes.get('/search', async (req, res) => {
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

contactRoutes.post('/sync', async (_req, res) => {
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
