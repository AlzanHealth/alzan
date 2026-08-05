BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_template_id uuid := gen_random_uuid();
  v_template_b_id uuid := gen_random_uuid();
  v_plan_a uuid := gen_random_uuid();
  v_plan_b uuid := gen_random_uuid();
  v_offset_session_id uuid := gen_random_uuid();
  v_offset_plan_id uuid := gen_random_uuid();
  v_recurring_session_id uuid := gen_random_uuid();
  v_recurring_template_id uuid := gen_random_uuid();
  v_recurring_plan_id uuid := gen_random_uuid();
  v_gym_session_id uuid := gen_random_uuid();
  v_gym_template_id uuid := gen_random_uuid();
  v_gym_plan_id uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'PLAN_ASSOCIATION_TEST_REQUIRES_LOCAL_USER'; END IF;

  INSERT INTO public.endurance_workout_templates (id, user_id, sport_type, base_name)
  VALUES
    (v_template_id, v_user_id, 'running', 'Codex association fixture'),
    (v_template_b_id, v_user_id, 'running', 'Codex association fixture B');
  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, start_time, end_time, started_at_local, source, name
  ) VALUES (
    v_session_id, v_user_id, 'running', '2026-05-01T08:00:00Z',
    '2026-05-01T09:00:00Z', '2026-05-01T10:00:00', 'imported', 'Original provider title'
  );
  INSERT INTO public.workout_plans (id, user_id, planned_date, endurance_template_id)
  VALUES
    (v_plan_a, v_user_id, '2026-05-01', v_template_id),
    (v_plan_b, v_user_id, '2026-05-01', v_template_id);

  v_result := public.associate_activity_session_template(
    v_user_id, v_session_id, v_template_id, NULL, NULL
  );
  IF v_result->>'status' <> 'selection_required'
    OR jsonb_array_length(v_result->'candidates') <> 2 THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_AMBIGUITY_NOT_REPORTED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workout_plans
    WHERE id IN (v_plan_a, v_plan_b) AND activity_session_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_AMBIGUITY_MUTATED_DATA';
  END IF;

  v_result := public.associate_activity_session_template(
    v_user_id, v_session_id, v_template_id, NULL, v_plan_b
  );
  IF v_result->>'status' <> 'associated' OR (v_result->>'plan_id')::uuid <> v_plan_b THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_EXPLICIT_PLAN_NOT_USED';
  END IF;
  IF (SELECT count(*) FROM public.workout_plans WHERE activity_session_id = v_session_id) <> 1 THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_SESSION_LINKED_MORE_THAN_ONCE';
  END IF;
  IF (SELECT name FROM public.activity_sessions WHERE id = v_session_id) <> 'Codex association fixture' THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_RUNNING_NAME_NOT_UPDATED';
  END IF;

  v_result := public.associate_activity_session_template(
    v_user_id, v_session_id, v_template_b_id, NULL, v_plan_b
  );
  IF v_result->>'status' <> 'associated'
    OR (SELECT name FROM public.activity_sessions WHERE id = v_session_id) <> 'Codex association fixture B' THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_RUNNING_NAME_NOT_UPDATED_ON_REASSOCIATION';
  END IF;

  PERFORM public.associate_activity_session_template(v_user_id, v_session_id, NULL, NULL, NULL);
  IF EXISTS (SELECT 1 FROM public.workout_plans WHERE activity_session_id = v_session_id) THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_REMOVAL_DID_NOT_REVERT_PLAN';
  END IF;
  IF (SELECT name FROM public.activity_sessions WHERE id = v_session_id) IS DISTINCT FROM 'Original provider title' THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_NAME_NOT_RESTORED';
  END IF;
  IF (SELECT template_name_state FROM public.activity_sessions WHERE id = v_session_id) IS NOT NULL THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_NAME_STATE_NOT_CLEARED';
  END IF;

  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, start_time, end_time, timezone, source
  ) VALUES (
    v_offset_session_id, v_user_id, 'running', '2026-05-01T22:30:00Z',
    '2026-05-01T23:30:00Z', '+02:00', 'imported'
  );
  INSERT INTO public.workout_plans (id, user_id, planned_date, endurance_template_id)
  VALUES (v_offset_plan_id, v_user_id, '2026-05-02', v_template_id);
  v_result := public.associate_activity_session_template(
    v_user_id, v_offset_session_id, v_template_id, NULL, v_offset_plan_id
  );
  IF (v_result->>'plan_id')::uuid <> v_offset_plan_id THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_FIXED_OFFSET_DATE_INCORRECT';
  END IF;

  INSERT INTO public.endurance_workout_templates (
    id, user_id, sport_type, base_name, scheduled_day, recurrence_start_date, recurrence_end_date
  ) VALUES (
    v_recurring_template_id, v_user_id, 'running', 'Codex recurring run fixture', 2, '2026-05-01', '2026-05-31'
  );
  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, start_time, end_time, started_at_local, source
  ) VALUES (
    v_recurring_session_id, v_user_id, 'running', '2026-05-05T08:00:00Z',
    '2026-05-05T09:00:00Z', '2026-05-05T10:00:00', 'imported'
  );
  INSERT INTO public.workout_plans (id, user_id, planned_date, endurance_template_id)
  VALUES (v_recurring_plan_id, v_user_id, '2026-05-05', v_recurring_template_id);
  v_result := public.associate_activity_session_template(
    v_user_id, v_recurring_session_id, v_recurring_template_id, NULL, v_recurring_plan_id
  );
  IF v_result->>'status' <> 'associated'
    OR (SELECT name FROM public.activity_sessions WHERE id = v_recurring_session_id) <> 'Codex recurring run fixture' THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_RECURRING_NAME_NOT_UPDATED';
  END IF;

  INSERT INTO public.workout_templates (id, user_id, base_name)
  VALUES (v_gym_template_id, v_user_id, 'Codex gym fixture');
  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, start_time, end_time, started_at_local, source, name
  ) VALUES (
    v_gym_session_id, v_user_id, 'strength', '2026-05-01T08:00:00Z',
    '2026-05-01T09:00:00Z', '2026-05-01T10:00:00', 'imported', 'Original strength title'
  );
  INSERT INTO public.workout_plans (id, user_id, planned_date, gym_template_id)
  VALUES (v_gym_plan_id, v_user_id, '2026-05-01', v_gym_template_id);
  BEGIN
    PERFORM public.associate_activity_session_template(
      v_user_id, v_session_id, v_template_id, NULL, v_gym_plan_id
    );
    RAISE EXCEPTION 'PLAN_ASSOCIATION_EXPECTED_FAMILY_REJECTION_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IMPORT_REVIEW_PLAN_SPORT_MISMATCH' THEN RAISE; END IF;
  END;
  v_result := public.associate_activity_session_template(
    v_user_id, v_gym_session_id, NULL, v_gym_template_id, v_gym_plan_id
  );
  IF v_result->>'status' <> 'associated'
    OR (SELECT name FROM public.activity_sessions WHERE id = v_gym_session_id) <> 'Codex gym fixture' THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_GYM_NAME_NOT_UPDATED';
  END IF;
  PERFORM public.associate_activity_session_template(v_user_id, v_gym_session_id, NULL, NULL, NULL);
  IF (SELECT name FROM public.activity_sessions WHERE id = v_gym_session_id) IS DISTINCT FROM 'Original strength title' THEN
    RAISE EXCEPTION 'PLAN_ASSOCIATION_GYM_NAME_NOT_RESTORED';
  END IF;
END;
$$;

ROLLBACK;
