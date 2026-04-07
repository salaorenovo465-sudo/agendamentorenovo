import type { AdminInboxConversation, AdminInboxMessage } from '../types';
import type { WAContact, WAMessage, PendingAttachment } from './wa-types';

/* ── Date / time helpers ── */

export const timeLabel = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const getDayKey = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const getDayLabel = (dayKey: string): string => {
  const today = new Date();
  const todayKey = today.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  if (dayKey === todayKey) return 'Hoje';

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  if (dayKey === yesterdayKey) return 'Ontem';

  return dayKey;
};

export const formatDateTimeLabel = (date: string, time: string): string => {
  if (!date) return time;
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return `${date} ${time}`.trim();
  return `${day}/${month}/${year} ${time}`.trim();
};

export const noteTimeLabel = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/* ── Mappers ── */

export const mapConversationToContact = (conversation: AdminInboxConversation, online: boolean): WAContact => ({
  id: String(conversation.id),
  name: conversation.contactName || conversation.phone,
  phone: conversation.phone,
  lastMessage: conversation.lastMessage || 'Sem mensagem',
  lastTime: timeLabel(conversation.updatedAt),
  unread: conversation.unreadCount,
  online,
  avatarUrl: conversation.avatarUrl || null,
  pendingBookingsCount: Number(conversation.pendingBookingsCount || 0),
  latestBookingStatus: conversation.latestBookingStatus || null,
  assigneeId: conversation.assigneeId || null,
  conversationStatus: conversation.conversationStatus || 'open',
  labels: conversation.labels || [],
});

export const mapMessages = (messages: AdminInboxMessage[]): WAMessage[] =>
  messages.map((message) => ({
    id: String(message.id),
    from: message.direction === 'outgoing' ? 'me' : message.direction === 'incoming' ? 'them' : 'system',
    text: message.content,
    time: message.createdAt ? timeLabel(message.createdAt) : '',
    dayKey: message.createdAt ? getDayKey(message.createdAt) : '',
    status:
      message.direction === 'outgoing'
        ? message.deliveryStatus || 'sent'
        : message.direction === 'incoming'
          ? 'read'
          : 'pending',
    type: message.attachment?.kind || 'text',
    attachment: message.attachment,
    providerMessageId: message.providerMessageId || null,
  }));

/* ── Attachment helpers ── */

export const inferAttachmentKind = (mimeType: string): PendingAttachment['kind'] => {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  return 'document';
};

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });

export const formatFileSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/* ── Booking helpers ── */

export const bookingStatusLabel = (status: string): string => {
  if (status === 'pending') return 'Pendente';
  if (status === 'confirmed') return 'Confirmado';
  return 'Cancelado';
};

const SERVICE_CATEGORY_MAP: Record<string, string> = {
  progressiva: 'Transformação & Alinhamento',
  'alinhamento capilar': 'Transformação & Alinhamento',
  selagem: 'Transformação & Alinhamento',
  botox: 'Transformação & Alinhamento',
  'plástica dos fios': 'Transformação & Alinhamento',
  'plastica dos fios': 'Transformação & Alinhamento',
  cpr: 'Tratamentos Premium',
  'cauterização': 'Tratamentos Premium',
  cauterizacao: 'Tratamentos Premium',
  'detox capilar': 'Tratamentos Premium',
  'hidratação': 'Tratamentos Premium',
  hidratacao: 'Tratamentos Premium',
  corte: 'Corte & Finalização',
  'escova e prancha': 'Corte & Finalização',
  escova: 'Corte & Finalização',
  'moreno iluminado': 'Coloração & Mechas',
  luzes: 'Coloração & Mechas',
  'pedicure e manicure': 'Unhas & SPA',
  manicure: 'Unhas & SPA',
  pedicure: 'Unhas & SPA',
  'plástica dos pés': 'Unhas & SPA',
  'plastica dos pes': 'Unhas & SPA',
  'spa dos pés': 'Unhas & SPA',
  'spa dos pes': 'Unhas & SPA',
  'perna completa': 'Depilação',
  'meia perna': 'Depilação',
  virilha: 'Depilação',
  'virilha completa': 'Depilação',
};

export const inferServiceCategory = (serviceName: string): string => {
  const normalized = serviceName.trim().toLowerCase();
  if (SERVICE_CATEGORY_MAP[normalized]) return SERVICE_CATEGORY_MAP[normalized];
  for (const [key, category] of Object.entries(SERVICE_CATEGORY_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) return category;
  }
  return 'Serviço';
};

export const parseServicePrice = (priceStr: string | null | undefined): string => {
  if (!priceStr) return '—';
  const cleaned = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num) || num <= 0) return priceStr;
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
};

/* ── Constants ── */

export const AVATAR_COLORS = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#00a884', '#667781', '#8696a0'];

export const EMOJI_PALETTE = [
  '😀', '😄', '😂', '😊', '😍', '🥰', '😘', '🤗',
  '🙏', '👍', '👏', '💪', '🎉', '❤️', '🔥', '✨',
  '💅', '💇', '💆', '📅', '✅', '❌', '💬', '📸',
  '🌟', '💖', '🙋', '👋', '💐', '🎊', '☀️', '🌸',
];
