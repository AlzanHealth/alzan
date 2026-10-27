-- These account/nutrition functions already check auth.uid internally. Remove
-- anonymous execution too, while preserving existing signed-in behavior.
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_user_data() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_recipe_usage(uuid,public.recipe_usage_context_enum) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_recipe_ingredient(text,text,text,public.ingredients_category,numeric,numeric,numeric,numeric,public.meal_items_source,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_user_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_recipe_usage(uuid,public.recipe_usage_context_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_recipe_ingredient(text,text,text,public.ingredients_category,numeric,numeric,numeric,numeric,public.meal_items_source,text) TO authenticated, service_role;
