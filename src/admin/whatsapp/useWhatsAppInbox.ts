import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  confirmAdminBooking,
  rejectAdminBooking,
  rescheduleAdminBooking,
  addWhatsappConversationNoteForAdmin,
  assignWhatsappConversationForAdmin,
  deleteConversationForAdmin,
  disconnectWhatsappForAdmin,
  findClientByPhoneForAdmin,
  registerClientForAdmin,
  getInboxConversationPanelForAdmin,
  getWhatsappStatusForAdmin,
  listInboxConversationsForAdmin,
  listInboxContactsForAdmin,
  fetchInboxAvatarsForAdmin,
  listInboxMessagesForAdmin,
  logoutWhatsappForAdmin,
  reconnectWhatsappForAdmin,
  runWhatsappSyncForAdmin,
  searchWhatsappConversationsForAdmin,
  sendInboxAttachmentForAdmin,
  sendInboxMessageForAdmin,
  startAdminInboxRealtimeStream,
  updateWhatsappConversationStatusForAdmin,
  updateWhatsappConversationTagsForAdmin,
  type AdminWhatsappStatus,
  type AdminInboxRealtimeEvent,
  type AdminInboxContact,
} from '../api';
import type { AdminBooking, AdminInternalNote } from '../types';
import type { WAContact, WAMessage, PendingAttachment, ConversationFilter, ConversationStatus } from './wa-types';
import { mapConversationToContact, mapMessages } from './wa-utils';

type HookProps = {
  adminKey: string;
  tenantSlug: string;
};

export function useWhatsAppInbox({ adminKey, tenantSlug }: HookProps) {
  /* ── Core state ── */
  const [status, setStatus] = useState<AdminWhatsappStatus | null>(null);
  const [contacts, setContacts] = useState<WAContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WAMessage[]>([]);
  const [loading, setLoading] = useState(false);

  /* ── Sidebar state ── */
  const [searchText, setSearchText] = useState('');
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all');
  const [operatorId, setOperatorId] = useState(() => {
    if (typeof window === 'undefined') return 'admin';
    return window.localStorage.getItem('renovo_admin_operator') || 'admin';
  });

  /* ── Panel state ── */
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelBookings, setPanelBookings] = useState<AdminBooking[]>([]);
  const [panelNotes, setPanelNotes] = useState<AdminInternalNote[]>([]);
  const [panelError, setPanelError] = useState('');
  const [sidePanelOpen, setSidePanelOpen] = useState(true);

  /* ── Operational fields ── */
  const [assigneeInput, setAssigneeInput] = useState('');
  const [statusInput, setStatusInput] = useState<ConversationStatus>('open');
  const [labelsInput, setLabelsInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [operationalBusy, setOperationalBusy] = useState(false);

  /* ── Sync ── */
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncLabel, setSyncLabel] = useState('');

  /* ── Booking actions ── */
  const [actionBookingId, setActionBookingId] = useState<number | null>(null);

  /* ── Client registration ── */
  const [registerClientBusy, setRegisterClientBusy] = useState(false);
  const [linkedClient, setLinkedClient] = useState<Record<string, unknown> | null>(null);

  /* ── Contacts picker ── */
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactPickerSearch, setContactPickerSearch] = useState('');
  const [contactPickerList, setContactPickerList] = useState<AdminInboxContact[]>([]);
  const [contactPickerLoading, setContactPickerLoading] = useState(false);

  /* ── Refs ── */
  const selectedIdRef = useRef<string | null>(null);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const conversationsLoadedRef = useRef(false);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('renovo_admin_operator', operatorId.trim() || 'admin');
  }, [operatorId]);

  /* ── Computed ── */
  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedId) || null,
    [contacts, selectedId],
  );

  const filteredContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return contacts.filter((item) => {
      if (conversationFilter === 'unread' && item.unread <= 0) return false;
      if (conversationFilter === 'mine' && item.assigneeId !== (operatorId.trim() || 'admin')) return false;
      if (conversationFilter === 'unassigned' && Boolean(item.assigneeId)) return false;
      if (conversationFilter === 'resolved' && item.conversationStatus !== 'resolved') return false;
      if (!query) return true;
      const labelText = (item.labels || []).join(' ').toLowerCase();
      return (
        item.name.toLowerCase().includes(query) ||
        item.phone.includes(query) ||
        item.lastMessage.toLowerCase().includes(query) ||
        labelText.includes(query)
      );
    });
  }, [contacts, searchText, conversationFilter, operatorId]);

  /* ── Data loading ── */
  const loadStatus = useCallback(async () => {
    const next = await getWhatsappStatusForAdmin(adminKey);
    setStatus(next);
    return next;
  }, [adminKey]);

  const loadConversations = useCallback(async (online: boolean, term?: string) => {
    const q = (term || '').trim();
    const rows = q
      ? await searchWhatsappConversationsForAdmin(q, adminKey, tenantSlug)
      : await listInboxConversationsForAdmin(adminKey, tenantSlug);
    const mapped = rows.map((item) => mapConversationToContact(item, online));
    setContacts(mapped);

    setSelectedId((current) => {
      if (!current && mapped[0]) return mapped[0].id;
      if (current && !mapped.find((c) => c.id === current)) return mapped[0]?.id || null;
      return current;
    });

    // Fetch missing avatars in background (non-blocking)
    const phonesWithoutAvatar = mapped.filter((c) => !c.avatarUrl).map((c) => c.phone);
    if (phonesWithoutAvatar.length > 0) {
      fetchInboxAvatarsForAdmin(phonesWithoutAvatar, adminKey)
        .then((avatars) => {
          setContacts((current) =>
            current.map((c) => {
              const url = avatars[c.phone];
              return url ? { ...c, avatarUrl: url } : c;
            }),
          );
        })
        .catch(() => { /* ignore avatar fetch errors */ });
    }
  }, [adminKey, tenantSlug]);

  const loadMessages = useCallback(async (contactId: string) => {
    const rows = await listInboxMessagesForAdmin(Number(contactId), adminKey, tenantSlug);
    setMessages(mapMessages(rows));
  }, [adminKey, tenantSlug]);

  const loadConversationPanel = useCallback(async (contactId: string) => {
    setPanelLoading(true);
    setPanelError('');
    try {
      const payload = await getInboxConversationPanelForAdmin(Number(contactId), adminKey, tenantSlug);
      setPanelBookings(payload.bookings || []);
      setPanelNotes(payload.notes || []);
      setAssigneeInput(payload.operational?.assigneeId || '');
      setStatusInput(payload.operational?.status || 'open');
      setLabelsInput((payload.operational?.labels || []).join(', '));

      if (payload.conversation?.id) {
        setContacts((current) =>
          current.map((item) =>
            item.id === String(payload.conversation.id)
              ? {
                  ...item,
                  avatarUrl: payload.conversation.avatarUrl || item.avatarUrl,
                  pendingBookingsCount: Number(payload.conversation.pendingBookingsCount || 0),
                  latestBookingStatus: payload.conversation.latestBookingStatus || item.latestBookingStatus,
                  assigneeId: payload.conversation.assigneeId || null,
                  conversationStatus: payload.conversation.conversationStatus || 'open',
                  labels: payload.conversation.labels || [],
                }
              : item,
          ),
        );
      }

      // Load client info in background (non-blocking)
      if (payload.conversation?.phone) {
        findClientByPhoneForAdmin(payload.conversation.phone, adminKey)
          .then((client) => setLinkedClient(client))
          .catch(() => setLinkedClient(null));
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Erro ao carregar painel.');
      setPanelBookings([]);
      setPanelNotes([]);
    } finally {
      setPanelLoading(false);
    }
  }, [adminKey, tenantSlug]);

  const loadContactPicker = useCallback(async (search?: string) => {
    setContactPickerLoading(true);
    try {
      const list = await listInboxContactsForAdmin(adminKey, search);
      setContactPickerList(list);
    } catch {
      setContactPickerList([]);
    } finally {
      setContactPickerLoading(false);
    }
  }, [adminKey]);

  const openContactPicker = useCallback(() => {
    setContactPickerOpen(true);
    setContactPickerSearch('');
    void loadContactPicker();
  }, [loadContactPicker]);

  const closeContactPicker = useCallback(() => {
    setContactPickerOpen(false);
    setContactPickerSearch('');
    setContactPickerList([]);
  }, []);

  const selectContactFromPicker = useCallback((contact: AdminInboxContact) => {
    setContactPickerOpen(false);
    setSelectedId(String(contact.id));
  }, []);

  const refreshInbox = useCallback(async (opts: { silent?: boolean; skipMessages?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const s = await loadStatus();
      await loadConversations(s.connected, searchText);
      const currentId = selectedIdRef.current;
      if (currentId && !opts.skipMessages) {
        await Promise.all([loadMessages(currentId), loadConversationPanel(currentId)]);
      }
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [loadStatus, loadConversations, loadMessages, loadConversationPanel, searchText]);

  /* ── Realtime SSE (single connection) ── */
  const scheduleRealtimeRefresh = useCallback((skipMessages: boolean) => {
    if (realtimeRefreshTimerRef.current) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      void refreshInbox({ silent: true, skipMessages });
    }, 300);
  }, [refreshInbox]);

  const handleRealtimeEvent = useCallback((event: AdminInboxRealtimeEvent) => {
    if (event.type === 'heartbeat') return;

    if (event.type === 'message-status') {
      setMessages((current) =>
        current.map((m) =>
          m.providerMessageId && m.providerMessageId === event.providerMessageId
            ? { ...m, status: event.status }
            : m,
        ),
      );
      return;
    }

    if (event.type === 'whatsapp-state-changed') {
      void loadStatus().then((next) => {
        if (next.connectionState === 'connected') {
          scheduleRealtimeRefresh(false);
        }
      });
      return;
    }

    const currentId = selectedIdRef.current;
    if (!currentId) {
      scheduleRealtimeRefresh(true);
      return;
    }

    const isCurrentThread = typeof event.threadId === 'number' && String(event.threadId) === currentId;
    if (event.reason === 'thread-read') {
      scheduleRealtimeRefresh(true);
      return;
    }
    scheduleRealtimeRefresh(!isCurrentThread);
  }, [loadStatus, scheduleRealtimeRefresh]);

  /* ── Bootstrap ── */
  useEffect(() => {
    void refreshInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  /* ── Single SSE stream ── */
  useEffect(() => {
    if (!adminKey) return;

    const stop = startAdminInboxRealtimeStream(
      adminKey,
      (event) => handleRealtimeEvent(event),
      (err) => console.error('Inbox SSE error:', err),
    );

    return () => {
      stop();
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  /* ── Search debounce ── */
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => {
      void loadConversations(Boolean(status.connected), searchText);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, status?.connected]);

  /* ── Contact picker search debounce ── */
  useEffect(() => {
    if (!contactPickerOpen) return;
    const timer = window.setTimeout(() => {
      void loadContactPicker(contactPickerSearch);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactPickerSearch, contactPickerOpen]);

  /* ── Selection change ── */
  useEffect(() => {
    if (selectedId) {
      void Promise.all([loadMessages(selectedId), loadConversationPanel(selectedId)]);
    } else {
      setMessages([]);
      setPanelBookings([]);
      setPanelNotes([]);
      setPanelError('');
      setAssigneeInput('');
      setStatusInput('open');
      setLabelsInput('');
      setNoteInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* ── Actions ── */
  const handleSelectContact = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleSendMessage = useCallback(async (text: string, attachment: PendingAttachment | null) => {
    if (!selectedId) return;
    const caption = text.trim();
    if (!attachment && !caption) return;

    // Optimistic update: show message instantly in the UI
    const optimisticId = `optimistic-${Date.now()}`;
    const now = new Date();
    const optimisticMsg: WAMessage = {
      id: optimisticId,
      from: 'me',
      text: caption,
      time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      dayKey: now.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      status: 'pending',
      type: attachment ? (attachment.kind || 'document') : 'text',
    };
    setMessages((current) => [...current, optimisticMsg]);

    // Send in background
    try {
      if (attachment) {
        await sendInboxAttachmentForAdmin(
          Number(selectedId),
          { attachmentBase64: attachment.base64, mimeType: attachment.mimeType, fileName: attachment.fileName },
          caption,
          adminKey,
          tenantSlug,
        );
      } else {
        await sendInboxMessageForAdmin(Number(selectedId), caption, adminKey, tenantSlug);
      }
    } catch (err) {
      // Mark as failed visually
      setMessages((current) =>
        current.map((m) => m.id === optimisticId ? { ...m, status: 'pending' as const } : m),
      );
      throw err;
    }

    // Refresh real messages and sidebar in background (non-blocking)
    void loadMessages(selectedId);
    void refreshInbox({ silent: true, skipMessages: true });
  }, [selectedId, adminKey, tenantSlug, loadMessages, refreshInbox]);

  const handleSync = useCallback(async () => {
    setSyncBusy(true);
    setSyncLabel('Sincronizando...');
    try {
      const response = await runWhatsappSyncForAdmin(adminKey, tenantSlug);
      const r = response.syncResult;
      if (r) {
        const issues = r.issues?.length ? ` (${r.issues.length} aviso(s))` : '';
        setSyncLabel(`${r.contactsSynced} contatos, ${r.chatsSynced} chats${issues}`);
      } else {
        setSyncLabel('Concluido');
      }
      await refreshInbox({ silent: true });
    } catch (err) {
      setSyncLabel(err instanceof Error ? err.message : 'Erro na sincronizacao');
    } finally {
      setSyncBusy(false);
    }
  }, [adminKey, tenantSlug, refreshInbox]);

  const [reconnectBusy, setReconnectBusy] = useState(false);

  const handleReconnect = useCallback(async () => {
    if (reconnectBusy) return; // Prevent repeated reconnect attempts
    setReconnectBusy(true);
    try {
      await reconnectWhatsappForAdmin(adminKey);
      await refreshInbox();
    } finally {
      setReconnectBusy(false);
    }
  }, [adminKey, refreshInbox, reconnectBusy]);

  const handleDisconnect = useCallback(async () => {
    await disconnectWhatsappForAdmin(adminKey);
    await loadStatus();
  }, [adminKey, loadStatus]);

  const handleLogout = useCallback(async () => {
    await logoutWhatsappForAdmin(adminKey);
    await refreshInbox();
  }, [adminKey, refreshInbox]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    await deleteConversationForAdmin(Number(conversationId), adminKey);
    setSelectedId((current) => {
      if (current === conversationId) return null;
      return current;
    });
    setContacts((current) => current.filter((c) => c.id !== conversationId));
  }, [adminKey]);

  const handleConfirmBooking = useCallback(async (booking: AdminBooking) => {
    setActionBookingId(booking.id);
    setPanelError('');
    try {
      await confirmAdminBooking(booking.id, adminKey);
      if (selectedId) {
        await Promise.all([loadConversationPanel(selectedId), loadMessages(selectedId), refreshInbox({ silent: true, skipMessages: true })]);
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Erro ao confirmar.');
    } finally {
      setActionBookingId(null);
    }
  }, [adminKey, selectedId, loadConversationPanel, loadMessages, refreshInbox]);

  const handleRejectBooking = useCallback(async (bookingId: number, reason: string) => {
    setActionBookingId(bookingId);
    setPanelError('');
    try {
      await rejectAdminBooking(bookingId, reason, adminKey);
      if (selectedId) {
        await Promise.all([loadConversationPanel(selectedId), loadMessages(selectedId), refreshInbox({ silent: true, skipMessages: true })]);
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Erro ao cancelar.');
    } finally {
      setActionBookingId(null);
    }
  }, [adminKey, selectedId, loadConversationPanel, loadMessages, refreshInbox]);

  const handleRescheduleBooking = useCallback(async (bookingId: number, date: string, time: string) => {
    setActionBookingId(bookingId);
    setPanelError('');
    try {
      await rescheduleAdminBooking(bookingId, date, time, adminKey);
      if (selectedId) {
        await Promise.all([loadConversationPanel(selectedId), loadMessages(selectedId), refreshInbox({ silent: true, skipMessages: true })]);
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Erro ao remarcar.');
    } finally {
      setActionBookingId(null);
    }
  }, [adminKey, selectedId, loadConversationPanel, loadMessages, refreshInbox]);

  const handleSaveOperational = useCallback(async () => {
    if (!selectedId) return;
    setOperationalBusy(true);
    setPanelError('');
    try {
      const cid = Number(selectedId);
      const parsedLabels = labelsInput.split(',').map((l) => l.trim()).filter(Boolean).slice(0, 50);
      await Promise.all([
        assignWhatsappConversationForAdmin(cid, assigneeInput.trim() || null, adminKey, tenantSlug),
        updateWhatsappConversationStatusForAdmin(cid, statusInput, adminKey, tenantSlug),
        updateWhatsappConversationTagsForAdmin(cid, parsedLabels, adminKey, tenantSlug),
      ]);
      await refreshInbox({ silent: true, skipMessages: true });
      await loadConversationPanel(selectedId);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setOperationalBusy(false);
    }
  }, [selectedId, assigneeInput, statusInput, labelsInput, adminKey, tenantSlug, refreshInbox, loadConversationPanel]);

  const handleAddNote = useCallback(async () => {
    if (!selectedId || !noteInput.trim()) return;
    setOperationalBusy(true);
    setPanelError('');
    try {
      await addWhatsappConversationNoteForAdmin(Number(selectedId), noteInput.trim(), operatorId.trim() || 'admin', adminKey, tenantSlug);
      setNoteInput('');
      await Promise.all([loadMessages(selectedId), loadConversationPanel(selectedId), refreshInbox({ silent: true, skipMessages: true })]);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Erro ao adicionar nota.');
    } finally {
      setOperationalBusy(false);
    }
  }, [selectedId, noteInput, operatorId, adminKey, tenantSlug, loadMessages, loadConversationPanel, refreshInbox]);

  const handleRegisterClient = useCallback(async (name: string, phone: string, preferredService?: string) => {
    setRegisterClientBusy(true);
    setPanelError('');
    try {
      const existing = await findClientByPhoneForAdmin(phone, adminKey);
      if (existing) {
        setLinkedClient(existing);
        setPanelError('Cliente já cadastrado.');
        return;
      }
      const created = await registerClientForAdmin({ name, phone, preferred_service: preferredService }, adminKey);
      setLinkedClient(created);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Erro ao cadastrar cliente.');
    } finally {
      setRegisterClientBusy(false);
    }
  }, [adminKey]);

  return {
    status,
    contacts,
    filteredContacts,
    selectedId,
    selectedContact,
    messages,
    loading,
    searchText,
    setSearchText,
    conversationFilter,
    setConversationFilter,
    operatorId,
    setOperatorId,
    panelLoading,
    panelBookings,
    panelNotes,
    panelError,
    setPanelError,
    sidePanelOpen,
    setSidePanelOpen,
    assigneeInput,
    setAssigneeInput,
    statusInput,
    setStatusInput,
    labelsInput,
    setLabelsInput,
    noteInput,
    setNoteInput,
    operationalBusy,
    syncBusy,
    syncLabel,
    actionBookingId,
    refreshInbox,
    handleSelectContact,
    handleSendMessage,
    handleSync,
    handleReconnect,
    reconnectBusy,
    handleDisconnect,
    handleLogout,
    handleDeleteConversation,
    handleConfirmBooking,
    handleRejectBooking,
    handleRescheduleBooking,
    handleSaveOperational,
    handleAddNote,
    handleRegisterClient,
    loadConversationPanel,
    registerClientBusy,
    linkedClient,
    contactPickerOpen,
    contactPickerSearch,
    setContactPickerSearch,
    contactPickerList,
    contactPickerLoading,
    openContactPicker,
    closeContactPicker,
    selectContactFromPicker,
  };
}
