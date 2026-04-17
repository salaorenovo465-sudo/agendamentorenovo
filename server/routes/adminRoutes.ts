import { Router } from 'express';

import { bookingStore } from '../db/bookingStore';
import { workbenchStore } from '../db/workbenchStore';
import { inboxStore } from '../db/inboxStore';
import { createRateLimit } from '../middleware/rateLimit';
import { createHeartbeatEvent, subscribeInboxRealtime, type InboxRealtimeEvent } from '../services/inboxRealtime';
import {
  createCalendarEventForBooking,
  deleteCalendarEventById,
  updateCalendarEventForBooking,
} from '../services/calendarService';
import {
  connectWhatsapp,
  disconnectWhatsapp,
  getWhatsappContactAvatarUrl,
  getWhatsappContactAvatarUrlCached,
  getWhatsappStatus,
  logoutWhatsapp,
  reconnectWhatsapp,
  sendWhatsappMessageToCustomer,
  whatsappConfig,
} from '../services/whatsappService';
import { getOutgoingDeliveryStatus } from '../services/whatsappDeliveryStatus';
import {
  notifyCustomerConfirmedBooking,
  notifyCustomerRejectedBooking,
  notifyCustomerRescheduledBooking,
} from '../services/notificationService';
import { logoutEvolutionInstance } from '../services/evolutionInstanceService';
import type { BookingServiceItem } from '../types';
import { toPositiveInt, parseId as parseBookingId, getTodayDate } from '../utils/helpers';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

const parseBookingServiceItems = (value: unknown): BookingServiceItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) {
        return null;
      }

      return {
        category: typeof row.category === 'string' ? row.category.trim() : '',
        name,
        price: typeof row.price === 'string' ? row.price.trim() : '',
      } satisfies BookingServiceItem;
    })
    .filter((item): item is BookingServiceItem => Boolean(item));
};

const parseMoneyAmount = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const match = value.match(/[\d.]+(?:,\d{2})?|\d+(?:\.\d{2})?/);
  if (!match) {
    return 0;
  }

  return Number(match[0].replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
};

const sumBookingServiceItems = (items: BookingServiceItem[] | undefined): number => {
  if (!Array.isArray(items)) {
    return 0;
  }

  return items.reduce((sum, item) => sum + parseMoneyAmount(item.price), 0);
};

const parseOptionalProfessionalId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

const resolveProfessionalSelection = async (
  professionalId: number | null,
): Promise<{ professionalId: number | null; professionalName: string | null }> => {
  if (!professionalId) {
    return { professionalId: null, professionalName: null };
  }

  const rows = await workbenchStore.list('professionals');
  const match = rows.find((row) => Number(row.id) === professionalId);
  if (!match) {
    throw new Error('Colaborador selecionado nao foi encontrado.');
  }

  const name = typeof match.name === 'string' ? match.name.trim() : '';
  if (!name) {
    throw new Error('Colaborador selecionado nao possui nome valido.');
  }

  return {
    professionalId,
    professionalName: name,
  };
};

const whatsappControlRateLimit = createRateLimit({
  windowMs: toPositiveInt(process.env.WHATSAPP_CONTROL_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toPositiveInt(process.env.WHATSAPP_CONTROL_RATE_LIMIT_MAX, 20),
  message: 'Muitas tentativas de controle do WhatsApp. Aguarde e tente novamente.',
  keyPrefix: 'whatsapp-control',
});

const whatsappSendRateLimit = createRateLimit({
  windowMs: toPositiveInt(process.env.WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toPositiveInt(process.env.WHATSAPP_SEND_RATE_LIMIT_MAX, 40),
  message: 'Limite de envio temporariamente excedido. Aguarde e tente novamente.',
  keyPrefix: 'whatsapp-send',
});

const isPermissionError = (error: unknown): boolean => {
  const rawMessage =
    (error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ||
    (error instanceof Error ? error.message : String(error));

  return /writer access|insufficient permission|forbidden|does not have permission/i.test(rawMessage);
};

export const adminRoutes = Router();

adminRoutes.get('/inbox/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const sendEvent = (event: InboxRealtimeEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  sendEvent({
    type: 'inbox-updated',
    reason: 'thread-updated',
    at: new Date().toISOString(),
  });

  const unsubscribe = subscribeInboxRealtime((event) => {
    sendEvent(event);
  });

  const heartbeatTimer = setInterval(() => {
    sendEvent(createHeartbeatEvent());
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    unsubscribe();
    res.end();
  });
});

adminRoutes.get('/bookings', async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'range';
  const date = typeof req.query.date === 'string' && DATE_REGEX.test(req.query.date) ? req.query.date : getTodayDate();
  const endDate = typeof req.query.endDate === 'string' && DATE_REGEX.test(req.query.endDate) ? req.query.endDate : null;

  try {
    const bookings = scope === 'all'
      ? await bookingStore.listAll()
      : endDate
        ? await bookingStore.listByDateRange(date, endDate)
        : await bookingStore.listByDate(date);
    return res.json({ date: scope === 'all' ? null : date, endDate: scope === 'all' ? null : endDate, scope, bookings });
  } catch (error) {
    console.error('Erro ao listar agendamentos do admin:', error);
    return res.status(500).json({ error: 'Erro ao listar agendamentos.' });
  }
});

adminRoutes.post('/bookings', async (req, res) => {
  const { service, servicePrice, date, time, name, phone } = req.body || {};
  const serviceValue = typeof service === 'string' ? service.trim() : '';
  const servicePriceValue = typeof servicePrice === 'string' && servicePrice.trim() ? servicePrice.trim() : null;
  const customerName = typeof name === 'string' ? name.trim() : '';
  const customerPhone = typeof phone === 'string' ? phone.trim() : '';
  const normalizedTime = typeof time === 'string' ? time.slice(0, 5) : '';
  const parsedServiceItems = parseBookingServiceItems(req.body?.serviceItems ?? req.body?.selectedServices);
  const serviceItems = parsedServiceItems.length > 0
    ? parsedServiceItems
    : serviceValue
      ? [{ category: '', name: serviceValue, price: servicePriceValue || '' }]
      : [];
  const professionalId = parseOptionalProfessionalId(req.body?.professionalId);

  if (!serviceValue || !date || !normalizedTime || !customerName || !customerPhone) {
    return res.status(400).json({ error: 'Todos os campos sao obrigatorios.' });
  }

  if (typeof date !== 'string' || !DATE_REGEX.test(date)) {
    return res.status(400).json({ error: 'Data invalida. Use YYYY-MM-DD.' });
  }

  if (typeof time !== 'string' || !TIME_REGEX.test(time)) {
    return res.status(400).json({ error: 'Horario invalido. Use HH:mm.' });
  }

  try {
    const professionalSelection = await resolveProfessionalSelection(professionalId);
    const booking = await bookingStore.create({
      service: serviceValue,
      servicePrice: servicePriceValue,
      serviceItems,
      date,
      time: normalizedTime,
      name: customerName,
      phone: customerPhone,
      professionalId: professionalSelection.professionalId,
      professionalName: professionalSelection.professionalName,
    });

    let normalizedBooking = booking;
    try {
      const thread = await inboxStore.ensureThread(booking.phone, booking.name);
      normalizedBooking =
        (await bookingStore.updateWhatsappThread({ id: booking.id, whatsappThreadId: thread.id })) || booking;
    } catch (error) {
      console.error('Erro ao vincular thread do inbox no agendamento admin:', error);
    }

    return res.status(201).json({
      message: 'Agendamento criado com sucesso.',
      booking: normalizedBooking,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar agendamento administrativo.';
    console.error('Erro ao criar agendamento administrativo:', error);
    return res.status(500).json({ error: message });
  }
});

adminRoutes.post('/bookings/:id/professional', async (req, res) => {
  const bookingId = parseBookingId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ error: 'ID de agendamento invalido.' });
  }

  const professionalId = parseOptionalProfessionalId(req.body?.professionalId);

  try {
    const booking = await bookingStore.getById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Agendamento nao encontrado.' });
    }

    if (!professionalId && booking.status !== 'pending') {
      return res.status(400).json({ error: 'Um agendamento fora de pendente precisa manter um colaborador definido.' });
    }

    const professionalSelection = await resolveProfessionalSelection(professionalId);
    const updatedBooking = await bookingStore.updateProfessional({
      id: bookingId,
      professionalId: professionalSelection.professionalId,
      professionalName: professionalSelection.professionalName,
    });

    return res.json({
      message: professionalSelection.professionalId ? 'Colaborador vinculado com sucesso.' : 'Colaborador removido do agendamento.',
      booking: updatedBooking,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar colaborador do agendamento.';
    console.error('Erro ao atualizar colaborador do agendamento:', error);
    return res.status(500).json({ error: message });
  }
});

adminRoutes.post('/bookings/:id/confirm', async (req, res) => {
  const bookingId = parseBookingId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ error: 'ID de agendamento inválido.' });
  }

  try {
    const booking = await bookingStore.getById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Agendamento não encontrado.' });
    }

    if (!booking.professionalId || !booking.professionalName) {
      return res.status(400).json({ error: 'Selecione o colaborador responsavel antes de confirmar este agendamento.' });
    }

    const conflict = await bookingStore.hasConflict(booking.date, booking.time, booking.id);
    if (conflict) {
      return res.status(409).json({ error: 'Conflito de horário com outro agendamento.' });
    }

    let googleEventId = booking.googleEventId;
    try {
      if (!googleEventId) {
        googleEventId = await createCalendarEventForBooking(booking);
      } else {
        await updateCalendarEventForBooking(googleEventId, booking);
      }
    } catch (error) {
      if (isPermissionError(error)) {
        return res.status(502).json({
          error: 'Sem permissão de escrita no Google Calendar.',
          actionRequired: 'Compartilhe a agenda com o e-mail da conta de serviço com permissão de edição.',
        });
      }
      throw error;
    }

    if (!booking.professionalId || !booking.professionalName) {
      return res.status(400).json({ error: 'Selecione o colaborador responsavel antes de finalizar este atendimento.' });
    }

    const updatedBooking = await bookingStore.updateStatus({
      id: booking.id,
      status: 'confirmed',
      googleEventId,
      rejectionReason: null,
    });

    if (updatedBooking) {
      try { await notifyCustomerConfirmedBooking(updatedBooking); } catch (notifErr) { console.error('Falha ao notificar cliente (confirmacao):', notifErr); }

      if (workbenchStore.isEnabled()) {
        try {
          const amount = parseMoneyAmount(updatedBooking.servicePrice) || sumBookingServiceItems(updatedBooking.serviceItems);

          await workbenchStore.create('finance', {
            booking_id: updatedBooking.id,
            client_name: updatedBooking.name,
            service_name: updatedBooking.service,
            amount,
            status: 'pendente',
            due_date: updatedBooking.date,
          });
        } catch (financeError) {
          console.error('Erro ao criar entrada financeira automatica:', financeError);
        }
      }
    }

    return res.json({ message: 'Agendamento confirmado com sucesso.', booking: updatedBooking });
  } catch (error) {
    console.error('Erro ao confirmar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao confirmar agendamento.' });
  }
});

adminRoutes.post('/bookings/:id/complete', async (req, res) => {
  const bookingId = parseBookingId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ error: 'ID de agendamento inválido.' });
  }

  try {
    const booking = await bookingStore.getById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Agendamento não encontrado.' });
    }

    const updatedBooking = await bookingStore.updateStatus({
      id: booking.id,
      status: 'completed',
    });

    return res.json({ message: 'Serviço finalizado com sucesso.', booking: updatedBooking });
  } catch (error) {
    console.error('Erro ao finalizar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao finalizar agendamento.' });
  }
});

adminRoutes.get('/bookings/by-phone/:phone', async (req, res) => {
  const phone = req.params.phone?.trim();
  if (!phone) {
    return res.status(400).json({ error: 'Telefone é obrigatório.' });
  }

  try {
    const bookings = await bookingStore.listByPhone(phone);
    return res.json({ bookings });
  } catch (error) {
    console.error('Erro ao buscar agendamentos por telefone:', error);
    return res.status(500).json({ error: 'Erro ao buscar agendamentos.' });
  }
});

adminRoutes.get('/bookings/pending-payment', async (_req, res) => {
  try {
    const bookings = await bookingStore.listPendingPayment();
    return res.json({ bookings });
  } catch (error) {
    console.error('Erro ao listar agendamentos pendentes de pagamento:', error);
    return res.status(500).json({ error: 'Erro ao listar agendamentos pendentes.' });
  }
});

adminRoutes.post('/bookings/:id/reject', async (req, res) => {
  const bookingId = parseBookingId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ error: 'ID de agendamento inválido.' });
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;

  try {
    const booking = await bookingStore.getById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Agendamento não encontrado.' });
    }

    if (booking.googleEventId) {
      try {
        await deleteCalendarEventById(booking.googleEventId);
      } catch (error) {
        console.error('Falha ao remover evento do Google Calendar durante rejeição:', error);
      }
    }

    const updatedBooking = await bookingStore.updateStatus({
      id: booking.id,
      status: 'rejected',
      rejectionReason: reason,
      googleEventId: null,
    });

    if (updatedBooking) {
      try { await notifyCustomerRejectedBooking(updatedBooking); } catch (notifErr) { console.error('Falha ao notificar cliente (rejeicao):', notifErr); }
    }

    return res.json({ message: 'Agendamento rejeitado.', booking: updatedBooking });
  } catch (error) {
    console.error('Erro ao rejeitar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao rejeitar agendamento.' });
  }
});

adminRoutes.delete('/bookings/:id', async (req, res) => {
  const bookingId = parseBookingId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ error: 'ID de agendamento inválido.' });
  }

  try {
    const booking = await bookingStore.getById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Agendamento não encontrado.' });
    }

    // Delete Google Calendar event if exists
    if (booking.googleEventId) {
      try { await deleteCalendarEventById(booking.googleEventId); } catch { /* ignore */ }
    }

    await bookingStore.deleteById(bookingId);
    return res.json({ message: 'Agendamento excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir agendamento:', error);
    return res.status(500).json({ error: 'Erro ao excluir agendamento.' });
  }
});

adminRoutes.post('/bookings/:id/reschedule', async (req, res) => {
  const bookingId = parseBookingId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ error: 'ID de agendamento inválido.' });
  }

  const { date, time: rawTime } = req.body || {};
  if (typeof date !== 'string' || !DATE_REGEX.test(date)) {
    return res.status(400).json({ error: 'Data inválida. Use YYYY-MM-DD.' });
  }
  if (typeof rawTime !== 'string' || !TIME_REGEX.test(rawTime)) {
    return res.status(400).json({ error: 'Horário inválido. Use HH:mm.' });
  }
  const time = rawTime.slice(0, 5); // Normalize HH:mm:ss -> HH:mm

  try {
    const booking = await bookingStore.getById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Agendamento não encontrado.' });
    }

    const conflict = await bookingStore.hasConflict(date, time, booking.id);
    if (conflict) {
      return res.status(409).json({ error: 'Conflito de horário com outro agendamento.' });
    }

    const updatedSchedule = await bookingStore.updateSchedule({ id: booking.id, date, time });
    if (!updatedSchedule) {
      return res.status(404).json({ error: 'Agendamento não encontrado após atualização.' });
    }

    let syncedGoogleEventId = updatedSchedule.googleEventId;
    if (updatedSchedule.status === 'confirmed') {
      try {
        if (updatedSchedule.googleEventId) {
          await updateCalendarEventForBooking(updatedSchedule.googleEventId, updatedSchedule);
        } else {
          syncedGoogleEventId = await createCalendarEventForBooking(updatedSchedule);
        }
      } catch (error) {
        if (isPermissionError(error)) {
          return res.status(502).json({
            error: 'Remarcado localmente, mas sem permissão para atualizar no Google Calendar.',
            actionRequired: 'Revise a permissão da conta de serviço na agenda.',
          });
        }
        throw error;
      }
    }

    const finalBooking =
      syncedGoogleEventId !== updatedSchedule.googleEventId
        ? await bookingStore.updateStatus({
            id: updatedSchedule.id,
            status: updatedSchedule.status,
            rejectionReason: updatedSchedule.rejectionReason,
            googleEventId: syncedGoogleEventId,
          })
        : updatedSchedule;

    if (finalBooking) {
      try { await notifyCustomerRescheduledBooking(finalBooking); } catch (notifErr) { console.error('Falha ao notificar cliente (remarcacao):', notifErr); }
    }

    return res.json({ message: 'Agendamento remarcado com sucesso.', booking: finalBooking });
  } catch (error) {
    console.error('Erro ao remarcar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao remarcar agendamento.' });
  }
});

adminRoutes.get('/inbox/conversations', async (_req, res) => {
  try {
    const conversations = await inboxStore.listThreads();

    // Enrich with bookings + cached avatar (instant, no WhatsApp API calls)
    const enrichedConversations = await Promise.all(
      conversations.map(async (conversation) => {
        let pendingBookingsCount = 0;
        let latestBookingStatus: string | null = null;
        try {
          const linkedBookings = await bookingStore.listByWhatsappThread(conversation.id);
          pendingBookingsCount = linkedBookings.filter((b) => b.status === 'pending').length;
          latestBookingStatus = linkedBookings[0]?.status || null;
        } catch { /* ignore */ }

        return {
          ...conversation,
          pendingBookingsCount,
          latestBookingStatus,
          avatarUrl: getWhatsappContactAvatarUrlCached(conversation.phone),
        };
      }),
    );

    return res.json({ conversations: enrichedConversations });
  } catch (error) {
    console.error('Erro ao listar conversas do inbox:', error);
    return res.status(500).json({ error: 'Erro ao listar conversas do inbox.' });
  }
});

adminRoutes.post('/inbox/avatars', async (req, res) => {
  try {
    const phones: string[] = Array.isArray(req.body?.phones) ? req.body.phones.slice(0, 50) : [];
    if (phones.length === 0) return res.json({ avatars: {} });

    const avatars: Record<string, string | null> = {};
    await Promise.all(
      phones.map(async (phone) => {
        try {
          avatars[phone] = await Promise.race([
            getWhatsappContactAvatarUrl(phone),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
        } catch {
          avatars[phone] = null;
        }
      }),
    );

    return res.json({ avatars });
  } catch (error) {
    console.error('Erro ao buscar avatars:', error);
    return res.status(500).json({ error: 'Erro ao buscar avatars.' });
  }
});

adminRoutes.get('/inbox/contacts', async (req, res) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q : '';
    const contacts = await inboxStore.listContacts(search);
    return res.json({ contacts });
  } catch (error) {
    console.error('Erro ao listar contatos do inbox:', error);
    return res.status(500).json({ error: 'Erro ao listar contatos.' });
  }
});

adminRoutes.get('/inbox/conversations/:id/panel', async (req, res) => {
  const threadId = parseBookingId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa inválido.' });
  }

  try {
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    // Fetch bookings and lastMessage in parallel; skip avatar to avoid WhatsApp API delay
    const [bookings, lastMessage] = await Promise.all([
      bookingStore.listByWhatsappThread(threadId),
      inboxStore.getLastMessageContent(threadId),
    ]);

    const pendingBookingsCount = bookings.filter((b) => b.status === 'pending').length;
    const latestBookingStatus = bookings[0]?.status || null;

    // Fetch avatar in background without blocking response
    let avatarUrl: string | null = null;
    try {
      avatarUrl = await Promise.race([
        getWhatsappContactAvatarUrl(thread.phone),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
    } catch { /* ignore */ }

    return res.json({
      conversation: {
        ...thread,
        lastMessage,
        pendingBookingsCount,
        latestBookingStatus,
        avatarUrl,
      },
      bookings,
    });
  } catch (error) {
    console.error('Erro ao carregar painel da conversa:', error);
    return res.status(500).json({ error: 'Erro ao carregar painel da conversa.' });
  }
});

adminRoutes.get('/inbox/conversations/:id/messages', async (req, res) => {
  const threadId = parseBookingId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa inválido.' });
  }

  try {
    // Fetch messages immediately; mark as read in background (non-blocking)
    const messages = await inboxStore.listMessages(threadId);
    void inboxStore.markThreadAsRead(threadId).catch((err) =>
      console.error('Erro ao marcar thread como lida:', err),
    );

    const withDeliveryStatus = messages.map((message) => ({
      ...message,
      deliveryStatus:
        message.direction === 'outgoing' ? getOutgoingDeliveryStatus(message.providerMessageId) || 'sent' : undefined,
    }));

    return res.json({ messages: withDeliveryStatus });
  } catch (error) {
    console.error('Erro ao listar mensagens do inbox:', error);
    return res.status(500).json({ error: 'Erro ao listar mensagens do inbox.' });
  }
});

adminRoutes.post('/inbox/conversations/:id/messages', whatsappSendRateLimit, async (req, res) => {
  const threadId = parseBookingId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa inválido.' });
  }

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) {
    return res.status(400).json({ error: 'Conteúdo da mensagem é obrigatório.' });
  }

  if (!whatsappConfig.isConfigured) {
    return res.status(503).json({ error: 'WhatsApp (Baileys) não configurado.' });
  }

  const whatsappStatus = getWhatsappStatus();
  if (!whatsappStatus.connected) {
    return res.status(409).json({
      error: 'WhatsApp desconectado. Conecte via QR Code antes de enviar mensagens.',
      connectionState: whatsappStatus.connectionState,
    });
  }

  try {
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    // Send via WhatsApp and respond immediately
    const providerMessageId = await sendWhatsappMessageToCustomer(thread.phone, content);

    // Respond to client right away — persist in background
    res.json({ message: 'Mensagem enviada com sucesso.' });

    // Save to DB in background (non-blocking)
    void inboxStore.addMessage({
      threadId: thread.id,
      direction: 'outgoing',
      content,
      providerMessageId,
      isRead: true,
    }).catch((err) => console.error('Erro ao salvar mensagem enviada:', err));
  } catch (error) {
    console.error('Erro ao enviar mensagem do inbox:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erro ao enviar mensagem do inbox.' });
    }
  }
});

adminRoutes.get('/whatsapp/status', (_req, res) => {
  res.json(getWhatsappStatus());
});

adminRoutes.post('/whatsapp/connect', whatsappControlRateLimit, async (_req, res) => {
  if (!whatsappConfig.isConfigured) {
    return res.status(503).json({ error: 'WhatsApp (Baileys) não habilitado.' });
  }

  try {
    await connectWhatsapp();
    return res.json({ message: 'Conexão WhatsApp iniciada.', status: getWhatsappStatus() });
  } catch (error) {
    console.error('Erro ao conectar WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao conectar WhatsApp.' });
  }
});

adminRoutes.post('/whatsapp/disconnect', whatsappControlRateLimit, async (_req, res) => {
  try {
    // Full logout to clear session and allow connecting a different number
    await logoutWhatsapp();
    try { await logoutEvolutionInstance(); } catch { /* ignore if not configured */ }
    return res.json({ message: 'WhatsApp desconectado. Sessão encerrada.', status: getWhatsappStatus() });
  } catch (error) {
    console.error('Erro ao desconectar WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao desconectar WhatsApp.' });
  }
});

adminRoutes.post('/whatsapp/reconnect', whatsappControlRateLimit, async (_req, res) => {
  if (!whatsappConfig.isConfigured) {
    return res.status(503).json({ error: 'WhatsApp (Baileys) não habilitado.' });
  }

  try {
    await reconnectWhatsapp();
    return res.json({ message: 'WhatsApp reconectado.', status: getWhatsappStatus() });
  } catch (error) {
    console.error('Erro ao reconectar WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao reconectar WhatsApp.' });
  }
});

adminRoutes.post('/whatsapp/logout', whatsappControlRateLimit, async (_req, res) => {
  if (!whatsappConfig.isConfigured) {
    return res.status(503).json({ error: 'WhatsApp (Baileys) não habilitado.' });
  }

  try {
    await logoutWhatsapp();
    // Also logout from Evolution API to fully clear the session
    try { await logoutEvolutionInstance(); } catch { /* ignore if not configured */ }
    return res.json({ message: 'Sessão encerrada. Escaneie o novo QR Code.', status: getWhatsappStatus() });
  } catch (error) {
    console.error('Erro ao fazer logout WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao fazer logout do WhatsApp.' });
  }
});

adminRoutes.delete('/inbox/conversations/:id', async (req, res) => {
  const threadId = parseBookingId(req.params.id);
  if (!threadId) {
    return res.status(400).json({ error: 'ID de conversa inválido.' });
  }

  try {
    const thread = await inboxStore.findThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    await inboxStore.deleteThread(threadId);
    return res.json({ message: 'Conversa excluída com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir conversa:', error);
    return res.status(500).json({ error: 'Erro ao excluir conversa.' });
  }
});
