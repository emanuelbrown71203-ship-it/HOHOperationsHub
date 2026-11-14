-- Store settings, AM/PM shifts, weekly focus, shoutouts, shift handoffs with photos,
-- position checklists with attached files, and photos on kitchen notes.

------------------------------------------------------------------------------
-- Store settings (one row)
------------------------------------------------------------------------------
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  store_name text not null default 'Our Store',
  shifts jsonb not null default '[{"name":"AM","start":"05:00"},{"name":"PM","start":"14:00"}]',
  waste_reasons jsonb not null default '["Overcooked / burnt","Hold time expired","Dropped / contaminated","Overproduction","Quality issue","Customer return","Other"]',
  waste_units jsonb not null default '["each","lbs","orders","pans","bags","trays","cases"]',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
alter table public.app_settings enable row level security;
create policy "app_settings: read" on public.app_settings for select to authenticated using (public.is_active_user());
create policy "app_settings: update" on public.app_settings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

------------------------------------------------------------------------------
-- HOH Lead checklists: daily or weekly, on the AM/PM shifts
------------------------------------------------------------------------------
alter table public.checklist_templates
  add column frequency text not null default 'daily' check (frequency in ('daily', 'weekly'));
update public.checklist_templates set frequency = 'weekly' where name ilike '%weekly%';
update public.checklist_templates set name = 'AM Opening', shift = 'AM' where name = 'Opening';
update public.checklist_templates set name = 'Shift Swap', shift = 'AM' where name = 'Mid-Shift';
update public.checklist_templates set name = 'PM Close', shift = 'PM' where name = 'Closing';

------------------------------------------------------------------------------
-- Attribution helper for rows that only managers write (focus, shoutouts)
------------------------------------------------------------------------------
create or replace function public.set_created_by() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.created_by_name := coalesce((select nullif(trim(full_name), '') from public.profiles where id = auth.uid()), 'Unknown');
  end if;
  return new;
end $$;
revoke execute on function public.set_created_by() from public, anon, authenticated;

------------------------------------------------------------------------------
-- Focus of the week
------------------------------------------------------------------------------
create table public.weekly_focus (
  week_start date primary key,           -- Monday of the week
  focus text not null check (length(trim(focus)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default 'Unknown',
  updated_at timestamptz not null default now()
);
create trigger weekly_focus_created_by before insert or update on public.weekly_focus
  for each row execute function public.set_created_by();

------------------------------------------------------------------------------
-- Shoutouts to HOH Leads
------------------------------------------------------------------------------
create table public.shoutouts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.hoh_leads(id) on delete set null,
  lead_name text not null check (length(trim(lead_name)) > 0),
  message text not null check (length(trim(message)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default 'Unknown',
  created_at timestamptz not null default now()
);
create index on public.shoutouts (created_at desc);
create trigger shoutouts_created_by before insert on public.shoutouts
  for each row execute function public.set_created_by();

------------------------------------------------------------------------------
-- Shift handoffs: leaving shift's notes + photos, incoming shift's rating
------------------------------------------------------------------------------
create table public.shift_handoffs (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  shift text not null,
  notes text,
  notes_by_name text,
  notes_at timestamptz,
  submitted_at timestamptz,
  submitted_by_name text,
  rating int check (rating between 1 and 5),
  rating_comment text,
  rated_by_name text,
  rated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shift_date, shift)
);

create table public.handoff_photos (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.shift_handoffs(id) on delete cascade,
  path text not null,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_by_name text not null default 'Unknown',
  created_at timestamptz not null default now()
);
create index on public.handoff_photos (handoff_id);

create or replace function public.ensure_handoff(p_date date, p_shift text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.shift_handoffs (shift_date, shift) values (p_date, p_shift)
    on conflict (shift_date, shift) do nothing;
  select id into v_id from public.shift_handoffs where shift_date = p_date and shift = p_shift;
  return v_id;
end $$;
revoke execute on function public.ensure_handoff(date, text) from public, anon, authenticated;

-- Leaving shift: save notes and/or submit the handoff.
create or replace function public.save_handoff(
  p_date date, p_shift text, p_notes text, p_lead_id uuid default null, p_submit boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := public.actor_name(p_lead_id);
  v_id uuid := public.ensure_handoff(p_date, p_shift);
begin
  update public.shift_handoffs set
    notes = nullif(trim(p_notes), ''),
    notes_by_name = case when nullif(trim(p_notes), '') is null then null else v_name end,
    notes_at = case when nullif(trim(p_notes), '') is null then null else now() end,
    submitted_at = case when p_submit then now() else submitted_at end,
    submitted_by_name = case when p_submit then v_name else submitted_by_name end
  where id = v_id;
  return v_id;
end $$;

-- Incoming shift: rate the previous shift's setup.
create or replace function public.rate_handoff(
  p_date date, p_shift text, p_rating int, p_comment text default null, p_lead_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := public.actor_name(p_lead_id);
  v_id uuid := public.ensure_handoff(p_date, p_shift);
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose 1 to 5 stars';
  end if;
  update public.shift_handoffs set
    rating = p_rating, rating_comment = nullif(trim(p_comment), ''), rated_by_name = v_name, rated_at = now()
  where id = v_id;
  return v_id;
end $$;

-- Record an uploaded handoff photo (the file itself goes to storage first).
create or replace function public.add_handoff_photo(
  p_date date, p_shift text, p_path text, p_lead_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := public.actor_name(p_lead_id);
  v_id uuid := public.ensure_handoff(p_date, p_shift);
  v_photo uuid;
begin
  insert into public.handoff_photos (handoff_id, path, user_id, uploaded_by_name)
    values (v_id, p_path, auth.uid(), v_name) returning id into v_photo;
  return v_photo;
end $$;

revoke execute on function public.save_handoff(date, text, text, uuid, boolean) from public, anon;
revoke execute on function public.rate_handoff(date, text, int, text, uuid) from public, anon;
revoke execute on function public.add_handoff_photo(date, text, text, uuid) from public, anon;
grant execute on function public.save_handoff(date, text, text, uuid, boolean) to authenticated;
grant execute on function public.rate_handoff(date, text, int, text, uuid) to authenticated;
grant execute on function public.add_handoff_photo(date, text, text, uuid) to authenticated;

------------------------------------------------------------------------------
-- Position checklists (the physical checklist, attached as photos or PDFs)
------------------------------------------------------------------------------
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.position_files (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  path text not null,
  file_name text not null,
  content_type text,
  created_at timestamptz not null default now()
);
create index on public.position_files (position_id);

insert into public.positions (name, sort_order) values
  ('Breading', 1), ('Fries', 2), ('Machines', 3), ('Prep', 4), ('Grill', 5), ('Dish', 6);

------------------------------------------------------------------------------
-- Kitchen notes: optional photo, and a "general kitchen" spot for notes not tied to equipment
------------------------------------------------------------------------------
alter table public.equipment_logs add column photo_path text;
insert into public.equipment (name, category, sort_order) values ('Kitchen (general)', 'Other', 0);

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------
alter table public.weekly_focus enable row level security;
alter table public.shoutouts enable row level security;
alter table public.shift_handoffs enable row level security;
alter table public.handoff_photos enable row level security;
alter table public.positions enable row level security;
alter table public.position_files enable row level security;

-- Everyone approved can read; managers write focus, shoutouts, positions and their files.
do $$
declare t text;
begin
  foreach t in array array['weekly_focus','shoutouts','positions','position_files'] loop
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (public.is_active_user())', t);
    execute format('create policy "%1$s: insert" on public.%1$I for insert to authenticated with check (public.is_manager())', t);
    execute format('create policy "%1$s: update" on public.%1$I for update to authenticated using (public.is_manager()) with check (public.is_manager())', t);
    execute format('create policy "%1$s: delete" on public.%1$I for delete to authenticated using (public.is_manager())', t);
  end loop;
end $$;

-- Handoffs are written only through the functions above (which record who did it).
create policy "shift_handoffs: read" on public.shift_handoffs for select to authenticated using (public.is_active_user());
create policy "handoff_photos: read" on public.handoff_photos for select to authenticated using (public.is_active_user());
create policy "handoff_photos: delete" on public.handoff_photos for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_manager()));

revoke all on public.app_settings, public.weekly_focus, public.shoutouts, public.shift_handoffs,
  public.handoff_photos, public.positions, public.position_files from anon;

------------------------------------------------------------------------------
-- File storage (private): handoff photos, note photos, position checklists
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hoh-files', 'hoh-files', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);

create policy "hoh-files: read" on storage.objects for select to authenticated
  using (bucket_id = 'hoh-files' and public.is_active_user());
create policy "hoh-files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'hoh-files' and public.is_active_user());
create policy "hoh-files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hoh-files' and (owner = auth.uid() or public.is_manager()));

alter publication supabase_realtime add table
  public.app_settings, public.weekly_focus, public.shoutouts, public.shift_handoffs,
  public.handoff_photos, public.positions, public.position_files;
