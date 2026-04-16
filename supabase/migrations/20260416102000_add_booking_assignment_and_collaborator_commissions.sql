alter table if exists public.bookings
  add column if not exists service_items jsonb not null default '[]'::jsonb;

alter table if exists public.bookings
  add column if not exists professional_id bigint;

alter table if exists public.bookings
  add column if not exists professional_name text;

create index if not exists bookings_professional_id_idx on public.bookings (professional_id);

alter table if exists public.professionals
  add column if not exists phone text;

alter table if exists public.professionals
  add column if not exists email text;

alter table if exists public.professionals
  add column if not exists cpf text;

alter table if exists public.professionals
  add column if not exists birth_date text;

alter table if exists public.professionals
  add column if not exists address text;

alter table if exists public.professionals
  add column if not exists notes text;

alter table if exists public.professionals
  add column if not exists base_commission numeric(5,2) not null default 0;

alter table if exists public.professionals
  add column if not exists commission_profile jsonb not null default '[]'::jsonb;
