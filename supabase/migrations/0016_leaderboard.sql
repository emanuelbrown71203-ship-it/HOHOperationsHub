-- Leaderboard: the top 5 HOH Leads by points, for everyone to see. It never lists last place and never
-- shows anyone's breakdown, so it celebrates the top without calling out the bottom.

-- Points per lead for a period (same counting as the app: finished daily checklists, handoff, stars,
-- cleaning jobs, night waste photo, times the values in Setup).
create or replace function private.point_totals(p_from date, p_to date)
returns table (lead_id uuid, points int)
language sql stable security definer set search_path = '' as $$
  with pv as (
    select coalesce((point_values->>'checklist')::numeric, 10) as checklist,
           coalesce((point_values->>'handoff')::numeric, 5) as handoff,
           coalesce((point_values->>'star')::numeric, 2) as star,
           coalesce((point_values->>'cleaning')::numeric, 1) as cleaning,
           coalesce((point_values->>'waste_photo')::numeric, 5) as waste_photo
    from public.app_settings where id = 1
  ),
  tmpl as (
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
  ),
  shifts as (
    select h.lead_id,
      (select count(*) from tmpl t join done d on d.template_id = t.id and d.check_date = h.shift_date
        where t.shift = h.shift and d.n >= t.n) as checklists,
      (h.submitted_at is not null) as handoff,
      (select coalesce(r.score, r.rating) from public.shift_ratings r where r.handoff_id = h.id) as stars,
      (select count(*) from public.cleaning_logs cl where cl.done_on = h.shift_date and cl.shift = h.shift) as cleaning,
      (h.shift = public.closing_shift() and exists (
        select 1 from public.waste_entries w
        where w.log_date = h.shift_date and w.shift = h.shift and w.photo_path is not null)) as waste_photo
    from public.shift_handoffs h
    where h.lead_id is not null and h.shift_date between p_from and p_to
  )
  select s.lead_id, sum(
      s.checklists * pv.checklist
    + case when s.handoff then pv.handoff else 0 end
    + round(coalesce(s.stars, 0) * pv.star)
    + s.cleaning * pv.cleaning
    + case when s.waste_photo then pv.waste_photo else 0 end
  )::int
  from shifts s cross join pv
  group by s.lead_id
$$;
revoke execute on function private.point_totals(date, date) from public, anon, authenticated;

create or replace function public.leaderboard(p_from date, p_to date)
returns table (place int, lead_id uuid, name text, points int)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select t.lead_id, l.name, t.points,
      rank() over (order by t.points desc) as place,
      row_number() over (order by t.points desc, l.name) as pos,
      count(*) over () as n
    from private.point_totals(p_from, p_to) t
    join public.hoh_leads l on l.id = t.lead_id and l.active
    where t.points > 0
  )
  select place::int, lead_id, name, points from ranked
  where public.is_active_user() and place <= 5 and (n = 1 or pos < n)
  order by place, name
$$;
revoke execute on function public.leaderboard(date, date) from public, anon;
grant execute on function public.leaderboard(date, date) to authenticated;

-- Your own points, privately: how many you have and how many more would put you on the board.
create or replace function public.my_points(p_from date, p_to date)
returns table (points int, on_board boolean, to_board int)
language sql stable security definer set search_path = '' as $$
  with me as (select public.my_lead_id() as id),
  mine as (select coalesce((select t.points from private.point_totals(p_from, p_to) t, me where t.lead_id = me.id), 0) as points),
  board as (select * from public.leaderboard(p_from, p_to))
  select m.points,
    exists (select 1 from board b, me where b.lead_id = me.id),
    greatest(0, coalesce((select min(b.points) from board b), 0) - m.points + 1)
  from mine m, me
  where me.id is not null
$$;
revoke execute on function public.my_points(date, date) from public, anon;
grant execute on function public.my_points(date, date) to authenticated;
