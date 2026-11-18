-- Shift Lead schedule, ratings by category, lead of the month, fryer tracker settings,
-- "Who's Trained" sign-offs, photo tasks on checklists, and phone notifications.

------------------------------------------------------------------------------
-- 0. Settings
------------------------------------------------------------------------------
alter table public.app_settings
  add column rating_categories jsonb not null default '["Stocked","Clean","Prepped","Organized"]',
  add column fryer_filter_hours int not null default 24 check (fryer_filter_hours between 1 and 720),
  add column fryer_oil_days int not null default 7 check (fryer_oil_days between 1 and 90),
  add column notifications_enabled boolean not null default false,
  add column timezone text not null default 'America/New_York';

-- Directors and admins build the Shift Lead schedule.
create or replace function public.can_schedule() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() = 'director', false) or public.is_admin()
$$;
revoke execute on function public.can_schedule() from public, anon;
grant execute on function public.can_schedule() to authenticated;

------------------------------------------------------------------------------
-- 1. Shift Lead schedule
------------------------------------------------------------------------------
create table public.shift_schedule (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  shift text not null,
  lead_id uuid not null references public.hoh_leads(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default 'Unknown',
  updated_at timestamptz not null default now(),
  -- When the lead was told about this shift, and when the day-of reminder went out.
  notified_at timestamptz,
  reminded_at timestamptz,
  unique (shift_date, shift)
);
create index on public.shift_schedule (lead_id, shift_date);
alter table public.shift_schedule enable row level security;
create policy "shift_schedule: read" on public.shift_schedule for select to authenticated using (public.is_active_user());
create policy "shift_schedule: insert" on public.shift_schedule for insert to authenticated with check (public.can_schedule());
create policy "shift_schedule: update" on public.shift_schedule for update to authenticated using (public.can_schedule()) with check (public.can_schedule());
create policy "shift_schedule: delete" on public.shift_schedule for delete to authenticated using (public.can_schedule());
revoke all on public.shift_schedule from anon;
create trigger shift_schedule_created_by before insert or update on public.shift_schedule
  for each row execute function public.set_created_by();

-- Changing who is on a shift means that person hasn't been told yet.
create or replace function public.schedule_changed() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.lead_id is distinct from old.lead_id then
    new.notified_at := null;
    new.reminded_at := null;
  end if;
  return new;
end $$;
create trigger shift_schedule_changed before update on public.shift_schedule
  for each row execute function public.schedule_changed();

-- Type a name straight into the schedule: adds them to the HOH Leads list (no account needed).
create or replace function public.add_hoh_lead(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_id uuid;
begin
  if not public.can_schedule() then
    raise exception 'Only directors and admins can add HOH Leads';
  end if;
  if v_name is null then
    raise exception 'Type a name';
  end if;
  select id into v_id from public.hoh_leads where lower(name) = lower(v_name) limit 1;
  if v_id is not null then
    update public.hoh_leads set active = true where id = v_id and not active;
    return v_id;
  end if;
  insert into public.hoh_leads (name, sort_order)
    values (v_name, coalesce((select max(sort_order) from public.hoh_leads), 0) + 1)
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.add_hoh_lead(text) from public, anon;
grant execute on function public.add_hoh_lead(text) to authenticated;

-- A shift with no recorded lead takes the scheduled one, so ratings land on the right person.
create or replace function public.ensure_handoff(p_date date, p_shift text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.shift_handoffs (shift_date, shift) values (p_date, p_shift)
    on conflict (shift_date, shift) do nothing;
  select id into v_id from public.shift_handoffs where shift_date = p_date and shift = p_shift;
  update public.shift_handoffs h set lead_id = l.id, lead_name = l.name
    from public.shift_schedule s join public.hoh_leads l on l.id = s.lead_id
    where h.id = v_id and h.lead_id is null and s.shift_date = p_date and s.shift = p_shift;
  return v_id;
end $$;

------------------------------------------------------------------------------
-- 2. Ratings by category
------------------------------------------------------------------------------
alter table public.shift_ratings
  add column category_scores jsonb,
  add column score numeric(3, 2);
update public.shift_ratings set score = rating where score is null;

create or replace function public.rate_setup(
  p_date date, p_shift text, p_scores jsonb default null, p_rating int default null, p_comment text default null,
  p_lead_id uuid default null, p_rated_lead_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := public.actor_name(p_lead_id);
  v_rater_lead uuid := public.actor_lead_id(p_lead_id);
  v_id uuid;
  v_lead uuid;
  v_prev public.shift_ratings%rowtype;
  v_score numeric;
  v_scores jsonb := null;
begin
  if p_scores is not null and jsonb_typeof(p_scores) = 'object' and p_scores <> '{}'::jsonb then
    if exists (select 1 from jsonb_each(p_scores) e
               where jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric not between 1 and 5) then
      raise exception 'Give every category 1 to 5 stars';
    end if;
    select avg((e.value)::text::numeric) into v_score from jsonb_each(p_scores) e;
    v_scores := p_scores;
  elsif p_rating between 1 and 5 then
    v_score := p_rating;
  else
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
  insert into public.shift_ratings (handoff_id, rating, score, category_scores, comment, rated_by_user, rated_by_lead, rated_by_name, rated_at)
  values (v_id, greatest(1, least(5, round(v_score)::int)), round(v_score, 2), v_scores, nullif(trim(p_comment), ''), auth.uid(), v_rater_lead, v_name, now())
  on conflict (handoff_id) do update set
    rating = excluded.rating, score = excluded.score, category_scores = excluded.category_scores,
    comment = excluded.comment, rated_by_user = excluded.rated_by_user,
    rated_by_lead = excluded.rated_by_lead, rated_by_name = excluded.rated_by_name, rated_at = excluded.rated_at;
  update public.shift_handoffs set rated_by_name = v_name, rated_at = now() where id = v_id;
end $$;
revoke execute on function public.rate_setup(date, text, jsonb, int, text, uuid, uuid) from public, anon;
grant execute on function public.rate_setup(date, text, jsonb, int, text, uuid, uuid) to authenticated;

-- The older entry point keeps working.
create or replace function public.rate_shift(
  p_date date, p_shift text, p_rating int, p_comment text default null,
  p_lead_id uuid default null, p_rated_lead_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.rate_setup(p_date, p_shift, null, p_rating, p_comment, p_lead_id, p_rated_lead_id);
end $$;

create or replace view public.lead_rating_history with (security_invoker = true) as
select h.id as handoff_id, h.shift_date, h.shift, h.lead_id, h.lead_name,
  r.rating, r.comment, r.rated_by_name, r.rated_at,
  h.submitted_at is not null as handoff_submitted,
  (select count(*) from public.handoff_photos p where p.handoff_id = h.id) as photo_count,
  coalesce(r.score, r.rating) as score, r.category_scores
from public.shift_ratings r
join public.shift_handoffs h on h.id = r.handoff_id;

------------------------------------------------------------------------------
-- 3. Lead of the Month: the name is for everyone; the numbers only for people who can see scores
------------------------------------------------------------------------------
create or replace function public.lead_of_month(p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_active_user() then null else (
    select jsonb_build_object(
      'lead_id', w.lead_id, 'name', w.name, 'month', date_trunc('month', p_month)::date,
      'ratings', case when public.can_view_scores() then w.n end,
      'avg', case when public.can_view_scores() then round(w.a, 2) end)
    from (
      select h.lead_id, l.name, avg(coalesce(r.score, r.rating)) as a, count(*) as n
      from public.shift_ratings r
      join public.shift_handoffs h on h.id = r.handoff_id
      join public.hoh_leads l on l.id = h.lead_id
      where h.shift_date >= date_trunc('month', p_month)::date
        and h.shift_date < (date_trunc('month', p_month) + interval '1 month')::date
      group by h.lead_id, l.name
      having count(*) >= 3
      order by a desc, n desc, l.name
      limit 1
    ) w
  ) end
$$;
revoke execute on function public.lead_of_month(date) from public, anon;
grant execute on function public.lead_of_month(date) to authenticated;

------------------------------------------------------------------------------
-- 4. Checklist tasks that need a photo
------------------------------------------------------------------------------
alter table public.checklist_items add column requires_photo boolean not null default false;
alter table public.checklist_checks add column photo_path text;

create or replace function public.require_check_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.photo_path is null
     and (select requires_photo from public.checklist_items where id = new.item_id) then
    raise exception 'This task needs a photo';
  end if;
  return new;
end $$;
create trigger checklist_checks_photo before insert on public.checklist_checks
  for each row execute function public.require_check_photo();
revoke execute on function public.require_check_photo() from public, anon, authenticated;

------------------------------------------------------------------------------
-- 5. Who's Trained: a team list (no accounts needed) and sign-offs per position
------------------------------------------------------------------------------
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table public.position_signoffs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  status text not null check (status in ('training', 'trained')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default 'Unknown',
  updated_at timestamptz not null default now(),
  unique (member_id, position_id)
);
alter table public.team_members enable row level security;
alter table public.position_signoffs enable row level security;
do $$
declare t text;
begin
  foreach t in array array['team_members', 'position_signoffs'] loop
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (public.is_active_user())', t);
    execute format('create policy "%1$s: insert" on public.%1$I for insert to authenticated with check (public.is_manager())', t);
    execute format('create policy "%1$s: update" on public.%1$I for update to authenticated using (public.is_manager()) with check (public.is_manager())', t);
    execute format('create policy "%1$s: delete" on public.%1$I for delete to authenticated using (public.is_manager())', t);
    execute format('revoke all on public.%1$I from anon', t);
  end loop;
end $$;
create trigger position_signoffs_created_by before insert or update on public.position_signoffs
  for each row execute function public.set_created_by();

------------------------------------------------------------------------------
-- 6. Phone notifications
------------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: read own" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "push_subscriptions: delete own" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions from anon;

-- A phone belongs to whoever turned notifications on there last.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then
    raise exception 'Your account is not approved yet';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, nullif(trim(p_device), ''))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device;
end $$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Keys for sending notifications live outside the public API (filled in once, by hand, never in this repository).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text not null,
  vapid_private text not null,
  cron_secret text not null
);
create or replace function public.push_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) from private.push_config c where id = 1
$$;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

------------------------------------------------------------------------------
-- 7. Live updates
------------------------------------------------------------------------------
alter publication supabase_realtime add table public.shift_schedule, public.team_members, public.position_signoffs;
