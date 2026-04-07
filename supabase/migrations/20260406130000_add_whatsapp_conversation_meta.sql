create table if not exists public.whatsapp_conversation_meta (
  thread_id bigint primary key references public.whatsapp_threads(id) on delete cascade,
  assignee_id text,
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  labels jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_internal_notes (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.whatsapp_threads(id) on delete cascade,
  content text not null,
  author text,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_sync_state (
  id bigint generated always as identity primary key,
  scope text not null,
  source text not null,
  cursor text,
  status text not null default 'idle' check (status in ('idle', 'running', 'error')),
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (scope, source)
);

create table if not exists public.whatsapp_contact_map (
  id bigint generated always as identity primary key,
  thread_id bigint references public.whatsapp_threads(id) on delete set null,
  phone text not null,
  wa_jid text,
  evolution_contact_id text,
  chatwoot_contact_id bigint,
  crm_client_id bigint,
  push_name text,
  avatar_url text,
  last_source text not null default 'unknown',
  last_synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone)
);

create table if not exists public.whatsapp_conversation_map (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.whatsapp_threads(id) on delete cascade,
  wa_jid text,
  evolution_chat_id text,
  chatwoot_conversation_id bigint,
  last_source text not null default 'unknown',
  last_synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id)
);

create index if not exists whatsapp_conversation_meta_status_idx
  on public.whatsapp_conversation_meta (status);

create index if not exists whatsapp_internal_notes_thread_idx
  on public.whatsapp_internal_notes (thread_id, created_at desc);

create index if not exists whatsapp_sync_state_scope_idx
  on public.whatsapp_sync_state (scope, source);

create index if not exists whatsapp_contact_map_source_idx
  on public.whatsapp_contact_map (last_source, updated_at desc);

create index if not exists whatsapp_conversation_map_source_idx
  on public.whatsapp_conversation_map (last_source, updated_at desc);

drop trigger if exists whatsapp_conversation_meta_set_updated_at on public.whatsapp_conversation_meta;
create trigger whatsapp_conversation_meta_set_updated_at
before update on public.whatsapp_conversation_meta
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_sync_state_set_updated_at on public.whatsapp_sync_state;
create trigger whatsapp_sync_state_set_updated_at
before update on public.whatsapp_sync_state
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_contact_map_set_updated_at on public.whatsapp_contact_map;
create trigger whatsapp_contact_map_set_updated_at
before update on public.whatsapp_contact_map
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_conversation_map_set_updated_at on public.whatsapp_conversation_map;
create trigger whatsapp_conversation_map_set_updated_at
before update on public.whatsapp_conversation_map
for each row execute function public.set_updated_at();
