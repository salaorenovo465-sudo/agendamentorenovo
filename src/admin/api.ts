import type {
  AdminEvolutionInstanceStatus,
  AdminTenant,
  AdminSettings,
  AdminBooking,
  AdminConversationOperational,
  AdminConversationOperationalStatus,
  AdminInboxConversationPanel,
  AdminInboxConversation,
  AdminInboxMessage,
  AdminInternalNote,
  WorkbenchEntity,
  WorkbenchOverview,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const ADMIN_KEY_STORAGE = 'renovo_admin_api_key';
export const ADMIN_AUTH_ERROR_EVENT = 'renovo-admin-auth-error';
export const ADMIN_TENANT_STORAGE = 'renovo_admin_tenant';

const withTenantQuery = (path: string, tenantSlug?: string): string => {
  const tenant = (tenantSlug || '').trim().toLowerCase();
  if (!tenant) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}tenant=${encodeURIComponent(tenant)}`;
};

const requestAdmin = async <T>(
  path: string,
  adminKey: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // noop
    }

    if (response.status === 401 && typeof window !== 'undefined') {
      window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      window.dispatchEvent(new CustomEvent(ADMIN_AUTH_ERROR_EVENT, { detail: { message } }));
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
};

export const listAdminBookings = async (date: string, adminKey: string, endDate?: string): Promise<AdminBooking[]> => {
  const url = endDate
    ? `/api/admin/bookings?date=${date}&endDate=${endDate}`
    : `/api/admin/bookings?date=${date}`;
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(url, adminKey);
  return response.bookings;
};

export const deleteAdminBooking = async (id: number, adminKey: string): Promise<void> => {
  await requestAdmin<{ message: string }>(`/api/admin/bookings/${id}`, adminKey, {
    method: 'DELETE',
  });
};

export const completeAdminBooking = async (id: number, adminKey: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/complete`, adminKey, {
    method: 'POST',
  });
  return response.booking;
};

export const confirmAdminBooking = async (id: number, adminKey: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/confirm`, adminKey, {
    method: 'POST',
  });
  return response.booking;
};

export const rejectAdminBooking = async (id: number, reason: string, adminKey: string): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/reject`, adminKey, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return response.booking;
};

export const rescheduleAdminBooking = async (
  id: number,
  date: string,
  time: string,
  adminKey: string,
): Promise<AdminBooking> => {
  const response = await requestAdmin<{ booking: AdminBooking }>(`/api/admin/bookings/${id}/reschedule`, adminKey, {
    method: 'POST',
    body: JSON.stringify({ date, time }),
  });
  return response.booking;
};

export const listInboxConversationsForAdmin = async (adminKey: string, _tenantSlug?: string): Promise<AdminInboxConversation[]> => {
  const response = await requestAdmin<{
    conversations: Array<{
      id: number;
      phone: string;
      contactName: string | null;
      lastMessage: string;
      unreadCount: number;
      updatedAt: string;
      avatarUrl: string | null;
      pendingBookingsCount?: number;
      latestBookingStatus?: AdminBooking['status'] | null;
    }>;
  }>(
    '/api/admin/inbox/conversations',
    adminKey,
    { method: 'GET' },
  );

  return response.conversations.map((conversation) => ({
    id: conversation.id,
    contactName: conversation.contactName || conversation.phone,
    phone: conversation.phone,
    lastMessage: conversation.lastMessage,
    unreadCount: conversation.unreadCount,
    updatedAt: conversation.updatedAt,
    pendingBookingsCount: conversation.pendingBookingsCount || 0,
    latestBookingStatus: conversation.latestBookingStatus || null,
    avatarUrl: conversation.avatarUrl || null,
    assigneeId: (conversation as Record<string, unknown>).assigneeId as string | null ?? null,
    conversationStatus: ((conversation as Record<string, unknown>).conversationStatus as 'open' | 'pending' | 'resolved') || 'open',
    labels: ((conversation as Record<string, unknown>).labels as string[]) || [],
    operational: (conversation as Record<string, unknown>).operational as AdminInboxConversationPanel['operational'] ?? undefined,
  }));
};

export type AdminInboxContact = { id: number; phone: string; name: string };

export const listInboxContactsForAdmin = async (adminKey: string, search?: string): Promise<AdminInboxContact[]> => {
  const qs = search ? `?q=${encodeURIComponent(search)}` : '';
  const response = await requestAdmin<{ contacts: AdminInboxContact[] }>(
    `/api/admin/inbox/contacts${qs}`,
    adminKey,
    { method: 'GET' },
  );
  return response.contacts;
};

export const fetchInboxAvatarsForAdmin = async (
  phones: string[],
  adminKey: string,
): Promise<Record<string, string | null>> => {
  if (phones.length === 0) return {};
  const response = await requestAdmin<{ avatars: Record<string, string | null> }>(
    '/api/admin/inbox/avatars',
    adminKey,
    { method: 'POST', body: JSON.stringify({ phones }) },
  );
  return response.avatars;
};

export const listInboxMessagesForAdmin = async (
  conversationId: number,
  adminKey: string,
  _tenantSlug?: string,
): Promise<AdminInboxMessage[]> => {
  const response = await requestAdmin<{ messages: AdminInboxMessage[] }>(
    `/api/admin/inbox/conversations/${conversationId}/messages`,
    adminKey,
    { method: 'GET' },
  );

  return response.messages;
};

export const getInboxConversationPanelForAdmin = async (
  conversationId: number,
  adminKey: string,
  _tenantSlug?: string,
): Promise<AdminInboxConversationPanel> => {
  const response = await requestAdmin<{
    conversation: {
      id: number;
      phone: string;
      contactName: string | null;
      lastMessage?: string;
      unreadCount: number;
      updatedAt: string;
      avatarUrl: string | null;
      pendingBookingsCount?: number;
      latestBookingStatus?: AdminBooking['status'] | null;
      assigneeId?: string | null;
      conversationStatus?: string;
      labels?: string[];
      operational?: unknown;
    };
    bookings: AdminBooking[];
    notes?: Array<{ id: number; content: string; author: string | null; createdAt: string }>;
    operational?: unknown;
  }>(`/api/admin/inbox/conversations/${conversationId}/panel`, adminKey, {
    method: 'GET',
  });

  return {
    conversation: {
      id: response.conversation.id,
      contactName: response.conversation.contactName || response.conversation.phone,
      phone: response.conversation.phone,
      lastMessage: response.conversation.lastMessage || '',
      unreadCount: response.conversation.unreadCount,
      updatedAt: response.conversation.updatedAt,
      pendingBookingsCount: response.conversation.pendingBookingsCount || 0,
      latestBookingStatus: response.conversation.latestBookingStatus || null,
      avatarUrl: response.conversation.avatarUrl || null,
      assigneeId: response.conversation.assigneeId ?? null,
      conversationStatus: (response.conversation.conversationStatus || 'open') as 'open' | 'pending' | 'resolved',
      labels: response.conversation.labels || [],
      operational: response.conversation.operational as AdminInboxConversationPanel['operational'] ?? undefined,
    },
    bookings: response.bookings || [],
    notes: (response.notes || []).map((n) => ({ ...n, threadId: conversationId })),
    operational: response.operational
      ? (response.operational as AdminInboxConversationPanel['operational'])
      : null,
  };
};

export const sendInboxMessageForAdmin = async (
  conversationId: number,
  content: string,
  adminKey: string,
  _tenantSlug?: string,
): Promise<void> => {
  await requestAdmin<{ message: string }>(`/api/admin/inbox/conversations/${conversationId}/messages`, adminKey, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
};

export const sendInboxAttachmentForAdmin = async (
  conversationId: number,
  payload: {
    attachmentUrl?: string;
    attachmentBase64?: string;
    mimeType?: string;
    fileName?: string;
  },
  caption: string,
  adminKey: string,
  tenantSlug?: string,
): Promise<void> => {
  await requestAdmin<{ message: string }>(withTenantQuery('/api/whatsapp/messages/attachment', tenantSlug), adminKey, {
    method: 'POST',
    body: JSON.stringify({ conversationId, caption, ...payload }),
  });
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

export type AdminInboxRealtimeEvent =
  | {
      type: 'inbox-updated';
      reason: 'message-created' | 'thread-read' | 'thread-updated';
      threadId?: number;
      at: string;
    }
  | {
      type: 'whatsapp-state-changed';
      at: string;
    }
  | {
      type: 'message-status';
      providerMessageId: string;
      status: 'sent' | 'delivered' | 'read';
      at: string;
    }
  | {
      type: 'heartbeat';
      at: string;
    };

const parseSseChunk = (chunk: string): AdminInboxRealtimeEvent[] => {
  const blocks = chunk.split('\n\n');
  const events: AdminInboxRealtimeEvent[] = [];

  blocks.forEach((block) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return;
    }

    const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.replace(/^data:\s*/, ''));
    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines.join('\n');

    try {
      const parsed = JSON.parse(payload) as AdminInboxRealtimeEvent;
      if (parsed && typeof parsed.type === 'string') {
        events.push(parsed);
      }
    } catch {
      // noop
    }
  });

  return events;
};

export const startAdminInboxRealtimeStream = (
  adminKey: string,
  onEvent: (event: AdminInboxRealtimeEvent) => void,
  onError?: (error: unknown) => void,
): (() => void) => {
  let cancelled = false;
  let controller: AbortController | null = null;

  const readStream = async (): Promise<void> => {
    while (!cancelled) {
      controller = new AbortController();

      try {
        const response = await fetch(`${API_BASE}/api/admin/inbox/stream`, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            'x-admin-key': adminKey,
          },
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Erro ${response.status} ao abrir stream do inbox.`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Stream do inbox indisponivel no navegador atual.');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          if (!value) {
            continue;
          }

          buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
          const segments = buffer.split('\n\n');
          buffer = segments.pop() || '';

          segments.forEach((segment) => {
            const events = parseSseChunk(segment);
            events.forEach((event) => onEvent(event));
          });
        }
      } catch (error) {
        if (cancelled) {
          break;
        }

        onError?.(error);
      }

      if (!cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  };

  void readStream();

  return () => {
    cancelled = true;
    controller?.abort();
  };
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

export const deleteConversationForAdmin = async (
  conversationId: number,
  adminKey: string,
): Promise<void> => {
  await requestAdmin<{ message: string }>(`/api/admin/inbox/conversations/${conversationId}`, adminKey, {
    method: 'DELETE',
  });
};

export const getWorkbenchOverviewForAdmin = async (date: string, adminKey: string): Promise<WorkbenchOverview> =>
  requestAdmin<WorkbenchOverview>(`/api/admin/workbench/overview?date=${date}`, adminKey, { method: 'GET' });

export const listWorkbenchEntityForAdmin = async (
  entity: WorkbenchEntity,
  adminKey: string,
): Promise<Record<string, unknown>[]> => {
  const response = await requestAdmin<{ rows: Record<string, unknown>[] }>(`/api/admin/workbench/${entity}`, adminKey, {
    method: 'GET',
  });

  return response.rows;
};

export const createWorkbenchEntityForAdmin = async (
  entity: WorkbenchEntity,
  payload: Record<string, unknown>,
  adminKey: string,
): Promise<Record<string, unknown>> => {
  const response = await requestAdmin<{ row: Record<string, unknown> }>(`/api/admin/workbench/${entity}`, adminKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.row;
};

export const updateWorkbenchEntityForAdmin = async (
  entity: WorkbenchEntity,
  id: number,
  payload: Record<string, unknown>,
  adminKey: string,
): Promise<Record<string, unknown> | null> => {
  const response = await requestAdmin<{ row: Record<string, unknown> | null }>(
    `/api/admin/workbench/${entity}/${id}`,
    adminKey,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );

  return response.row;
};

export const deleteWorkbenchEntityForAdmin = async (entity: WorkbenchEntity, id: number, adminKey: string): Promise<void> => {
  await requestAdmin<{ message: string }>(`/api/admin/workbench/${entity}/${id}`, adminKey, {
    method: 'DELETE',
  });
};

export const convertLeadForAdmin = async (
  leadId: number,
  adminKey: string,
): Promise<{ lead: Record<string, unknown>; client: Record<string, unknown> }> =>
  requestAdmin<{ lead: Record<string, unknown>; client: Record<string, unknown> }>(
    `/api/admin/workbench/leads/${leadId}/convert`,
    adminKey,
    { method: 'POST' },
  );

export const markFinancePaidForAdmin = async (financeId: number, adminKey: string): Promise<Record<string, unknown> | null> => {
  const response = await requestAdmin<{ entry: Record<string, unknown> | null }>(
    `/api/admin/workbench/finance/${financeId}/pay`,
    adminKey,
    { method: 'POST' },
  );

  return response.entry;
};

export const findClientByPhoneForAdmin = async (
  phone: string,
  adminKey: string,
): Promise<Record<string, unknown> | null> => {
  const response = await requestAdmin<{ client: Record<string, unknown> | null }>(
    `/api/admin/workbench/clients/by-phone/${encodeURIComponent(phone)}`,
    adminKey,
    { method: 'GET' },
  );
  return response.client;
};

export const listBookingsByPhoneForAdmin = async (
  phone: string,
  adminKey: string,
): Promise<AdminBooking[]> => {
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(
    `/api/admin/bookings/by-phone/${encodeURIComponent(phone)}`,
    adminKey,
    { method: 'GET' },
  );
  return response.bookings;
};

export const listPendingPaymentBookingsForAdmin = async (
  adminKey: string,
): Promise<AdminBooking[]> => {
  const response = await requestAdmin<{ bookings: AdminBooking[] }>(
    '/api/admin/bookings/pending-payment',
    adminKey,
    { method: 'GET' },
  );
  return response.bookings;
};

export const confirmBookingPaymentForAdmin = async (
  bookingId: number,
  paymentMethod: string,
  adminKey: string,
): Promise<Record<string, unknown>> => {
  const response = await requestAdmin<{ entry: Record<string, unknown> }>(
    '/api/admin/workbench/finance/confirm-booking-payment',
    adminKey,
    {
      method: 'POST',
      body: JSON.stringify({ booking_id: bookingId, payment_method: paymentMethod }),
    },
  );
  return response.entry;
};

export const registerClientForAdmin = async (
  payload: { name: string; phone: string; preferred_service?: string },
  adminKey: string,
): Promise<Record<string, unknown>> => {
  return createWorkbenchEntityForAdmin('clients', {
    name: payload.name,
    phone: payload.phone,
    preferred_service: payload.preferred_service || '',
    status: 'ativo',
    tags: 'whatsapp',
  }, adminKey);
};

export const getAdminSettings = async (adminKey: string, tenantSlug?: string): Promise<AdminSettings> => {
  const response = await requestAdmin<{ settings: AdminSettings }>(
    withTenantQuery('/api/admin/workbench/settings', tenantSlug),
    adminKey,
    { method: 'GET' },
  );
  return response.settings;
};

export const saveAdminSettings = async (settings: AdminSettings, adminKey: string, tenantSlug?: string): Promise<AdminSettings> => {
  const response = await requestAdmin<{ settings: AdminSettings }>(
    withTenantQuery('/api/admin/workbench/settings', tenantSlug),
    adminKey,
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    },
  );

  return response.settings;
};

export const listAdminTenants = async (adminKey: string): Promise<AdminTenant[]> => {
  const response = await requestAdmin<{ tenants: AdminTenant[] }>('/api/admin/workbench/tenants', adminKey, { method: 'GET' });
  return response.tenants;
};

export const createAdminTenant = async (
  payload: { slug: string; name: string; active?: boolean },
  adminKey: string,
): Promise<AdminTenant> => {
  const response = await requestAdmin<{ tenant: AdminTenant }>('/api/admin/workbench/tenants', adminKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.tenant;
};

export const updateAdminTenant = async (
  slug: string,
  payload: { name?: string; active?: boolean },
  adminKey: string,
): Promise<AdminTenant> => {
  const response = await requestAdmin<{ tenant: AdminTenant }>(`/api/admin/workbench/tenants/${encodeURIComponent(slug)}`, adminKey, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.tenant;
};
