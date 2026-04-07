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
  specialties text,
  work_start text,
  work_end text,
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

create index if not exists availability_rules_active_idx on public.availability_rules(active);
create index if not exists clients_phone_idx on public.clients(phone);
create index if not exists leads_stage_idx on public.leads(stage);
create index if not exists services_catalog_active_idx on public.services_catalog(active);
create index if not exists professionals_active_idx on public.professionals(active);
create index if not exists financial_entries_status_idx on public.financial_entries(status);
create index if not exists tasks_status_idx on public.tasks(status);

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
