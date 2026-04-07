import type {
  AdminEvolutionInstanceStatus,
  AdminBooking,
  AdminConversationOperational,
  AdminConversationOperationalStatus,
  AdminInternalNote,
  AdminInboxConversation,
} from '../types';
import { requestAdmin, withTenantQuery } from './apiCore';

export type AdminWhatsappStatus = {
  provider: 'baileys';
  enabled: boolean;
  connectionState: 'disabled' | 'disconnected' | 'connecting' | 'qr' | 'connected';
  connected: boolean;
  connectedJid: string | null;
  connectedPhone: string | null;
  qrAvailable: boolean;
  qrDataUrl: string | null;
  salonNumbersConfigured: boolean;
  lastError: string | null;
  lastUpdateAt: string;
};

export const assignWhatsappConversationForAdmin = async (
  conversationId: number,
  assigneeId: string | null,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminConversationOperational> => {
  const response = await requestAdmin<{ operational: AdminConversationOperational }>(
    withTenantQuery(`/api/whatsapp/conversations/${conversationId}/assign`, tenantSlug),
    adminKey,
    {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId }),
    },
  );

  return response.operational;
};

export const updateWhatsappConversationStatusForAdmin = async (
  conversationId: number,
  status: AdminConversationOperationalStatus,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminConversationOperational> => {
  const response = await requestAdmin<{ operational: AdminConversationOperational }>(
    withTenantQuery(`/api/whatsapp/conversations/${conversationId}/status`, tenantSlug),
    adminKey,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );

  return response.operational;
};

export const updateWhatsappConversationTagsForAdmin = async (
  conversationId: number,
  labels: string[],
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminConversationOperational> => {
  const response = await requestAdmin<{ operational: AdminConversationOperational }>(
    withTenantQuery(`/api/whatsapp/conversations/${conversationId}/tags`, tenantSlug),
    adminKey,
    {
      method: 'PATCH',
      body: JSON.stringify({ labels }),
    },
  );

  return response.operational;
};

export const addWhatsappConversationNoteForAdmin = async (
  conversationId: number,
  content: string,
  author: string | null,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminInternalNote> => {
  const response = await requestAdmin<{ note: AdminInternalNote }>(
    withTenantQuery(`/api/whatsapp/conversations/${conversationId}/notes`, tenantSlug),
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify({ content, author }),
    },
  );

  return response.note;
};

export const searchWhatsappConversationsForAdmin = async (
  term: string,
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminInboxConversation[]> => {
  const response = await requestAdmin<{
    conversations: Array<{
      id: number;
      phone: string;
      contactName: string | null;
      lastMessage: string;
      unreadCount: number;
      updatedAt: string;
      avatarUrl: string | null;
      operational?: AdminConversationOperational;
      crm?: {
        pendingBookingsCount?: number;
        latestBookingStatus?: AdminBooking['status'] | null;
      };
    }>;
  }>(withTenantQuery(`/api/whatsapp/search?q=${encodeURIComponent(term)}`, tenantSlug), adminKey, { method: 'GET' });

  return response.conversations.map((conversation) => ({
    id: conversation.id,
    contactName: conversation.contactName || conversation.phone,
    phone: conversation.phone,
    lastMessage: conversation.lastMessage,
    unreadCount: conversation.unreadCount,
    updatedAt: conversation.updatedAt,
    pendingBookingsCount: conversation.crm?.pendingBookingsCount || 0,
    latestBookingStatus: conversation.crm?.latestBookingStatus || null,
    avatarUrl: conversation.avatarUrl || null,
    assigneeId: conversation.operational?.assigneeId || null,
    conversationStatus: conversation.operational?.status || 'open',
    labels: conversation.operational?.labels || [],
    operational: conversation.operational,
  }));
};

export const runWhatsappSyncForAdmin = async (adminKey: string, tenantSlug?: string): Promise<{
  ok: boolean;
  syncResult?: {
    ok: boolean;
    tenantSlug: string;
    contactsSynced: number;
    chatsSynced: number;
    issues: string[];
  };
}> => requestAdmin<{ ok: boolean; syncResult?: { ok: boolean; tenantSlug: string; contactsSynced: number; chatsSynced: number; issues: string[] } }>(
  withTenantQuery('/api/whatsapp/sync', tenantSlug),
  adminKey,
  { method: 'POST' },
);

export const getWhatsappInstanceStatusForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminEvolutionInstanceStatus> => {
  const response = await requestAdmin<{ status: AdminEvolutionInstanceStatus }>(
    withTenantQuery('/api/whatsapp/instance/status', tenantSlug),
    adminKey,
    { method: 'GET' },
  );

  return response.status;
};

export const createWhatsappInstanceForAdmin = async (
  adminKey: string,
  tenantSlug: string,
  companyName: string,
): Promise<AdminEvolutionInstanceStatus> => {
  const response = await requestAdmin<{ status: AdminEvolutionInstanceStatus }>(
    withTenantQuery('/api/whatsapp/instance/create', tenantSlug),
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify({ companyName }),
    },
  );

  return response.status;
};

export const getWhatsappInstanceQrForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminEvolutionInstanceStatus> => {
  const response = await requestAdmin<{ status: AdminEvolutionInstanceStatus }>(
    withTenantQuery('/api/whatsapp/instance/qr', tenantSlug),
    adminKey,
    { method: 'GET' },
  );

  return response.status;
};

export const refreshWhatsappInstanceQrForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
): Promise<AdminEvolutionInstanceStatus> => {
  const response = await requestAdmin<{ status: AdminEvolutionInstanceStatus }>(
    withTenantQuery('/api/whatsapp/instance/refresh-qr', tenantSlug),
    adminKey,
    { method: 'POST' },
  );

  return response.status;
};

export const getWhatsappStatusForAdmin = async (adminKey: string): Promise<AdminWhatsappStatus> =>
  requestAdmin<AdminWhatsappStatus>('/api/admin/whatsapp/status', adminKey, { method: 'GET' });

export const connectWhatsappForAdmin = async (adminKey: string): Promise<AdminWhatsappStatus> => {
  const response = await requestAdmin<{ status: AdminWhatsappStatus }>('/api/admin/whatsapp/connect', adminKey, {
    method: 'POST',
  });

  return response.status;
};

export const disconnectWhatsappForAdmin = async (adminKey: string): Promise<AdminWhatsappStatus> => {
  const response = await requestAdmin<{ status: AdminWhatsappStatus }>('/api/admin/whatsapp/disconnect', adminKey, {
    method: 'POST',
  });

  return response.status;
};

export const reconnectWhatsappForAdmin = async (adminKey: string): Promise<AdminWhatsappStatus> => {
  const response = await requestAdmin<{ status: AdminWhatsappStatus }>('/api/admin/whatsapp/reconnect', adminKey, {
    method: 'POST',
  });

  return response.status;
};

export const logoutWhatsappForAdmin = async (adminKey: string): Promise<AdminWhatsappStatus> => {
  const response = await requestAdmin<{ status: AdminWhatsappStatus }>('/api/admin/whatsapp/logout', adminKey, {
    method: 'POST',
  });

  return response.status;
};
