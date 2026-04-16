create table if not exists public.bookings (
  id bigint generated always as identity primary key,
  service text not null,
  service_price text,
  service_items jsonb not null default '[]'::jsonb,
  date text not null,
  time text not null,
  name text not null,
  phone text not null,
  professional_id bigint,
  professional_name text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'completed')),
  google_event_id text,
  whatsapp_thread_id bigint,
  rejection_reason text,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.availability_rules (
  id bigint generated always as identity primary key,
  title text not null,
  type text not null default 'horario',
  weekday integer,
  start_time text,
  end_time text,
  limit_per_day integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  email text,
  birth_date text,
  notes text,
  status text not null default 'ativo',
  tags text,
  preferred_service text,
  preferred_professional text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  source text,
  stage text not null default 'novo',
  owner text,
  next_contact_at text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services_catalog (
  id bigint generated always as identity primary key,
  name text not null,
  category text,
  duration_min integer not null default 0,
  price numeric(10,2) not null default 0,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professionals (
  id bigint generated always as identity primary key,
  name text not null,
  phone text,
  email text,
  cpf text,
  birth_date text,
  address text,
  notes text,
  specialties text,
  work_start text,
  work_end text,
  base_commission numeric(5,2) not null default 0,
  commission_profile jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_entries (
  id bigint generated always as identity primary key,
  booking_id bigint,
  client_name text,
  service_name text,
  amount numeric(10,2) not null default 0,
  payment_method text,
  status text not null default 'pendente',
  due_date text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  client_name text not null,
  professional_name text,
  score integer not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  title text not null,
  owner text,
  due_date text,
  priority text not null default 'media',
  status text not null default 'pendente',
  notes text,
  related_client text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automations (
  id bigint generated always as identity primary key,
  name text not null,
  trigger_type text,
  message_template text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

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

create index if not exists bookings_date_idx on public.bookings (date);
create index if not exists bookings_date_time_idx on public.bookings (date, time);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_whatsapp_thread_idx on public.bookings (whatsapp_thread_id);
create index if not exists bookings_professional_id_idx on public.bookings (professional_id);
create index if not exists whatsapp_threads_last_message_idx on public.whatsapp_threads (last_message_at desc);
create index if not exists whatsapp_messages_thread_created_idx on public.whatsapp_messages (thread_id, created_at desc);
create index if not exists whatsapp_conversation_meta_status_idx on public.whatsapp_conversation_meta (status);
create index if not exists whatsapp_internal_notes_thread_idx on public.whatsapp_internal_notes (thread_id, created_at desc);
create index if not exists whatsapp_sync_state_scope_idx on public.whatsapp_sync_state (scope, source);
create index if not exists whatsapp_contact_map_source_idx on public.whatsapp_contact_map (last_source, updated_at desc);
create index if not exists whatsapp_conversation_map_source_idx on public.whatsapp_conversation_map (last_source, updated_at desc);
create index if not exists availability_rules_active_idx on public.availability_rules(active);
create index if not exists clients_phone_idx on public.clients(phone);
create index if not exists leads_stage_idx on public.leads(stage);
create index if not exists services_catalog_active_idx on public.services_catalog(active);
create index if not exists professionals_active_idx on public.professionals(active);
create index if not exists financial_entries_status_idx on public.financial_entries(status);
create index if not exists tasks_status_idx on public.tasks(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();

drop trigger if exists whatsapp_threads_set_updated_at on public.whatsapp_threads;
create trigger whatsapp_threads_set_updated_at
before update on public.whatsapp_threads
for each row
execute function public.set_updated_at();

drop trigger if exists availability_rules_set_updated_at on public.availability_rules;
create trigger availability_rules_set_updated_at
before update on public.availability_rules
for each row execute function public.set_updated_at();

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

drop trigger if exists services_catalog_set_updated_at on public.services_catalog;
create trigger services_catalog_set_updated_at
before update on public.services_catalog
for each row execute function public.set_updated_at();

drop trigger if exists professionals_set_updated_at on public.professionals;
create trigger professionals_set_updated_at
before update on public.professionals
for each row execute function public.set_updated_at();

drop trigger if exists financial_entries_set_updated_at on public.financial_entries;
create trigger financial_entries_set_updated_at
before update on public.financial_entries
for each row execute function public.set_updated_at();

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
before update on public.reviews
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists automations_set_updated_at on public.automations;
create trigger automations_set_updated_at
before update on public.automations
for each row execute function public.set_updated_at();

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
