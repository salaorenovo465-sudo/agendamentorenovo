create table if not exists public.bookings (
  id bigint generated always as identity primary key,
  service text not null,
  service_price text,
  date text not null,
  time text not null,
  name text not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  google_event_id text,
  rejection_reason text,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_date_idx on public.bookings (date);
create index if not exists bookings_date_time_idx on public.bookings (date, time);
create index if not exists bookings_status_idx on public.bookings (status);

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
