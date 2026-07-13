BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_import_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  v_source_session_id uuid := gen_random_uuid();
  v_target_session_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'WEARABLE_BUNDLE_TEST_REQUIRES_LOCAL_USER'; END IF;

  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, start_time, end_time, source, provider,
    source_channel, source_record_id
  ) VALUES (
    v_session_id, v_user_id, 'running', '2026-05-01T08:00:00Z', NULL,
    'imported', 'suunto', 'cloud', 'codex-audit-workout'
  );
  INSERT INTO public.wearable_sync_jobs (
    id, user_id, provider, sync_domain, status, lease_expires_at
  ) VALUES (
    v_job_id, v_user_id, 'suunto', 'activities', 'running', now() + interval '5 minutes'
  );
  INSERT INTO public.wearable_activity_imports (
    id, user_id, provider, source_channel, source_record_id, status, attempts, job_id
  ) VALUES (
    v_import_id, v_user_id, 'suunto', 'cloud', 'codex-audit-workout', 'processing', 1, v_job_id
  );

  UPDATE public.wearable_sync_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = v_job_id;
  BEGIN
    PERFORM public.persist_wearable_activity_bundle(
      v_user_id, v_session_id, jsonb_build_object('end_time', '2026-05-01T09:00:00Z'),
      NULL, true, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL,
      jsonb_build_object(
        'session_id', v_session_id, 'user_id', v_user_id, 'provider', 'suunto',
        'source_channel', 'cloud', 'fields', '{}'::jsonb
      ),
      NULL, v_import_id, v_job_id, 1
    );
    RAISE EXCEPTION 'WEARABLE_BUNDLE_EXPECTED_LEASE_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'WEARABLE_ACTIVITY_IMPORT_LEASE_LOST' THEN RAISE; END IF;
  END;
  IF (SELECT end_time FROM public.activity_sessions WHERE id = v_session_id) IS NOT NULL THEN
    RAISE EXCEPTION 'WEARABLE_BUNDLE_EXPIRED_JOB_MUTATED_SESSION';
  END IF;
  UPDATE public.wearable_sync_jobs SET lease_expires_at = now() + interval '5 minutes' WHERE id = v_job_id;

  PERFORM public.persist_wearable_activity_bundle(
    v_user_id,
    v_session_id,
    jsonb_build_object(
      'end_time', '2026-05-01T09:00:00Z',
      'duration_s', 3600,
      'distance_m', 10000,
      'timezone', '+02:00',
      'started_at_local', '2026-05-01T10:00:00',
      'ended_at_local', '2026-05-01T11:00:00'
    ),
    NULL,
    true,
    jsonb_build_array(jsonb_build_object(
      'session_id', v_session_id, 'user_id', v_user_id, 'lap_index', 1,
      'lap_type', 'manual', 'split_group', 'custom', 'split_group_order', 0,
      'distance_m', 1000, 'duration_s', 300
    )),
    jsonb_build_array(jsonb_build_object(
      'session_id', v_session_id, 'zone', 2, 'duration_s', 600, 'percentage', 16.67
    )),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL,
    jsonb_build_object(
      'session_id', v_session_id, 'user_id', v_user_id, 'provider', 'suunto',
      'source_channel', 'cloud', 'fields', '{}'::jsonb
    ),
    NULL,
    v_import_id,
    v_job_id,
    1
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.activity_sessions
    WHERE id = v_session_id AND end_time IS NOT NULL AND duration_s = 3600
  ) THEN RAISE EXCEPTION 'WEARABLE_BUNDLE_SESSION_NOT_HYDRATED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wearable_activity_imports
    WHERE id = v_import_id AND status = 'complete' AND session_id = v_session_id
      AND reconciliation_status = 'pending'
  ) THEN RAISE EXCEPTION 'WEARABLE_BUNDLE_LIFECYCLE_NOT_COMPLETED'; END IF;
  PERFORM public.finish_wearable_activity_reconciliation(v_import_id, NULL);
  IF (SELECT reconciliation_status FROM public.wearable_activity_imports WHERE id = v_import_id) <> 'complete' THEN
    RAISE EXCEPTION 'WEARABLE_BUNDLE_RECONCILIATION_NOT_COMPLETED';
  END IF;

  BEGIN
    PERFORM public.persist_wearable_activity_bundle(
      v_user_id,
      v_session_id,
      jsonb_build_object('duration_s', 999),
      NULL,
      true,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'session_id', v_session_id, 'user_id', v_user_id, 'point_index', 0,
        'lat', NULL, 'lon', 0
      )),
      NULL,
      jsonb_build_object(
        'session_id', v_session_id, 'user_id', v_user_id, 'provider', 'suunto',
        'source_channel', 'cloud', 'fields', '{}'::jsonb
      ),
      NULL,
      NULL,
      NULL,
      1
    );
    RAISE EXCEPTION 'WEARABLE_BUNDLE_EXPECTED_FAILURE_NOT_RAISED';
  EXCEPTION WHEN not_null_violation THEN
    NULL;
  END;

  IF (SELECT duration_s FROM public.activity_sessions WHERE id = v_session_id) <> 3600 THEN
    RAISE EXCEPTION 'WEARABLE_BUNDLE_SESSION_ROLLBACK_FAILED';
  END IF;
  IF (SELECT count(*) FROM public.activity_laps WHERE session_id = v_session_id) <> 1 THEN
    RAISE EXCEPTION 'WEARABLE_BUNDLE_CHILD_ROLLBACK_FAILED';
  END IF;

  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, start_time, end_time, source, provider,
    source_channel, source_record_id, provider_activity_id
  ) VALUES (
    v_source_session_id, v_user_id, 'running', '2026-05-02T08:00:00Z', '2026-05-02T09:00:00Z',
    'imported', 'suunto', 'cloud', 'codex-absorbed-workout', 'codex-absorbed-workout'
  );
  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, start_time, end_time, source
  ) VALUES (
    v_target_session_id, v_user_id, 'running', '2026-05-02T08:00:00Z', NULL, 'manual'
  );

  PERFORM public.persist_wearable_activity_bundle(
    v_user_id,
    v_target_session_id,
    jsonb_build_object(
      'end_time', '2026-05-02T09:00:00Z', 'provider', 'suunto',
      'source_channel', 'cloud', 'source_record_id', 'codex-absorbed-workout',
      'provider_activity_id', 'codex-absorbed-workout'
    ),
    v_source_session_id,
    true,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL,
    jsonb_build_object(
      'session_id', v_target_session_id, 'user_id', v_user_id, 'provider', 'suunto',
      'source_channel', 'cloud', 'fields', '{}'::jsonb
    ),
    NULL,
    NULL,
    NULL,
    1
  );

  IF EXISTS (
    SELECT 1 FROM public.activity_sessions
    WHERE id = v_source_session_id AND (source_record_id IS NOT NULL OR provider_activity_id IS NOT NULL)
  ) THEN RAISE EXCEPTION 'WEARABLE_BUNDLE_SOURCE_PROVENANCE_NOT_CLEARED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.activity_sessions
    WHERE id = v_target_session_id
      AND source_record_id = 'codex-absorbed-workout'
      AND provider_activity_id = 'codex-absorbed-workout'
  ) THEN RAISE EXCEPTION 'WEARABLE_BUNDLE_TARGET_PROVENANCE_NOT_TRANSFERRED'; END IF;
END;
$$;

ROLLBACK;
