-- UX tweak for duplicated recipes:
-- Keep original name; if name collides for same owner, append numeric suffix (2), (3), ...
-- Avoid "(copia)" suffix in user-visible recipe names.

create or replace function public.duplicate_recipe(p_recipe_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_source_recipe public.recipes%rowtype;
  v_new_recipe_id uuid;
  v_default_visibility text := 'private';
  v_new_visibility public.recipe_visibility_enum := 'private'::public.recipe_visibility_enum;
  v_name_attempt integer := 1;
  v_base_name_es text;
  v_new_name_es text;
  v_new_name_norm_es text;
begin
  select r.*
  into v_source_recipe
  from public.recipes r
  where r.id = p_recipe_id
    and r.deleted_at is null
    and (
      r.source = 'system'::public.recipe_source_enum
      or r.visibility = 'public'::public.recipe_visibility_enum
      or r.owner_user_id = auth.uid()
    );

  if not found then
    raise exception 'recipe_not_visible';
  end if;

  select coalesce(up.nutrition_prefs->>'default_recipe_visibility', 'private')
  into v_default_visibility
  from public.user_preferences up
  where up.user_id = auth.uid();

  if v_default_visibility = 'public' then
    v_new_visibility := 'public'::public.recipe_visibility_enum;
  end if;

  v_base_name_es := trim(v_source_recipe.name_es);
  v_new_name_es := v_base_name_es;
  v_new_name_norm_es := lower(trim(regexp_replace(v_new_name_es, '\s+', ' ', 'g')));

  while exists (
    select 1
    from public.recipes r
    where r.owner_user_id = auth.uid()
      and r.deleted_at is null
      and r.name_norm_es = v_new_name_norm_es
  ) loop
    v_name_attempt := v_name_attempt + 1;
    v_new_name_es := v_base_name_es || format(' (%s)', v_name_attempt);
    v_new_name_norm_es := lower(trim(regexp_replace(v_new_name_es, '\s+', ' ', 'g')));
  end loop;

  insert into public.recipes (
    name_es,
    name_en,
    name_norm_es,
    description_es,
    description_en,
    quality_score,
    owner_user_id,
    source,
    visibility,
    published_at,
    public_slug,
    origin_recipe_id,
    kcal_100,
    protein_g_100,
    carbs_g_100,
    fat_g_100
  )
  values (
    v_new_name_es,
    v_source_recipe.name_en,
    v_new_name_norm_es,
    v_source_recipe.description_es,
    v_source_recipe.description_en,
    v_source_recipe.quality_score,
    auth.uid(),
    'user'::public.recipe_source_enum,
    v_new_visibility,
    null,
    null,
    p_recipe_id,
    v_source_recipe.kcal_100,
    v_source_recipe.protein_g_100,
    v_source_recipe.carbs_g_100,
    v_source_recipe.fat_g_100
  )
  returning id into v_new_recipe_id;

  insert into public.recipe_items (
    recipe_id,
    ingredient_id,
    quantity,
    unit,
    order_index
  )
  select
    v_new_recipe_id,
    ri.ingredient_id,
    ri.quantity,
    ri.unit,
    ri.order_index
  from public.recipe_items ri
  where ri.recipe_id = v_source_recipe.id
  order by ri.order_index;

  perform public.refresh_recipe_snapshot(v_new_recipe_id);

  return v_new_recipe_id;
end;
$$;
