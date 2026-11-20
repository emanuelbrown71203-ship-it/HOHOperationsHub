-- Equipment & Supplies (a message board, no equipment list), Coaching Notes, and more phone notifications.
-- The old equipment list, fryer logs and "Who's Trained" tables stay in place (unused) so no history is lost.

------------------------------------------------------------------------------
-- 1. Equipment & Supplies: "something's broken" or "we need ..." messages
------------------------------------------------------------------------------
create table public.kitchen_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('broken', 'need')),
  title text not null check (length(trim(title)) > 0),
  details text,
  photo_path text,
  status text not null default 'open' check (status in ('open', 'done')),
  shift text,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.hoh_leads(id) on delete set null,
  performed_by_name text not null default 'Unknown',
  resolved_at timestamptz,
  resolved_by_name text,
  resolution_note text
);
create index on public.kitchen_requests (status, created_at desc);
alter table public.kitchen_requests enable row level security;
create policy "kitchen_requests: read" on public.kitchen_requests for select to authenticated using (public.is_active_user());
create policy "kitchen_requests: insert" on public.kitchen_requests for insert to authenticated with check (public.is_active_user());
create policy "kitchen_requests: update" on public.kitchen_requests for update to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_manager())) with check (public.is_active_user());
create policy "kitchen_requests: delete" on public.kitchen_requests for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_manager()));
revoke all on public.kitchen_requests from anon;
create trigger kitchen_requests_attribution before insert on public.kitchen_requests
  for each row execute function public.set_attribution();
create trigger kitchen_requests_keep_attribution before update on public.kitchen_requests
  for each row execute function public.keep_attribution();

-- Anyone approved can mark one fixed / taken care of; credit goes to whoever did it.
create or replace function public.resolve_kitchen_request(p_id uuid, p_lead_id uuid default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text := public.actor_name(p_lead_id);
begin
  update public.kitchen_requests
     set status = 'done', resolved_at = now(), resolved_by_name = v_name, resolution_note = nullif(trim(p_note), '')
   where id = p_id and status = 'open';
  if not found then
    raise exception 'Already taken care of';
  end if;
end $$;
revoke execute on function public.resolve_kitchen_request(uuid, uuid, text) from public, anon;
grant execute on function public.resolve_kitchen_request(uuid, uuid, text) to authenticated;

-- Bring over open and recent equipment issues so nothing is lost.
insert into public.kitchen_requests (kind, title, details, photo_path, status, shift, created_at, user_id, lead_id, performed_by_name, resolved_at, resolved_by_name, resolution_note)
select 'broken', e.name, l.notes, l.photo_path, case when l.status = 'open' then 'open' else 'done' end, l.shift, l.logged_at,
  l.user_id, l.lead_id, l.performed_by_name, l.resolved_at, l.resolved_by_name, l.resolution_notes
from public.equipment_logs l join public.equipment e on e.id = l.equipment_id
where l.log_type = 'issue' and (l.status = 'open' or l.logged_at > now() - interval '60 days');

------------------------------------------------------------------------------
-- 2. Coaching Notes: directors and admins keep notes on HOH Leads (or anyone)
------------------------------------------------------------------------------
create or replace function public.my_lead_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.hoh_leads where profile_id = auth.uid() and active limit 1
$$;
revoke execute on function public.my_lead_id() from public, anon;
grant execute on function public.my_lead_id() to authenticated;

create table public.coaching_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.hoh_leads(id) on delete set null,
  subject_name text not null check (length(trim(subject_name)) > 0),
  kind text not null default 'coaching' check (kind in ('coaching', 'praise')),
  note text not null check (length(trim(note)) > 0),
  follow_up_on date,
  follow_up_done_at timestamptz,
  shared_with_lead boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default 'Unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.coaching_notes (lead_id, created_at desc);
alter table public.coaching_notes enable row level security;
-- Directors and admins see every note; a lead sees only notes about them that were shared with them.
create policy "coaching_notes: read" on public.coaching_notes for select to authenticated
  using (public.can_schedule() or (shared_with_lead and lead_id is not null and lead_id = public.my_lead_id()));
create policy "coaching_notes: insert" on public.coaching_notes for insert to authenticated with check (public.can_schedule());
create policy "coaching_notes: update" on public.coaching_notes for update to authenticated using (public.can_schedule()) with check (public.can_schedule());
create policy "coaching_notes: delete" on public.coaching_notes for delete to authenticated using (public.can_schedule());
revoke all on public.coaching_notes from anon;
create trigger coaching_notes_created_by before insert on public.coaching_notes
  for each row execute function public.set_created_by();

------------------------------------------------------------------------------
-- 3. Notification settings: one switch per kind, and when close-out should be done
------------------------------------------------------------------------------
alter table public.app_settings
  add column notify_kinds jsonb not null default '{"schedule":true,"reminder":true,"handoff_missed":true,"requests":true,"ratings":true}',
  add column close_time text not null default '23:00' check (close_time ~ '^\d{2}:\d{2}$');

-- One notification per event, even if the 10-minute job sees it twice.
create table private.notification_log (key text primary key, sent_at timestamptz not null default now());
create or replace function public.claim_notification(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.notification_log (key) values (p_key) on conflict (key) do nothing;
  return found;
end $$;
revoke execute on function public.claim_notification(text) from public, anon, authenticated;
grant execute on function public.claim_notification(text) to service_role;

-- Ask the notify function to send something (runs after the change is saved; never blocks it).
create or replace function private.call_notify(p_body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select notifications_enabled from public.app_settings where id = 1), false) then
    return;
  end if;
  perform net.http_post(
    url := 'https://khtuqripoqqlzqdkrwym.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select cron_secret from private.push_config where id = 1)),
    body := p_body
  );
exception when others then
  null; -- a notification problem must never stop someone saving their entry
end $$;

create or replace function public.notify_new_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.call_notify(jsonb_build_object('action', 'request', 'id', new.id));
  return new;
end $$;
revoke execute on function public.notify_new_request() from public, anon, authenticated;
create trigger kitchen_requests_notify after insert on public.kitchen_requests
  for each row execute function public.notify_new_request();

create or replace function public.notify_shift_rated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.call_notify(jsonb_build_object('action', 'rated', 'handoff_id', new.handoff_id));
  return new;
end $$;
revoke execute on function public.notify_shift_rated() from public, anon, authenticated;
create trigger shift_ratings_notify after insert on public.shift_ratings
  for each row execute function public.notify_shift_rated();

------------------------------------------------------------------------------
-- 4. Live updates
------------------------------------------------------------------------------
alter publication supabase_realtime add table public.kitchen_requests, public.coaching_notes;
