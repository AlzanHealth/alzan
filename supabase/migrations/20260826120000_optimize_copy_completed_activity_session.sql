-- Avoid a full scan for running/endurance sessions that have no strength sets.
CREATE INDEX IF NOT EXISTS workout_sets_session_id_idx
  ON public.workout_sets (session_id);

-- Copy high-volume activity details in set-based statements so real wearable
-- sessions stay below the hosted Postgres statement timeout.
CREATE OR REPLACE FUNCTION public.copy_completed_activity_session(
  p_session_id uuid,
  p_target_date date
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source public.activity_sessions;
  v_new_session_id uuid := gen_random_uuid();
  v_source_local_start timestamp without time zone;
  v_source_local_date date;
  v_target_local_start timestamp without time zone;
  v_target_local_end timestamp without time zone;
  v_target_start timestamptz;
  v_target_end timestamptz;
  v_timezone text;
  v_duration_seconds integer;
  v_time_delta interval;
  v_session_payload jsonb;
  v_section_map jsonb := '{}'::jsonb;
  v_source_section record;
  v_new_section_id uuid;
  v_new_parent_section_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'COPY_SESSION_UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_source
  FROM public.activity_sessions
  WHERE id = p_session_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COPY_SESSION_NOT_FOUND';
  END IF;

  IF v_source.status <> 'completed' OR v_source.end_time IS NULL THEN
    RAISE EXCEPTION 'COPY_SESSION_NOT_COMPLETED';
  END IF;

  v_timezone := coalesce(nullif(v_source.timezone, ''), current_setting('TIMEZONE'));
  v_source_local_start := coalesce(v_source.started_at_local, v_source.start_time AT TIME ZONE v_timezone);
  v_source_local_date := v_source_local_start::date;

  IF p_target_date IS NULL OR p_target_date = v_source_local_date THEN
    RAISE EXCEPTION 'COPY_SESSION_SAME_DATE';
  END IF;

  v_duration_seconds := greatest(
    0,
    coalesce(
      v_source.duration_s,
      extract(epoch FROM (v_source.end_time - v_source.start_time))::integer
    )
  );
  v_target_local_start := p_target_date::timestamp + v_source_local_start::time;
  v_target_local_end := v_target_local_start + make_interval(secs => v_duration_seconds);
  v_target_start := v_target_local_start AT TIME ZONE v_timezone;
  v_target_end := v_target_local_end AT TIME ZONE v_timezone;
  v_time_delta := v_target_start - v_source.start_time;

  -- Copy user-visible session data while dropping provider identity, import
  -- provenance, duplicate-review state and source row identifiers.
  v_session_payload := (
    to_jsonb(v_source) - ARRAY[
      'id', 'user_id', 'created_at', 'updated_at',
      'start_time', 'end_time', 'started_at_local', 'ended_at_local',
      'status', 'source', 'provider',
      'provider_activity_id', 'device_id', 'raw_payload_id', 'imported_at',
      'source_channel', 'source_package', 'source_provider_key',
      'source_record_id', 'source_updated_at',
      'duplicate_of_session_id', 'duplicate_resolution', 'duplicate_score',
      'needs_strength_review', 'pending_watch_metrics', 'import_review_seen_at',
      'suggested_endurance_template_id', 'template_suggestion_deferred_at',
      'template_match_method', 'template_match_score', 'template_name_state'
    ]::text[]
  ) || jsonb_build_object(
    'id', v_new_session_id,
    'user_id', v_user_id,
    'created_at', now(),
    'updated_at', now(),
    'start_time', v_target_start,
    'end_time', v_target_end,
    'started_at_local', v_target_local_start,
    'ended_at_local', v_target_local_end,
    'status', 'completed',
    'source', 'manual',
    'provider', 'manual',
    'provider_activity_id', NULL,
    'device_id', NULL,
    'raw_payload_id', NULL,
    'imported_at', NULL,
    'source_channel', NULL,
    'source_package', NULL,
    'source_provider_key', NULL,
    'source_record_id', NULL,
    'source_updated_at', NULL,
    'duplicate_of_session_id', NULL,
    'duplicate_resolution', NULL,
    'duplicate_score', NULL,
    'needs_strength_review', false,
    'pending_watch_metrics', NULL,
    'import_review_seen_at', NULL,
    'suggested_endurance_template_id', NULL,
    'template_suggestion_deferred_at', NULL,
    'template_match_method', NULL,
    'template_match_score', NULL,
    'template_name_state', NULL
  );

  INSERT INTO public.activity_sessions
  SELECT (jsonb_populate_record(NULL::public.activity_sessions, v_session_payload)).*;

  INSERT INTO public.workout_sets (
    id, session_id, user_id, exercise_id, set_number, weight_kg, reps,
    duration_s, rest_s, rpe, is_warmup, is_pr, created_at, set_type,
    notes, tempo, pause_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm
  )
  SELECT
    gen_random_uuid(), v_new_session_id, v_user_id, exercise_id, set_number,
    weight_kg, reps, duration_s, rest_s, rpe, is_warmup, is_pr, now(),
    set_type, notes, tempo, pause_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm
  FROM public.workout_sets
  WHERE session_id = p_session_id;

  INSERT INTO public.activity_session_superset_links (
    id, session_id, from_exercise_id, to_exercise_id,
    from_order_index, to_order_index, created_at
  )
  SELECT
    gen_random_uuid(), v_new_session_id, from_exercise_id, to_exercise_id,
    from_order_index, to_order_index, now()
  FROM public.activity_session_superset_links
  WHERE session_id = p_session_id;

  INSERT INTO public.activity_laps (
    id, session_id, lap_index, distance_m, duration_s, avg_heart_rate,
    max_heart_rate, avg_pace_s_per_km, lap_type, start_offset_s, end_offset_s,
    user_id, split_group, split_distance_m, split_group_order
  )
  SELECT
    gen_random_uuid(), v_new_session_id, lap_index, distance_m, duration_s,
    avg_heart_rate, max_heart_rate, avg_pace_s_per_km, lap_type,
    start_offset_s, end_offset_s, v_user_id, split_group, split_distance_m,
    split_group_order
  FROM public.activity_laps
  WHERE session_id = p_session_id;

  INSERT INTO public.activity_heart_rate_zones (
    id, session_id, zone, duration_s, percentage, created_at
  )
  SELECT
    gen_random_uuid(), v_new_session_id, zone, duration_s, percentage, now()
  FROM public.activity_heart_rate_zones
  WHERE session_id = p_session_id;

  INSERT INTO public.activity_session_tags (session_id, tag_id, created_at)
  SELECT v_new_session_id, tag_id, now()
  FROM public.activity_session_tags
  WHERE session_id = p_session_id;

  INSERT INTO public.activity_streams (
    id, session_id, stream_type, unit, data, sample_hz, source, created_at,
    user_id, source_channel, source_package, source_record_id, raw_payload_id
  )
  SELECT
    gen_random_uuid(), v_new_session_id, stream_type, unit, data, sample_hz,
    'manual', now(), v_user_id, NULL, NULL, NULL, NULL
  FROM public.activity_streams
  WHERE session_id = p_session_id;

  INSERT INTO public.activity_route_points (
    id, session_id, user_id, point_index, "timestamp", offset_s, lat, lon,
    altitude_m, distance_m, speed_mps, horizontal_accuracy_m,
    vertical_accuracy_m, source, source_channel, source_package,
    source_record_id, raw_payload_id, raw_payload, created_at
  )
  SELECT
    gen_random_uuid(), v_new_session_id, v_user_id, point_index,
    CASE WHEN "timestamp" IS NULL THEN NULL ELSE "timestamp" + v_time_delta END,
    offset_s, lat, lon, altitude_m, distance_m, speed_mps,
    horizontal_accuracy_m, vertical_accuracy_m, 'manual', NULL, NULL, NULL,
    NULL, NULL, now()
  FROM public.activity_route_points
  WHERE session_id = p_session_id;

  INSERT INTO public.activity_stream_samples (
    id, session_id, user_id, stream_type, "timestamp", offset_s, value, unit,
    source, source_channel, source_package, source_record_id, raw_payload_id,
    raw_payload, created_at
  )
  SELECT
    gen_random_uuid(), v_new_session_id, v_user_id, stream_type,
    CASE WHEN "timestamp" IS NULL THEN NULL ELSE "timestamp" + v_time_delta END,
    offset_s, value, unit, 'manual', NULL, NULL, NULL, NULL, NULL, now()
  FROM public.activity_stream_samples
  WHERE session_id = p_session_id;

  -- Preserve the saved manual/endurance breakdown while remapping its hierarchy.
  FOR v_source_section IN
    SELECT *
    FROM public.activity_session_sections
    WHERE session_id = p_session_id
    ORDER BY order_index, repetition_index NULLS FIRST, id
  LOOP
    v_new_section_id := gen_random_uuid();
    v_new_parent_section_id := NULL;
    IF v_source_section.parent_section_id IS NOT NULL THEN
      v_new_parent_section_id := NULLIF(v_section_map->>v_source_section.parent_section_id::text, '')::uuid;
      IF v_new_parent_section_id IS NULL THEN
        RAISE EXCEPTION 'COPY_SESSION_SECTION_PARENT_NOT_FOUND';
      END IF;
    END IF;

    INSERT INTO public.activity_session_sections (
      id, user_id, session_id, parent_section_id, source_template_step_id,
      order_index, is_group, phase_type, duration_type, label, repetitions,
      repetition_index, distance_m, duration_s, pace_s_per_km, pace_s_per_100m,
      speed_m_per_s, avg_heart_rate, max_heart_rate, avg_power_w, max_power_w,
      avg_cadence, elev_gain_m, calories_kcal, rpe, notes
    ) VALUES (
      v_new_section_id, v_user_id, v_new_session_id, v_new_parent_section_id,
      v_source_section.source_template_step_id, v_source_section.order_index,
      v_source_section.is_group, v_source_section.phase_type, v_source_section.duration_type,
      v_source_section.label, v_source_section.repetitions, v_source_section.repetition_index,
      v_source_section.distance_m, v_source_section.duration_s, v_source_section.pace_s_per_km,
      v_source_section.pace_s_per_100m, v_source_section.speed_m_per_s,
      v_source_section.avg_heart_rate, v_source_section.max_heart_rate,
      v_source_section.avg_power_w, v_source_section.max_power_w,
      v_source_section.avg_cadence, v_source_section.elev_gain_m,
      v_source_section.calories_kcal, v_source_section.rpe, v_source_section.notes
    );
    v_section_map := v_section_map || jsonb_build_object(v_source_section.id::text, v_new_section_id::text);
  END LOOP;

  RETURN v_new_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_completed_activity_session(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_completed_activity_session(uuid, date) TO authenticated;
