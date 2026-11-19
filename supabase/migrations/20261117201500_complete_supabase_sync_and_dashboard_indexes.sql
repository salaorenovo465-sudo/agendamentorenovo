-- Consolidacao completa de colunas multi-tenant, pagamento, RLS e indices da nova Dashboard

-- 1. Colunas faltantes em bookings
alter table if exists public.bookings
  add column if not exists tenant_slug text not null default 'renovo';

alter table if exists public.bookings
  add column if not exists payment_status text not null default 'pendente';

alter table if exists public.bookings
  add column if not exists completed_at timestamptz;

update public.bookings
set completed_at = updated_at
where status = 'completed'
  and completed_at is null;

-- 2. Garantir tenant_slug em todas as tabelas operacionais do Workbench
alter table if exists public.availability_rules add column if not exists tenant_slug text not null default 'renovo';
alter table if exists public.clients add column if not exists tenant_slug text not null default 'renovo';
alter table if exists public.leads add column if not exists tenant_slug text not null default 'renovo';
alter table if exists public.services_catalog add column if not exists tenant_slug text not null default 'renovo';
alter table if exists public.professionals add column if not exists tenant_slug text not null default 'renovo';
alter table if exists public.financial_entries add column if not exists tenant_slug text not null default 'renovo';
alter table if exists public.reviews add column if not exists tenant_slug text not null default 'renovo';
alter table if exists public.tasks add column if not exists tenant_slug text not null default 'renovo';
alter table if exists public.automations add column if not exists tenant_slug text not null default 'renovo';

-- 3. Overbooking guard com isolamento por tenant
drop index if exists public.bookings_unique_active_slot_idx;
create unique index if not exists bookings_unique_active_slot_tenant_idx
  on public.bookings (tenant_slug, date, time)
  where status in ('pending', 'confirmed');

-- 4. Indices compostos para Dashboard (Calendario mensal + Painel financeiro + KPIs + Funil)
create index if not exists bookings_tenant_date_time_id_idx
  on public.bookings (tenant_slug, date asc, time asc, id asc);

create index if not exists financial_entries_tenant_due_id_idx
  on public.financial_entries (tenant_slug, due_date desc, id desc);

create index if not exists financial_entries_tenant_status_due_idx
  on public.financial_entries (tenant_slug, status, due_date desc);

create index if not exists leads_tenant_stage_idx
  on public.leads (tenant_slug, stage);

create index if not exists tasks_tenant_status_idx
  on public.tasks (tenant_slug, status);

create index if not exists clients_tenant_phone_idx
  on public.clients (tenant_slug, phone);

create index if not exists services_catalog_tenant_active_idx
  on public.services_catalog (tenant_slug, active);

create index if not exists professionals_tenant_active_idx
  on public.professionals (tenant_slug, active);
