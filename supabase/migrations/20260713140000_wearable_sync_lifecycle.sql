-- Recoverable, concurrency-safe lifecycle for wearable activity imports.

CREATE TABLE IF NOT EXISTS public.wearable_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider public.wearable_provider_enum NOT NULL,
  sync_domain text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial', 'error')),
  lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_expires_at timestamptz NOT NULL,
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  reconciliation_status text NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'complete', 'retryable_error')),
  last_reconciliation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wearable_sync_jobs_user_started_idx
ON public.wearable_sync_jobs (user_id, provider, sync_domain, started_at DESC);

ALTER TABLE public.wearable_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.wearable_activity_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider public.wearable_provider_enum NOT NULL,
  source_channel text NOT NULL,
  source_package text,
  source_record_id text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'complete', 'retryable_error', 'permanent_error')),
  canonical_version integer NOT NULL DEFAULT 1 CHECK (canonical_version >= 1),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  session_id uuid REFERENCES public.activity_sessions(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.wearable_sync_jobs(id) ON DELETE SET NULL,
  last_error_code text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wearable_activity_imports_identity_uq
ON public.wearable_activity_imports (
  user_id,
  provider,
  source_channel,
  COALESCE(source_package, ''),
  source_record_id
);

CREATE INDEX IF NOT EXISTS wearable_activity_imports_job_idx
ON public.wearable_activity_imports (job_id)
WHERE job_id IS NOT NULL;

ALTER TABLE public.wearable_activity_imports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wearable_activity_imports
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'complete', 'retryable_error')),
  ADD COLUMN IF NOT EXISTS last_reconciliation_error text;

CREATE OR REPLACE FUNCTION public.claim_wearable_sync_job(
  p_user_id uuid,
  p_provider public.wearable_provider_enum,
  p_sync_domain text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active public.wearable_sync_jobs%ROWTYPE;
  v_job public.wearable_sync_jobs%ROWTYPE;
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 1800 THEN
    RAISE EXCEPTION 'WEARABLE_SYNC_JOB_INVALID_LEASE';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_provider::text || ':' || p_sync_domain, 0)
  );

  SELECT * INTO v_active
  FROM public.wearable_sync_jobs
  WHERE user_id = p_user_id
    AND provider = p_provider
    AND sync_domain = p_sync_domain
    AND status = 'running'
    AND lease_expires_at > now()
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_active.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'active',
      'job_id', v_active.id,
      'lease_token', v_active.lease_token,
      'lease_expires_at', v_active.lease_expires_at
    );
  END IF;

  UPDATE public.wearable_sync_jobs
  SET status = 'error',
      last_error = 'WEARABLE_SYNC_JOB_LEASE_EXPIRED',
      completed_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id
    AND provider = p_provider
    AND sync_domain = p_sync_domain
    AND status = 'running';

  INSERT INTO public.wearable_sync_jobs (
    user_id,
    provider,
    sync_domain,
    lease_expires_at
  ) VALUES (
    p_user_id,
    p_provider,
    p_sync_domain,
    now() + make_interval(secs => p_lease_seconds)
  )
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'action', 'acquired',
    'job_id', v_job.id,
    'lease_token', v_job.lease_token,
    'lease_expires_at', v_job.lease_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_wearable_sync_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_counters jsonb DEFAULT '{}'::jsonb,
  p_last_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('success', 'partial', 'error') THEN
    RAISE EXCEPTION 'WEARABLE_SYNC_JOB_INVALID_STATUS';
  END IF;

  UPDATE public.wearable_sync_jobs
  SET status = p_status,
      counters = COALESCE(p_counters, '{}'::jsonb),
      last_error = p_last_error,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND status = 'running';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEARABLE_SYNC_JOB_LEASE_LOST';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_wearable_sync_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 1800
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 1800 THEN
    RAISE EXCEPTION 'WEARABLE_SYNC_JOB_INVALID_LEASE';
  END IF;
  UPDATE public.wearable_sync_jobs
  SET lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND status = 'running'
    AND lease_expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'WEARABLE_SYNC_JOB_LEASE_LOST'; END IF;
END;
$$;

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
    AND v_import.reconciliation_status = 'complete' THEN
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

CREATE OR REPLACE FUNCTION public.finish_wearable_activity_reconciliation(
  p_import_id uuid,
  p_error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wearable_activity_imports
  SET reconciliation_status = CASE WHEN p_error_code IS NULL THEN 'complete' ELSE 'retryable_error' END,
      last_reconciliation_error = CASE WHEN p_error_code IS NULL THEN NULL ELSE left(p_error_code, 200) END,
      updated_at = now()
  WHERE id = p_import_id AND status = 'complete';
  IF NOT FOUND THEN RAISE EXCEPTION 'WEARABLE_ACTIVITY_IMPORT_NOT_COMPLETE'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_wearable_activity_import(
  p_import_id uuid,
  p_session_id uuid,
  p_canonical_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wearable_activity_imports
  SET status = 'complete',
      session_id = p_session_id,
      canonical_version = p_canonical_version,
      last_error_code = NULL,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_import_id
    AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEARABLE_ACTIVITY_IMPORT_NOT_PROCESSING';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_wearable_activity_import(
  p_import_id uuid,
  p_error_code text,
  p_retryable boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wearable_activity_imports
  SET status = CASE WHEN p_retryable THEN 'retryable_error' ELSE 'permanent_error' END,
      last_error_code = left(COALESCE(p_error_code, 'WEARABLE_ACTIVITY_IMPORT_FAILED'), 200),
      updated_at = now()
  WHERE id = p_import_id
    AND status = 'processing';
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workout_plans
    WHERE activity_session_id IS NOT NULL
    GROUP BY activity_session_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'WORKOUT_PLAN_SESSION_DUPLICATES_REQUIRE_REPAIR';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS workout_plans_activity_session_uq
ON public.workout_plans (activity_session_id)
WHERE activity_session_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.devices
    WHERE device_serial IS NOT NULL
    GROUP BY user_id, provider, device_serial
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'WEARABLE_DEVICE_DUPLICATES_REQUIRE_REPAIR';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS devices_user_provider_serial_uq
ON public.devices (user_id, provider, device_serial)
WHERE device_serial IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.external_raw_payloads_v2
    WHERE source_record_id IS NOT NULL
    GROUP BY user_id, provider, source_channel, COALESCE(source_package, ''), object_type, source_record_id, payload_hash
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'WEARABLE_RAW_PAYLOAD_DUPLICATES_REQUIRE_REPAIR';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS external_raw_payloads_v2_identity_hash_uq
ON public.external_raw_payloads_v2 (
  user_id,
  provider,
  source_channel,
  COALESCE(source_package, ''),
  object_type,
  source_record_id,
  payload_hash
)
WHERE source_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS activity_sessions_user_provider_start_idx
ON public.activity_sessions (user_id, provider, start_time DESC);

CREATE INDEX IF NOT EXISTS endurance_templates_user_sport_idx
ON public.endurance_workout_templates (user_id, sport_type);

ALTER TABLE public.integration_sync_state
  DROP CONSTRAINT IF EXISTS integration_sync_state_status_check;

ALTER TABLE public.integration_sync_state
  ADD CONSTRAINT integration_sync_state_status_check
  CHECK (status IN ('idle', 'running', 'success', 'partial', 'error', 'paused', 'expired'));

REVOKE ALL ON TABLE public.wearable_sync_jobs FROM anon, authenticated;
REVOKE ALL ON TABLE public.wearable_activity_imports FROM anon, authenticated;
GRANT ALL ON TABLE public.wearable_sync_jobs TO service_role;
GRANT ALL ON TABLE public.wearable_activity_imports TO service_role;

REVOKE ALL ON FUNCTION public.claim_wearable_sync_job(uuid, public.wearable_provider_enum, text, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_wearable_sync_job(uuid, uuid, text, jsonb, text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_wearable_sync_job(uuid, uuid, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_wearable_activity_import(
  uuid, public.wearable_provider_enum, text, text, text, integer, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_wearable_activity_import(uuid, uuid, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_wearable_activity_import(uuid, text, boolean)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_wearable_activity_reconciliation(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_wearable_sync_job(uuid, public.wearable_provider_enum, text, integer)
TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_wearable_sync_job(uuid, uuid, text, jsonb, text)
TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_wearable_sync_job(uuid, uuid, integer)
TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_wearable_activity_import(
  uuid, public.wearable_provider_enum, text, text, text, integer, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_wearable_activity_import(uuid, uuid, integer)
TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_wearable_activity_import(uuid, text, boolean)
TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_wearable_activity_reconciliation(uuid, text)
TO service_role;
