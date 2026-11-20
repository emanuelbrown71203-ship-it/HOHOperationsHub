-- Cleaning Hub: cleaning jobs for the whole HOH, each repeating every N days (daily, weekly, monthly...),
-- assigned to a shift and an area, checked off with the person's name (and a photo when required).

create table public.cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  area text not null default 'Kitchen' check (length(trim(area)) > 0),
  every_days int not null default 1 check (every_days between 1 and 365),
  shift text not null default 'Any',
  requires_photo boolean not null default false,
  instructions text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.cleaning_tasks enable row level security;
create policy "cleaning_tasks: read" on public.cleaning_tasks for select to authenticated using (public.is_active_user());
create policy "cleaning_tasks: insert" on public.cleaning_tasks for insert to authenticated with check (public.is_admin());
create policy "cleaning_tasks: update" on public.cleaning_tasks for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cleaning_tasks: delete" on public.cleaning_tasks for delete to authenticated using (public.is_admin());
revoke all on public.cleaning_tasks from anon;

create table public.cleaning_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.cleaning_tasks(id) on delete cascade,
  done_on date not null,
  done_at timestamptz not null default now(),
  shift text,
  photo_path text,
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.hoh_leads(id) on delete set null,
  performed_by_name text not null default 'Unknown',
  unique (task_id, done_on)
);
create index on public.cleaning_logs (done_on);
alter table public.cleaning_logs enable row level security;
create policy "cleaning_logs: read" on public.cleaning_logs for select to authenticated using (public.is_active_user());
create policy "cleaning_logs: insert" on public.cleaning_logs for insert to authenticated with check (public.is_active_user());
-- Undo, or a lead fixing a mistake.
create policy "cleaning_logs: delete" on public.cleaning_logs for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_manager()));
revoke all on public.cleaning_logs from anon;
create trigger cleaning_logs_attribution before insert on public.cleaning_logs
  for each row execute function public.set_attribution();

create or replace function public.require_cleaning_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.photo_path is null
     and (select requires_photo from public.cleaning_tasks where id = new.task_id) then
    raise exception 'This cleaning job needs a photo';
  end if;
  return new;
end $$;
revoke execute on function public.require_cleaning_photo() from public, anon, authenticated;
create trigger cleaning_logs_photo before insert on public.cleaning_logs
  for each row execute function public.require_cleaning_photo();

alter publication supabase_realtime add table public.cleaning_tasks, public.cleaning_logs;

-- Starter jobs (edit, hide or add more in Setup → Cleaning).
insert into public.cleaning_tasks (name, area, every_days, shift, requires_photo, instructions, sort_order) values
  ('Wipe down and sanitize the breading table', 'Breading', 1, 'PM', true, 'Empty the bins, wipe every surface, sanitize, and let it air dry.', 1),
  ('Clean the fryer station and backsplash', 'Fryers', 1, 'PM', true, null, 2),
  ('Scrape and clean the grill', 'Grill', 1, 'PM', false, null, 3),
  ('Clean and sanitize prep sinks', 'Prep', 1, 'AM', false, null, 4),
  ('Wipe down the holding cabinet', 'Line', 1, 'Any', false, null, 5),
  ('Empty and wipe out trash cans', 'Kitchen', 1, 'PM', false, null, 6),
  ('Sweep and mop the kitchen floor', 'Floors & drains', 1, 'PM', true, null, 7),
  ('Scrub the floor drains', 'Floors & drains', 7, 'PM', false, null, 8),
  ('Degrease the hood filters', 'Hoods', 7, 'PM', true, null, 9),
  ('Wipe and organize walk-in cooler shelves', 'Walk-in', 7, 'AM', false, 'Check dates while you go. First in, first out.', 10),
  ('Deep clean the dish area', 'Dish', 7, 'Any', false, null, 11),
  ('Wash the walls behind the line', 'Line', 14, 'Any', false, null, 12),
  ('Clean the walk-in freezer floor and shelves', 'Walk-in', 30, 'AM', false, null, 13);
