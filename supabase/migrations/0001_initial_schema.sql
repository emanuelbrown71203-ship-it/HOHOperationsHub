-- HOH Operations Hub: initial schema
-- Roles:
--   pending      new sign-up, waiting for a director to approve (no data access)
--   team_member  can log entries and check off checklists under their own name
--   lead         same as team member + manage leads list, checklists, equipment, waste items
--   director     same as lead + approve users and change roles
--   kitchen      shared store device; every entry is attributed to the selected Shift Lead

------------------------------------------------------------------------------
-- Profiles & role helpers
------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'pending'
    check (role in ('pending','team_member','lead','director','kitchen')),
  created_at timestamptz not null default now()
);

create or replace function public.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = auth.uid()) <> 'pending', false)
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('lead','director'), false)
$$;

-- New sign-ups get a profile. The very first account becomes the director.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'director' else 'pending' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only directors may change roles, and the last director cannot be demoted.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  if new.role is distinct from old.role then
    if auth.uid() is not null and coalesce(public.app_role(), '') <> 'director' then
      raise exception 'Only directors can change roles';
    end if;
    if old.role = 'director'
       and (select count(*) from public.profiles where role = 'director') <= 1 then
      raise exception 'There must be at least one director';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

alter table public.profiles enable row level security;

create policy "profiles: read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy "profiles: update self or director" on public.profiles for update to authenticated
  using (id = auth.uid() or public.app_role() = 'director')
  with check (id = auth.uid() or public.app_role() = 'director');

------------------------------------------------------------------------------
-- HOH Leads list (who can be selected as Shift Lead on the shared device)
------------------------------------------------------------------------------
create table public.hoh_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- Attribution: who gets credit for an entry
------------------------------------------------------------------------------
-- Shared kitchen device -> the selected Shift Lead's name.
-- Personal account      -> the account holder's name.
create or replace function public.actor_name(p_lead_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text;
  v_name text;
begin
  select role, full_name into v_role, v_name from public.profiles where id = auth.uid();
  if v_role is null or v_role = 'pending' then
    raise exception 'Your account is not approved yet';
  end if;
  if v_role = 'kitchen' then
    if p_lead_id is null then
      raise exception 'Select the Shift Lead before logging';
    end if;
    select name into v_name from public.hoh_leads where id = p_lead_id and active;
    if v_name is null then
      raise exception 'That Shift Lead is not on the active HOH Leads list';
    end if;
  end if;
  return coalesce(nullif(trim(v_name), ''), 'Unknown');
end $$;

create or replace function public.set_attribution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new; -- seed / admin SQL
  end if;
  new.user_id := auth.uid();
  new.performed_by_name := public.actor_name(new.lead_id);
  if public.app_role() <> 'kitchen' then
    new.lead_id := null;
  end if;
  return new;
end $$;

create or replace function public.keep_attribution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := old.user_id;
  new.lead_id := old.lead_id;
  new.performed_by_name := old.performed_by_name;
  return new;
end $$;

------------------------------------------------------------------------------
-- Shift checklists
------------------------------------------------------------------------------
create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  shift text not null default 'Any',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.checklist_items (template_id);

create table public.checklist_checks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  item_id uuid not null references public.checklist_items(id) on delete cascade,
  check_date date not null,
  checked_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.hoh_leads(id) on delete set null,
  performed_by_name text not null default 'Unknown',
  unique (item_id, check_date)
);
create index on public.checklist_checks (check_date);

create trigger checklist_checks_attribution before insert on public.checklist_checks
  for each row execute function public.set_attribution();

------------------------------------------------------------------------------
-- Waste log
------------------------------------------------------------------------------
create table public.waste_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  default_unit text not null default 'each',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.waste_entries (
  id uuid primary key default gen_random_uuid(),
  logged_at timestamptz not null default now(),
  log_date date not null,
  shift text not null,
  item_name text not null check (length(trim(item_name)) > 0),
  quantity numeric not null check (quantity > 0),
  unit text not null,
  reason text not null,
  notes text,
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.hoh_leads(id) on delete set null,
  performed_by_name text not null default 'Unknown'
);
create index on public.waste_entries (log_date);

create trigger waste_entries_attribution before insert on public.waste_entries
  for each row execute function public.set_attribution();
create trigger waste_entries_keep_attribution before update on public.waste_entries
  for each row execute function public.keep_attribution();

------------------------------------------------------------------------------
-- Equipment log
------------------------------------------------------------------------------
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text not null default 'Other',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.equipment_logs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  log_type text not null
    check (log_type in ('filter_change','oil_change','cleaning','maintenance','issue')),
  notes text,
  status text not null default 'done' check (status in ('done','open','resolved')),
  logged_at timestamptz not null default now(),
  log_date date not null,
  shift text not null,
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.hoh_leads(id) on delete set null,
  performed_by_name text not null default 'Unknown',
  resolved_at timestamptz,
  resolved_by_name text,
  resolution_notes text
);
create index on public.equipment_logs (equipment_id, logged_at desc);
create index on public.equipment_logs (status);

create or replace function public.equipment_log_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.status := case when new.log_type = 'issue' then 'open' else 'done' end;
  new.resolved_at := null;
  new.resolved_by_name := null;
  new.resolution_notes := null;
  return new;
end $$;

create trigger equipment_logs_status before insert on public.equipment_logs
  for each row execute function public.equipment_log_status();
create trigger equipment_logs_attribution before insert on public.equipment_logs
  for each row execute function public.set_attribution();
create trigger equipment_logs_keep_attribution before update on public.equipment_logs
  for each row execute function public.keep_attribution();

-- Anyone approved can mark an open issue resolved; credit goes to the actor.
create or replace function public.resolve_equipment_issue(
  p_log_id uuid, p_lead_id uuid default null, p_notes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := public.actor_name(p_lead_id);
begin
  update public.equipment_logs
     set status = 'resolved',
         resolved_at = now(),
         resolved_by_name = v_name,
         resolution_notes = nullif(trim(p_notes), '')
   where id = p_log_id and status = 'open';
  if not found then
    raise exception 'Issue not found or already resolved';
  end if;
end $$;

revoke execute on function public.resolve_equipment_issue(uuid, uuid, text) from public, anon;
grant execute on function public.resolve_equipment_issue(uuid, uuid, text) to authenticated;

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------
alter table public.hoh_leads enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_checks enable row level security;
alter table public.waste_items enable row level security;
alter table public.waste_entries enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_logs enable row level security;

-- Setup lists: everyone approved reads, leads/directors manage.
do $$
declare t text;
begin
  foreach t in array array['hoh_leads','checklist_templates','checklist_items','waste_items','equipment'] loop
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (public.is_active_user())', t);
    execute format('create policy "%1$s: insert" on public.%1$I for insert to authenticated with check (public.is_manager())', t);
    execute format('create policy "%1$s: update" on public.%1$I for update to authenticated using (public.is_manager()) with check (public.is_manager())', t);
    execute format('create policy "%1$s: delete" on public.%1$I for delete to authenticated using (public.is_manager())', t);
  end loop;
end $$;

-- Checklist checks: everyone approved can check; uncheck your own (or any, if manager).
create policy "checklist_checks: read" on public.checklist_checks for select to authenticated
  using (public.is_active_user());
create policy "checklist_checks: insert" on public.checklist_checks for insert to authenticated
  with check (public.is_active_user());
create policy "checklist_checks: delete" on public.checklist_checks for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_manager()));

-- Waste & equipment logs: everyone approved can log; edit/delete own (or any, if manager).
do $$
declare t text;
begin
  foreach t in array array['waste_entries','equipment_logs'] loop
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (public.is_active_user())', t);
    execute format('create policy "%1$s: insert" on public.%1$I for insert to authenticated with check (public.is_active_user())', t);
    execute format('create policy "%1$s: update" on public.%1$I for update to authenticated using (public.is_active_user() and (user_id = auth.uid() or public.is_manager())) with check (public.is_active_user())', t);
    execute format('create policy "%1$s: delete" on public.%1$I for delete to authenticated using (public.is_active_user() and (user_id = auth.uid() or public.is_manager()))', t);
  end loop;
end $$;

-- Nothing is readable without signing in.
revoke all on all tables in schema public from anon;

-- Live updates across devices.
alter publication supabase_realtime add table
  public.checklist_checks, public.waste_entries, public.equipment_logs;
