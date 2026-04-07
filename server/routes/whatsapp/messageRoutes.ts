import { Router } from 'express';

import { inboxStore } from '../../db/inboxStore';
import { createRateLimit } from '../../middleware/rateLimit';
import {
  sendWhatsappAttachmentToCustomer,
  sendWhatsappMessageToCustomer,
} from '../../services/whatsappService';
import { toPositiveInt } from '../../utils/helpers';
import {
  inferAttachmentKind,
  inferMimeTypeFromUrl,
  parseAttachmentContent,
  parseThreadId,
  sendTextMessage,
  serializeAttachmentContent,
} from './whatsappHelpers';

const whatsappSendRateLimit = createRateLimit({
  windowMs: toPositiveInt(process.env.WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toPositiveInt(process.env.WHATSAPP_SEND_RATE_LIMIT_MAX, 40),
  message: 'Limite de envio temporariamente excedido. Aguarde e tente novamente.',
  keyPrefix: 'whatsapp-send-v2',
});

export const messageRoutes = Router();

messageRoutes.post('/messages', whatsappSendRateLimit, async (req, res) => {
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

messageRoutes.post('/messages/attachment', whatsappSendRateLimit, async (req, res) => {
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
