BEGIN;

DO $test$
DECLARE
  v_user_id uuid;
  v_ingredient_id uuid;
  v_meal public.meal_logs;
  v_recipe_result jsonb;
  v_recipe_id uuid;
  v_recipe_updated_at timestamptz;
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_ingredient_id FROM public.ingredients ORDER BY id LIMIT 1;
  IF v_user_id IS NULL OR v_ingredient_id IS NULL THEN
    RAISE EXCEPTION 'ATOMIC_NUTRITION_TEST_REQUIRES_LOCAL_SEEDS';
  END IF;

  IF has_function_privilege('anon', 'public.copy_meal_to_date(jsonb, jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.copy_meal_to_date(jsonb, jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'MEAL_COPY_FUNCTION_GRANTS_INCORRECT';
  END IF;

  IF has_function_privilege(
      'anon',
      'public.save_user_recipe_atomic(uuid, timestamptz, text, text, public.recipe_visibility_enum, jsonb, jsonb)',
      'EXECUTE'
    ) OR NOT has_function_privilege(
      'authenticated',
      'public.save_user_recipe_atomic(uuid, timestamptz, text, text, public.recipe_visibility_enum, jsonb, jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'RECIPE_SAVE_FUNCTION_GRANTS_INCORRECT';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  v_meal := public.copy_meal_to_date(
    jsonb_build_object(
      'date', '2026-08-07',
      'meal_type', 'lunch',
      'name', 'Atomic meal copy fixture',
      'kcal', 100,
      'source', 'meal_copy_v1'
    ),
    jsonb_build_array(jsonb_build_object(
      'name', 'Atomic item fixture',
      'quantity_g', 100,
      'source', 'manual'
    ))
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.meal_items
    WHERE meal_log_id = v_meal.id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'MEAL_COPY_DID_NOT_CREATE_ITEMS';
  END IF;

  BEGIN
    PERFORM public.copy_meal_to_date(
      jsonb_build_object(
        'date', '2026-08-08',
        'meal_type', 'dinner',
        'name', 'Meal that must roll back'
      ),
      jsonb_build_array(jsonb_build_object(
        'name', 'Invalid source item',
        'quantity_g', 100,
        'source', 'not-a-source'
      ))
    );
    RAISE EXCEPTION 'MEAL_COPY_EXPECTED_FAILURE_NOT_RAISED';
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.meal_logs
    WHERE user_id = v_user_id AND name = 'Meal that must roll back'
  ) THEN
    RAISE EXCEPTION 'MEAL_COPY_FAILED_WRITE_WAS_NOT_ATOMIC';
  END IF;

  v_recipe_result := public.save_user_recipe_atomic(
    NULL,
    NULL,
    'Atomic recipe fixture',
    'atomic recipe fixture',
    'private',
    jsonb_build_object(
      'kcal_100', 100,
      'protein_g_100', 10,
      'carbs_g_100', 10,
      'fat_g_100', 2,
      'quality_score', 0.5
    ),
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient_id,
      'order_index', 0,
      'quantity', 100,
      'unit', 'g'
    ))
  );
  v_recipe_id := (v_recipe_result->>'id')::uuid;
  v_recipe_updated_at := (v_recipe_result->>'updated_at')::timestamptz;

  IF NOT EXISTS (
    SELECT 1 FROM public.recipe_items
    WHERE recipe_id = v_recipe_id AND ingredient_id = v_ingredient_id
  ) THEN
    RAISE EXCEPTION 'RECIPE_SAVE_DID_NOT_CREATE_ITEMS';
  END IF;

  BEGIN
    PERFORM public.save_user_recipe_atomic(
      v_recipe_id,
      v_recipe_updated_at - interval '1 second',
      'Stale update',
      'stale update',
      'private',
      jsonb_build_object('kcal_100', 1),
      jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_ingredient_id,
        'order_index', 0,
        'quantity', 1,
        'unit', 'g'
      ))
    );
    RAISE EXCEPTION 'RECIPE_EXPECTED_CONFLICT_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'RECIPE_UPDATE_CONFLICT' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.recipes
    WHERE id = v_recipe_id AND name_es = 'Stale update'
  ) THEN
    RAISE EXCEPTION 'RECIPE_CONFLICT_CHANGED_EXISTING_RECIPE';
  END IF;
END;
$test$;

ROLLBACK;
