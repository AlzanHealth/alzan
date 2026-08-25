BEGIN;

DO $test$
DECLARE
  v_user_id uuid;
  v_source_id uuid := gen_random_uuid();
  v_occupied_id uuid := gen_random_uuid();
  v_copy_id uuid;
  v_exercise_id uuid;
  v_exercise_id_2 uuid;
  v_tag_id uuid := gen_random_uuid();
  v_section_group_id uuid := gen_random_uuid();
  v_section_leaf_id uuid := gen_random_uuid();
  v_failed_copy_count integer;
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'COPY_SESSION_TEST_REQUIRES_LOCAL_USER';
  END IF;

  IF has_function_privilege('anon', 'public.copy_completed_activity_session(uuid, date)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.copy_completed_activity_session(uuid, date)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'COPY_SESSION_FUNCTION_GRANTS_INCORRECT';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, source, provider, status, start_time, end_time,
    started_at_local, ended_at_local, duration_s, name, distance_m,
    route_polyline, provider_activity_id, source_record_id, source_channel, timezone
  ) VALUES (
    v_source_id, v_user_id, 'running', 'imported', 'coros', 'completed',
    '2026-08-23 08:00:00+00', '2026-08-23 08:42:00+00',
    '2026-08-23 10:00:00', '2026-08-23 10:42:00', 2520,
    'Copy source', 7200, 'encoded-route', 'coros-source-id', 'coros-record', 'cloud', 'Europe/Madrid'
  );

  INSERT INTO public.activity_laps (
    session_id, user_id, lap_index, distance_m, duration_s, avg_heart_rate,
    max_heart_rate, avg_pace_s_per_km, lap_type, start_offset_s, end_offset_s,
    split_group, split_distance_m, split_group_order
  ) VALUES (
    v_source_id, v_user_id, 1, 7200, 2520, 147, 171, 350, 'distance', 12, 2532,
    'distance', 1000, 4
  );
  INSERT INTO public.activity_session_sections (
    id, user_id, session_id, order_index, is_group, phase_type, duration_type, repetitions
  ) VALUES (
    v_section_group_id, v_user_id, v_source_id, 0, true, 'interval', 'lap_button', 2
  );
  INSERT INTO public.activity_session_sections (
    id, user_id, session_id, parent_section_id, order_index, is_group, phase_type,
    duration_type, repetition_index, distance_m, duration_s
  ) VALUES (
    v_section_leaf_id, v_user_id, v_source_id, v_section_group_id, 1, false, 'interval',
    'distance', 1, 400, 120
  );
  INSERT INTO public.activity_heart_rate_zones (session_id, zone, duration_s, percentage)
  VALUES (v_source_id, 3, 1200, 47.62);
  INSERT INTO public.activity_route_points (
    session_id, user_id, point_index, lat, lon, timestamp, offset_s, altitude_m,
    distance_m, speed_mps, horizontal_accuracy_m, vertical_accuracy_m, source,
    source_channel, source_package, source_record_id, raw_payload
  ) VALUES (
    v_source_id, v_user_id, 1, 41.3874, 2.1686, '2026-08-23 08:10:00+00',
    600, 17.5, 1500, 3.8, 2.1, 3.2, 'wearable_import', 'cloud',
    'com.coros.app', 'route-point-1', '{"provider":"coros"}'::jsonb
  );
  INSERT INTO public.activity_streams (
    session_id, user_id, stream_type, unit, data, sample_hz, source,
    source_channel, source_package, source_record_id
  ) VALUES (
    v_source_id, v_user_id, 'heart_rate', 'bpm', '{"values":[140,145]}'::jsonb,
    1, 'wearable_import', 'cloud', 'com.coros.app', 'stream-1'
  );
  INSERT INTO public.activity_stream_samples (
    session_id, user_id, stream_type, value, unit, timestamp, offset_s, source,
    source_channel, source_package, source_record_id, raw_payload
  ) VALUES (
    v_source_id, v_user_id, 'heart_rate', 140, 'bpm', '2026-08-23 08:10:00+00',
    600, 'wearable_import', 'cloud', 'com.coros.app', 'sample-1',
    '{"provider":"coros"}'::jsonb
  );

  INSERT INTO public.tags (id, user_id, name, name_norm, color)
  VALUES (v_tag_id, v_user_id, 'Copy test tag', 'copy test tag', '#123456');
  INSERT INTO public.activity_session_tags (session_id, tag_id)
  VALUES (v_source_id, v_tag_id);

  SELECT id INTO v_exercise_id FROM public.exercises ORDER BY id LIMIT 1;
  SELECT id INTO v_exercise_id_2 FROM public.exercises WHERE id <> v_exercise_id ORDER BY id LIMIT 1;
  IF v_exercise_id IS NOT NULL THEN
    INSERT INTO public.workout_sets (
      session_id, user_id, exercise_id, set_number, reps, weight_kg, duration_s,
      rest_s, rpe, is_warmup, is_pr, set_type, notes, tempo, pause_s,
      distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm
    ) VALUES (
      v_source_id, v_user_id, v_exercise_id, 1, 10, 20, 45, 90, 8.5, true,
      true, 'normal', 'Controlled set', '3-1-1', 2, 125, 18.5, 132, 151
    );
  END IF;
  IF v_exercise_id IS NOT NULL AND v_exercise_id_2 IS NOT NULL THEN
    INSERT INTO public.workout_sets (session_id, user_id, exercise_id, set_number, reps, weight_kg)
    VALUES (v_source_id, v_user_id, v_exercise_id_2, 2, 8, 15);
    INSERT INTO public.activity_session_superset_links (
      session_id, from_exercise_id, from_order_index, to_exercise_id, to_order_index
    ) VALUES (v_source_id, v_exercise_id, 0, v_exercise_id_2, 1);
  END IF;

  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, source, provider, status, start_time, end_time,
    started_at_local, ended_at_local, duration_s, name, timezone
  ) VALUES (
    v_occupied_id, v_user_id, 'running', 'manual', 'manual', 'completed',
    '2026-08-25 08:00:00+00', '2026-08-25 08:20:00+00',
    '2026-08-25 10:00:00', '2026-08-25 10:20:00', 1200, 'Occupied target', 'Europe/Madrid'
  );

  v_copy_id := public.copy_completed_activity_session(v_source_id, '2026-08-25');

  IF NOT EXISTS (
    SELECT 1 FROM public.activity_sessions
    WHERE id = v_copy_id
      AND user_id = v_user_id
      AND status = 'completed'
      AND source = 'manual'
      AND provider = 'manual'
      AND provider_activity_id IS NULL
      AND source_record_id IS NULL
      AND source_channel IS NULL
      AND started_at_local::date = '2026-08-25'
      AND duration_s = 2520
      AND route_polyline = 'encoded-route'
  ) THEN
    RAISE EXCEPTION 'COPY_SESSION_MAIN_ROW_INVALID';
  END IF;

  IF (SELECT count(*) FROM public.activity_sessions WHERE user_id = v_user_id AND started_at_local::date = '2026-08-25') <> 2 THEN
    RAISE EXCEPTION 'COPY_SESSION_OCCUPIED_TARGET_NOT_ALLOWED';
  END IF;

  IF (SELECT count(*) FROM public.activity_laps WHERE session_id = v_copy_id) <> 1
    OR (SELECT count(*) FROM public.activity_heart_rate_zones WHERE session_id = v_copy_id) <> 1
    OR (SELECT count(*) FROM public.activity_route_points WHERE session_id = v_copy_id) <> 1
    OR (SELECT count(*) FROM public.activity_streams WHERE session_id = v_copy_id) <> 1
    OR (SELECT count(*) FROM public.activity_stream_samples WHERE session_id = v_copy_id) <> 1
    OR (SELECT count(*) FROM public.activity_session_tags WHERE session_id = v_copy_id) <> 1
  THEN
    RAISE EXCEPTION 'COPY_SESSION_DETAIL_ROWS_MISSING';
  END IF;

  IF (SELECT count(*) FROM public.activity_session_sections WHERE session_id = v_copy_id) <> 2
    OR NOT EXISTS (
      SELECT 1
      FROM public.activity_session_sections copied
      JOIN public.activity_session_sections copied_parent ON copied_parent.id = copied.parent_section_id
      WHERE copied.session_id = v_copy_id
        AND copied.parent_section_id IS NOT NULL
        AND copied_parent.session_id = v_copy_id
        AND copied.id <> v_section_leaf_id
    )
  THEN
    RAISE EXCEPTION 'COPY_SESSION_SECTIONS_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.activity_route_points
    WHERE session_id = v_copy_id
      AND (
        source <> 'manual'
        OR source_channel IS NOT NULL
        OR source_package IS NOT NULL
        OR source_record_id IS NOT NULL
        OR raw_payload_id IS NOT NULL
        OR raw_payload IS NOT NULL
      )
  ) OR NOT EXISTS (
    SELECT 1 FROM public.activity_route_points
    WHERE session_id = v_copy_id
      AND point_index = 1
      AND timestamp = '2026-08-23 08:10:00+00'::timestamptz + interval '2 days'
  ) OR EXISTS (
    SELECT 1 FROM public.activity_streams
    WHERE session_id = v_copy_id
      AND (
        source <> 'manual'
        OR source_channel IS NOT NULL
        OR source_package IS NOT NULL
        OR source_record_id IS NOT NULL
        OR raw_payload_id IS NOT NULL
      )
  ) OR EXISTS (
    SELECT 1 FROM public.activity_stream_samples
    WHERE session_id = v_copy_id
      AND (
        source <> 'manual'
        OR source_channel IS NOT NULL
        OR source_package IS NOT NULL
        OR source_record_id IS NOT NULL
        OR raw_payload_id IS NOT NULL
        OR raw_payload IS NOT NULL
      )
  ) OR NOT EXISTS (
    SELECT 1 FROM public.activity_stream_samples
    WHERE session_id = v_copy_id
      AND timestamp = '2026-08-23 08:10:00+00'::timestamptz + interval '2 days'
  ) THEN
    RAISE EXCEPTION 'COPY_SESSION_PROVIDER_PROVENANCE_RETAINED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.activity_laps source_row
    JOIN public.activity_laps copied_row ON copied_row.session_id = v_copy_id
      AND copied_row.lap_index = source_row.lap_index
    WHERE source_row.session_id = v_source_id
      AND to_jsonb(copied_row) - ARRAY['id', 'session_id', 'user_id']::text[]
        <> to_jsonb(source_row) - ARRAY['id', 'session_id', 'user_id']::text[]
  ) OR EXISTS (
    SELECT 1
    FROM public.activity_heart_rate_zones source_row
    JOIN public.activity_heart_rate_zones copied_row ON copied_row.session_id = v_copy_id
      AND copied_row.zone = source_row.zone
    WHERE source_row.session_id = v_source_id
      AND to_jsonb(copied_row) - ARRAY['id', 'session_id', 'created_at']::text[]
        <> to_jsonb(source_row) - ARRAY['id', 'session_id', 'created_at']::text[]
  ) OR EXISTS (
    SELECT 1
    FROM public.activity_streams source_row
    JOIN public.activity_streams copied_row ON copied_row.session_id = v_copy_id
      AND copied_row.stream_type = source_row.stream_type
    WHERE source_row.session_id = v_source_id
      AND to_jsonb(copied_row) - ARRAY[
        'id', 'session_id', 'user_id', 'source', 'created_at', 'source_channel',
        'source_package', 'source_record_id', 'raw_payload_id'
      ]::text[] <> to_jsonb(source_row) - ARRAY[
        'id', 'session_id', 'user_id', 'source', 'created_at', 'source_channel',
        'source_package', 'source_record_id', 'raw_payload_id'
      ]::text[]
  ) OR EXISTS (
    SELECT 1
    FROM public.activity_route_points source_row
    JOIN public.activity_route_points copied_row ON copied_row.session_id = v_copy_id
      AND copied_row.point_index = source_row.point_index
    WHERE source_row.session_id = v_source_id
      AND to_jsonb(copied_row) - ARRAY[
        'id', 'session_id', 'user_id', 'timestamp', 'source', 'created_at',
        'source_channel', 'source_package', 'source_record_id', 'raw_payload_id',
        'raw_payload'
      ]::text[] <> to_jsonb(source_row) - ARRAY[
        'id', 'session_id', 'user_id', 'timestamp', 'source', 'created_at',
        'source_channel', 'source_package', 'source_record_id', 'raw_payload_id',
        'raw_payload'
      ]::text[]
  ) OR EXISTS (
    SELECT 1
    FROM public.activity_stream_samples source_row
    JOIN public.activity_stream_samples copied_row ON copied_row.session_id = v_copy_id
      AND copied_row.stream_type = source_row.stream_type
      AND copied_row.offset_s = source_row.offset_s
    WHERE source_row.session_id = v_source_id
      AND to_jsonb(copied_row) - ARRAY[
        'id', 'session_id', 'user_id', 'timestamp', 'source', 'created_at',
        'source_channel', 'source_package', 'source_record_id', 'raw_payload_id',
        'raw_payload'
      ]::text[] <> to_jsonb(source_row) - ARRAY[
        'id', 'session_id', 'user_id', 'timestamp', 'source', 'created_at',
        'source_channel', 'source_package', 'source_record_id', 'raw_payload_id',
        'raw_payload'
      ]::text[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.activity_session_tags
    WHERE session_id = v_copy_id
      AND tag_id = v_tag_id
  ) THEN
    RAISE EXCEPTION 'COPY_SESSION_DETAIL_VALUES_CHANGED';
  END IF;

  IF v_exercise_id IS NOT NULL
    AND (SELECT count(*) FROM public.workout_sets WHERE session_id = v_copy_id) <> 1
  THEN
    IF v_exercise_id_2 IS NULL THEN
      RAISE EXCEPTION 'COPY_SESSION_WORKOUT_SETS_MISSING';
    END IF;
  END IF;

  IF v_exercise_id_2 IS NOT NULL
    AND ((SELECT count(*) FROM public.workout_sets WHERE session_id = v_copy_id) <> 2
      OR (SELECT count(*) FROM public.activity_session_superset_links WHERE session_id = v_copy_id) <> 1)
  THEN
    RAISE EXCEPTION 'COPY_SESSION_STRENGTH_RELATIONS_MISSING';
  END IF;

  IF v_exercise_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.workout_sets source_row
    JOIN public.workout_sets copied_row ON copied_row.session_id = v_copy_id
      AND copied_row.exercise_id = source_row.exercise_id
      AND copied_row.set_number = source_row.set_number
    WHERE source_row.session_id = v_source_id
      AND to_jsonb(copied_row) - ARRAY['id', 'session_id', 'user_id', 'created_at']::text[]
        <> to_jsonb(source_row) - ARRAY['id', 'session_id', 'user_id', 'created_at']::text[]
  ) THEN
    RAISE EXCEPTION 'COPY_SESSION_WORKOUT_SET_VALUES_CHANGED';
  END IF;

  IF v_exercise_id_2 IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.activity_session_superset_links source_row
    JOIN public.activity_session_superset_links copied_row ON copied_row.session_id = v_copy_id
      AND copied_row.from_order_index = source_row.from_order_index
    WHERE source_row.session_id = v_source_id
      AND to_jsonb(copied_row) - ARRAY['id', 'session_id', 'created_at']::text[]
        <> to_jsonb(source_row) - ARRAY['id', 'session_id', 'created_at']::text[]
  ) THEN
    RAISE EXCEPTION 'COPY_SESSION_SUPERSET_VALUES_CHANGED';
  END IF;

  BEGIN
    PERFORM public.copy_completed_activity_session(v_source_id, '2026-08-23');
    RAISE EXCEPTION 'COPY_SESSION_SAME_DATE_NOT_REJECTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'COPY_SESSION_SAME_DATE' THEN
      RAISE;
    END IF;
  END;

  CREATE OR REPLACE FUNCTION public.copy_session_test_fail_on_lap()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    RAISE EXCEPTION 'COPY_SESSION_TEST_RELATED_ROW_FAILURE';
  END;
  $fn$;
  CREATE TRIGGER copy_session_test_fail_on_lap
    BEFORE INSERT ON public.activity_laps
    FOR EACH ROW EXECUTE FUNCTION public.copy_session_test_fail_on_lap();

  SELECT count(*)
  INTO v_failed_copy_count
  FROM public.activity_sessions
  WHERE user_id = v_user_id
    AND started_at_local::date = '2026-08-26';

  BEGIN
    PERFORM public.copy_completed_activity_session(v_source_id, '2026-08-26');
    RAISE EXCEPTION 'COPY_SESSION_ROLLBACK_NOT_TRIGGERED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'COPY_SESSION_TEST_RELATED_ROW_FAILURE' THEN
      RAISE;
    END IF;
  END;

  DROP TRIGGER copy_session_test_fail_on_lap ON public.activity_laps;
  DROP FUNCTION public.copy_session_test_fail_on_lap();

  IF (
    SELECT count(*)
    FROM public.activity_sessions
    WHERE user_id = v_user_id
      AND started_at_local::date = '2026-08-26'
  ) <> v_failed_copy_count THEN
    RAISE EXCEPTION 'COPY_SESSION_ROLLBACK_LEFT_PARTIAL_SESSION';
  END IF;
END;
$test$;

ROLLBACK;
