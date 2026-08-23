BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_imported_session_id uuid := gen_random_uuid();
  v_linked_session_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'COROS_DISCONNECT_TEST_REQUIRES_LOCAL_USER'; END IF;

  IF has_function_privilege('anon', 'public.delete_coros_user_data(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'COROS_DELETE_RPC_EXPOSED_TO_ANON';
  END IF;
  IF has_function_privilege('authenticated', 'public.delete_coros_user_data(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'COROS_DELETE_RPC_EXPOSED_TO_AUTHENTICATED';
  END IF;

  INSERT INTO public.user_connections (user_id, provider, provider_user_id)
  VALUES (v_user_id, 'coros', 'coros-disconnect-open-id')
  ON CONFLICT (user_id, provider) DO UPDATE SET provider_user_id = EXCLUDED.provider_user_id;

  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, source, provider, provider_activity_id, source_channel, source_record_id
  ) VALUES (
    v_imported_session_id, v_user_id, 'running', 'imported', 'coros', 'coros-imported', 'cloud', 'coros-imported'
  ), (
    v_linked_session_id, v_user_id, 'running', 'manual', 'coros', 'coros-linked', 'cloud', 'coros-linked'
  );
  UPDATE public.activity_sessions
  SET pre_wearable_merge_snapshot = jsonb_build_object(
        'sport_type', 'running',
        'sport_subtype', 'planned_easy',
        'start_time', '2026-08-19T07:00:00+00:00',
        'end_time', NULL,
        'duration_s', NULL,
        'timezone', 'Europe/Madrid',
        'started_at_local', '2026-08-19T09:00:00',
        'ended_at_local', NULL,
        'route_polyline', NULL,
        'status', 'active',
        'distance_m', NULL,
        'elev_gain_m', NULL,
        'elev_loss_m', NULL,
        'avg_heart_rate', NULL,
        'max_heart_rate', NULL,
        'min_heart_rate', NULL,
        'avg_speed_m_per_s', NULL,
        'calories_kcal', NULL,
        'device_id', NULL,
        'avg_cadence', NULL,
        'max_cadence', NULL,
        'avg_power_w', NULL,
        'max_power_w', NULL,
        'avg_temp_c', NULL,
        'max_temp_c', NULL,
        'recovery_time_s', NULL,
        'total_steps', NULL,
        'vo2_max', NULL,
        'tss_hr', NULL,
        'epoc', NULL,
        'pte', NULL,
        'duplicate_of_session_id', NULL,
        'duplicate_score', NULL,
        'duplicate_resolution', NULL,
        'needs_strength_review', false,
        'pending_watch_metrics', NULL
      ),
      sport_subtype = 'outdoor',
      distance_m = 5000,
      start_time = '2026-08-20 08:00:00Z',
      end_time = '2026-08-20 09:00:00Z',
      duration_s = 3600,
      timezone = 'Europe/Madrid',
      started_at_local = '2026-08-20 10:00:00',
      ended_at_local = '2026-08-20 11:00:00',
      route_polyline = 'encoded-coros-route',
      status = 'completed'
  WHERE id = v_linked_session_id;

  INSERT INTO public.activity_files (user_id, session_id, provider, file_type, file_hash)
  VALUES (v_user_id, v_linked_session_id, 'coros', 'fit', 'coros-disconnect-fit');

  INSERT INTO public.daily_steps (user_id, date, timezone, source, total_steps)
  VALUES (v_user_id, '2026-08-20', 'COROS_LOCAL', 'coros', 10000);
  INSERT INTO public.sleep_sessions (user_id, source, date, timezone, start_time, end_time)
  VALUES (v_user_id, 'coros', '2026-08-20', 'COROS_LOCAL', '2026-08-19 22:00Z', '2026-08-20 06:00Z');
  INSERT INTO public.daily_recovery (user_id, date, timezone, source, resting_hr_bpm)
  VALUES (v_user_id, '2026-08-20', 'COROS_LOCAL', 'coros', 50);

  PERFORM public.delete_coros_user_data(v_user_id);

  IF EXISTS (SELECT 1 FROM public.activity_sessions WHERE id = v_imported_session_id) THEN
    RAISE EXCEPTION 'COROS_IMPORTED_ACTIVITY_NOT_DELETED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.activity_sessions
    WHERE id = v_linked_session_id
      AND provider = 'manual'
      AND provider_activity_id IS NULL
      AND distance_m IS NULL
      AND start_time = '2026-08-19 07:00:00Z'
      AND end_time IS NULL
      AND duration_s IS NULL
      AND timezone = 'Europe/Madrid'
      AND started_at_local = '2026-08-19 09:00:00'
      AND ended_at_local IS NULL
      AND route_polyline IS NULL
      AND sport_subtype = 'planned_easy'
      AND status = 'active'
      AND pre_wearable_merge_snapshot IS NULL
  ) THEN
    RAISE EXCEPTION 'COROS_LINKED_ALZAN_SESSION_NOT_CLEANED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.daily_steps WHERE user_id = v_user_id AND source = 'coros')
    OR EXISTS (SELECT 1 FROM public.sleep_sessions WHERE user_id = v_user_id AND source = 'coros')
    OR EXISTS (SELECT 1 FROM public.daily_recovery WHERE user_id = v_user_id AND source = 'coros') THEN
    RAISE EXCEPTION 'COROS_HEALTH_DATA_NOT_DELETED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_connections WHERE user_id = v_user_id AND provider = 'coros') THEN
    RAISE EXCEPTION 'COROS_CONNECTION_NOT_DELETED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.activity_files WHERE user_id = v_user_id AND provider = 'coros') THEN
    RAISE EXCEPTION 'COROS_ACTIVITY_FILE_NOT_DELETED';
  END IF;
END;
$$;

ROLLBACK;
