import type {
  AdminBooking,
  AdminInboxConversationPanel,
  AdminInboxConversation,
  AdminInboxMessage,
} from '../types';
import { requestAdmin, withTenantQuery, API_BASE } from './apiCore';

export type AdminInboxContact = { id: number; phone: string; name: string };

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

export const deleteConversationForAdmin = async (
  conversationId: number,
  adminKey: string,
): Promise<void> => {
  await requestAdmin<{ message: string }>(`/api/admin/inbox/conversations/${conversationId}`, adminKey, {
    method: 'DELETE',
  });
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
