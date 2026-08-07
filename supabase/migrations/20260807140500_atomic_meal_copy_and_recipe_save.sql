-- Keep meal copies and user recipe replacements atomic. Both functions derive
-- ownership from auth.uid() and expose only the minimum authenticated surface.

CREATE OR REPLACE FUNCTION public.copy_meal_to_date(
  p_log jsonb,
  p_items jsonb
)
RETURNS public.meal_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $copy_meal$
DECLARE
  v_user_id uuid := auth.uid();
  v_log public.meal_logs;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'MEAL_COPY_AUTH_REQUIRED';
  END IF;

  IF jsonb_typeof(p_log) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) > 100
    OR (p_log->>'date') IS NULL
    OR (p_log->>'meal_type') NOT IN ('breakfast', 'almuerzo', 'lunch', 'merienda', 'dinner', 'snack')
    OR char_length(COALESCE(p_log->>'name', '')) > 160
  THEN
    RAISE EXCEPTION 'MEAL_COPY_PAYLOAD_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(name text, quantity_g numeric)
    WHERE NULLIF(btrim(item.name), '') IS NULL
      OR char_length(item.name) > 160
      OR item.quantity_g IS NULL
      OR item.quantity_g <= 0
      OR item.quantity_g > 10000
  ) THEN
    RAISE EXCEPTION 'MEAL_COPY_ITEMS_INVALID';
  END IF;

  INSERT INTO public.meal_logs (
    user_id,
    logged_at,
    date,
    meal_type,
    name,
    notes,
    kcal,
    protein_g,
    carbs_g,
    fats_g,
    diet_template_meal_id,
    adherence_status,
    source,
    data_quality,
    calc_version,
    origin,
    origin_confidence,
    source_recipe_id
  ) VALUES (
    v_user_id,
    COALESCE((p_log->>'logged_at')::timestamptz, now()),
    (p_log->>'date')::date,
    (p_log->>'meal_type')::public.meal_type_enum,
    NULLIF(btrim(p_log->>'name'), ''),
    NULLIF(p_log->>'notes', ''),
    (p_log->>'kcal')::numeric,
    (p_log->>'protein_g')::numeric,
    (p_log->>'carbs_g')::numeric,
    (p_log->>'fats_g')::numeric,
    NULL,
    COALESCE(NULLIF(p_log->>'adherence_status', ''), 'extra_meal'),
    COALESCE(NULLIF(p_log->>'source', ''), 'meal_copy_v1'),
    COALESCE((p_log->>'data_quality')::public.meal_logs_data_quality, 'manual'::public.meal_logs_data_quality),
    COALESCE(NULLIF(p_log->>'calc_version', ''), 'nutrition_v1'),
    COALESCE((p_log->>'origin')::public.meal_logs_origin, 'user'::public.meal_logs_origin),
    (p_log->>'origin_confidence')::numeric,
    NULLIF(p_log->>'source_recipe_id', '')::uuid
  )
  RETURNING * INTO v_log;

  INSERT INTO public.meal_items (
    meal_log_id,
    user_id,
    name,
    quantity_g,
    source,
    source_ref,
    kcal,
    protein_g,
    carbs_g,
    fats_g,
    per_100g_kcal,
    per_100g_protein_g,
    per_100g_carbs_g,
    per_100g_fats_g,
    data_quality,
    origin,
    confidence
  )
  SELECT
    v_log.id,
    v_user_id,
    item.name,
    item.quantity_g,
    COALESCE(item.source::public.meal_items_source, 'manual'::public.meal_items_source),
    item.source_ref,
    item.kcal,
    item.protein_g,
    item.carbs_g,
    item.fats_g,
    item.per_100g_kcal,
    item.per_100g_protein_g,
    item.per_100g_carbs_g,
    item.per_100g_fats_g,
    COALESCE(item.data_quality::public.meal_items_data_quality, 'manual'::public.meal_items_data_quality),
    COALESCE(item.origin::public.meal_items_origin, 'user'::public.meal_items_origin),
    item.confidence
  FROM jsonb_to_recordset(p_items) AS item(
    name text,
    quantity_g numeric,
    source text,
    source_ref text,
    kcal numeric,
    protein_g numeric,
    carbs_g numeric,
    fats_g numeric,
    per_100g_kcal numeric,
    per_100g_protein_g numeric,
    per_100g_carbs_g numeric,
    per_100g_fats_g numeric,
    data_quality text,
    origin text,
    confidence numeric
  );

  RETURN v_log;
END;
$copy_meal$;

CREATE OR REPLACE FUNCTION public.save_user_recipe_atomic(
  p_recipe_id uuid,
  p_expected_updated_at timestamptz,
  p_name_es text,
  p_name_norm_es text,
  p_visibility public.recipe_visibility_enum,
  p_nutrition jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '10s'
AS $save_recipe$
DECLARE
  v_user_id uuid := auth.uid();
  v_recipe_id uuid;
  v_current_updated_at timestamptz;
  v_next_updated_at timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'RECIPE_SAVE_AUTH_REQUIRED';
  END IF;

  IF NULLIF(btrim(p_name_es), '') IS NULL
    OR NULLIF(btrim(p_name_norm_es), '') IS NULL
    OR char_length(p_name_es) > 160
    OR jsonb_typeof(p_nutrition) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION 'RECIPE_SAVE_PAYLOAD_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(ingredient_id uuid, order_index integer, quantity numeric, unit text)
    WHERE item.ingredient_id IS NULL
      OR item.order_index IS NULL
      OR item.order_index < 0
      OR item.quantity IS NULL
      OR item.quantity <= 0
      OR item.quantity > 10000
      OR item.unit NOT IN ('g', 'ml')
      OR NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id = item.ingredient_id)
  ) THEN
    RAISE EXCEPTION 'RECIPE_SAVE_ITEMS_INVALID';
  END IF;

  IF p_recipe_id IS NULL THEN
    INSERT INTO public.recipes (
      name_es,
      name_norm_es,
      owner_user_id,
      source,
      visibility,
      kcal_100,
      protein_g_100,
      carbs_g_100,
      fat_g_100,
      quality_score,
      updated_at
    ) VALUES (
      btrim(p_name_es),
      btrim(p_name_norm_es),
      v_user_id,
      'user'::public.recipe_source_enum,
      p_visibility,
      COALESCE((p_nutrition->>'kcal_100')::numeric, 0),
      COALESCE((p_nutrition->>'protein_g_100')::numeric, 0),
      COALESCE((p_nutrition->>'carbs_g_100')::numeric, 0),
      COALESCE((p_nutrition->>'fat_g_100')::numeric, 0),
      COALESCE((p_nutrition->>'quality_score')::numeric, 0),
      v_next_updated_at
    )
    RETURNING id INTO v_recipe_id;
  ELSE
    SELECT updated_at
    INTO v_current_updated_at
    FROM public.recipes
    WHERE id = p_recipe_id
      AND owner_user_id = v_user_id
      AND source = 'user'::public.recipe_source_enum
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RECIPE_UPDATE_NOT_ALLOWED';
    END IF;

    IF p_expected_updated_at IS NULL OR v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'RECIPE_UPDATE_CONFLICT';
    END IF;

    v_recipe_id := p_recipe_id;

    UPDATE public.recipes
    SET name_es = btrim(p_name_es),
        name_norm_es = btrim(p_name_norm_es),
        kcal_100 = COALESCE((p_nutrition->>'kcal_100')::numeric, 0),
        protein_g_100 = COALESCE((p_nutrition->>'protein_g_100')::numeric, 0),
        carbs_g_100 = COALESCE((p_nutrition->>'carbs_g_100')::numeric, 0),
        fat_g_100 = COALESCE((p_nutrition->>'fat_g_100')::numeric, 0),
        quality_score = COALESCE((p_nutrition->>'quality_score')::numeric, 0),
        updated_at = v_next_updated_at
    WHERE id = v_recipe_id;

    DELETE FROM public.recipe_items WHERE recipe_id = v_recipe_id;
  END IF;

  INSERT INTO public.recipe_items (recipe_id, ingredient_id, order_index, quantity, unit)
  SELECT
    v_recipe_id,
    item.ingredient_id,
    item.order_index,
    item.quantity,
    item.unit::public.recipe_items_unit
  FROM jsonb_to_recordset(p_items) AS item(
    ingredient_id uuid,
    order_index integer,
    quantity numeric,
    unit text
  );

  RETURN jsonb_build_object('id', v_recipe_id, 'updated_at', v_next_updated_at);
END;
$save_recipe$;
