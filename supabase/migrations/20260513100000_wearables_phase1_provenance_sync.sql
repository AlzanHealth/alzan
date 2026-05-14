-- =============================================================================
-- Wearables phase 1: provenance, sync state, source origins, raw payloads
-- =============================================================================

ALTER TABLE public.user_connections
  ADD COLUMN IF NOT EXISTS connection_kind text NOT NULL DEFAULT 'oauth',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.user_connections
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN token_expires_at DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_connections_connection_kind_check'
      AND conrelid = 'public.user_connections'::regclass
  ) THEN
    ALTER TABLE public.user_connections
      ADD CONSTRAINT user_connections_connection_kind_check
      CHECK (connection_kind IN ('oauth', 'local_sdk', 'file_import'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_connections_status_check'
      AND conrelid = 'public.user_connections'::regclass
  ) THEN
    ALTER TABLE public.user_connections
      ADD CONSTRAINT user_connections_status_check
      CHECK (status IN ('active', 'revoked', 'expired', 'error', 'paused'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.provider_connection_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.user_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider public.wearable_provider_enum NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  token_type text,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id)
);

ALTER TABLE public.provider_connection_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.provider_connection_tokens (
  connection_id,
  user_id,
  provider,
  access_token,
  refresh_token,
  token_expires_at,
  scope,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  provider,
  access_token,
  refresh_token,
  token_expires_at,
  scope,
  now(),
  now()
FROM public.user_connections
WHERE access_token IS NOT NULL
ON CONFLICT (connection_id) DO UPDATE SET
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  token_expires_at = EXCLUDED.token_expires_at,
  scope = EXCLUDED.scope,
  updated_at = now();

UPDATE public.user_connections
SET access_token = NULL,
    refresh_token = NULL,
    updated_at = now()
WHERE access_token IS NOT NULL
   OR refresh_token IS NOT NULL;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS health_data_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_data_consent_version text;

CREATE TABLE IF NOT EXISTS public.provider_data_origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_channel text NOT NULL,
  provider public.wearable_provider_enum NOT NULL,
  source_package text,
  source_provider_key text,
  display_name text,
  platform text,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_data_origins_identity
ON public.provider_data_origins (
  user_id,
  source_channel,
  provider,
  COALESCE(source_package, ''),
  COALESCE(source_provider_key, '')
);

ALTER TABLE public.provider_data_origins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.health_connect_provider_selection (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  origin_id uuid NOT NULL,
  selected_package_name text NOT NULL,
  selected_provider_key text,
  selected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_connect_provider_selection_origin_user_fkey
    FOREIGN KEY (origin_id, user_id)
    REFERENCES public.provider_data_origins(id, user_id)
    ON DELETE CASCADE
);

ALTER TABLE public.health_connect_provider_selection ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.integration_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider public.wearable_provider_enum NOT NULL,
  source_channel text NOT NULL,
  source_package text,
  sync_domain text NOT NULL,
  cursor_token text,
  anchor_token text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_record_at timestamptz,
  status text NOT NULL DEFAULT 'idle',
  last_error text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'integration_sync_state_status_check'
      AND conrelid = 'public.integration_sync_state'::regclass
  ) THEN
    ALTER TABLE public.integration_sync_state
      ADD CONSTRAINT integration_sync_state_status_check
      CHECK (status IN ('idle', 'running', 'success', 'error', 'paused', 'expired'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_sync_state_identity
ON public.integration_sync_state (
  user_id,
  provider,
  source_channel,
  COALESCE(source_package, ''),
  sync_domain
);

ALTER TABLE public.integration_sync_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.external_raw_payloads_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider public.wearable_provider_enum NOT NULL,
  source_channel text NOT NULL,
  source_package text,
  object_type text NOT NULL,
  source_record_id text,
  payload_hash text NOT NULL,
  payload jsonb,
  storage_bucket text,
  storage_path text,
  size_bytes integer CHECK (size_bytes IS NULL OR size_bytes >= 0),
  trace_id text,
  related_table text,
  related_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_raw_payloads_v2 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_provider_key text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.activity_streams
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.daily_steps
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_provider_key text,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.step_intervals
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_provider_key text,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_sessions
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_provider_key text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_stage_intervals
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_biomarker_samples
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.daily_recovery
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_provider_key text,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.weight_logs
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_provider_key text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.resting_hr_logs
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_package text,
  ADD COLUMN IF NOT EXISTS source_provider_key text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL;

ALTER TABLE public.daily_steps DROP CONSTRAINT IF EXISTS daily_steps_user_id_date_source_key;
ALTER TABLE public.daily_recovery DROP CONSTRAINT IF EXISTS daily_recovery_user_id_date_source_key;
ALTER TABLE public.sleep_sessions DROP CONSTRAINT IF EXISTS sleep_sessions_user_id_source_source_sleep_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_provider_record
ON public.activity_sessions (
  user_id,
  provider,
  COALESCE(source_channel, ''),
  COALESCE(source_package, ''),
  provider_activity_id
)
WHERE provider_activity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_source_record
ON public.activity_sessions (
  user_id,
  provider,
  COALESCE(source_channel, ''),
  COALESCE(source_package, ''),
  source_record_id
)
WHERE source_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sleep_source_record
ON public.sleep_sessions (
  user_id,
  source,
  COALESCE(source_package, ''),
  COALESCE(source_sleep_id, source_record_id)
)
WHERE COALESCE(source_sleep_id, source_record_id) IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_steps_source_package
ON public.daily_steps (user_id, date, source, COALESCE(source_package, ''));

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_recovery_source_package
ON public.daily_recovery (user_id, date, source, COALESCE(source_package, ''));

CREATE INDEX IF NOT EXISTS idx_provider_connection_tokens_connection
ON public.provider_connection_tokens (connection_id);

CREATE INDEX IF NOT EXISTS idx_provider_data_origins_user_channel
ON public.provider_data_origins (user_id, source_channel, provider);

CREATE INDEX IF NOT EXISTS idx_raw_payloads_v2_user_received
ON public.external_raw_payloads_v2 (user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_payloads_v2_source_record
ON public.external_raw_payloads_v2 (
  user_id,
  provider,
  source_channel,
  COALESCE(source_package, ''),
  object_type,
  source_record_id
)
WHERE source_record_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'provider_data_origins'
      AND policyname = 'Users can view own provider_data_origins'
  ) THEN
    CREATE POLICY "Users can view own provider_data_origins"
      ON public.provider_data_origins FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'provider_data_origins'
      AND policyname = 'Users can insert own provider_data_origins'
  ) THEN
    CREATE POLICY "Users can insert own provider_data_origins"
      ON public.provider_data_origins FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'provider_data_origins'
      AND policyname = 'Users can update own provider_data_origins'
  ) THEN
    CREATE POLICY "Users can update own provider_data_origins"
      ON public.provider_data_origins FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'provider_data_origins'
      AND policyname = 'Users can delete own provider_data_origins'
  ) THEN
    CREATE POLICY "Users can delete own provider_data_origins"
      ON public.provider_data_origins FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'health_connect_provider_selection'
      AND policyname = 'Users can view own health_connect_provider_selection'
  ) THEN
    CREATE POLICY "Users can view own health_connect_provider_selection"
      ON public.health_connect_provider_selection FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'health_connect_provider_selection'
      AND policyname = 'Users can upsert own health_connect_provider_selection'
  ) THEN
    CREATE POLICY "Users can upsert own health_connect_provider_selection"
      ON public.health_connect_provider_selection FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'health_connect_provider_selection'
      AND policyname = 'Users can update own health_connect_provider_selection'
  ) THEN
    CREATE POLICY "Users can update own health_connect_provider_selection"
      ON public.health_connect_provider_selection FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'integration_sync_state'
      AND policyname = 'Users can view own integration_sync_state'
  ) THEN
    CREATE POLICY "Users can view own integration_sync_state"
      ON public.integration_sync_state FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'integration_sync_state'
      AND policyname = 'Users can insert own integration_sync_state'
  ) THEN
    CREATE POLICY "Users can insert own integration_sync_state"
      ON public.integration_sync_state FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'integration_sync_state'
      AND policyname = 'Users can update own integration_sync_state'
  ) THEN
    CREATE POLICY "Users can update own integration_sync_state"
      ON public.integration_sync_state FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
