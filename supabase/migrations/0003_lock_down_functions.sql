-- Internal functions (triggers, attribution) are not part of the public API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
revoke execute on function public.set_attribution() from public, anon, authenticated;
revoke execute on function public.keep_attribution() from public, anon, authenticated;
revoke execute on function public.equipment_log_status() from public, anon, authenticated;
revoke execute on function public.actor_name(uuid) from public, anon, authenticated;

-- Role helpers are needed by row-level security for signed-in users only.
revoke execute on function public.app_role() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_manager() from public, anon;
grant execute on function public.app_role() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_manager() to authenticated;
