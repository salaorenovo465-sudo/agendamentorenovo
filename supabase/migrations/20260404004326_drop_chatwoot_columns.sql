alter table if exists public.bookings
  drop column if exists chatwoot_contact_id,
  drop column if exists chatwoot_conversation_id;

drop index if exists bookings_chatwoot_conversation_idx;
