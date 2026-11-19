-- Otimizacao de consultas e paginacao de agendamentos finalizados (Agenda Principal + Historico Dedicado)

alter table if exists public.bookings
  add column if not exists completed_at timestamptz;

-- Backfill seguro para registros ja finalizados usando updated_at
update public.bookings
set completed_at = updated_at
where status = 'completed'
  and completed_at is null;

-- Trigger para preencher/limpar completed_at automaticamente na mudanca de status
create or replace function public.sync_booking_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed' or new.completed_at is null) then
    new.completed_at = coalesce(new.completed_at, now());
  elsif new.status <> 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_sync_completed_at on public.bookings;
create trigger bookings_sync_completed_at
before insert or update on public.bookings
for each row
execute function public.sync_booking_completed_at();

-- Indice composto parcial para buscar os 20 finalizados mais recentes e paginar o historico por tenant
create index if not exists bookings_completed_tenant_updated_id_idx
  on public.bookings (tenant_slug, updated_at desc, date desc, time desc, id desc)
  where status = 'completed';

-- Indice composto parcial para filtro por periodo de finalizados
create index if not exists bookings_completed_tenant_date_id_idx
  on public.bookings (tenant_slug, date desc, time desc, id desc)
  where status = 'completed';

-- Indice composto parcial para o quadro ativo (pending e confirmed)
create index if not exists bookings_active_tenant_date_time_idx
  on public.bookings (tenant_slug, status, date asc, time asc, id asc)
  where status in ('pending', 'confirmed');
