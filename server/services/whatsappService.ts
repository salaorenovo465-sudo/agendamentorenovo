import fs from 'fs';
import os from 'os';
import path from 'path';

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type ConnectionState,
  type WAMessage,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import P from 'pino';

import '../loadEnv';
import { inboxStore } from '../db/inboxStore';
import { normalizeWhatsappPhone, whatsappJidToPhone } from '../utils/phone';
import { publishMessageStatus, publishWhatsappStateChanged } from './inboxRealtime';
import {
  type OutgoingDeliveryStatus,
  setOutgoingDeliveryStatus,
} from './whatsappDeliveryStatus';

const BAILEYS_ENABLED = process.env.BAILEYS_ENABLED !== 'false';
const DEFAULT_BAILEYS_AUTH_DIR = path.resolve(os.homedir(), '.agendamentorenovo', 'baileys_auth');
const BAILEYS_AUTH_DIR = process.env.BAILEYS_AUTH_DIR || DEFAULT_BAILEYS_AUTH_DIR;
const BAILEYS_AUTO_CONNECT = process.env.BAILEYS_AUTO_CONNECT !== 'false';

const BAILEYS_SALON_WHATSAPP = (process.env.BAILEYS_SALON_WHATSAPP || '')
  .split(',')
  .map((value) => normalizeWhatsappPhone(value))
  .filter(Boolean);

type WhatsappConnectionState = 'disabled' | 'disconnected' | 'connecting' | 'qr' | 'connected';

type StoredWhatsappState = {
  connectionState: WhatsappConnectionState;
  qr: string | null;
  qrDataUrl: string | null;
  connectedJid: string | null;
  lastError: string | null;
  lastUpdateAt: string;
};

const state: StoredWhatsappState = {
  connectionState: BAILEYS_ENABLED ? 'disconnected' : 'disabled',
  qr: null,
  qrDataUrl: null,
  connectedJid: null,
  lastError: null,
  lastUpdateAt: new Date().toISOString(),
};

let socket: ReturnType<typeof makeWASocket> | null = null;
let connectPromise: Promise<void> | null = null;
let manualDisconnect = false;
let reconnectTimer: NodeJS.Timeout | null = null;

type ContactAvatarCacheEntry = {
  url: string | null;
  expiresAt: number;
};

type ContactJidCacheEntry = {
  jid: string;
  expiresAt: number;
};

const CONTACT_AVATAR_TTL_MS = 1000 * 60 * 15;
const CONTACT_JID_TTL_MS = 1000 * 60 * 60 * 24;
const contactAvatarCache = new Map<string, ContactAvatarCacheEntry>();
const contactJidCache = new Map<string, ContactJidCacheEntry>();

const rememberContactJid = (phone: string, jid: string): void => {
  if (!phone || !jid || isBroadcastOrGroup(jid)) {
    return;
  }

  contactJidCache.set(phone, {
    jid,
    expiresAt: Date.now() + CONTACT_JID_TTL_MS,
  });
};

const getRememberedContactJid = (phone: string): string | null => {
  const cached = contactJidCache.get(phone);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    contactJidCache.delete(phone);
    return null;
  }

  return cached.jid;
};

const logger = P({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

const setState = (patch: Partial<StoredWhatsappState>): void => {
  Object.assign(state, patch, { lastUpdateAt: new Date().toISOString() });
  publishWhatsappStateChanged();
};

const clearReconnectTimer = (): void => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const isBroadcastOrGroup = (jid: string): boolean =>
  jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid === 'status@broadcast';

const extractTextFromMessage = (message: WAMessage): string | null => {
  const content = message.message;
  if (!content) {
    return null;
  }

  if (typeof content.conversation === 'string' && content.conversation.trim()) {
    return content.conversation.trim();
  }

  const extended = content.extendedTextMessage?.text;
  if (typeof extended === 'string' && extended.trim()) {
    return extended.trim();
  }

  const imageCaption = content.imageMessage?.caption;
  if (typeof imageCaption === 'string' && imageCaption.trim()) {
    return imageCaption.trim();
  }

  const videoCaption = content.videoMessage?.caption;
  if (typeof videoCaption === 'string' && videoCaption.trim()) {
    return videoCaption.trim();
  }

  return null;
};

const mapBaileysNumericStatus = (rawStatus: unknown): OutgoingDeliveryStatus | null => {
  if (typeof rawStatus !== 'number' || !Number.isFinite(rawStatus)) {
    return null;
  }

  if (rawStatus >= 3) return 'read';
  if (rawStatus >= 2) return 'delivered';
  if (rawStatus >= 1) return 'sent';
  return null;
};

const mapBaileysReceiptStatus = (rawReceipt: unknown): OutgoingDeliveryStatus | null => {
  if (typeof rawReceipt !== 'string') {
    return null;
  }

  const receipt = rawReceipt.toLowerCase();
  if (receipt === 'read' || receipt === 'played') return 'read';
  if (receipt === 'delivery' || receipt === 'delivered') return 'delivered';
  if (receipt === 'sender' || receipt === 'server') return 'sent';
  return null;
};

const applyProviderStatus = (providerMessageId: string | null | undefined, status: OutgoingDeliveryStatus | null): void => {
  if (!providerMessageId || !status) {
    return;
  }

  const changed = setOutgoingDeliveryStatus(providerMessageId, status);
  if (changed) {
    publishMessageStatus(providerMessageId, status);
  }
};

const handleMessagesStatusUpdate = (updates: unknown): void => {
  if (!Array.isArray(updates)) {
    return;
  }

  updates.forEach((item) => {
    const typedItem = item as { key?: { id?: string | null }; update?: { status?: unknown } };
    const providerMessageId = typedItem.key?.id || null;
    const mappedStatus = mapBaileysNumericStatus(typedItem.update?.status);
    applyProviderStatus(providerMessageId, mappedStatus);
  });
};

const handleMessageReceiptUpdate = (updates: unknown): void => {
  if (!Array.isArray(updates)) {
    return;
  }

  updates.forEach((item) => {
    const typedItem = item as { key?: { id?: string | null }; receipt?: unknown };
    const providerMessageId = typedItem.key?.id || null;
    const mappedStatus = mapBaileysReceiptStatus(typedItem.receipt);
    applyProviderStatus(providerMessageId, mappedStatus);
  });
};

const handleIncomingMessage = async (message: WAMessage): Promise<void> => {
  const remoteJid = message.key.remoteJid || '';
  if (!remoteJid || message.key.fromMe || isBroadcastOrGroup(remoteJid)) {
    return;
  }

  const phone = whatsappJidToPhone(remoteJid);
  if (!phone) {
    return;
  }

  rememberContactJid(phone, remoteJid);

  const text = extractTextFromMessage(message);
  if (!text) {
    return;
  }

  const thread = await inboxStore.ensureThread(phone, message.pushName || null);
  await inboxStore.addMessage({
    threadId: thread.id,
    direction: 'incoming',
    content: text,
    providerMessageId: message.key.id || null,
    isRead: false,
  });

  // Check if client is requesting a cancellation
  try {
    const { handleClientCancellationRequest } = await import('./notificationService');
    await handleClientCancellationRequest(phone, text);
  } catch (err) {
    console.error('Erro ao verificar cancelamento via mensagem:', err);
  }
};

const handleConnectionUpdate = async (update: Partial<ConnectionState>): Promise<void> => {
  if (update.qr) {
    let qrDataUrl: string | null = null;
    try {
      qrDataUrl = await qrcode.toDataURL(update.qr);
    } catch (error) {
      console.error('Falha ao gerar QR DataURL do Baileys:', error);
    }

    setState({
      connectionState: 'qr',
      qr: update.qr,
      qrDataUrl,
      connectedJid: null,
      lastError: null,
    });
  }

  if (update.connection === 'connecting') {
    setState({ connectionState: 'connecting', lastError: null });
  }

  if (update.connection === 'open') {
    setState({
      connectionState: 'connected',
      qr: null,
      qrDataUrl: null,
      connectedJid: socket?.user?.id || null,
      lastError: null,
    });
  }

  if (update.connection === 'close') {
    const statusCode =
      (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode || 0;
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    const reason = loggedOut
      ? 'Sessao WhatsApp desconectada (logout). Escaneie o QR novamente.'
      : `Conexao encerrada (${statusCode || 'sem-codigo'}).`;

    setState({
      connectionState: BAILEYS_ENABLED ? 'disconnected' : 'disabled',
      connectedJid: null,
      qr: null,
      qrDataUrl: null,
      lastError: reason,
    });

    socket = null;
    connectPromise = null;

    if (!loggedOut && !manualDisconnect && BAILEYS_AUTO_CONNECT) {
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        void connectWhatsapp();
      }, 2500);
    }
  }
};

const ensureAuthDir = (): void => {
  if (!fs.existsSync(BAILEYS_AUTH_DIR)) {
    fs.mkdirSync(BAILEYS_AUTH_DIR, { recursive: true });
  }
};

export const connectWhatsapp = async (): Promise<void> => {
  if (!BAILEYS_ENABLED) {
    setState({ connectionState: 'disabled', lastError: 'BAILEYS_ENABLED=false' });
    return;
  }

  manualDisconnect = false;

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    try {
      clearReconnectTimer();
      ensureAuthDir();
      setState({ connectionState: 'connecting', lastError: null });

      const { state: authState, saveCreds } = await useMultiFileAuthState(BAILEYS_AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      socket = makeWASocket({
        version,
        auth: authState,
        logger,
        printQRInTerminal: false,
        browser: ['Renovo SaaS', 'Chrome', '1.0.0'],
      });

      socket.ev.on('creds.update', saveCreds);
      socket.ev.on('connection.update', (update) => {
        void handleConnectionUpdate(update);
      });

      socket.ev.on('messages.upsert', (upsert) => {
        if (upsert.type !== 'notify') {
          return;
        }

        upsert.messages.forEach((message) => {
          void handleIncomingMessage(message).catch((error) => {
            console.error('Erro ao processar mensagem recebida via Baileys:', error);
          });
        });
      });

      socket.ev.on('messages.update', (updates) => {
        handleMessagesStatusUpdate(updates);
      });

      socket.ev.on('message-receipt.update', (updates) => {
        handleMessageReceiptUpdate(updates);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ connectionState: 'disconnected', lastError: message });
      throw error;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
};

export const disconnectWhatsapp = async (): Promise<void> => {
  manualDisconnect = true;
  clearReconnectTimer();

  if (socket) {
    try {
      await socket.ws.close();
    } catch (err) {
      console.warn('Erro ao fechar websocket WhatsApp:', err);
    }
  }

  socket = null;
  setState({
    connectionState: BAILEYS_ENABLED ? 'disconnected' : 'disabled',
    connectedJid: null,
    qr: null,
    qrDataUrl: null,
    lastError: null,
  });
};

export const reconnectWhatsapp = async (): Promise<void> => {
  manualDisconnect = false;
  await disconnectWhatsapp();
  manualDisconnect = false;
  await connectWhatsapp();
};

export const logoutWhatsapp = async (): Promise<void> => {
  await disconnectWhatsapp();

  // Remove auth dir to force new QR code on next connect
  try {
    if (fs.existsSync(BAILEYS_AUTH_DIR)) {
      fs.rmSync(BAILEYS_AUTH_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('Erro ao remover diretório de autenticação Baileys:', err);
  }

  manualDisconnect = false;
  await connectWhatsapp();
};

export const initializeWhatsapp = async (): Promise<void> => {
  if (!BAILEYS_ENABLED) {
    setState({ connectionState: 'disabled', lastError: 'BAILEYS_ENABLED=false' });
    return;
  }

  manualDisconnect = false;
  if (BAILEYS_AUTO_CONNECT) {
    await connectWhatsapp();
  }
};

const ensureSocketConnected = async (): Promise<ReturnType<typeof makeWASocket>> => {
  if (state.connectionState !== 'connected' || !socket) {
    await connectWhatsapp();
  }

  if (state.connectionState !== 'connected' || !socket) {
    throw new Error('WhatsApp desconectado. Conecte a sessao via QR Code no painel.');
  }

  return socket;
};

export const getWhatsappContactAvatarUrlCached = (phone: string): string | null => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) return null;
  const cached = contactAvatarCache.get(normalizedPhone);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  return null;
};

export const getWhatsappContactAvatarUrl = async (phone: string): Promise<string | null> => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    return null;
  }

  const cached = contactAvatarCache.get(normalizedPhone);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  if (state.connectionState !== 'connected' || !socket) {
    return cached?.url || null;
  }

  const candidateJids = new Set<string>();
  const rememberedJid = getRememberedContactJid(normalizedPhone);
  if (rememberedJid) {
    candidateJids.add(rememberedJid);
  }

  const fallbackJid = `${normalizedPhone}@s.whatsapp.net`;
  candidateJids.add(fallbackJid);

  if (!normalizedPhone.startsWith('55')) {
    candidateJids.add(`${normalizedPhone}@lid`);
  }

  try {
    const rows = (await socket.onWhatsApp(normalizedPhone).catch(() => [])) as Array<{
      jid?: string | null;
      exists?: boolean;
    }>;

    rows.forEach((row) => {
      if (row?.jid) {
        candidateJids.add(row.jid);
      }
    });
  } catch (err) {
    console.warn('Erro ao resolver JID para avatar via onWhatsApp:', err);
  }

  try {
    for (const jid of candidateJids) {
      const avatarUrl = await socket.profilePictureUrl(jid, 'image').catch(() => null);
      if (!avatarUrl) {
        continue;
      }

      rememberContactJid(normalizedPhone, jid);
      contactAvatarCache.set(normalizedPhone, {
        url: avatarUrl,
        expiresAt: Date.now() + CONTACT_AVATAR_TTL_MS,
      });
      return avatarUrl;
    }

    contactAvatarCache.set(normalizedPhone, {
      url: null,
      expiresAt: Date.now() + 1000 * 60 * 3,
    });
    return null;
  } catch {
    contactAvatarCache.set(normalizedPhone, {
      url: null,
      expiresAt: Date.now() + 1000 * 60 * 3,
    });
    return null;
  }
};

export const sendWhatsappMessageToCustomer = async (phone: string, text: string): Promise<string | null> => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    throw new Error('Telefone inválido para envio no WhatsApp.');
  }

  const sock = await ensureSocketConnected();
  const jid = `${normalizedPhone}@s.whatsapp.net`;
  rememberContactJid(normalizedPhone, jid);
  const result = await sock.sendMessage(jid, { text });
  const providerMessageId = result.key.id || null;
  applyProviderStatus(providerMessageId, 'sent');
  return providerMessageId;
};

export type WhatsappAttachmentInput = {
  dataBase64: string;
  mimeType: string;
  fileName: string;
  caption?: string;
};

const decodeAttachmentBuffer = (rawBase64: string): Buffer => {
  const normalized = rawBase64.trim();
  if (!normalized) {
    throw new Error('Conteudo do anexo vazio.');
  }

  const commaIndex = normalized.indexOf(',');
  const base64Payload = commaIndex >= 0 ? normalized.slice(commaIndex + 1) : normalized;
  return Buffer.from(base64Payload, 'base64');
};

const resolveSendJid = async (
  sock: ReturnType<typeof makeWASocket>,
  normalizedPhone: string,
): Promise<string> => {
  const candidateJids = new Set<string>();
  const remembered = getRememberedContactJid(normalizedPhone);
  if (remembered) {
    candidateJids.add(remembered);
  }

  candidateJids.add(`${normalizedPhone}@s.whatsapp.net`);

  try {
    const rows = (await sock.onWhatsApp(normalizedPhone).catch(() => [])) as Array<{
      jid?: string | null;
      exists?: boolean;
    }>;

    rows.forEach((row) => {
      if (row?.jid) {
        candidateJids.add(row.jid);
      }
    });
  } catch (err) {
    console.warn('Erro ao resolver JID para envio via onWhatsApp:', err);
  }

  const preferred = Array.from(candidateJids).find((jid) => !isBroadcastOrGroup(jid));
  return preferred || `${normalizedPhone}@s.whatsapp.net`;
};

export const sendWhatsappAttachmentToCustomer = async (
  phone: string,
  attachment: WhatsappAttachmentInput,
): Promise<string | null> => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    throw new Error('Telefone inválido para envio de anexo no WhatsApp.');
  }

  const sock = await ensureSocketConnected();
  const jid = await resolveSendJid(sock, normalizedPhone);
  rememberContactJid(normalizedPhone, jid);

  const mimeType = (attachment.mimeType || '').trim().toLowerCase() || 'application/octet-stream';
  const fileName = attachment.fileName?.trim() || `anexo-${Date.now()}`;
  const caption = attachment.caption?.trim() || undefined;
  const buffer = decodeAttachmentBuffer(attachment.dataBase64);

  if (!buffer.length) {
    throw new Error('Anexo inválido.');
  }

  let result: Awaited<ReturnType<typeof sock.sendMessage>>;

  if (mimeType.startsWith('image/')) {
    result = await sock.sendMessage(jid, { image: buffer, caption });
  } else if (mimeType.startsWith('video/')) {
    result = await sock.sendMessage(jid, { video: buffer, caption });
  } else if (mimeType.startsWith('audio/')) {
    result = await sock.sendMessage(jid, {
      audio: buffer,
      mimetype: mimeType,
      ptt: true,
    });
  } else {
    result = await sock.sendMessage(jid, {
      document: buffer,
      mimetype: mimeType,
      fileName,
      caption,
    });
  }

  const providerMessageId = result.key.id || null;
  applyProviderStatus(providerMessageId, 'sent');
  return providerMessageId;
};

export const sendWhatsappMessageToSalon = async (text: string): Promise<void> => {
  if (BAILEYS_SALON_WHATSAPP.length === 0) {
    throw new Error('Nenhum numero do salao configurado em BAILEYS_SALON_WHATSAPP.');
  }

  for (const phone of BAILEYS_SALON_WHATSAPP) {
    await sendWhatsappMessageToCustomer(phone, text);
  }
};

export const getWhatsappStatus = () => ({
  provider: 'baileys' as const,
  enabled: BAILEYS_ENABLED,
  connectionState: state.connectionState,
  connected: state.connectionState === 'connected',
  connectedJid: state.connectedJid,
  connectedPhone: state.connectedJid ? whatsappJidToPhone(state.connectedJid) : null,
  qrAvailable: Boolean(state.qr),
  qrDataUrl: state.qrDataUrl,
  salonNumbersConfigured: BAILEYS_SALON_WHATSAPP.length > 0,
  lastError: state.lastError,
  lastUpdateAt: state.lastUpdateAt,
});

export const whatsappConfig = {
  isConfigured: BAILEYS_ENABLED,
};
