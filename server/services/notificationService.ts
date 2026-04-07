import { inboxStore } from '../db/inboxStore';
import { bookingStore } from '../db/bookingStore';
import type { BookingRecord } from '../types';

import { sendWhatsappMessageToCustomer, sendWhatsappMessageToSalon } from './whatsappService';

const formatBookingDate = (date: string): string => date.split('-').reverse().join('/');

const formatBookingSummary = (booking: BookingRecord): string => {
  const price = booking.servicePrice || 'Sob consulta';
  const prettyDate = formatBookingDate(booking.date);

  return [
    `ID: #${booking.id}`,
    `Cliente: ${booking.name}`,
    `WhatsApp: ${booking.phone}`,
    `Servico: ${booking.service}`,
    `Valor: ${price}`,
    `Data: ${prettyDate}`,
    `Horario: ${booking.time}`,
  ].join('\n');
};

const safeRun = async (label: string, callback: () => Promise<void>): Promise<boolean> => {
  try {
    await callback();
    return true;
  } catch (error) {
    console.error(`Falha em ${label}:`, error);
    return false;
  }
};

const ensureThreadId = async (booking: BookingRecord): Promise<number | null> => {
  if (booking.whatsappThreadId) {
    return booking.whatsappThreadId;
  }

  try {
    const thread = await inboxStore.ensureThread(booking.phone, booking.name);
    return thread.id;
  } catch (error) {
    console.error('Falha ao garantir thread para notificacao:', error);
    return null;
  }
};

const sendAndTrackCustomerMessage = async (booking: BookingRecord, message: string): Promise<void> => {
  const threadId = await ensureThreadId(booking);
  let providerMessageId: string | null = null;

  const sentSuccessfully = await safeRun('whatsapp-customer-send', async () => {
    providerMessageId = await sendWhatsappMessageToCustomer(booking.phone, message);
  });

  if (threadId) {
    await safeRun('inbox-track-outgoing', async () => {
      await inboxStore.addMessage({
        threadId,
        direction: sentSuccessfully ? 'outgoing' : 'system',
        content: sentSuccessfully ? message : `Falha ao enviar para cliente: ${message}`,
        providerMessageId,
        isRead: true,
      });
    });
  }
};

export const notifySalonNewBooking = async (booking: BookingRecord): Promise<void> => {
  const prettyDate = formatBookingDate(booking.date);
  const price = booking.servicePrice || 'Sob consulta';

  const message = [
    '✨ *NOVA SOLICITAÇÃO DE AGENDAMENTO* ✨',
    '',
    'Uma nova reserva acabou de chegar! 🌸',
    '',
    `👑 *SERVIÇO:* ${booking.service}`,
    `💰 *VALOR:* ${price}`,
    `📅 *DATA:* ${prettyDate}`,
    `⏰ *HORÁRIO:* ${booking.time}`,
    '',
    `👤 *CLIENTE:* ${booking.name}`,
    `📱 *WHATSAPP:* ${booking.phone}`,
    '',
    '⚡ Acesse o painel admin para confirmar ou remarcar.',
  ].join('\n');

  await safeRun('whatsapp-salon-send', async () => {
    await sendWhatsappMessageToSalon(message);
  });
};

export const notifyCustomerPendingBooking = async (booking: BookingRecord): Promise<void> => {
  const prettyDate = formatBookingDate(booking.date);
  const price = booking.servicePrice || 'Sob consulta';

  const message = [
    `✨ *AGENDAMENTO RECEBIDO* ✨`,
    '',
    `Olá, *${booking.name}*! 🌸`,
    'Que bom ter você conosco! Recebemos sua solicitação de agendamento no *Estúdio Renovo*.',
    '',
    `👑 *SERVIÇO:* ${booking.service}`,
    `💰 *VALOR:* ${price}`,
    `📅 *DATA:* ${prettyDate}`,
    `⏰ *HORÁRIO:* ${booking.time}`,
    '',
    '📋 *STATUS:* Aguardando confirmação da nossa equipe.',
    '',
    'Em breve você receberá a confirmação! Fique tranquila(o). 🤍✨',
    '',
    '_Caso precise cancelar, é só nos enviar uma mensagem com a palavra *cancelar*._',
  ].join('\n');

  await sendAndTrackCustomerMessage(booking, message);
};

export const notifyCustomerConfirmedBooking = async (booking: BookingRecord): Promise<void> => {
  const prettyDate = formatBookingDate(booking.date);
  const price = booking.servicePrice || 'Sob consulta';

  const message = [
    `✅ *AGENDAMENTO CONFIRMADO* ✅`,
    '',
    `Olá, *${booking.name}*! 🎉`,
    'Temos uma ótima notícia! Seu agendamento no *Estúdio Renovo* foi *CONFIRMADO* com sucesso!',
    '',
    `👑 *SERVIÇO:* ${booking.service}`,
    `💰 *VALOR:* ${price}`,
    `📅 *DATA:* ${prettyDate}`,
    `⏰ *HORÁRIO:* ${booking.time}`,
    '',
    'Te esperamos no horário combinado! Chegue com 5 minutinhos de antecedência para que possamos te receber da melhor forma. 💖',
    '',
    '✨ Prepare-se para uma experiência incrível! ✨',
    '',
    '_Caso precise remarcar ou cancelar, é só nos enviar uma mensagem._ 🤍',
  ].join('\n');

  await sendAndTrackCustomerMessage(booking, message);
};

export const notifyCustomerRejectedBooking = async (booking: BookingRecord): Promise<void> => {
  const prettyDate = formatBookingDate(booking.date);
  const rejectionReason = booking.rejectionReason;

  const message = [
    `⚠️ *AGENDAMENTO NÃO DISPONÍVEL* ⚠️`,
    '',
    `Olá, *${booking.name}*! 🌸`,
    'Pedimos desculpas, mas infelizmente não foi possível confirmar seu agendamento no *Estúdio Renovo*.',
    '',
    `👑 *SERVIÇO:* ${booking.service}`,
    `📅 *DATA:* ${prettyDate}`,
    `⏰ *HORÁRIO:* ${booking.time}`,
    rejectionReason ? `\n📝 *MOTIVO:* ${rejectionReason}` : null,
    '',
    'Mas não se preocupe! Ficaremos felizes em encontrar outro horário perfeito para você. 💖',
    '',
    'Responda esta mensagem e vamos agendar juntos um novo horário! ✨',
  ]
    .filter(Boolean)
    .join('\n');

  await sendAndTrackCustomerMessage(booking, message);
};

export const notifyCustomerRescheduledBooking = async (booking: BookingRecord): Promise<void> => {
  const prettyDate = formatBookingDate(booking.date);
  const price = booking.servicePrice || 'Sob consulta';

  const message = [
    `🔄 *AGENDAMENTO REMARCADO* 🔄`,
    '',
    `Olá, *${booking.name}*! 🌸`,
    'Pedimos desculpas pelo transtorno, mas precisamos fazer uma pequena alteração no seu agendamento no *Estúdio Renovo*.',
    '',
    '📌 *NOVA DATA E HORÁRIO:*',
    `👑 *SERVIÇO:* ${booking.service}`,
    `💰 *VALOR:* ${price}`,
    `📅 *DATA:* ${prettyDate}`,
    `⏰ *HORÁRIO:* ${booking.time}`,
    '',
    'Esperamos que o novo horário funcione bem para você! Caso precise de outro ajuste, é só nos avisar. 💖',
    '',
    '✨ Estamos ansiosos para te receber! ✨',
    '',
    '_Caso precise cancelar, é só nos enviar uma mensagem com a palavra *cancelar*._ 🤍',
  ].join('\n');

  await sendAndTrackCustomerMessage(booking, message);
};

export const notifyCustomerCancelledBooking = async (booking: BookingRecord): Promise<void> => {
  const prettyDate = formatBookingDate(booking.date);

  const message = [
    `❌ *AGENDAMENTO CANCELADO* ❌`,
    '',
    `Olá, *${booking.name}*! 🌸`,
    'Conforme sua solicitação, seu agendamento no *Estúdio Renovo* foi cancelado com sucesso.',
    '',
    `👑 *SERVIÇO:* ${booking.service}`,
    `📅 *DATA:* ${prettyDate}`,
    `⏰ *HORÁRIO:* ${booking.time}`,
    '',
    'Sentiremos sua falta! 💖 Sempre que quiser, é só agendar novamente pelo nosso site ou por aqui mesmo.',
    '',
    '✨ Até breve! ✨',
  ].join('\n');

  await sendAndTrackCustomerMessage(booking, message);
};

/**
 * Checks if an incoming message from a client is requesting a cancellation.
 * If so, finds their pending/confirmed bookings by phone number and cancels them.
 * Returns true if a cancellation was processed.
 */
export const handleClientCancellationRequest = async (phone: string, text: string): Promise<boolean> => {
  const normalizedText = text.toLowerCase().trim();

  // Check if the message contains cancellation intent
  const cancelKeywords = ['cancelar', 'cancela', 'cancelamento', 'cancelo', 'quero cancelar', 'desmarcar', 'desmarco'];
  const isCancelRequest = cancelKeywords.some((kw) => normalizedText.includes(kw));

  if (!isCancelRequest) return false;

  try {
    const bookings = await bookingStore.listByPhone(phone);
    const activeBookings = bookings.filter(
      (b) => b.status === 'pending' || b.status === 'confirmed',
    );

    if (activeBookings.length === 0) return false;

    // Cancel the most recent active booking
    const bookingToCancel = activeBookings[0];
    await bookingStore.updateStatus({
      id: bookingToCancel.id,
      status: 'rejected',
      rejectionReason: 'Cancelado a pedido do cliente via WhatsApp',
    });

    const updatedBooking = await bookingStore.getById(bookingToCancel.id);
    if (updatedBooking) {
      await notifyCustomerCancelledBooking(updatedBooking);

      // Notify salon about the cancellation
      const prettyDate = formatBookingDate(updatedBooking.date);
      const salonMessage = [
        `⚠️ *CANCELAMENTO SOLICITADO PELO CLIENTE* ⚠️`,
        '',
        `O cliente *${updatedBooking.name}* solicitou o cancelamento via WhatsApp.`,
        '',
        `👑 *SERVIÇO:* ${updatedBooking.service}`,
        `📅 *DATA:* ${prettyDate}`,
        `⏰ *HORÁRIO:* ${updatedBooking.time}`,
        `📱 *WHATSAPP:* ${updatedBooking.phone}`,
        '',
        '📋 O agendamento foi cancelado automaticamente.',
      ].join('\n');

      await safeRun('whatsapp-salon-cancel-notify', async () => {
        await sendWhatsappMessageToSalon(salonMessage);
      });
    }

    return true;
  } catch (error) {
    console.error('Erro ao processar cancelamento via mensagem:', error);
    return false;
  }
};
