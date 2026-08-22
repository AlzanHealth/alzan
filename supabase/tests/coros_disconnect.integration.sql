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
  UPDATE public.activity_sessions SET distance_m = 5000 WHERE id = v_linked_session_id;

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
