-- Lead points that add up, and photos of the waste at night.

------------------------------------------------------------------------------
-- 1. Waste photos (required on the closing shift unless switched off in Setup)
------------------------------------------------------------------------------
alter table public.waste_entries add column photo_path text;
alter table public.app_settings
  add column waste_photo_at_close boolean not null default true,
  add column point_values jsonb not null default '{"checklist":10,"handoff":5,"star":2,"cleaning":1,"waste_photo":5}';

-- The last shift of the day (the one that closes).
create or replace function public.closing_shift() returns text
language sql stable security definer set search_path = '' as $$
  select s->>'name' from public.app_settings a, jsonb_array_elements(a.shifts) s
  where a.id = 1 order by s->>'start' desc limit 1
$$;
revoke execute on function public.closing_shift() from public, anon;
grant execute on function public.closing_shift() to authenticated;

create or replace function public.require_waste_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.photo_path is null
     and coalesce((select waste_photo_at_close from public.app_settings where id = 1), false)
     and new.shift = public.closing_shift() then
    raise exception 'Take a photo of the waste first (required on the % shift)', new.shift;
  end if;
  return new;
end $$;
revoke execute on function public.require_waste_photo() from public, anon, authenticated;
create trigger waste_entries_photo before insert on public.waste_entries
  for each row execute function public.require_waste_photo();

------------------------------------------------------------------------------
-- 2. What each shift earned for its Shift Lead. The app multiplies by the point values
--    in Setup, so changing a value recounts every shift.
------------------------------------------------------------------------------
create or replace function public.lead_points_by_shift(p_from date, p_to date)
returns table (
  shift_date date, shift text, lead_id uuid, lead_name text,
  checklists int, handoff boolean, stars numeric, cleaning int, waste_photo boolean
)
language sql stable security definer set search_path = '' as $$
  with tmpl as (
    select t.id, t.shift, count(i.id) as n
    from public.checklist_templates t
    join public.checklist_items i on i.template_id = t.id and i.active
    where t.active and t.frequency = 'daily'
    group by t.id, t.shift
  ),
  done as (
    select c.check_date, c.template_id, count(*) as n
    from public.checklist_checks c
    join public.checklist_items i on i.id = c.item_id and i.active
    where c.check_date between p_from and p_to
    group by c.check_date, c.template_id
  )
  select h.shift_date, h.shift, h.lead_id, coalesce(l.name, h.lead_name),
    (select count(*)::int from tmpl t join done d on d.template_id = t.id and d.check_date = h.shift_date
      where t.shift = h.shift and d.n >= t.n),
    h.submitted_at is not null,
    (select coalesce(r.score, r.rating) from public.shift_ratings r where r.handoff_id = h.id),
    (select count(*)::int from public.cleaning_logs cl where cl.done_on = h.shift_date and cl.shift = h.shift),
    h.shift = public.closing_shift() and exists (
      select 1 from public.waste_entries w
      where w.log_date = h.shift_date and w.shift = h.shift and w.photo_path is not null)
  from public.shift_handoffs h
  left join public.hoh_leads l on l.id = h.lead_id
  where public.can_view_scores() and h.lead_id is not null and h.shift_date between p_from and p_to
  order by h.shift_date desc, h.shift
$$;
revoke execute on function public.lead_points_by_shift(date, date) from public, anon;
grant execute on function public.lead_points_by_shift(date, date) to authenticated;
