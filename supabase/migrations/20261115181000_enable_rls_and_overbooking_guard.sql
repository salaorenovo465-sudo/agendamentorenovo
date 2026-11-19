-- Habilitar Row Level Security (RLS) em todas as tabelas
-- para bloquear acesso direto anônimo não autorizado via PostgREST.

do $$
declare
  tbl text;
  tables text[] := array[
    'bookings',
    'whatsapp_threads',
    'whatsapp_messages',
    'whatsapp_conversation_meta',
    'whatsapp_internal_notes',
    'whatsapp_sync_state',
    'whatsapp_contact_map',
    'whatsapp_conversation_map',
    'availability_rules',
    'clients',
    'leads',
    'services_catalog',
    'professionals',
    'financial_entries',
    'reviews',
    'tasks',
    'automations',
    'app_settings'
  ];
begin
  foreach tbl in array tables loop
    if exists (
      select 1 from information_schema.tables 
      where table_schema = 'public' and table_name = tbl
    ) then
      execute format('alter table public.%I enable row level security;', tbl);
      execute format('drop policy if exists service_role_all_%I on public.%I;', tbl, tbl);
      execute format('create policy service_role_all_%I on public.%I for all to service_role using (true) with check (true);', tbl, tbl);
    end if;
  end loop;
end;
$$;

-- Índice único condicional para impedir Overbooking (concorrência de agendamento no mesmo horário)
create unique index if not exists bookings_unique_active_slot_idx 
on public.bookings (date, time) 
where status in ('pending', 'confirmed');
