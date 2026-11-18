-- Admins configure the app: Setup (leads, checklists, positions, equipment, store settings),
-- team accounts and roles, and who can see lead scores. Admin is a switch on top of a person's
-- role, so a Director (or anyone) can also be an Admin. Directors always see the lead score
-- record; without the Admin switch they can't change the app's setup.

alter table public.profiles add column is_admin boolean not null default false;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin and role <> 'pending' from public.profiles where id = auth.uid()), false)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Leads, directors and admins manage day-to-day content (focus of the week, shoutouts, others' entries).
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (role in ('lead', 'director') or is_admin) and role <> 'pending' from public.profiles where id = auth.uid()), false)
$$;

-- The very first account becomes a Director and an Admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, full_name, role, is_admin)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    case when v_first then 'director' else 'pending' end,
    v_first
  );
  return new;
end $$;

-- Only admins change roles or the Admin switch, and there is always at least one admin.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  if new.role is distinct from old.role or new.is_admin is distinct from old.is_admin then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only admins can change roles';
    end if;
    if old.is_admin and old.role <> 'pending' and (not new.is_admin or new.role = 'pending')
       and (select count(*) from public.profiles where is_admin and role <> 'pending') <= 1 then
      raise exception 'There must be at least one admin';
    end if;
  end if;
  return new;
end $$;

alter policy "profiles: update self or director" on public.profiles
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Setup lists: only admins change them.
alter policy "hoh_leads: insert" on public.hoh_leads with check (public.is_admin());
alter policy "hoh_leads: update" on public.hoh_leads using (public.is_admin()) with check (public.is_admin());
alter policy "hoh_leads: delete" on public.hoh_leads using (public.is_admin());
alter policy "checklist_templates: insert" on public.checklist_templates with check (public.is_admin());
alter policy "checklist_templates: update" on public.checklist_templates using (public.is_admin()) with check (public.is_admin());
alter policy "checklist_templates: delete" on public.checklist_templates using (public.is_admin());
alter policy "checklist_items: insert" on public.checklist_items with check (public.is_admin());
alter policy "checklist_items: update" on public.checklist_items using (public.is_admin()) with check (public.is_admin());
alter policy "checklist_items: delete" on public.checklist_items using (public.is_admin());
alter policy "waste_items: insert" on public.waste_items with check (public.is_admin());
alter policy "waste_items: update" on public.waste_items using (public.is_admin()) with check (public.is_admin());
alter policy "waste_items: delete" on public.waste_items using (public.is_admin());
alter policy "equipment: insert" on public.equipment with check (public.is_admin());
alter policy "equipment: update" on public.equipment using (public.is_admin()) with check (public.is_admin());
alter policy "equipment: delete" on public.equipment using (public.is_admin());
alter policy "positions: insert" on public.positions with check (public.is_admin());
alter policy "positions: update" on public.positions using (public.is_admin()) with check (public.is_admin());
alter policy "positions: delete" on public.positions using (public.is_admin());
alter policy "position_files: insert" on public.position_files with check (public.is_admin());
alter policy "position_files: update" on public.position_files using (public.is_admin()) with check (public.is_admin());
alter policy "position_files: delete" on public.position_files using (public.is_admin());
alter policy "app_settings: update" on public.app_settings using (public.is_admin()) with check (public.is_admin());

-- Lead scores: admins and directors always see them; admins decide who else does.
create or replace function public.can_view_scores() returns boolean
language sql stable security definer set search_path = '' as $$
  select case coalesce((select scores_visibility from public.app_settings where id = 1), 'directors')
    when 'everyone' then public.is_active_user()
    when 'managers' then public.is_manager()
    else coalesce(public.app_role() = 'director', false) or public.is_admin()
  end
$$;

create or replace function public.guard_settings_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  if new.scores_visibility is distinct from old.scores_visibility
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can change who sees lead scores';
  end if;
  return new;
end $$;

create or replace function public.guard_lead_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and new.profile_id is distinct from (case when tg_op = 'UPDATE' then old.profile_id end) then
    raise exception 'Only admins can link accounts to HOH Leads';
  end if;
  return new;
end $$;

-- Directors and admins look after the score record (move a rating to the right lead, delete one).
alter policy "shift_ratings: delete" on public.shift_ratings
  using (coalesce(public.app_role() = 'director', false) or public.is_admin());

create or replace function public.set_shift_lead(p_date date, p_shift text, p_lead_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.app_role();
  v_admin boolean := public.is_admin();
  v_name text;
  v_id uuid;
begin
  if not v_admin and (v_role is null or v_role not in ('kitchen', 'lead', 'director')) then
    raise exception 'Only the shared kitchen device or a lead can set the Shift Lead';
  end if;
  select name into v_name from public.hoh_leads where id = p_lead_id and active;
  if v_name is null then
    raise exception 'That Shift Lead is not on the active HOH Leads list';
  end if;
  v_id := public.ensure_handoff(p_date, p_shift);
  if v_role = 'kitchen' and p_date < current_date - 1 then
    raise exception 'Past shifts can only be changed by a lead or director';
  end if;
  if not (v_admin or v_role = 'director') and exists (select 1 from public.shift_ratings where handoff_id = v_id) then
    raise exception 'That shift has already been rated. Ask a director or admin to change its Shift Lead.';
  end if;
  update public.shift_handoffs set lead_id = p_lead_id, lead_name = v_name where id = v_id;
end $$;
