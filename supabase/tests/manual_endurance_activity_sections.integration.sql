BEGIN;

DO $test$
DECLARE
  v_user_id uuid;
  v_running_id uuid;
  v_swimming_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_TEST_REQUIRES_LOCAL_USER';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  v_running_id := public.create_manual_endurance_activity(
    jsonb_build_object(
      'sport_type', 'running',
      'name', 'Manual intervals',
      'start_time', '2026-08-23T08:00:00+00',
      'timezone', 'Europe/Madrid'
    ),
    jsonb_build_array(
      jsonb_build_object('clientId', 'warmup', 'isGroup', false, 'phaseType', 'warmup', 'durationType', 'time', 'durationS', 300, 'distanceM', 800, 'orderIndex', 0),
      jsonb_build_object('clientId', 'block', 'isGroup', true, 'phaseType', 'interval', 'durationType', 'lap_button', 'repetitions', 2, 'orderIndex', 1),
      jsonb_build_object('clientId', 'work-1', 'parentClientId', 'block', 'isGroup', false, 'phaseType', 'interval', 'durationType', 'distance', 'distanceM', 400, 'durationS', 110, 'repetitionIndex', 1, 'orderIndex', 2),
      jsonb_build_object('clientId', 'rest-1', 'parentClientId', 'block', 'isGroup', false, 'phaseType', 'recovery', 'durationType', 'time', 'durationS', 60, 'repetitionIndex', 1, 'orderIndex', 3),
      jsonb_build_object('clientId', 'work-2', 'parentClientId', 'block', 'isGroup', false, 'phaseType', 'interval', 'durationType', 'distance', 'distanceM', 400, 'durationS', 120, 'repetitionIndex', 2, 'orderIndex', 4),
      jsonb_build_object('clientId', 'rest-2', 'parentClientId', 'block', 'isGroup', false, 'phaseType', 'recovery', 'durationType', 'time', 'durationS', 65, 'repetitionIndex', 2, 'orderIndex', 5)
    )
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.activity_sessions
    WHERE id = v_running_id AND source = 'manual' AND provider = 'manual'
      AND status = 'completed' AND distance_m = 1600 AND duration_s = 655
      AND provider_activity_id IS NULL AND raw_payload_id IS NULL AND device_id IS NULL AND imported_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_SESSION_TOTALS_INVALID';
  END IF;

  IF (SELECT count(*) FROM public.activity_session_sections WHERE session_id = v_running_id) <> 6
    OR (SELECT count(*) FROM public.activity_session_sections WHERE session_id = v_running_id AND is_group) <> 1
    OR (SELECT count(*) FROM public.activity_session_sections WHERE session_id = v_running_id AND parent_section_id IS NOT NULL) <> 4
  THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_SECTIONS_MISSING';
  END IF;

  v_swimming_id := public.create_manual_endurance_activity(
    jsonb_build_object(
      'sport_type', 'swimming',
      'name', 'Manual swim',
      'start_time', '2026-08-23T09:00:00+00',
      'pool_type', '25m'
    ),
    jsonb_build_array(
      jsonb_build_object('clientId', 'swim', 'isGroup', false, 'phaseType', 'interval', 'durationType', 'distance', 'distanceM', 1000, 'durationS', 1500, 'paceSPer100m', 150, 'orderIndex', 0)
    )
  );

  IF (SELECT distance_m FROM public.activity_sessions WHERE id = v_swimming_id) <> 1000 THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_SWIMMING_TOTALS_INVALID';
  END IF;

  BEGIN
    PERFORM public.create_manual_endurance_activity(
      jsonb_build_object('sport_type', 'golf', 'name', 'Unsupported', 'start_time', '2026-08-23T10:00:00+00'),
      jsonb_build_array(jsonb_build_object('clientId', 'step', 'phaseType', 'interval', 'durationType', 'time', 'durationS', 1))
    );
    RAISE EXCEPTION 'MANUAL_ENDURANCE_UNSUPPORTED_NOT_REJECTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MANUAL_ENDURANCE_UNSUPPORTED_SPORT' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_manual_endurance_activity(
      jsonb_build_object('sport_type', 'running', 'name', 'Empty', 'start_time', '2026-08-23T11:00:00+00'),
      jsonb_build_array(jsonb_build_object('clientId', 'empty', 'phaseType', 'interval', 'durationType', 'time'))
    );
    RAISE EXCEPTION 'MANUAL_ENDURANCE_EMPTY_NOT_REJECTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MANUAL_ENDURANCE_EMPTY_ACTIVITY' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_manual_endurance_activity(
      jsonb_build_object('sport_type', 'running', 'name', 'Rollback', 'start_time', '2026-08-23T12:00:00+00'),
      jsonb_build_array(jsonb_build_object('clientId', 'bad', 'phaseType', 'not_a_phase', 'durationType', 'time', 'durationS', 10))
    );
    RAISE EXCEPTION 'MANUAL_ENDURANCE_ROLLBACK_NOT_TRIGGERED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid input value for enum phase_type_enum: "not_a_phase"' THEN RAISE; END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.activity_sessions WHERE user_id = v_user_id AND name = 'Rollback') THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_ROLLBACK_LEFT_SESSION';
  END IF;
END;
$test$;

ROLLBACK;
