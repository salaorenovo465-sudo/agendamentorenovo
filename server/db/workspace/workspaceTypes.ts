export type ConversationOperationalStatus = 'open' | 'pending' | 'resolved';

export type ConversationMeta = {
  threadId: number;
  assigneeId: string | null;
  status: ConversationOperationalStatus;
  labels: string[];
  updatedAt: string;
};

export type InternalNote = {
  id: number;
  threadId: number;
  content: string;
  author: string | null;
  createdAt: string;
};

export type WhatsappSyncStatus = 'idle' | 'running' | 'error';

export type WhatsappSyncState = {
  id: number;
  scope: string;
  source: string;
  cursor: string | null;
  status: WhatsappSyncStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type WhatsappContactMap = {
  id: number;
  threadId: number | null;
  phone: string;
  waJid: string | null;
  evolutionContactId: string | null;
  chatwootContactId: number | null;
  crmClientId: number | null;
  pushName: string | null;
  avatarUrl: string | null;
  lastSource: string;
  lastSyncedAt: string;
  updatedAt: string;
};

export type WhatsappConversationMap = {
  id: number;
  threadId: number;
  waJid: string | null;
  evolutionChatId: string | null;
  chatwootConversationId: number | null;
  lastSource: string;
  lastSyncedAt: string;
  updatedAt: string;
};
