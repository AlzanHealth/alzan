-- Allow recipe saving with manual and barcode-scanned ingredients.
-- Manual ingredients stay recipe-only; barcode products can be reused in catalog searches.

create or replace function public.ensure_recipe_ingredient(
  p_name_es text,
  p_name_en text,
  p_name_norm_es text,
  p_category public.ingredients_category,
  p_kcal_100 numeric,
  p_protein_g_100 numeric,
  p_carbs_g_100 numeric,
  p_fat_g_100 numeric,
  p_source public.meal_items_source,
  p_barcode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_barcode text := nullif(trim(coalesce(p_barcode, '')), '');
  v_name_es text := nullif(trim(coalesce(p_name_es, '')), '');
  v_name_en text := nullif(trim(coalesce(p_name_en, p_name_es, '')), '');
  v_name_norm_es text := nullif(trim(coalesce(p_name_norm_es, '')), '');
  v_recipe_name_norm_es text;
  v_existing_id uuid;
  v_source_primary jsonb;
begin
  if v_auth_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_source not in ('manual'::public.meal_items_source, 'openfoodfacts'::public.meal_items_source) then
    raise exception 'unsupported_recipe_ingredient_source';
  end if;

  if v_name_es is null or v_name_norm_es is null then
    raise exception 'ingredient_name_required';
  end if;

  if p_source = 'openfoodfacts'::public.meal_items_source and v_barcode is null then
    raise exception 'barcode_required';
  end if;

  if p_kcal_100 is null or p_kcal_100 < 0
    or p_protein_g_100 is null or p_protein_g_100 < 0
    or p_carbs_g_100 is null or p_carbs_g_100 < 0
    or p_fat_g_100 is null or p_fat_g_100 < 0 then
    raise exception 'invalid_nutrition_values';
  end if;

  if p_source = 'openfoodfacts'::public.meal_items_source then
    select i.id
    into v_existing_id
    from public.ingredients i
    where i.source_primary->>'barcode' = v_barcode
    limit 1;

    if v_existing_id is not null then
      return v_existing_id;
    end if;

    v_recipe_name_norm_es := 'recipe_barcode_' || regexp_replace(v_barcode, '[^0-9A-Za-z]+', '_', 'g');
    v_source_primary := jsonb_build_object(
      'provider', 'OpenFoodFacts',
      'barcode', v_barcode,
      'original_id', v_barcode,
      'original_name_norm_es', v_name_norm_es,
      'retrieved_at', now()
    );
  else
    select i.id
    into v_existing_id
    from public.ingredients i
    where i.name_norm_es = v_name_norm_es
      and coalesce(i.source_primary->>'recipe_only', 'false') <> 'true'
    limit 1;

    if v_existing_id is not null then
      return v_existing_id;
    end if;

    v_recipe_name_norm_es := v_name_norm_es;
    v_source_primary := jsonb_build_object(
      'provider', 'ManualRecipeIngredient',
      'recipe_only', true,
      'original_name_norm_es', v_name_norm_es,
      'retrieved_at', now()
    );
  end if;

  insert into public.ingredients (
    name_es,
    name_en,
    name_norm_es,
    category,
    unit_basis,
    kcal_100,
    protein_g_100,
    carbs_g_100,
    fat_g_100,
    source_primary,
    source_secondary,
    quality_score
  )
  values (
    v_name_es,
    coalesce(v_name_en, v_name_es),
    v_recipe_name_norm_es,
    p_category,
    'per_100g'::public.ingredients_unit_basis,
    p_kcal_100,
    p_protein_g_100,
    p_carbs_g_100,
    p_fat_g_100,
    v_source_primary,
    null,
    0.5
  )
  on conflict (name_norm_es) do nothing
  returning id into v_existing_id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select i.id
  into v_existing_id
  from public.ingredients i
  where i.name_norm_es = v_recipe_name_norm_es
  limit 1;

  if v_existing_id is null then
    raise exception 'recipe_ingredient_create_failed';
  end if;

  return v_existing_id;
end;
$$;

revoke all on function public.ensure_recipe_ingredient(
  text,
  text,
  text,
  public.ingredients_category,
  numeric,
  numeric,
  numeric,
  numeric,
  public.meal_items_source,
  text
) from public;

grant execute on function public.ensure_recipe_ingredient(
  text,
  text,
  text,
  public.ingredients_category,
  numeric,
  numeric,
  numeric,
  numeric,
  public.meal_items_source,
  text
) to authenticated, service_role;
