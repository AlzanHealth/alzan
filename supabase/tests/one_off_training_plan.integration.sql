BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_endurance_template_id uuid := gen_random_uuid();
  v_gym_template_id uuid := gen_random_uuid();
  v_unrelated_endurance_plan_id uuid := gen_random_uuid();
  v_unrelated_gym_plan_id uuid := gen_random_uuid();
  v_one_off_plan_id uuid;
  v_updated_plan_id uuid;
  v_completed_plan_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'ONE_OFF_TEST_REQUIRES_LOCAL_USER'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  IF has_function_privilege('anon', 'public.set_one_off_workout_plan(uuid,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ONE_OFF_FUNCTION_EXPOSED_TO_ANON';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.set_one_off_workout_plan(uuid,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ONE_OFF_FUNCTION_MISSING_AUTHENTICATED_GRANT';
  END IF;

  INSERT INTO public.endurance_workout_templates (id, user_id, sport_type, base_name)
  VALUES (v_endurance_template_id, v_user_id, 'running', 'Codex one-off running fixture');
  INSERT INTO public.workout_templates (id, user_id, base_name)
  VALUES (v_gym_template_id, v_user_id, 'Codex one-off gym fixture');

  INSERT INTO public.workout_plans (id, user_id, planned_date, endurance_template_id)
  VALUES (v_unrelated_endurance_plan_id, v_user_id, '2026-08-10', v_endurance_template_id);
  INSERT INTO public.workout_plans (id, user_id, planned_date, gym_template_id)
  VALUES (v_unrelated_gym_plan_id, v_user_id, '2026-08-11', v_gym_template_id);

  BEGIN
    PERFORM public.set_one_off_workout_plan(gen_random_uuid(), 'endurance', '2026-08-12');
    RAISE EXCEPTION 'ONE_OFF_UNKNOWN_TEMPLATE_ACCEPTED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'ONE_OFF_TEMPLATE_NOT_FOUND' THEN RAISE; END IF;
  END;

  v_one_off_plan_id := public.set_one_off_workout_plan(
    v_endurance_template_id,
    'endurance',
    '2026-08-12'
  );
  IF v_one_off_plan_id IS NULL THEN RAISE EXCEPTION 'ONE_OFF_RUNNING_PLAN_NOT_CREATED'; END IF;
  IF (
    SELECT count(*)
    FROM public.workout_plans
    WHERE user_id = v_user_id
      AND endurance_template_id = v_endurance_template_id
      AND is_one_off_schedule
      AND completed_at IS NULL
      AND status IN ('planned', 'rescheduled')
  ) <> 1 THEN
    RAISE EXCEPTION 'ONE_OFF_RUNNING_PLAN_NOT_UNIQUE';
  END IF;

  v_updated_plan_id := public.set_one_off_workout_plan(
    v_endurance_template_id,
    'endurance',
    '2026-08-13'
  );
  IF v_updated_plan_id IS DISTINCT FROM v_one_off_plan_id THEN
    RAISE EXCEPTION 'ONE_OFF_RUNNING_PLAN_RECREATED_INSTEAD_OF_UPDATED';
  END IF;
  IF (SELECT planned_date FROM public.workout_plans WHERE id = v_one_off_plan_id) <> '2026-08-13'::date THEN
    RAISE EXCEPTION 'ONE_OFF_RUNNING_DATE_NOT_UPDATED';
  END IF;
  IF (SELECT planned_date FROM public.workout_plans WHERE id = v_unrelated_endurance_plan_id) <> '2026-08-10'::date THEN
    RAISE EXCEPTION 'ONE_OFF_RUNNING_MUTATED_UNRELATED_PLAN';
  END IF;

  PERFORM public.set_one_off_workout_plan(v_endurance_template_id, 'endurance', NULL);
  IF EXISTS (SELECT 1 FROM public.workout_plans WHERE id = v_one_off_plan_id) THEN
    RAISE EXCEPTION 'ONE_OFF_RUNNING_PLAN_NOT_REMOVED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workout_plans WHERE id = v_unrelated_endurance_plan_id) THEN
    RAISE EXCEPTION 'ONE_OFF_RUNNING_REMOVED_UNRELATED_PLAN';
  END IF;

  INSERT INTO public.workout_plans (
    id,
    user_id,
    planned_date,
    endurance_template_id,
    is_one_off_schedule,
    status,
    completed_at
  ) VALUES (
    v_completed_plan_id,
    v_user_id,
    '2026-08-09',
    v_endurance_template_id,
    true,
    'completed',
    now()
  );
  PERFORM public.set_one_off_workout_plan(v_endurance_template_id, 'endurance', '2026-08-15');
  PERFORM public.set_one_off_workout_plan(v_endurance_template_id, 'endurance', NULL);
  IF NOT EXISTS (SELECT 1 FROM public.workout_plans WHERE id = v_completed_plan_id) THEN
    RAISE EXCEPTION 'ONE_OFF_RUNNING_REMOVED_COMPLETED_HISTORY';
  END IF;

  v_one_off_plan_id := public.set_one_off_workout_plan(v_gym_template_id, 'gym', '2026-08-14');
  IF v_one_off_plan_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.workout_plans
      WHERE id = v_one_off_plan_id
        AND gym_template_id = v_gym_template_id
        AND is_one_off_schedule
    ) THEN
    RAISE EXCEPTION 'ONE_OFF_GYM_PLAN_NOT_CREATED';
  END IF;

  PERFORM public.set_one_off_workout_plan(v_gym_template_id, 'gym', NULL);
  IF EXISTS (SELECT 1 FROM public.workout_plans WHERE id = v_one_off_plan_id) THEN
    RAISE EXCEPTION 'ONE_OFF_GYM_PLAN_NOT_REMOVED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workout_plans WHERE id = v_unrelated_gym_plan_id) THEN
    RAISE EXCEPTION 'ONE_OFF_GYM_REMOVED_UNRELATED_PLAN';
  END IF;
END;
$$;

ROLLBACK;
