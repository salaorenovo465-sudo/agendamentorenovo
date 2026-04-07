import { EventEmitter } from 'events';

import type { OutgoingDeliveryStatus } from './whatsappDeliveryStatus';

type InboxRealtimeEventBase = {
  at: string;
};

type PublishableInboxRealtimeEvent =
  | {
      type: 'inbox-updated';
      reason: 'message-created' | 'thread-read' | 'thread-updated' | 'thread-deleted';
      threadId?: number;
    }
  | {
      type: 'whatsapp-state-changed';
    }
  | {
      type: 'message-status';
      providerMessageId: string;
      status: OutgoingDeliveryStatus;
    }
  | {
      type: 'heartbeat';
    };

export type InboxRealtimeEvent = InboxRealtimeEventBase & PublishableInboxRealtimeEvent;

type Subscriber = (event: InboxRealtimeEvent) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const emitEvent = (event: PublishableInboxRealtimeEvent): void => {
  emitter.emit('event', {
    ...event,
    at: new Date().toISOString(),
  } as InboxRealtimeEvent);
};

export const publishInboxUpdated = (
  reason: 'message-created' | 'thread-read' | 'thread-updated' | 'thread-deleted',
  threadId?: number,
): void => {
  emitEvent({
    type: 'inbox-updated',
    reason,
    threadId,
  });
};

export const publishWhatsappStateChanged = (): void => {
  emitEvent({ type: 'whatsapp-state-changed' });
};

export const publishMessageStatus = (providerMessageId: string, status: OutgoingDeliveryStatus): void => {
  if (!providerMessageId) return;
  emitEvent({
    type: 'message-status',
    providerMessageId,
    status,
  });
};

export const subscribeInboxRealtime = (subscriber: Subscriber): (() => void) => {
  const listener = (event: InboxRealtimeEvent): void => {
    subscriber(event);
  };

  emitter.on('event', listener);
  return () => {
    emitter.off('event', listener);
  };
};

export const createHeartbeatEvent = (): InboxRealtimeEvent => ({
  type: 'heartbeat',
  at: new Date().toISOString(),
});
