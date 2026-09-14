-- Run against local Supabase; all fixtures are rolled back.
BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_job_id uuid := gen_random_uuid();
  v_session_id uuid := gen_random_uuid();
  v_import_id uuid;
  v_result jsonb;
  v_marker jsonb;
  v_source_id text := '418173315956375553';
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'COROS_RETRY_TEST_REQUIRES_LOCAL_USER'; END IF;

  INSERT INTO public.wearable_sync_jobs (id, user_id, provider, sync_domain, lease_expires_at)
  VALUES (v_job_id, v_user_id, 'coros', 'coros_retry_regression', now() + interval '5 minutes');
  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, provider, provider_activity_id, source_channel, source_package, source_record_id
  ) VALUES (v_session_id, v_user_id, 'running', 'coros', v_source_id, 'cloud', 'coros_retry_regression', v_source_id);

  v_result := public.claim_wearable_activity_import(
    v_user_id, 'coros', 'cloud', 'coros_retry_regression', v_source_id, 1, v_job_id
  );
  v_import_id := (v_result->>'import_id')::uuid;
  IF v_result->>'action' <> 'repair' OR (v_result->>'session_id')::uuid IS DISTINCT FROM v_session_id THEN
    RAISE EXCEPTION 'COROS_RETRY_EXISTING_SESSION_NOT_REUSED: %', v_result;
  END IF;

  FOR v_marker IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('provider', 'coros', 'provider_activity_id', v_source_id, 'reason', 'COROS_FIT_URL_MISSING'),
    jsonb_build_object('provider', 'coros', 'providerActivityId', v_source_id, 'reason', 'COROS_FIT_PARSE_FAILED'),
    jsonb_build_object('provider', 'coros', 'providerActivityId', v_source_id, 'provider_activity_id', v_source_id),
    jsonb_build_object('provider', 'coros', 'provider_activity_id', '', 'providerActivityId', v_source_id)
  )) LOOP
    UPDATE public.wearable_activity_imports
    SET status = 'complete', reconciliation_status = 'complete' WHERE id = v_import_id;
    UPDATE public.activity_sessions SET pending_watch_metrics = v_marker WHERE id = v_session_id;
    v_result := public.claim_wearable_activity_import(
      v_user_id, 'coros', 'cloud', 'coros_retry_regression', v_source_id, 1, v_job_id
    );
    IF v_result->>'action' <> 'repair'
      OR (v_result->>'import_id')::uuid IS DISTINCT FROM v_import_id
      OR (v_result->>'session_id')::uuid IS DISTINCT FROM v_session_id THEN
      RAISE EXCEPTION 'COROS_PENDING_FIT_NOT_REPAIRED: marker=%, claim=%', v_marker, v_result;
    END IF;
  END LOOP;

  -- A completed enrichment, another provider or another activity must still skip.
  FOR v_marker IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    null,
    jsonb_build_object('provider', 'garmin', 'providerActivityId', v_source_id),
    jsonb_build_object('provider', 'coros', 'providerActivityId', '418173315956375554'),
    jsonb_build_object('provider', 'coros', 'provider_activity_id', '418173315956375554'),
    jsonb_build_object('provider', 'coros')
  )) LOOP
    UPDATE public.wearable_activity_imports
    SET status = 'complete', reconciliation_status = 'complete' WHERE id = v_import_id;
    UPDATE public.activity_sessions SET pending_watch_metrics = NULLIF(v_marker, 'null'::jsonb) WHERE id = v_session_id;
    v_result := public.claim_wearable_activity_import(
      v_user_id, 'coros', 'cloud', 'coros_retry_regression', v_source_id, 1, v_job_id
    );
    IF v_result->>'action' <> 'skip' THEN
      RAISE EXCEPTION 'COROS_COMPLETED_IMPORT_NOT_SKIPPED: %', v_result;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.wearable_activity_imports WHERE job_id = v_job_id) <> 1
    OR (SELECT count(*) FROM public.activity_sessions WHERE user_id = v_user_id AND source_package = 'coros_retry_regression') <> 1 THEN
    RAISE EXCEPTION 'COROS_RETRY_CREATED_DUPLICATES';
  END IF;
END;
$$;

ROLLBACK;
