import '../loadEnv';
import { whatsappWorkspaceStore } from '../db/whatsappWorkspaceStore';
import { workbenchStore } from '../db/workbenchStore';
import { asObject, getString } from '../utils/helpers';
import { normalizeWhatsappPhone, whatsappJidToPhone } from '../utils/phone';
import { resolveTenantBridgeConfig } from './chatwootEvolutionBridge';
import { evolutionApiRequest, fetchEvolutionInstances, resolveEvolutionInstance } from './evolutionApiService';
import {
  configureEvolutionWebhook,
  createEvolutionInstance,
  getEvolutionInstanceStatus,
  logoutEvolutionInstance,
  refreshEvolutionInstanceQr,
  type EvolutionInstanceStatus,
} from './evolutionInstanceService';
import {
  sendEvolutionAttachmentToCustomer,
  sendEvolutionMessageToCustomer,
  type EvolutionAttachmentInput,
} from './evolutionIntegrationService';
import { publishMessageStatus, publishWhatsappStateChanged } from './inboxRealtime';
import {
  type OutgoingDeliveryStatus,
  setOutgoingDeliveryStatus,
} from './whatsappDeliveryStatus';

export type WhatsappAttachmentInput = EvolutionAttachmentInput;

type WhatsappConnectionState = 'disabled' | 'disconnected' | 'connecting' | 'qr' | 'connected';

type StoredWhatsappState = {
  connectionState: WhatsappConnectionState;
  qr: string | null;
  qrDataUrl: string | null;
  connectedJid: string | null;
  lastError: string | null;
  lastUpdateAt: string;
};

const WHATSAPP_FEATURE_ENABLED = process.env.WHATSAPP_FEATURE_ENABLED !== 'false';
const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'renovo').trim().toLowerCase();
const MASTER_SALON_WHATSAPP = normalizeWhatsappPhone(process.env.SALON_WHATSAPP || '5571999542265');
const SALON_WHATSAPP_LIST = MASTER_SALON_WHATSAPP ? [MASTER_SALON_WHATSAPP] : [];

const state: StoredWhatsappState = {
  connectionState: WHATSAPP_FEATURE_ENABLED ? 'disconnected' : 'disabled',
  qr: null,
  qrDataUrl: null,
  connectedJid: null,
  lastError: null,
  lastUpdateAt: new Date().toISOString(),
};

type ContactAvatarCacheEntry = {
  url: string | null;
  expiresAt: number;
};

const CONTACT_AVATAR_TTL_MS = 1000 * 60 * 15;
const contactAvatarCache = new Map<string, ContactAvatarCacheEntry>();

const setState = (patch: Partial<StoredWhatsappState>): void => {
  const prevState = state.connectionState;
  const prevQr = state.qrDataUrl;
  Object.assign(state, patch, { lastUpdateAt: new Date().toISOString() });
  if (state.connectionState !== prevState || state.qrDataUrl !== prevQr) {
    publishWhatsappStateChanged();
  }
};

const mapEvolutionStatusToInternal = (evo: EvolutionInstanceStatus): Partial<StoredWhatsappState> => {
  if (!WHATSAPP_FEATURE_ENABLED || !evo.configured) {
    return {
      connectionState: 'disabled',
      qr: null,
      qrDataUrl: null,
      lastError: evo.lastError || 'Evolution API nao configurada.',
    };
  }

  if (evo.connected || evo.connectionState === 'open') {
    return {
      connectionState: 'connected',
      qr: null,
      qrDataUrl: null,
      lastError: null,
    };
  }

  if (evo.qrDataUrl) {
    return {
      connectionState: 'qr',
      qr: evo.qrDataUrl,
      qrDataUrl: evo.qrDataUrl,
      lastError: evo.lastError || null,
    };
  }

  if (evo.connectionState === 'connecting') {
    return {
      connectionState: 'connecting',
      qr: null,
      qrDataUrl: null,
      lastError: evo.lastError || null,
    };
  }

  return {
    connectionState: 'disconnected',
    qr: null,
    qrDataUrl: null,
    lastError: evo.lastError || null,
  };
};

export const syncWhatsappStatusFromEvolution = async (
  tenantSlug?: string,
  options: { includeQr?: boolean } = {},
) => {
  if (!WHATSAPP_FEATURE_ENABLED) {
    setState({ connectionState: 'disabled', lastError: 'WHATSAPP_FEATURE_ENABLED=false' });
    return getWhatsappStatus();
  }

  try {
    const evoStatus = await getEvolutionInstanceStatus(tenantSlug || DEFAULT_TENANT_SLUG, options);
    setState(mapEvolutionStatusToInternal(evoStatus));
  } catch (error) {
    setState({
      connectionState: 'disconnected',
      lastError: error instanceof Error ? error.message : 'Erro ao consultar Evolution API.',
    });
  }

  return getWhatsappStatus();
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

export const connectWhatsapp = async (tenantSlug?: string): Promise<void> => {
  if (!WHATSAPP_FEATURE_ENABLED) {
    setState({ connectionState: 'disabled', lastError: 'WHATSAPP_FEATURE_ENABLED=false' });
    return;
  }

  const targetTenant = tenantSlug || DEFAULT_TENANT_SLUG;
  const current = await getEvolutionInstanceStatus(targetTenant, { includeQr: true });
  const finalStatus = current.exists
    ? current
    : await createEvolutionInstance(targetTenant);

  setState(mapEvolutionStatusToInternal(finalStatus));
};

export const disconnectWhatsapp = async (tenantSlug?: string): Promise<void> => {
  const targetTenant = tenantSlug || DEFAULT_TENANT_SLUG;
  const evoStatus = await logoutEvolutionInstance(targetTenant);
  setState(mapEvolutionStatusToInternal(evoStatus));
};

export const reconnectWhatsapp = async (tenantSlug?: string): Promise<void> => {
  const targetTenant = tenantSlug || DEFAULT_TENANT_SLUG;
  const evoStatus = await refreshEvolutionInstanceQr(targetTenant);
  setState(mapEvolutionStatusToInternal(evoStatus));
};

export const logoutWhatsapp = async (tenantSlug?: string): Promise<void> => {
  const targetTenant = tenantSlug || DEFAULT_TENANT_SLUG;
  const evoStatus = await logoutEvolutionInstance(targetTenant);
  setState(mapEvolutionStatusToInternal(evoStatus));
};

export const initializeWhatsapp = async (): Promise<void> => {
  await syncWhatsappStatusFromEvolution(DEFAULT_TENANT_SLUG, { includeQr: false });
  void configureEvolutionWebhook(DEFAULT_TENANT_SLUG);
};

export const getWhatsappContactAvatarUrlCached = (phone: string): string | null => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) return null;
  const cached = contactAvatarCache.get(normalizedPhone);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  return null;
};

export const getWhatsappContactAvatarUrl = async (phone: string, tenantSlug?: string): Promise<string | null> => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    return null;
  }

  const cached = contactAvatarCache.get(normalizedPhone);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const mapped = await whatsappWorkspaceStore.getContactMapByPhone(normalizedPhone);
    if (mapped?.avatarUrl) {
      contactAvatarCache.set(normalizedPhone, {
        url: mapped.avatarUrl,
        expiresAt: Date.now() + CONTACT_AVATAR_TTL_MS,
      });
      return mapped.avatarUrl;
    }
  } catch {
    // fallback to Evolution API
  }

  try {
    const targetTenant = (tenantSlug || DEFAULT_TENANT_SLUG).trim().toLowerCase();
    const settings = workbenchStore.isEnabled() ? await workbenchStore.getSettings(targetTenant) : {};
    const resolved = resolveTenantBridgeConfig(targetTenant, settings, 'evolution');
    if (resolved.ok === true) {
      const instances = await fetchEvolutionInstances(resolved.config.evolutionUrl, resolved.config.evolutionApiKey);
      const match = resolveEvolutionInstance(instances, resolved.config.evolutionInstance);
      const instanceName = match.instanceName || resolved.config.evolutionInstance;
      const payload = await evolutionApiRequest(
        resolved.config.evolutionUrl,
        resolved.config.evolutionApiKey,
        'POST',
        `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
        { number: normalizedPhone },
      );
      const root = asObject(payload);
      const avatarUrl =
        getString(root?.profilePictureUrl) ||
        getString(root?.profilePicUrl) ||
        getString(root?.picture) ||
        null;

      contactAvatarCache.set(normalizedPhone, {
        url: avatarUrl,
        expiresAt: Date.now() + (avatarUrl ? CONTACT_AVATAR_TTL_MS : 1000 * 60 * 3),
      });
      return avatarUrl;
    }
  } catch {
    // ignore avatar resolution errors
  }

  contactAvatarCache.set(normalizedPhone, {
    url: null,
    expiresAt: Date.now() + 1000 * 60 * 3,
  });
  return null;
};

export const sendWhatsappMessageToCustomer = async (
  phone: string,
  text: string,
  tenantSlug?: string,
): Promise<string | null> => {
  const providerMessageId = await sendEvolutionMessageToCustomer(tenantSlug || DEFAULT_TENANT_SLUG, phone, text);
  applyProviderStatus(providerMessageId, 'sent');
  return providerMessageId;
};

export const sendWhatsappAttachmentToCustomer = async (
  phone: string,
  attachment: WhatsappAttachmentInput,
  tenantSlug?: string,
): Promise<string | null> => {
  const providerMessageId = await sendEvolutionAttachmentToCustomer(
    tenantSlug || DEFAULT_TENANT_SLUG,
    phone,
    attachment,
  );
  applyProviderStatus(providerMessageId, 'sent');
  return providerMessageId;
};

export const sendWhatsappMessageToSalon = async (text: string, tenantSlug?: string): Promise<void> => {
  if (SALON_WHATSAPP_LIST.length === 0) {
    throw new Error('Nenhum numero do salao configurado.');
  }

  for (const phone of SALON_WHATSAPP_LIST) {
    await sendWhatsappMessageToCustomer(phone, text, tenantSlug);
  }
};

export const getWhatsappStatus = () => ({
  provider: 'evolution' as const,
  enabled: WHATSAPP_FEATURE_ENABLED,
  connectionState: state.connectionState,
  connected: state.connectionState === 'connected',
  connectedJid: state.connectedJid,
  connectedPhone: state.connectedJid ? whatsappJidToPhone(state.connectedJid) : null,
  qrAvailable: Boolean(state.qrDataUrl || state.qr),
  qrDataUrl: state.qrDataUrl,
  salonNumbersConfigured: SALON_WHATSAPP_LIST.length > 0,
  lastError: state.lastError,
  lastUpdateAt: state.lastUpdateAt,
});

export const whatsappConfig = {
  featureEnabled: WHATSAPP_FEATURE_ENABLED,
  isConfigured: WHATSAPP_FEATURE_ENABLED,
};
