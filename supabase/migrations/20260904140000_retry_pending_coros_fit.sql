-- Allow a COROS summary-only activity to be claimed again so a later sync can
-- enrich it when the FIT endpoint becomes available.
CREATE OR REPLACE FUNCTION public.claim_wearable_activity_import(
  p_user_id uuid,
  p_provider public.wearable_provider_enum,
  p_source_channel text,
  p_source_package text,
  p_source_record_id text,
  p_canonical_version integer,
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import public.wearable_activity_imports%ROWTYPE;
  v_existing_session_id uuid;
  v_action text;
BEGIN
  IF length(trim(p_source_record_id)) = 0 OR p_canonical_version < 1 THEN
    RAISE EXCEPTION 'WEARABLE_ACTIVITY_IMPORT_INVALID_IDENTITY';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.wearable_sync_jobs
    WHERE id = p_job_id
      AND user_id = p_user_id
      AND provider = p_provider
      AND status = 'running'
      AND lease_expires_at > now()
  ) THEN
    RAISE EXCEPTION 'WEARABLE_ACTIVITY_IMPORT_JOB_LEASE_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_user_id::text || ':' || p_provider::text || ':' || p_source_channel || ':' ||
      COALESCE(p_source_package, '') || ':' || p_source_record_id,
      0
    )
  );

  SELECT * INTO v_import
  FROM public.wearable_activity_imports
  WHERE user_id = p_user_id
    AND provider = p_provider
    AND source_channel = p_source_channel
    AND COALESCE(source_package, '') = COALESCE(p_source_package, '')
    AND source_record_id = p_source_record_id
  FOR UPDATE;

  IF v_import.id IS NOT NULL
    AND v_import.status = 'complete'
    AND v_import.canonical_version >= p_canonical_version
    AND v_import.reconciliation_status = 'complete'
    AND NOT EXISTS (
      SELECT 1
      FROM public.activity_sessions AS pending_session
      WHERE pending_session.id = v_import.session_id
        AND pending_session.pending_watch_metrics IS NOT NULL
        AND pending_session.pending_watch_metrics->>'provider' = p_provider::text
        AND pending_session.pending_watch_metrics->>'provider_activity_id' = p_source_record_id
    ) THEN
    RETURN jsonb_build_object(
      'action', 'skip',
      'import_id', v_import.id,
      'session_id', v_import.session_id
    );
  END IF;

  IF v_import.id IS NULL THEN
    SELECT id INTO v_existing_session_id
    FROM public.activity_sessions
    WHERE user_id = p_user_id
      AND provider::text = p_provider::text
      AND source_channel = p_source_channel
      AND COALESCE(source_package, '') = COALESCE(p_source_package, '')
      AND (source_record_id = p_source_record_id OR provider_activity_id = p_source_record_id)
    ORDER BY imported_at DESC NULLS LAST
    LIMIT 1;

    v_action := CASE WHEN v_existing_session_id IS NULL THEN 'import' ELSE 'repair' END;

    INSERT INTO public.wearable_activity_imports (
      user_id,
      provider,
      source_channel,
      source_package,
      source_record_id,
      status,
      canonical_version,
      attempts,
      session_id,
      job_id,
      claimed_at
    ) VALUES (
      p_user_id,
      p_provider,
      p_source_channel,
      p_source_package,
      p_source_record_id,
      'processing',
      p_canonical_version,
      1,
      v_existing_session_id,
      p_job_id,
      now()
    )
    RETURNING * INTO v_import;
  ELSE
    v_action := 'repair';
    UPDATE public.wearable_activity_imports
    SET status = 'processing',
        reconciliation_status = 'pending',
        last_reconciliation_error = NULL,
        canonical_version = p_canonical_version,
        attempts = attempts + 1,
        job_id = p_job_id,
        last_error_code = NULL,
        claimed_at = now(),
        updated_at = now()
    WHERE id = v_import.id
    RETURNING * INTO v_import;
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'import_id', v_import.id,
    'session_id', v_import.session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_wearable_activity_import(
  uuid, public.wearable_provider_enum, text, text, text, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wearable_activity_import(
  uuid, public.wearable_provider_enum, text, text, text, integer, uuid
) TO service_role;
