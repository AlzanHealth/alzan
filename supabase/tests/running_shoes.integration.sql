BEGIN;

CREATE TEMP TABLE running_shoe_test_context (
  owner_id uuid NOT NULL,
  other_owner_id uuid NOT NULL,
  owner_shoe_id uuid NOT NULL,
  other_shoe_id uuid NOT NULL,
  assigned_session_id uuid NOT NULL,
  mileage_m numeric NOT NULL
) ON COMMIT DROP;

GRANT SELECT ON running_shoe_test_context TO authenticated;

DO $fixture$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_other_owner_id uuid := gen_random_uuid();
  v_first_shoe_id uuid;
  v_second_shoe_id uuid;
  v_assigned_session_id uuid := gen_random_uuid();
  v_past_session_id uuid := gen_random_uuid();
  v_trail_session_id uuid := gen_random_uuid();
  v_explicit_session_id uuid := gen_random_uuid();
  v_new_default_session_id uuid := gen_random_uuid();
  v_other_session_id uuid := gen_random_uuid();
  v_first_result record;
  v_second_result record;
  v_other_result record;
  v_mileage numeric;
  v_updated_sessions integer;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (v_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_owner_id::text || '@running-shoes.test', '', '{}'::jsonb, '{}'::jsonb),
    (v_other_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_other_owner_id::text || '@running-shoes.test', '', '{}'::jsonb, '{}'::jsonb);

  INSERT INTO public.activity_sessions (id, user_id, sport_type, distance_m, start_time, started_at_local, timezone)
  VALUES
    (v_past_session_id, v_owner_id, 'running', 2500, now() - interval '3 days', (CURRENT_DATE - 3)::timestamp, 'UTC'),
    (v_assigned_session_id, v_owner_id, 'running', 4000, now() - interval '1 day', (CURRENT_DATE - 1)::timestamp, 'UTC'),
    (v_trail_session_id, v_owner_id, 'trail', 9000, now() - interval '1 day', (CURRENT_DATE - 1)::timestamp, 'UTC');

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

  SELECT * INTO v_first_result
  FROM public.create_running_shoe_with_backfill(
    'Everyday shoe', CURRENT_DATE - 1, 'Test brand', 'Model A', CURRENT_DATE - 2, 600, true
  );
  v_first_shoe_id := v_first_result.shoe_id;

  IF v_first_result.assigned_sessions <> 1
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_assigned_session_id) <> v_first_shoe_id
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_past_session_id) IS NOT NULL
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_trail_session_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'RUNNING_SHOE_BACKFILL_DATE_OR_SPORT_FILTER_FAILED';
  END IF;

  SELECT * INTO v_second_result
  FROM public.create_running_shoe_with_backfill(
    'Race shoe', CURRENT_DATE - 3, NULL, NULL, NULL, 350, true
  );
  v_second_shoe_id := v_second_result.shoe_id;

  IF v_second_result.assigned_sessions <> 1
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_assigned_session_id) <> v_first_shoe_id
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_past_session_id) <> v_second_shoe_id
    OR NOT (SELECT is_default FROM public.running_shoes WHERE id = v_second_shoe_id)
    OR (SELECT is_default FROM public.running_shoes WHERE id = v_first_shoe_id)
  THEN
    RAISE EXCEPTION 'RUNNING_SHOE_BACKFILL_OVERWROTE_ASSIGNMENT_OR_DEFAULT_FAILED';
  END IF;

  INSERT INTO public.activity_sessions (id, user_id, sport_type, distance_m, start_time, started_at_local, timezone)
  VALUES
    (v_new_default_session_id, v_owner_id, 'running', 3000, now(), NULL, NULL),
    (v_explicit_session_id, v_owner_id, 'running', 1200, now(), NULL, NULL),
    (gen_random_uuid(), v_owner_id, 'trail', 8000, now(), NULL, NULL);

  UPDATE public.activity_sessions
  SET running_shoe_id = v_first_shoe_id
  WHERE id = v_explicit_session_id;

  IF (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_new_default_session_id) <> v_second_shoe_id
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_explicit_session_id) <> v_first_shoe_id
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE sport_type = 'trail' AND user_id = v_owner_id AND distance_m = 8000) IS NOT NULL
  THEN
    RAISE EXCEPTION 'RUNNING_SHOE_DEFAULT_TRIGGER_SCOPE_OR_EXPLICIT_ASSIGNMENT_FAILED';
  END IF;

  PERFORM public.set_default_running_shoe(v_first_shoe_id, true);
  INSERT INTO public.activity_sessions (user_id, sport_type, distance_m)
  VALUES (v_owner_id, 'running', 5000);

  IF (SELECT running_shoe_id FROM public.activity_sessions WHERE user_id = v_owner_id AND distance_m = 5000) <> v_first_shoe_id
    OR (SELECT count(*) FROM public.running_shoes WHERE user_id = v_owner_id AND is_default) <> 1
  THEN
    RAISE EXCEPTION 'RUNNING_SHOE_DEFAULT_SWITCH_FAILED';
  END IF;

  SELECT total_distance_m INTO v_mileage
  FROM public.get_running_shoe_mileage()
  WHERE shoe_id = v_first_shoe_id;

  IF v_mileage <> 10200 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_MILEAGE_AGGREGATE_FAILED: %', v_mileage;
  END IF;

  UPDATE public.activity_sessions
  SET running_shoe_id = v_second_shoe_id
  WHERE id = v_assigned_session_id;

  SELECT total_distance_m INTO v_mileage
  FROM public.get_running_shoe_mileage()
  WHERE shoe_id = v_first_shoe_id;

  IF v_mileage <> 6200 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_REASSIGNMENT_DID_NOT_SUBTRACT_MILEAGE: %', v_mileage;
  END IF;

  SELECT total_distance_m INTO v_mileage
  FROM public.get_running_shoe_mileage()
  WHERE shoe_id = v_second_shoe_id;

  IF v_mileage <> 9500 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_REASSIGNMENT_DID_NOT_ADD_MILEAGE: %', v_mileage;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_other_owner_id::text, true);
  SELECT * INTO v_other_result
  FROM public.create_running_shoe_with_backfill(
    'Other user shoe', CURRENT_DATE, NULL, NULL, NULL, NULL, false
  );

  INSERT INTO public.activity_sessions (id, user_id, sport_type, distance_m, start_time, started_at_local, timezone)
  VALUES (v_other_session_id, v_other_owner_id, 'running', 1800, now(), CURRENT_DATE::timestamp, 'UTC');

  v_updated_sessions := public.update_running_shoe_with_backfill(
    v_other_result.shoe_id, 'Edited other user shoe', CURRENT_DATE, NULL, NULL, NULL, 700
  );

  IF v_updated_sessions <> 0
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_other_session_id) IS NOT NULL
    OR (SELECT name FROM public.running_shoes WHERE id = v_other_result.shoe_id) <> 'Edited other user shoe'
  THEN
    RAISE EXCEPTION 'RUNNING_SHOE_METADATA_EDIT_BACKFILLED_UNASSIGNED_SESSION';
  END IF;

  v_updated_sessions := public.update_running_shoe_with_backfill(
    v_other_result.shoe_id, 'Edited other user shoe', CURRENT_DATE - 1, NULL, NULL, NULL, 700
  );

  IF v_updated_sessions <> 1
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_other_session_id) <> v_other_result.shoe_id
  THEN
    RAISE EXCEPTION 'RUNNING_SHOE_START_DATE_CHANGE_DID_NOT_BACKFILL';
  END IF;

  UPDATE public.activity_sessions
  SET running_shoe_id = NULL
  WHERE id = v_other_session_id;

  v_updated_sessions := public.update_running_shoe_with_backfill(
    v_other_result.shoe_id, 'Updated metadata after removal', CURRENT_DATE - 1,
    'New brand', 'New model', CURRENT_DATE - 2, 800
  );

  IF v_updated_sessions <> 0
    OR (SELECT running_shoe_id FROM public.activity_sessions WHERE id = v_other_session_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'RUNNING_SHOE_METADATA_EDIT_OVERWROTE_EXPLICIT_REMOVAL';
  END IF;

  INSERT INTO running_shoe_test_context (
    owner_id, other_owner_id, owner_shoe_id, other_shoe_id, assigned_session_id, mileage_m
  ) VALUES (
    v_owner_id, v_other_owner_id, v_first_shoe_id, v_other_result.shoe_id, v_assigned_session_id, v_mileage
  );
END;
$fixture$;

SET LOCAL ROLE authenticated;

DO $rls$
DECLARE
  v_context running_shoe_test_context%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_context FROM running_shoe_test_context;
  PERFORM set_config('request.jwt.claim.sub', v_context.owner_id::text, true);

  IF EXISTS (SELECT 1 FROM public.running_shoes WHERE id = v_context.other_shoe_id) THEN
    RAISE EXCEPTION 'RUNNING_SHOE_RLS_EXPOSED_ANOTHER_USERS_SHOE';
  END IF;

  BEGIN
    UPDATE public.activity_sessions
    SET running_shoe_id = v_context.other_shoe_id
    WHERE id = v_context.assigned_session_id;
    RAISE EXCEPTION 'RUNNING_SHOE_CROSS_USER_ASSIGNMENT_WAS_ALLOWED';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_context.other_owner_id::text, true);
  IF EXISTS (SELECT 1 FROM public.running_shoes WHERE id = v_context.owner_shoe_id) THEN
    RAISE EXCEPTION 'RUNNING_SHOE_RLS_EXPOSED_OWNER_SHOE_TO_ANOTHER_USER';
  END IF;
END;
$rls$;

RESET ROLE;
ROLLBACK;
