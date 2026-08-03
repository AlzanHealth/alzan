-- Expand the local nutrition menu import capacity for detailed 45-day plans.
-- This migration is intentionally additive: it replaces the already deployed
-- function without editing an older migration file.

CREATE OR REPLACE FUNCTION public.import_nutrition_menu(
  p_dates date[],
  p_expected_snapshot_token text,
  p_meals jsonb,
  p_items jsonb,
  p_replacement_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '15s'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_created_ids jsonb;
  v_first_date date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'MENU_IMPORT_AUTH_REQUIRED';
  END IF;

  IF p_dates IS NULL
    OR cardinality(p_dates) NOT BETWEEN 1 AND 45
    OR (
      SELECT count(DISTINCT imported_date)
      FROM unnest(p_dates) AS imported_date
    ) <> cardinality(p_dates)
    OR (
      SELECT max(imported_date) - min(imported_date)
      FROM unnest(p_dates) AS imported_date
    ) > 44
  THEN
    RAISE EXCEPTION 'MENU_IMPORT_DATES_INVALID';
  END IF;

  IF jsonb_typeof(p_meals) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR pg_column_size(p_meals) + pg_column_size(p_items) > 2000000
    OR p_expected_snapshot_token !~ '^[0-9a-f]{32}$'
    OR jsonb_array_length(p_meals) NOT BETWEEN 1 AND 450
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 3000
    OR COALESCE(cardinality(p_replacement_ids), 0) > 4500
  THEN
    RAISE EXCEPTION 'MENU_IMPORT_PAYLOAD_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_meals) AS meal(
      id uuid,
      user_id uuid,
      date date,
      meal_type text,
      name text,
      kcal numeric,
      protein_g numeric,
      carbs_g numeric,
      fats_g numeric
    )
    WHERE meal.id IS NULL
      OR meal.user_id IS DISTINCT FROM v_user_id
      OR meal.date IS NULL
      OR meal.date <> ALL(p_dates)
      OR meal.meal_type IS NULL
      OR meal.meal_type NOT IN (
        'breakfast',
        'almuerzo',
        'lunch',
        'merienda',
        'dinner',
        'snack'
      )
      OR NULLIF(btrim(meal.name), '') IS NULL
      OR char_length(meal.name) > 160
      OR meal.kcal IS NULL OR meal.kcal < 0
      OR meal.protein_g IS NULL OR meal.protein_g < 0
      OR meal.carbs_g IS NULL OR meal.carbs_g < 0
      OR meal.fats_g IS NULL OR meal.fats_g < 0
  ) OR (
    SELECT count(*) <> count(DISTINCT meal.id)
    FROM jsonb_to_recordset(p_meals) AS meal(id uuid)
  ) THEN
    RAISE EXCEPTION 'MENU_IMPORT_MEALS_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(
      meal_log_id uuid,
      user_id uuid,
      name text,
      source_ref text,
      quantity_g numeric,
      per_100g_kcal numeric,
      per_100g_protein_g numeric,
      per_100g_carbs_g numeric,
      per_100g_fats_g numeric,
      kcal numeric,
      protein_g numeric,
      carbs_g numeric,
      fats_g numeric
    )
    WHERE item.meal_log_id IS NULL
      OR item.user_id IS DISTINCT FROM v_user_id
      OR NULLIF(btrim(item.name), '') IS NULL
      OR char_length(item.name) > 160
      OR NULLIF(btrim(item.source_ref), '') IS NULL
      OR char_length(item.source_ref) > 200
      OR item.quantity_g IS NULL
      OR item.quantity_g < 0.1
      OR item.quantity_g > 10000
      OR item.per_100g_kcal IS NULL OR item.per_100g_kcal < 0
      OR item.per_100g_protein_g IS NULL OR item.per_100g_protein_g < 0
      OR item.per_100g_carbs_g IS NULL OR item.per_100g_carbs_g < 0
      OR item.per_100g_fats_g IS NULL OR item.per_100g_fats_g < 0
      OR item.kcal IS NULL OR item.kcal < 0
      OR item.protein_g IS NULL OR item.protein_g < 0
      OR item.carbs_g IS NULL OR item.carbs_g < 0
      OR item.fats_g IS NULL OR item.fats_g < 0
      OR NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_meals) AS meal(id uuid)
        WHERE meal.id = item.meal_log_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_meals) AS meal(id uuid)
    LEFT JOIN jsonb_to_recordset(p_items) AS item(meal_log_id uuid)
      ON item.meal_log_id = meal.id
    GROUP BY meal.id
    HAVING count(item.meal_log_id) NOT BETWEEN 1 AND 30
  ) THEN
    RAISE EXCEPTION 'MENU_IMPORT_ITEMS_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('nutrition-menu:' || v_user_id::text, 0)
  );

  IF public.nutrition_menu_snapshot_token(v_user_id, p_dates)
    IS DISTINCT FROM p_expected_snapshot_token
  THEN
    RAISE EXCEPTION 'MENU_IMPORT_SNAPSHOT_STALE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_replacement_ids, ARRAY[]::uuid[])) AS replacement(id)
    LEFT JOIN public.meal_logs AS existing
      ON existing.id = replacement.id
     AND existing.user_id = v_user_id
    WHERE existing.id IS NULL
      OR existing.date <> ALL(p_dates)
      OR NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_meals) AS meal(date date, meal_type text)
        WHERE meal.date = existing.date
          AND meal.meal_type = existing.meal_type::text
      )
  ) THEN
    RAISE EXCEPTION 'MENU_IMPORT_REPLACEMENTS_INVALID';
  END IF;

  INSERT INTO public.meal_logs (
    id,
    user_id,
    date,
    meal_type,
    name,
    kcal,
    protein_g,
    carbs_g,
    fats_g,
    adherence_status,
    source,
    data_quality,
    calc_version,
    origin,
    source_recipe_id
  )
  SELECT
    meal.id,
    v_user_id,
    meal.date,
    meal.meal_type::public.meal_type_enum,
    meal.name,
    meal.kcal,
    meal.protein_g,
    meal.carbs_g,
    meal.fats_g,
    'done_as_planned',
    'menu_import_v1',
    'computed'::public.meal_logs_data_quality,
    'nutrition_v1',
    'imported'::public.meal_logs_origin,
    NULL
  FROM jsonb_to_recordset(p_meals) AS meal(
    id uuid,
    user_id uuid,
    date date,
    meal_type text,
    name text,
    kcal numeric,
    protein_g numeric,
    carbs_g numeric,
    fats_g numeric
  );

  INSERT INTO public.meal_items (
    meal_log_id,
    user_id,
    name,
    source,
    source_ref,
    quantity_g,
    per_100g_kcal,
    per_100g_protein_g,
    per_100g_carbs_g,
    per_100g_fats_g,
    kcal,
    protein_g,
    carbs_g,
    fats_g,
    data_quality,
    origin
  )
  SELECT
    item.meal_log_id,
    v_user_id,
    item.name,
    'database'::public.meal_items_source,
    item.source_ref,
    item.quantity_g,
    item.per_100g_kcal,
    item.per_100g_protein_g,
    item.per_100g_carbs_g,
    item.per_100g_fats_g,
    item.kcal,
    item.protein_g,
    item.carbs_g,
    item.fats_g,
    'automatic'::public.meal_items_data_quality,
    'imported'::public.meal_items_origin
  FROM jsonb_to_recordset(p_items) AS item(
    meal_log_id uuid,
    user_id uuid,
    name text,
    source_ref text,
    quantity_g numeric,
    per_100g_kcal numeric,
    per_100g_protein_g numeric,
    per_100g_carbs_g numeric,
    per_100g_fats_g numeric,
    kcal numeric,
    protein_g numeric,
    carbs_g numeric,
    fats_g numeric
  );

  DELETE FROM public.meal_items
  WHERE user_id = v_user_id
    AND meal_log_id = ANY(COALESCE(p_replacement_ids, ARRAY[]::uuid[]));

  DELETE FROM public.meal_logs
  WHERE user_id = v_user_id
    AND id = ANY(COALESCE(p_replacement_ids, ARRAY[]::uuid[]));

  SELECT
    jsonb_agg(meal.id ORDER BY meal.id),
    min(meal.date)
  INTO v_created_ids, v_first_date
  FROM jsonb_to_recordset(p_meals) AS meal(id uuid, date date);

  RETURN jsonb_build_object(
    'created_meal_ids', COALESCE(v_created_ids, '[]'::jsonb),
    'first_date', v_first_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_nutrition_menu(date[], text, jsonb, jsonb, uuid[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_nutrition_menu(date[], text, jsonb, jsonb, uuid[])
TO authenticated;
