alter table if exists public.bookings
  add column if not exists chatwoot_contact_id bigint,
  add column if not exists chatwoot_conversation_id bigint;

create index if not exists bookings_chatwoot_conversation_idx
  on public.bookings (chatwoot_conversation_id);
