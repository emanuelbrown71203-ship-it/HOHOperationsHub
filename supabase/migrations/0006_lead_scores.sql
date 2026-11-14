-- Lead scores: the incoming shift rates the previous shift's setup (1-5 stars), and the
-- rating is recorded against the HOH Lead who ran that shift.

------------------------------------------------------------------------------
-- 1. Who can see lead scores (only directors can change this)
------------------------------------------------------------------------------
alter table public.app_settings
  add column scores_visibility text not null default 'directors'
  check (scores_visibility in ('directors', 'managers', 'everyone'));

create or replace function public.guard_settings_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  if new.scores_visibility is distinct from old.scores_visibility
     and auth.uid() is not null and coalesce(public.app_role(), '') <> 'director' then
    raise exception 'Only directors can change who sees lead scores';
  end if;
  return new;
end $$;
create trigger guard_settings_update before update on public.app_settings
  for each row execute function public.guard_settings_update();
revoke execute on function public.guard_settings_update() from public, anon, authenticated;

create or replace function public.can_view_scores() returns boolean
language sql stable security definer set search_path = '' as $$
  select case coalesce((select scores_visibility from public.app_settings where id = 1), 'directors')
    when 'everyone' then public.is_active_user()
    when 'managers' then public.is_manager()
    else coalesce(public.app_role() = 'director', false)
  end
$$;
revoke execute on function public.can_view_scores() from public, anon;
grant execute on function public.can_view_scores() to authenticated;

------------------------------------------------------------------------------
-- 2. Link an HOH Lead to that person's own account (directors only), so handoffs
--    they submit from their own phone are credited to them
------------------------------------------------------------------------------
alter table public.hoh_leads add column profile_id uuid references public.profiles(id) on delete set null;
create unique index hoh_leads_profile_id_key on public.hoh_leads (profile_id) where profile_id is not null;

create or replace function public.guard_lead_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and coalesce(public.app_role(), '') <> 'director'
     and new.profile_id is distinct from (case when tg_op = 'UPDATE' then old.profile_id end) then
    raise exception 'Only directors can link accounts to HOH Leads';
  end if;
  return new;
end $$;
create trigger guard_lead_link before insert or update on public.hoh_leads
  for each row execute function public.guard_lead_link();
revoke execute on function public.guard_lead_link() from public, anon, authenticated;

-- The HOH Lead an action belongs to: the chosen Shift Lead on the shared device,
-- or the lead linked to the signed-in account.
create or replace function public.actor_lead_id(p_lead_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when public.app_role() = 'kitchen'
    then (select id from public.hoh_leads where id = p_lead_id and active)
    else (select id from public.hoh_leads where profile_id = auth.uid() and active limit 1)
  end
$$;
revoke execute on function public.actor_lead_id(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 3. The HOH Lead who ran each shift
------------------------------------------------------------------------------
alter table public.shift_handoffs
  add column lead_id uuid references public.hoh_leads(id) on delete set null,
  add column lead_name text;
create index on public.shift_handoffs (lead_id);

------------------------------------------------------------------------------
-- 4. Ratings: their own table, readable only by people allowed to see scores
------------------------------------------------------------------------------
create table public.shift_ratings (
  handoff_id uuid primary key references public.shift_handoffs(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  rated_by_user uuid references auth.users(id) on delete set null,
  rated_by_lead uuid references public.hoh_leads(id) on delete set null,
  rated_by_name text not null,
  rated_at timestamptz not null default now()
);
alter table public.shift_ratings enable row level security;
create policy "shift_ratings: read" on public.shift_ratings for select to authenticated
  using (public.can_view_scores());
create policy "shift_ratings: delete" on public.shift_ratings for delete to authenticated
  using (coalesce(public.app_role() = 'director', false));
revoke all on public.shift_ratings from anon;

-- Move any ratings made before this change.
insert into public.shift_ratings (handoff_id, rating, comment, rated_by_name, rated_at)
select id, rating, rating_comment, coalesce(rated_by_name, 'Unknown'), coalesce(rated_at, now())
from public.shift_handoffs where rating is not null;
update public.shift_handoffs set rating = null, rating_comment = null where rating is not null;

-- If a director deletes a rating, the shift shows as not rated again.
create or replace function public.clear_rated_marker() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.shift_handoffs set rated_by_name = null, rated_at = null where id = old.handoff_id;
  return old;
end $$;
create trigger shift_ratings_cleared after delete on public.shift_ratings
  for each row execute function public.clear_rated_marker();
revoke execute on function public.clear_rated_marker() from public, anon, authenticated;

------------------------------------------------------------------------------
-- 5. Record a shift's Shift Lead (shared device when a lead is picked; leads and
--    directors to correct a record)
------------------------------------------------------------------------------
create or replace function public.set_shift_lead(p_date date, p_shift text, p_lead_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.app_role();
  v_name text;
  v_id uuid;
begin
  if v_role is null or v_role not in ('kitchen', 'lead', 'director') then
    raise exception 'Only the shared kitchen device or a lead can set the Shift Lead';
  end if;
  select name into v_name from public.hoh_leads where id = p_lead_id and active;
  if v_name is null then
    raise exception 'That Shift Lead is not on the active HOH Leads list';
  end if;
  v_id := public.ensure_handoff(p_date, p_shift);
  if v_role = 'kitchen' then
    if p_date < current_date - 1 then
      raise exception 'Past shifts can only be changed by a lead or director';
    end if;
    if exists (select 1 from public.shift_ratings where handoff_id = v_id) then
      raise exception 'That shift has already been rated. Ask a director to change its Shift Lead.';
    end if;
  end if;
  update public.shift_handoffs set lead_id = p_lead_id, lead_name = v_name where id = v_id;
end $$;
revoke execute on function public.set_shift_lead(date, text, uuid) from public, anon;
grant execute on function public.set_shift_lead(date, text, uuid) to authenticated;

------------------------------------------------------------------------------
-- 6. Leaving shift: submitting the handoff also records who ran the shift
------------------------------------------------------------------------------
create or replace function public.save_handoff(
  p_date date, p_shift text, p_notes text, p_lead_id uuid default null, p_submit boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := public.actor_name(p_lead_id);
  v_lead uuid := public.actor_lead_id(p_lead_id);
  v_id uuid := public.ensure_handoff(p_date, p_shift);
begin
  update public.shift_handoffs set
    notes = nullif(trim(p_notes), ''),
    notes_by_name = case when nullif(trim(p_notes), '') is null then null else v_name end,
    notes_at = case when nullif(trim(p_notes), '') is null then null else now() end,
    submitted_at = case when p_submit then now() else submitted_at end,
    submitted_by_name = case when p_submit then v_name else submitted_by_name end
  where id = v_id;
  if p_submit and v_lead is not null then
    update public.shift_handoffs h set lead_id = v_lead, lead_name = l.name
    from public.hoh_leads l
    where h.id = v_id and l.id = v_lead
      and (public.app_role() = 'kitchen' or h.lead_id is null)
      and not exists (select 1 from public.shift_ratings r where r.handoff_id = v_id);
  end if;
  return v_id;
end $$;

------------------------------------------------------------------------------
-- 7. Incoming shift: rate the previous shift's setup, credited to its Shift Lead
------------------------------------------------------------------------------
create or replace function public.rate_shift(
  p_date date, p_shift text, p_rating int, p_comment text default null,
  p_lead_id uuid default null, p_rated_lead_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := public.actor_name(p_lead_id);
  v_rater_lead uuid := public.actor_lead_id(p_lead_id);
  v_id uuid;
  v_lead uuid;
  v_prev public.shift_ratings%rowtype;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose 1 to 5 stars';
  end if;
  v_id := public.ensure_handoff(p_date, p_shift);
  select lead_id into v_lead from public.shift_handoffs where id = v_id;
  if v_lead is null then
    if p_rated_lead_id is null then
      raise exception 'Choose who was the Shift Lead for the % shift', p_shift;
    end if;
    select id into v_lead from public.hoh_leads where id = p_rated_lead_id and active;
    if v_lead is null then
      raise exception 'That Shift Lead is not on the active HOH Leads list';
    end if;
    update public.shift_handoffs
      set lead_id = v_lead, lead_name = (select name from public.hoh_leads where id = v_lead)
      where id = v_id;
  end if;
  if v_rater_lead is not null and v_rater_lead = v_lead then
    raise exception 'You can''t rate your own shift';
  end if;
  select * into v_prev from public.shift_ratings where handoff_id = v_id;
  if found and not public.is_manager()
     and not (v_prev.rated_by_user = auth.uid() and v_prev.rated_by_lead is not distinct from v_rater_lead) then
    raise exception 'This shift was already rated by %', v_prev.rated_by_name;
  end if;
  insert into public.shift_ratings (handoff_id, rating, comment, rated_by_user, rated_by_lead, rated_by_name, rated_at)
  values (v_id, p_rating, nullif(trim(p_comment), ''), auth.uid(), v_rater_lead, v_name, now())
  on conflict (handoff_id) do update set
    rating = excluded.rating, comment = excluded.comment, rated_by_user = excluded.rated_by_user,
    rated_by_lead = excluded.rated_by_lead, rated_by_name = excluded.rated_by_name, rated_at = excluded.rated_at;
  update public.shift_handoffs set rated_by_name = v_name, rated_at = now() where id = v_id;
end $$;
revoke execute on function public.rate_shift(date, text, int, text, uuid, uuid) from public, anon;
grant execute on function public.rate_shift(date, text, int, text, uuid, uuid) to authenticated;

-- The earlier entry point now records into shift_ratings as well.
create or replace function public.rate_handoff(
  p_date date, p_shift text, p_rating int, p_comment text default null, p_lead_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform public.rate_shift(p_date, p_shift, p_rating, p_comment, p_lead_id, null);
  return (select id from public.shift_handoffs where shift_date = p_date and shift = p_shift);
end $$;

------------------------------------------------------------------------------
-- 8. The record, also browsable in the Supabase Table Editor
------------------------------------------------------------------------------
create view public.lead_rating_history with (security_invoker = true) as
select h.id as handoff_id, h.shift_date, h.shift, h.lead_id, h.lead_name,
  r.rating, r.comment, r.rated_by_name, r.rated_at,
  h.submitted_at is not null as handoff_submitted,
  (select count(*) from public.handoff_photos p where p.handoff_id = h.id) as photo_count
from public.shift_ratings r
join public.shift_handoffs h on h.id = r.handoff_id;

create view public.lead_scores with (security_invoker = true) as
select l.id as lead_id, l.name as lead_name, l.active,
  count(r.handoff_id) as ratings,
  round(avg(r.rating), 2) as avg_rating,
  count(r.handoff_id) filter (where h.shift_date >= current_date - 30) as ratings_30d,
  round(avg(r.rating) filter (where h.shift_date >= current_date - 30), 2) as avg_rating_30d,
  count(h.id) as shifts_led,
  count(h.id) filter (where h.submitted_at is not null) as handoffs_submitted,
  max(r.rated_at) as last_rated_at
from public.hoh_leads l
left join public.shift_handoffs h on h.lead_id = l.id
left join public.shift_ratings r on r.handoff_id = h.id
group by l.id, l.name, l.active;

revoke all on public.lead_rating_history, public.lead_scores from anon;
grant select on public.lead_rating_history, public.lead_scores to authenticated;

alter publication supabase_realtime add table public.shift_ratings;
