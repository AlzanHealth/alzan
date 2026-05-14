-- =============================================================================
-- Wearables phase 3: 24/7 health metric samples and VO2 max history
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.health_metric_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider public.wearable_provider_enum NOT NULL,
  source_channel text NOT NULL,
  source_package text,
  source_record_id text,
  metric_type text NOT NULL CHECK (length(metric_type) > 0),
  recorded_at timestamptz NOT NULL,
  local_date date,
  timezone text,
  value numeric NOT NULL,
  unit text NOT NULL,
  sleep_session_id uuid REFERENCES public.sleep_sessions(id) ON DELETE SET NULL,
  activity_session_id uuid REFERENCES public.activity_sessions(id) ON DELETE SET NULL,
  raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_metric_samples ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_health_metric_source_record
ON public.health_metric_samples (
  user_id,
  provider,
  source_channel,
  COALESCE(source_package, ''),
  metric_type,
  source_record_id
)
WHERE source_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_health_metric_time
ON public.health_metric_samples (
  user_id,
  provider,
  source_channel,
  COALESCE(source_package, ''),
  metric_type,
  recorded_at
);

CREATE TABLE IF NOT EXISTS public.vo2_max_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL,
  value_ml_kg_min numeric NOT NULL CHECK (value_ml_kg_min > 0 AND value_ml_kg_min <= 100),
  provider public.wearable_provider_enum NOT NULL,
  source_channel text,
  source_package text,
  source_record_id text,
  activity_session_id uuid REFERENCES public.activity_sessions(id) ON DELETE SET NULL,
  raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vo2_max_logs ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vo2_max_source_record
ON public.vo2_max_logs (
  user_id,
  provider,
  COALESCE(source_channel, ''),
  COALESCE(source_package, ''),
  source_record_id
)
WHERE source_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vo2_max_time
ON public.vo2_max_logs (
  user_id,
  provider,
  COALESCE(source_channel, ''),
  COALESCE(source_package, ''),
  measured_at
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'health_metric_samples'
      AND policyname = 'Users can view own health_metric_samples'
  ) THEN
    CREATE POLICY "Users can view own health_metric_samples"
      ON public.health_metric_samples FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'health_metric_samples'
      AND policyname = 'Users can insert own health_metric_samples'
  ) THEN
    CREATE POLICY "Users can insert own health_metric_samples"
      ON public.health_metric_samples FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'health_metric_samples'
      AND policyname = 'Users can update own health_metric_samples'
  ) THEN
    CREATE POLICY "Users can update own health_metric_samples"
      ON public.health_metric_samples FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'health_metric_samples'
      AND policyname = 'Users can delete own health_metric_samples'
  ) THEN
    CREATE POLICY "Users can delete own health_metric_samples"
      ON public.health_metric_samples FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vo2_max_logs'
      AND policyname = 'Users can view own vo2_max_logs'
  ) THEN
    CREATE POLICY "Users can view own vo2_max_logs"
      ON public.vo2_max_logs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vo2_max_logs'
      AND policyname = 'Users can insert own vo2_max_logs'
  ) THEN
    CREATE POLICY "Users can insert own vo2_max_logs"
      ON public.vo2_max_logs FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vo2_max_logs'
      AND policyname = 'Users can update own vo2_max_logs'
  ) THEN
    CREATE POLICY "Users can update own vo2_max_logs"
      ON public.vo2_max_logs FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vo2_max_logs'
      AND policyname = 'Users can delete own vo2_max_logs'
  ) THEN
    CREATE POLICY "Users can delete own vo2_max_logs"
      ON public.vo2_max_logs FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
