-- SECURITY DEFINER functions must not be executable by the anonymous role.
-- Revoke PUBLIC and any direct anon grants explicitly, then expose only the
-- authenticated and server-side surfaces required by the application.

DO $grant_fix$
BEGIN
  EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public.copy_meal_to_date(jsonb, jsonb) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.copy_meal_to_date(jsonb, jsonb) TO authenticated, service_role';
  EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public.save_user_recipe_atomic(uuid, timestamptz, text, text, public.recipe_visibility_enum, jsonb, jsonb) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_user_recipe_atomic(uuid, timestamptz, text, text, public.recipe_visibility_enum, jsonb, jsonb) TO authenticated, service_role';
END;
$grant_fix$;
