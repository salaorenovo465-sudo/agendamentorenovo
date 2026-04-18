import { normalizeWhatsappPhone, normalizeWhatsappPhoneWithPlus } from '../utils/phone';
import { type GenericObject, asObject, asArray, getString, getPositiveInt } from '../utils/helpers';
import { fetchEvolutionInstances, resolveEvolutionInstance } from './evolutionApiService';

export type TenantBridgeConfig = {
  tenantSlug: string;
  chatwootUrl: string;
  chatwootAccountId: number;
  chatwootInboxId: number;
  chatwootApiToken: string;
  chatwootAgentEmail: string | null;
  chatwootWebhookSecret: string | null;
  evolutionUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
  evolutionSendPath: string;
  evolutionWebhookSecret: string | null;
};

type BridgeResult = {
  delivered: boolean;
  reason?: string;
};

const WEBHOOK_DEDUP_TTL_MS = 1000 * 60 * 15;
const processedWebhookIds = new Map<string, number>();

const cleanupProcessedWebhookIds = (): void => {
  const now = Date.now();
  for (const [key, expiresAt] of processedWebhookIds.entries()) {
    if (expiresAt <= now) {
      processedWebhookIds.delete(key);
    }
  }
};

const cleanupTimer = setInterval(cleanupProcessedWebhookIds, 1000 * 60 * 2);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

const alreadyProcessedWebhookId = (scope: string, id: string | null): boolean => {
  if (!id) {
    return false;
  }

  const key = `${scope}:${id}`;
  const now = Date.now();
  const current = processedWebhookIds.get(key);
  if (current && current > now) {
    return true;
  }

  processedWebhookIds.set(key, now + WEBHOOK_DEDUP_TTL_MS);
  return false;
};


const toBaseUrl = (value: string): string => {
  const raw = value.trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
};

const withLeadingSlash = (value: string): string => {
  if (!value) {
    return '';
  }

  return value.startsWith('/') ? value : `/${value}`;
};

const normalizeChatwootPhone = (value: string): string => normalizeWhatsappPhone(value);

export const resolveTenantBridgeConfig = (
  tenantSlug: string,
  settings: Record<string, unknown>,
  requirement: 'chatwoot' | 'evolution' | 'all' = 'all',
): { ok: true; config: TenantBridgeConfig } | { ok: false; error: string } => {
  const envPrefix = tenantSlug.toUpperCase().replace(/-/g, '_');

  const chatwootUrl = toBaseUrl(
    getString(settings.chatwootUrl) ||
      getString(process.env[`${envPrefix}_CHATWOOT_URL`]) ||
      getString(process.env.CHATWOOT_URL),
  );
  const chatwootAccountId = getPositiveInt(
    settings.chatwootAccountId || process.env[`${envPrefix}_CHATWOOT_ACCOUNT_ID`] || process.env.CHATWOOT_ACCOUNT_ID,
  );
  const chatwootInboxId = getPositiveInt(
    settings.chatwootInboxId || process.env[`${envPrefix}_CHATWOOT_INBOX_ID`] || process.env.CHATWOOT_INBOX_ID,
  );
  const chatwootApiToken =
    getString(settings.chatwootApiToken) ||
    getString(process.env[`${envPrefix}_CHATWOOT_API_TOKEN`]) ||
    getString(process.env.CHATWOOT_API_TOKEN);

  const evolutionUrl = toBaseUrl(
    getString(settings.evolutionUrl) ||
      getString(process.env[`${envPrefix}_EVOLUTION_API_URL`]) ||
      getString(process.env[`${envPrefix}_EVOLUTION_URL`]) ||
      getString(process.env.EVOLUTION_API_URL) ||
      getString(process.env.EVOLUTION_URL),
  );
  const evolutionApiKey =
    getString(settings.evolutionApiKey) ||
    getString(process.env[`${envPrefix}_EVOLUTION_API_KEY`]) ||
    getString(process.env.EVOLUTION_API_KEY);
  const evolutionInstance =
    getString(settings.evolutionInstance) ||
    getString(process.env[`${envPrefix}_EVOLUTION_INSTANCE`]) ||
    getString(process.env.EVOLUTION_INSTANCE);

  const requiresChatwoot = requirement === 'chatwoot' || requirement === 'all';
  const requiresEvolution = requirement === 'evolution' || requirement === 'all';

  if (requiresChatwoot && (!chatwootUrl || !chatwootAccountId || !chatwootInboxId || !chatwootApiToken)) {
    return {
      ok: false,
      error:
        'Configuração incompleta do Chatwoot para este tenant. Defina chatwootUrl, chatwootAccountId, chatwootInboxId e chatwootApiToken.',
    };
  }

  if (requiresEvolution && (!evolutionUrl || !evolutionApiKey || !evolutionInstance)) {
    return {
      ok: false,
      error: 'Configuração incompleta da Evolution para este tenant. Defina evolutionUrl, evolutionApiKey e evolutionInstance.',
    };
  }

  const evolutionSendPathRaw = getString(settings.evolutionSendPath) || '/message/sendText/{instance}';
  const evolutionSendPath = evolutionSendPathRaw.includes('{instance}')
    ? evolutionSendPathRaw
    : `${evolutionSendPathRaw.replace(/\/+$/, '')}/{instance}`;

  return {
    ok: true,
    config: {
      tenantSlug,
      chatwootUrl,
      chatwootAccountId,
      chatwootInboxId,
      chatwootApiToken,
      chatwootAgentEmail: getString(settings.chatwootAgentEmail) || null,
      chatwootWebhookSecret:
        getString(settings.chatwootWebhookSecret) ||
        getString(process.env[`${envPrefix}_CHATWOOT_WEBHOOK_SECRET`]) ||
        getString(process.env.CHATWOOT_WEBHOOK_SECRET) ||
        null,
      evolutionUrl,
      evolutionApiKey,
      evolutionInstance,
      evolutionSendPath,
      evolutionWebhookSecret:
        getString(settings.evolutionWebhookSecret) ||
        getString(process.env[`${envPrefix}_EVOLUTION_WEBHOOK_SECRET`]) ||
        getString(process.env.EVOLUTION_WEBHOOK_SECRET) ||
        null,
    },
  };
};

export const validateWebhookSecret = (
  expectedSecret: string | null,
  receivedSecret: string | null,
): { ok: true } | { ok: false; error: string } => {
  if (!expectedSecret) {
    return { ok: true };
  }

  if (receivedSecret && receivedSecret === expectedSecret) {
    return { ok: true };
  }

  return {
    ok: false,
    error: 'Webhook não autorizado para este tenant.',
  };
};

const extractMessageText = (payload: GenericObject | null): string => {
  if (!payload) {
    return '';
  }

  const conversation = getString(payload.conversation);
  if (conversation) return conversation;

  const extendedText = getString(asObject(payload.extendedTextMessage)?.text);
  if (extendedText) return extendedText;

  const imageCaption = getString(asObject(payload.imageMessage)?.caption);
  if (imageCaption) return imageCaption;

  const videoCaption = getString(asObject(payload.videoMessage)?.caption);
  if (videoCaption) return videoCaption;

  const documentCaption = getString(asObject(payload.documentMessage)?.caption);
  if (documentCaption) return documentCaption;

  return '';
};

type EvolutionIncomingPayload = {
  messageId: string | null;
  phone: string;
  name: string;
  text: string;
};

const extractEvolutionIncomingPayload = (payload: unknown): EvolutionIncomingPayload | null => {
  const root = asObject(payload);
  if (!root) return null;

  const data = asObject(root.data) || root;
  const firstDataMessage = asObject(asArray(data.messages)[0]);
  const messageNode = firstDataMessage || data;
  const keyNode = asObject(messageNode.key) || asObject(data.key) || asObject(root.key);

  const remoteJid =
    getString(keyNode?.remoteJid) ||
    getString(messageNode.remoteJid) ||
    getString(data.remoteJid) ||
    getString(root.remoteJid) ||
    getString(root.from);

  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
    return null;
  }

  const fromMe = Boolean(keyNode?.fromMe || messageNode.fromMe || data.fromMe || root.fromMe);
  if (fromMe) {
    return null;
  }

  const messagePayload = asObject(messageNode.message) || asObject(data.message) || asObject(root.message);
  const text =
    extractMessageText(messagePayload) ||
    getString(messageNode.text) ||
    getString(data.text) ||
    getString(asObject(root.payload)?.text);

  if (!text) {
    return null;
  }

  const phone = normalizeWhatsappPhone(remoteJid);
  if (!phone) {
    return null;
  }

  const name = getString(messageNode.pushName) || getString(data.pushName) || getString(root.pushName) || phone;
  const messageId = getString(keyNode?.id) || getString(messageNode.id) || getString(data.id) || null;

  return {
    messageId,
    phone,
    name,
    text,
  };
};

const chatwootRequest = async (
  config: TenantBridgeConfig,
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

  const rawBody = await response.text();
  let body: GenericObject = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as GenericObject;
    } catch {
      body = {};
    }
  }

  if (!response.ok) {
    const message = getString(body.message || body.error) || rawBody || `Erro Chatwoot ${response.status}`;
    throw new Error(message);
  }

  return body;
};

const getChatwootContactId = async (config: TenantBridgeConfig, phone: string, name: string): Promise<number> => {
  const search = await chatwootRequest(
    config,
    `/api/v1/accounts/${config.chatwootAccountId}/contacts/search?q=${encodeURIComponent(phone)}`,
    { method: 'GET' },
  );

  const searchPayload = asArray(search.payload);
  const found = searchPayload
    .map((item) => asObject(item))
    .find((item) => item && normalizeChatwootPhone(getString(item.phone_number)) === phone);

  const foundId = getPositiveInt(found?.id);
  if (foundId) {
    return foundId;
  }

  const created = await chatwootRequest(config, `/api/v1/accounts/${config.chatwootAccountId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      inbox_id: config.chatwootInboxId,
      name,
      phone_number: normalizeWhatsappPhoneWithPlus(phone),
      identifier: `${config.tenantSlug}:${phone}`,
    }),
  });

  const createdPayload = asObject(created.payload);
  const createdContact = asObject(createdPayload?.contact) || createdPayload || created;
  const createdId = getPositiveInt(createdContact.id);
  if (!createdId) {
    throw new Error('Não foi possível identificar o contato no Chatwoot.');
  }

  return createdId;
};

const getChatwootConversationId = async (
  config: TenantBridgeConfig,
  contactId: number,
  sourceId: string,
): Promise<number> => {
  const listed = await chatwootRequest(
    config,
    `/api/v1/accounts/${config.chatwootAccountId}/contacts/${contactId}/conversations`,
    { method: 'GET' },
  );

  const conversationList = asArray(listed.payload)
    .map((item) => asObject(item))
    .filter((item): item is GenericObject => Boolean(item));

  const existing = conversationList.find((conversation) => getPositiveInt(conversation.inbox_id) === config.chatwootInboxId);
  const existingId = getPositiveInt(existing?.id);
  if (existingId) {
    return existingId;
  }

  const created = await chatwootRequest(config, `/api/v1/accounts/${config.chatwootAccountId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({
      source_id: sourceId,
      inbox_id: config.chatwootInboxId,
      contact_id: contactId,
      status: 'open',
    }),
  });

  const createdId = getPositiveInt((asObject(created.payload) || created).id);
  if (!createdId) {
    throw new Error('Não foi possível identificar a conversa no Chatwoot.');
  }

  return createdId;
};

const pushIncomingMessageToChatwoot = async (
  config: TenantBridgeConfig,
  conversationId: number,
  text: string,
  sourceMessageId: string | null,
): Promise<void> => {
  await chatwootRequest(
    config,
    `/api/v1/accounts/${config.chatwootAccountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: text,
        message_type: 'incoming',
        private: false,
        source_id: sourceMessageId || undefined,
      }),
    },
  );
};

const buildEvolutionSendUrl = (config: TenantBridgeConfig, instanceName: string): string => {
  const dynamicPath = config.evolutionSendPath.replace('{instance}', encodeURIComponent(instanceName));
  return `${config.evolutionUrl}${withLeadingSlash(dynamicPath)}`;
};

const sendOutgoingMessageToEvolution = async (config: TenantBridgeConfig, phone: string, text: string): Promise<void> => {
  const instanceRows = await fetchEvolutionInstances(config.evolutionUrl, config.evolutionApiKey);
  const resolvedInstance = resolveEvolutionInstance(instanceRows, config.evolutionInstance);
  if (!resolvedInstance.row) {
    throw new Error('A instancia configurada nao foi localizada na Evolution.');
  }

  const url = buildEvolutionSendUrl(config, resolvedInstance.instanceName);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.evolutionApiKey,
      Authorization: `Bearer ${config.evolutionApiKey}`,
    },
    body: JSON.stringify({
      number: phone,
      text,
    }),
  });

  if (!response.ok) {
    const rawBody = await response.text();
    throw new Error(`Falha no envio via Evolution (${response.status}): ${rawBody || 'sem detalhes'}`);
  }
};

type ChatwootOutgoingPayload = {
  messageId: string | null;
  phone: string;
  text: string;
};

const extractChatwootOutgoingPayload = (payload: unknown): ChatwootOutgoingPayload | null => {
  const root = asObject(payload);
  if (!root) {
    return null;
  }

  const event = getString(root.event).toLowerCase();
  if (event !== 'message_created' && event !== 'message_updated') {
    return null;
  }

  const messageType = getString(root.message_type).toLowerCase();
  if (messageType && messageType !== 'outgoing') {
    return null;
  }

  if (root.private === true) {
    return null;
  }

  const text = getString(root.content);
  if (!text) {
    return null;
  }

  const conversation = asObject(root.conversation);
  const contactInbox = asObject(conversation?.contact_inbox);
  const conversationMeta = asObject(conversation?.meta);
  const senderMeta = asObject(conversationMeta?.sender);
  const contactMeta = asObject(conversation?.contact);

  const phoneCandidate =
    getString(contactInbox?.source_id) ||
    getString(contactMeta?.phone_number) ||
    getString(senderMeta?.phone_number) ||
    getString(root.phone_number);

  const phone = normalizeWhatsappPhone(phoneCandidate);
  if (!phone) {
    return null;
  }

  const messageId = getString(root.id) || getString(root.source_id) || null;

  return {
    messageId,
    phone,
    text,
  };
};

export const forwardEvolutionInboundToChatwoot = async (
  config: TenantBridgeConfig,
  payload: unknown,
): Promise<BridgeResult> => {
  const incoming = extractEvolutionIncomingPayload(payload);
  if (!incoming) {
    return { delivered: false, reason: 'Evento ignorado (sem mensagem inbound válida).' };
  }

  if (alreadyProcessedWebhookId(`evolution:${config.tenantSlug}`, incoming.messageId)) {
    return { delivered: false, reason: 'Evento duplicado da Evolution.' };
  }

  const contactId = await getChatwootContactId(config, incoming.phone, incoming.name);
  const conversationId = await getChatwootConversationId(config, contactId, incoming.phone);
  await pushIncomingMessageToChatwoot(config, conversationId, incoming.text, incoming.messageId);

  return { delivered: true };
};

export const forwardChatwootOutgoingToEvolution = async (
  config: TenantBridgeConfig,
  payload: unknown,
): Promise<BridgeResult> => {
  const outgoing = extractChatwootOutgoingPayload(payload);
  if (!outgoing) {
    return { delivered: false, reason: 'Evento ignorado (não é mensagem outbound).' };
  }

  if (alreadyProcessedWebhookId(`chatwoot:${config.tenantSlug}`, outgoing.messageId)) {
    return { delivered: false, reason: 'Evento duplicado do Chatwoot.' };
  }

  await sendOutgoingMessageToEvolution(config, outgoing.phone, outgoing.text);
  return { delivered: true };
};
