-- recipe_usage_events hardening + observability
-- - Ensure RPC can always insert usage events from authenticated clients.
-- - Allow authenticated users to read only their own usage rows.

alter function public.log_recipe_usage(uuid, public.recipe_usage_context_enum)
  security definer
  set search_path = public;

revoke all on function public.log_recipe_usage(uuid, public.recipe_usage_context_enum) from public;
grant execute on function public.log_recipe_usage(uuid, public.recipe_usage_context_enum) to authenticated, service_role;

grant usage on type public.recipe_usage_context_enum to authenticated, service_role;
grant insert on table public.recipe_usage_events to authenticated, service_role;
grant select on table public.recipe_usage_events to authenticated, service_role;

drop policy if exists recipe_usage_events_select_own on public.recipe_usage_events;
create policy recipe_usage_events_select_own
on public.recipe_usage_events
for select
to authenticated
using (user_id = auth.uid());
