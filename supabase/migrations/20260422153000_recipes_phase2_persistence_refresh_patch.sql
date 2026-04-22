-- Phase 2 patch:
-- - Ensure usage events can be persisted reliably through RPC from authenticated clients.
-- - Allow on-demand aggregate refresh from FE (cron remains primary refresh path).

alter function public.log_recipe_usage(uuid, public.recipe_usage_context_enum)
  security definer
  set search_path = public;

revoke all on function public.log_recipe_usage(uuid, public.recipe_usage_context_enum) from public;
grant execute on function public.log_recipe_usage(uuid, public.recipe_usage_context_enum) to authenticated, service_role;

revoke all on function public.refresh_recipe_popularity_aggregates() from public;
grant execute on function public.refresh_recipe_popularity_aggregates() to authenticated, service_role;

grant usage on type public.recipe_usage_context_enum to authenticated, service_role;

grant insert on table public.recipe_usage_events to authenticated, service_role;
grant select on table public.recipe_usage_events to service_role;

grant select, insert, delete on table public.recipe_favorites to authenticated, service_role;
