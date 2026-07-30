BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_existing_id uuid := gen_random_uuid();
  v_created_id uuid := gen_random_uuid();
  v_atomic_proposed_id uuid := gen_random_uuid();
  v_wrong_user_proposed_id uuid := gen_random_uuid();
  v_stale_existing_id uuid := gen_random_uuid();
  v_stale_proposed_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_result jsonb;
  v_dates date[];
  v_meals jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_meal_id uuid;
  v_day_index integer;
  v_meal_index integer;
  v_ingredient_index integer;
  v_meal_types text[] := ARRAY['breakfast', 'almuerzo', 'lunch', 'merienda', 'dinner', 'snack'];
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_TEST_REQUIRES_LOCAL_USER';
  END IF;

  IF has_function_privilege('anon', 'public.import_nutrition_menu(date[], text, jsonb, jsonb, uuid[])', 'EXECUTE')
    OR NOT has_function_privilege(
      'authenticated',
      'public.import_nutrition_menu(date[], text, jsonb, jsonb, uuid[])',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_FUNCTION_GRANTS_INCORRECT';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.get_nutrition_menu_import_snapshot(ARRAY['2026-08-03'::date]);
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_EXPECTED_AUTH_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MENU_IMPORT_AUTH_REQUIRED' THEN
      RAISE;
    END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  BEGIN
    PERFORM public.get_nutrition_menu_import_snapshot(
      ARRAY['2026-08-01'::date, '2026-09-15'::date]
    );
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_EXPECTED_RANGE_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MENU_IMPORT_DATES_INVALID' THEN
      RAISE;
    END IF;
  END;

  INSERT INTO public.meal_logs (id, user_id, date, meal_type, name)
  VALUES (v_existing_id, v_user_id, '2026-08-03', 'lunch', 'Existing SQL fixture');

  v_snapshot := public.get_nutrition_menu_import_snapshot(ARRAY['2026-08-03'::date]);
  v_result := public.import_nutrition_menu(
    ARRAY['2026-08-03'::date],
    v_snapshot->>'token',
    jsonb_build_array(jsonb_build_object(
      'id', v_created_id,
      'user_id', v_user_id,
      'date', '2026-08-03',
      'meal_type', 'lunch',
      'name', 'Imported SQL fixture',
      'kcal', 300,
      'protein_g', 20,
      'carbs_g', 35,
      'fats_g', 8
    )),
    jsonb_build_array(jsonb_build_object(
      'meal_log_id', v_created_id,
      'user_id', v_user_id,
      'name', 'Rice',
      'source_ref', 'sql-rice',
      'quantity_g', 150,
      'per_100g_kcal', 200,
      'per_100g_protein_g', 10,
      'per_100g_carbs_g', 20,
      'per_100g_fats_g', 5,
      'kcal', 300,
      'protein_g', 15,
      'carbs_g', 30,
      'fats_g', 7.5
    )),
    ARRAY[v_existing_id]
  );

  IF EXISTS (SELECT 1 FROM public.meal_logs WHERE id = v_existing_id) THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_REPLACEMENT_NOT_DELETED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.meal_logs
    WHERE id = v_created_id
      AND user_id = v_user_id
      AND origin = 'imported'
      AND source = 'menu_import_v1'
      AND adherence_status = 'done_as_planned'
      AND source_recipe_id IS NULL
  ) THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_MEAL_NOT_CREATED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.meal_items
    WHERE meal_log_id = v_created_id
      AND user_id = v_user_id
      AND origin = 'imported'
      AND source = 'database'
  ) THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_ITEM_NOT_CREATED';
  END IF;
  IF (v_result->>'first_date')::date <> '2026-08-03'::date THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_FIRST_DATE_INCORRECT';
  END IF;

  v_snapshot := public.get_nutrition_menu_import_snapshot(ARRAY['2026-08-03'::date]);
  BEGIN
    PERFORM public.import_nutrition_menu(
      ARRAY['2026-08-03'::date],
      v_snapshot->>'token',
      jsonb_build_array(
        jsonb_build_object(
          'id', v_created_id,
          'user_id', v_user_id,
          'date', '2026-08-03',
          'meal_type', 'lunch',
          'name', 'Duplicate primary key',
          'kcal', 100,
          'protein_g', 10,
          'carbs_g', 10,
          'fats_g', 2
        ),
        jsonb_build_object(
          'id', v_atomic_proposed_id,
          'user_id', v_user_id,
          'date', '2026-08-03',
          'meal_type', 'dinner',
          'name', 'Must roll back with sibling',
          'kcal', 100,
          'protein_g', 10,
          'carbs_g', 10,
          'fats_g', 2
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'meal_log_id', v_created_id,
          'user_id', v_user_id,
          'name', 'Fixture one',
          'source_ref', 'sql-fixture-one',
          'quantity_g', 100,
          'per_100g_kcal', 100,
          'per_100g_protein_g', 10,
          'per_100g_carbs_g', 10,
          'per_100g_fats_g', 2,
          'kcal', 100,
          'protein_g', 10,
          'carbs_g', 10,
          'fats_g', 2
        ),
        jsonb_build_object(
          'meal_log_id', v_atomic_proposed_id,
          'user_id', v_user_id,
          'name', 'Fixture two',
          'source_ref', 'sql-fixture-two',
          'quantity_g', 100,
          'per_100g_kcal', 100,
          'per_100g_protein_g', 10,
          'per_100g_carbs_g', 10,
          'per_100g_fats_g', 2,
          'kcal', 100,
          'protein_g', 10,
          'carbs_g', 10,
          'fats_g', 2
        )
      ),
      ARRAY[]::uuid[]
    );
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_EXPECTED_ATOMIC_FAILURE_NOT_RAISED';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.meal_logs WHERE id = v_atomic_proposed_id) THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_FAILED_BATCH_WAS_PARTIALLY_WRITTEN';
  END IF;

  v_snapshot := public.get_nutrition_menu_import_snapshot(ARRAY['2026-08-05'::date]);
  BEGIN
    PERFORM public.import_nutrition_menu(
      ARRAY['2026-08-05'::date],
      v_snapshot->>'token',
      jsonb_build_array(jsonb_build_object(
        'id', v_wrong_user_proposed_id,
        'user_id', gen_random_uuid(),
        'date', '2026-08-05',
        'meal_type', 'dinner',
        'name', 'Wrong owner',
        'kcal', 100,
        'protein_g', 10,
        'carbs_g', 10,
        'fats_g', 2
      )),
      jsonb_build_array(jsonb_build_object(
        'meal_log_id', v_wrong_user_proposed_id,
        'user_id', v_user_id,
        'name', 'Fixture',
        'source_ref', 'sql-fixture',
        'quantity_g', 100,
        'per_100g_kcal', 100,
        'per_100g_protein_g', 10,
        'per_100g_carbs_g', 10,
        'per_100g_fats_g', 2,
        'kcal', 100,
        'protein_g', 10,
        'carbs_g', 10,
        'fats_g', 2
      )),
      ARRAY[]::uuid[]
    );
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_EXPECTED_OWNER_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MENU_IMPORT_MEALS_INVALID' THEN
      RAISE;
    END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.meal_logs WHERE id = v_wrong_user_proposed_id) THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_WRONG_OWNER_MUTATED_DATA';
  END IF;

  v_snapshot := public.get_nutrition_menu_import_snapshot(ARRAY['2026-08-04'::date]);
  INSERT INTO public.meal_logs (id, user_id, date, meal_type, name)
  VALUES (v_stale_existing_id, v_user_id, '2026-08-04', 'dinner', 'Concurrent SQL fixture');

  BEGIN
    PERFORM public.import_nutrition_menu(
      ARRAY['2026-08-04'::date],
      v_snapshot->>'token',
      jsonb_build_array(jsonb_build_object(
        'id', v_stale_proposed_id,
        'user_id', v_user_id,
        'date', '2026-08-04',
        'meal_type', 'dinner',
        'name', 'Must roll back',
        'kcal', 100,
        'protein_g', 10,
        'carbs_g', 10,
        'fats_g', 2
      )),
      jsonb_build_array(jsonb_build_object(
        'meal_log_id', v_stale_proposed_id,
        'user_id', v_user_id,
        'name', 'Fixture',
        'source_ref', 'sql-fixture',
        'quantity_g', 100,
        'per_100g_kcal', 100,
        'per_100g_protein_g', 10,
        'per_100g_carbs_g', 10,
        'per_100g_fats_g', 2,
        'kcal', 100,
        'protein_g', 10,
        'carbs_g', 10,
        'fats_g', 2
      )),
      ARRAY[]::uuid[]
    );
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_EXPECTED_STALE_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MENU_IMPORT_SNAPSHOT_STALE' THEN
      RAISE;
    END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.meal_logs WHERE id = v_stale_proposed_id) THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_STALE_CALL_MUTATED_DATA';
  END IF;

  v_dates := ARRAY(
    SELECT '2026-09-01'::date + day_offset
    FROM generate_series(0, 44) AS day_offset
  );

  FOR v_day_index IN 0..44 LOOP
    FOR v_meal_index IN 1..5 LOOP
      v_meal_id := gen_random_uuid();
      v_meals := v_meals || jsonb_build_array(jsonb_build_object(
        'id', v_meal_id,
        'user_id', v_user_id,
        'date', ('2026-09-01'::date + v_day_index),
        'meal_type', v_meal_types[v_meal_index],
        'name', format('SQL max-range day %s meal %s', v_day_index + 1, v_meal_index),
        'kcal', 800,
        'protein_g', 80,
        'carbs_g', 160,
        'fats_g', 40
      ));

      FOR v_ingredient_index IN 1..6 LOOP
        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'meal_log_id', v_meal_id,
          'user_id', v_user_id,
          'name', format('SQL ingredient %s', v_ingredient_index),
          'source_ref', format('sql-ingredient-%s', v_ingredient_index),
          'quantity_g', 100,
          'per_100g_kcal', 100,
          'per_100g_protein_g', 10,
          'per_100g_carbs_g', 20,
          'per_100g_fats_g', 5,
          'kcal', 100,
          'protein_g', 10,
          'carbs_g', 20,
          'fats_g', 5
        ));
      END LOOP;
    END LOOP;
  END LOOP;

  v_snapshot := public.get_nutrition_menu_import_snapshot(v_dates);
  PERFORM public.import_nutrition_menu(
    v_dates,
    v_snapshot->>'token',
    v_meals,
    v_items,
    ARRAY[]::uuid[]
  );

  IF (
    SELECT count(*)
    FROM public.meal_logs
    WHERE user_id = v_user_id
      AND date = ANY(v_dates)
      AND name LIKE 'SQL max-range day %'
  ) <> 225 THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_MAX_RANGE_MEAL_COUNT_INCORRECT';
  END IF;
  IF (
    SELECT count(*)
    FROM public.meal_logs
    WHERE user_id = v_user_id
      AND date = ANY(v_dates)
      AND name LIKE 'SQL max-range day %'
      AND adherence_status = 'done_as_planned'
  ) <> 225 THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_MAX_RANGE_MEAL_STATUS_INCORRECT';
  END IF;
  IF (
    SELECT count(*)
    FROM public.meal_items AS item
    JOIN public.meal_logs AS meal ON meal.id = item.meal_log_id
    WHERE meal.user_id = v_user_id
      AND meal.date = ANY(v_dates)
      AND meal.name LIKE 'SQL max-range day %'
  ) <> 1350 THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_MAX_RANGE_ITEM_COUNT_INCORRECT';
  END IF;
  IF (
    SELECT count(DISTINCT meal_type)
    FROM public.meal_logs
    WHERE user_id = v_user_id
      AND date = ANY(v_dates)
      AND name LIKE 'SQL max-range day %'
  ) <> 5 THEN
    RAISE EXCEPTION 'NUTRITION_MENU_IMPORT_MAX_RANGE_MEAL_TYPES_INCOMPLETE';
  END IF;
END;
$$;

ROLLBACK;
