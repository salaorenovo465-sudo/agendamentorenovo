create table if not exists public.whatsapp_threads (
  id bigint generated always as identity primary key,
  phone text not null unique,
  contact_name text,
  unread_count integer not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.whatsapp_threads(id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing', 'system')),
  content text not null,
  provider_message_id text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table if exists public.bookings
  add column if not exists whatsapp_thread_id bigint references public.whatsapp_threads(id);

create index if not exists whatsapp_threads_last_message_idx on public.whatsapp_threads (last_message_at desc);
create index if not exists whatsapp_messages_thread_created_idx on public.whatsapp_messages (thread_id, created_at desc);
create index if not exists bookings_whatsapp_thread_idx on public.bookings (whatsapp_thread_id);

drop trigger if exists whatsapp_threads_set_updated_at on public.whatsapp_threads;
create trigger whatsapp_threads_set_updated_at
before update on public.whatsapp_threads
for each row
execute function public.set_updated_at();
