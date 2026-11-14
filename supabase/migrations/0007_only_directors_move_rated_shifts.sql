-- Once a shift is rated, only a director can change which HOH Lead it is credited to.
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
  if v_role = 'kitchen' and p_date < current_date - 1 then
    raise exception 'Past shifts can only be changed by a lead or director';
  end if;
  if v_role <> 'director' and exists (select 1 from public.shift_ratings where handoff_id = v_id) then
    raise exception 'That shift has already been rated. Ask a director to change its Shift Lead.';
  end if;
  update public.shift_handoffs set lead_id = p_lead_id, lead_name = v_name where id = v_id;
end $$;
