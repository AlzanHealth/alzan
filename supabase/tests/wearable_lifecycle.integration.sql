BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_first jsonb;
  v_second jsonb;
  v_job_id uuid;
  v_claim jsonb;
  v_repair jsonb;
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'WEARABLE_LIFECYCLE_TEST_REQUIRES_LOCAL_USER'; END IF;

  v_first := public.claim_wearable_sync_job(v_user_id, 'suunto', 'activities', 300);
  v_second := public.claim_wearable_sync_job(v_user_id, 'suunto', 'activities', 300);
  IF v_first->>'action' <> 'acquired' OR v_second->>'action' <> 'active' THEN
    RAISE EXCEPTION 'WEARABLE_SYNC_JOB_LEASE_NOT_EXCLUSIVE';
  END IF;
  IF v_first->>'job_id' IS DISTINCT FROM v_second->>'job_id' THEN
    RAISE EXCEPTION 'WEARABLE_SYNC_JOB_ACTIVE_ID_MISMATCH';
  END IF;

  v_job_id := (v_first->>'job_id')::uuid;
  v_claim := public.claim_wearable_activity_import(
    v_user_id, 'suunto', 'cloud', NULL, 'codex-lifecycle-workout', 1, v_job_id
  );
  IF v_claim->>'action' <> 'import' THEN
    RAISE EXCEPTION 'WEARABLE_ACTIVITY_FIRST_CLAIM_NOT_IMPORT';
  END IF;

  PERFORM public.fail_wearable_activity_import(
    (v_claim->>'import_id')::uuid, 'SUUNTO_RATE_LIMITED', true
  );
  v_repair := public.claim_wearable_activity_import(
    v_user_id, 'suunto', 'cloud', NULL, 'codex-lifecycle-workout', 1, v_job_id
  );
  IF v_repair->>'action' <> 'repair' THEN
    RAISE EXCEPTION 'WEARABLE_ACTIVITY_RETRY_NOT_REPAIR';
  END IF;
  IF (
    SELECT attempts FROM public.wearable_activity_imports
    WHERE id = (v_claim->>'import_id')::uuid
  ) <> 2 THEN
    RAISE EXCEPTION 'WEARABLE_ACTIVITY_ATTEMPT_NOT_INCREMENTED';
  END IF;
END;
$$;

ROLLBACK;
