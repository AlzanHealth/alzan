BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_gym_template_id uuid := gen_random_uuid();
  v_endurance_template_id uuid := gen_random_uuid();
  v_active_template_id uuid := gen_random_uuid();
  v_stale_pending_gym_id uuid := gen_random_uuid();
  v_stale_pending_endurance_id uuid := gen_random_uuid();
  v_current_pending_gym_id uuid := gen_random_uuid();
  v_gym_history_plan_id uuid := gen_random_uuid();
  v_endurance_history_plan_id uuid := gen_random_uuid();
  v_gym_future_plan_id uuid := gen_random_uuid();
  v_endurance_future_plan_id uuid := gen_random_uuid();
  v_gym_session_id uuid := gen_random_uuid();
  v_endurance_session_id uuid := gen_random_uuid();
  v_deleted_count integer;
BEGIN
  SELECT id INTO v_user_id
  FROM public.users
  ORDER BY created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_TEST_REQUIRES_LOCAL_USER';
  END IF;

  IF has_function_privilege('anon', 'public.expire_training_templates(date)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.expire_training_templates(date)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_FUNCTION_GRANTS_INCORRECT';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.expire_training_templates('1900-01-11'::date);
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_EXPECTED_AUTH_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TRAINING_TEMPLATE_AUTH_REQUIRED' THEN
      RAISE;
    END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  INSERT INTO public.workout_templates (
    id,
    user_id,
    base_name,
    source,
    recurrence_start_date,
    recurrence_end_date,
    auto_delete_after_end
  )
  VALUES
    (
      v_gym_template_id,
      v_user_id,
      'Expired gym integration fixture',
      'imported',
      '1900-01-01',
      '1900-01-10',
      true
    ),
    (
      v_active_template_id,
      v_user_id,
      'Active gym integration fixture',
      'imported',
      '1900-01-01',
      '1900-01-12',
      true
    ),
    (
      v_stale_pending_gym_id,
      v_user_id,
      'Abandoned gym import fixture',
      'importing',
      '1900-01-01',
      '1900-01-12',
      true
    ),
    (
      v_current_pending_gym_id,
      v_user_id,
      'Current gym import fixture',
      'importing',
      '1900-01-01',
      '1900-01-12',
      true
    );

  UPDATE public.workout_templates
  SET created_at = now() - interval '25 hours'
  WHERE id = v_stale_pending_gym_id;

  INSERT INTO public.workout_template_translations (
    workout_template_id,
    language_code,
    name
  )
  VALUES (
    v_gym_template_id,
    'es',
    'Traducción que debe eliminarse'
  );

  INSERT INTO public.endurance_workout_templates (
    id,
    user_id,
    sport_type,
    base_name,
    source,
    recurrence_start_date,
    recurrence_end_date,
    auto_delete_after_end
  )
  VALUES (
    v_endurance_template_id,
    v_user_id,
    'running',
    'Expired running integration fixture',
    'imported',
    '1900-01-01',
    '1900-01-10',
    true
  );

  INSERT INTO public.endurance_workout_templates (
    id,
    user_id,
    sport_type,
    base_name,
    source,
    recurrence_start_date,
    recurrence_end_date,
    auto_delete_after_end,
    created_at
  )
  VALUES (
    v_stale_pending_endurance_id,
    v_user_id,
    'running',
    'Abandoned running import fixture',
    'importing',
    '1900-01-01',
    '1900-01-12',
    true,
    now() - interval '25 hours'
  );

  INSERT INTO public.endurance_workout_steps (
    template_id,
    order_index,
    phase_type,
    duration_type,
    duration_s,
    target_type,
    repetitions,
    is_group
  )
  VALUES (
    v_endurance_template_id,
    0,
    'warmup',
    'time',
    600,
    'none',
    1,
    false
  );

  INSERT INTO public.endurance_workout_template_progressions (
    template_id,
    week_index,
    total_distance_m,
    total_duration_s
  )
  VALUES (
    v_endurance_template_id,
    1,
    5000,
    1800
  );

  INSERT INTO public.workout_plans (
    id,
    user_id,
    planned_date,
    gym_template_id,
    status,
    completed_at
  )
  VALUES
    (
      v_gym_history_plan_id,
      v_user_id,
      '1900-01-09',
      v_gym_template_id,
      'completed',
      '1900-01-09T10:00:00Z'
    ),
    (
      v_gym_future_plan_id,
      v_user_id,
      '1900-01-12',
      v_gym_template_id,
      'planned',
      NULL
    );

  INSERT INTO public.workout_plans (
    id,
    user_id,
    planned_date,
    endurance_template_id,
    status,
    completed_at
  )
  VALUES
    (
      v_endurance_history_plan_id,
      v_user_id,
      '1900-01-08',
      v_endurance_template_id,
      'completed',
      '1900-01-08T10:00:00Z'
    ),
    (
      v_endurance_future_plan_id,
      v_user_id,
      '1900-01-13',
      v_endurance_template_id,
      'planned',
      NULL
    );

  INSERT INTO public.activity_sessions (
    id,
    user_id,
    sport_type,
    workout_template_id,
    name
  )
  VALUES (
    v_gym_session_id,
    v_user_id,
    'strength',
    v_gym_template_id,
    'Gym history integration fixture'
  );

  INSERT INTO public.activity_sessions (
    id,
    user_id,
    sport_type,
    endurance_template_id,
    suggested_endurance_template_id,
    name
  )
  VALUES (
    v_endurance_session_id,
    v_user_id,
    'running',
    v_endurance_template_id,
    v_endurance_template_id,
    'Running history integration fixture'
  );

  v_deleted_count := public.expire_training_templates('1900-01-11'::date);

  IF v_deleted_count <> 2 THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_DELETED_COUNT_INCORRECT';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workout_templates
    WHERE id = v_gym_template_id
  ) OR EXISTS (
    SELECT 1
    FROM public.endurance_workout_templates
    WHERE id = v_endurance_template_id
  ) THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_EXPIRED_TEMPLATE_REMAINED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workout_templates
    WHERE id = v_active_template_id
  ) THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_ACTIVE_TEMPLATE_REMOVED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workout_templates
    WHERE id = v_stale_pending_gym_id
  ) OR EXISTS (
    SELECT 1
    FROM public.endurance_workout_templates
    WHERE id = v_stale_pending_endurance_id
  ) THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_STALE_PENDING_TEMPLATE_REMAINED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workout_templates
    WHERE id = v_current_pending_gym_id
  ) THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_CURRENT_PENDING_TEMPLATE_REMOVED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workout_plans
    WHERE id IN (v_gym_future_plan_id, v_endurance_future_plan_id)
  ) THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_FUTURE_PLAN_REMAINED';
  END IF;
  IF (
    SELECT count(*)
    FROM public.workout_plans
    WHERE id IN (v_gym_history_plan_id, v_endurance_history_plan_id)
      AND gym_template_id IS NULL
      AND endurance_template_id IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_HISTORY_NOT_PRESERVED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.activity_sessions
    WHERE id = v_gym_session_id
      AND workout_template_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.activity_sessions
    WHERE id = v_endurance_session_id
      AND (
        endurance_template_id IS NOT NULL
        OR suggested_endurance_template_id IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_SESSION_NOT_PRESERVED_OR_UNLINKED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workout_template_translations
    WHERE workout_template_id = v_gym_template_id
  ) OR EXISTS (
    SELECT 1
    FROM public.endurance_workout_steps
    WHERE template_id = v_endurance_template_id
  ) OR EXISTS (
    SELECT 1
    FROM public.endurance_workout_template_progressions
    WHERE template_id = v_endurance_template_id
  ) THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_CHILD_ROWS_REMAINED';
  END IF;

  INSERT INTO public.workout_plans (
    user_id,
    planned_date,
    import_dedupe_key
  )
  VALUES (
    v_user_id,
    '1900-01-20',
    'training-plan-v1:1900-01-20:test-family'
  );

  BEGIN
    INSERT INTO public.workout_plans (
      user_id,
      planned_date,
      import_dedupe_key
    )
    VALUES (
      v_user_id,
      '1900-01-20',
      'training-plan-v1:1900-01-20:test-family'
    );
    RAISE EXCEPTION 'TRAINING_TEMPLATE_LIFECYCLE_EXPECTED_DEDUPE_FAILURE_NOT_RAISED';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
