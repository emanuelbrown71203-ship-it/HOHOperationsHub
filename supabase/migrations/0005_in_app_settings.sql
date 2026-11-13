-- Everything a lead or director should be able to change without touching code.

-- Store-wide settings (one row).
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  store_name text not null default 'Our Store',
  shifts jsonb not null default '[{"name":"Opening","start":"05:00"},{"name":"Mid","start":"10:30"},{"name":"Closing","start":"16:00"}]',
  waste_reasons jsonb not null default '["Overcooked / burnt","Hold time expired","Dropped / contaminated","Overproduction","Quality issue","Customer return","Other"]',
  waste_units jsonb not null default '["each","lbs","orders","pans","bags","trays","cases"]',
  equipment_actions jsonb not null default '["Filter change","Oil change","Cleaning","Maintenance"]',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

alter table public.app_settings enable row level security;
create policy "app_settings: read" on public.app_settings for select to authenticated using (public.is_active_user());
create policy "app_settings: update" on public.app_settings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
revoke all on public.app_settings from anon;

-- Checklists can repeat daily or weekly (weekly checks are stored on the Monday of that week).
alter table public.checklist_templates
  add column frequency text not null default 'daily' check (frequency in ('daily', 'weekly'));
update public.checklist_templates set frequency = 'weekly' where name ilike '%weekly%';

-- Any piece of equipment can have a recurring task, e.g. "Filter change every 12 hours".
alter table public.equipment
  add column track_action text,
  add column track_hours numeric check (track_hours > 0);
update public.equipment set track_action = 'Filter change', track_hours = 12 where category = 'Fryer';

-- Equipment actions are now whatever the store lists in Settings ('issue' stays special).
alter table public.equipment_logs drop constraint equipment_logs_log_type_check;
update public.equipment_logs set log_type = case log_type
  when 'filter_change' then 'Filter change'
  when 'oil_change' then 'Oil change'
  when 'cleaning' then 'Cleaning'
  when 'maintenance' then 'Maintenance'
  else log_type end;
alter table public.equipment_logs add constraint equipment_logs_log_type_check check (length(trim(log_type)) > 0);

alter publication supabase_realtime add table public.app_settings;
