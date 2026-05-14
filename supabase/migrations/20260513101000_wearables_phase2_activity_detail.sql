-- =============================================================================
-- Wearables phase 2: route points, queryable streams, provider fields, files
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.activity_route_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  point_index integer NOT NULL CHECK (point_index >= 0),
  timestamp timestamptz,
  offset_s integer CHECK (offset_s IS NULL OR offset_s >= 0),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  altitude_m numeric,
  distance_m numeric CHECK (distance_m IS NULL OR distance_m >= 0),
  speed_mps numeric CHECK (speed_mps IS NULL OR speed_mps >= 0),
  horizontal_accuracy_m numeric CHECK (horizontal_accuracy_m IS NULL OR horizontal_accuracy_m >= 0),
  vertical_accuracy_m numeric CHECK (vertical_accuracy_m IS NULL OR vertical_accuracy_m >= 0),
  source text,
  source_channel text,
  source_package text,
  source_record_id text,
  raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, point_index)
);

ALTER TABLE public.activity_route_points ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_stream_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stream_type public.stream_type_enum NOT NULL,
  timestamp timestamptz,
  offset_s integer CHECK (offset_s IS NULL OR offset_s >= 0),
  value numeric NOT NULL,
  unit text,
  source text,
  source_channel text,
  source_package text,
  source_record_id text,
  raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_stream_samples_time_or_offset_check
    CHECK (timestamp IS NOT NULL OR offset_s IS NOT NULL)
);

ALTER TABLE public.activity_stream_samples ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_stream_sample_time
ON public.activity_stream_samples (session_id, stream_type, timestamp)
WHERE timestamp IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_stream_sample_offset
ON public.activity_stream_samples (session_id, stream_type, offset_s)
WHERE offset_s IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.activity_provider_fields (
  session_id uuid PRIMARY KEY REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider public.wearable_provider_enum NOT NULL,
  source_channel text,
  source_package text,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_provider_fields ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
  provider public.wearable_provider_enum NOT NULL,
  source_channel text,
  source_package text,
  file_type text NOT NULL,
  storage_bucket text,
  storage_path text,
  file_hash text,
  size_bytes integer CHECK (size_bytes IS NULL OR size_bytes >= 0),
  raw_payload_id uuid REFERENCES public.external_raw_payloads_v2(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_files ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activity_files_user_provider
ON public.activity_files (user_id, provider, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_files_session
ON public.activity_files (session_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_route_points'
      AND policyname = 'Users can view own activity_route_points'
  ) THEN
    CREATE POLICY "Users can view own activity_route_points"
      ON public.activity_route_points FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_route_points'
      AND policyname = 'Users can insert own activity_route_points'
  ) THEN
    CREATE POLICY "Users can insert own activity_route_points"
      ON public.activity_route_points FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_route_points'
      AND policyname = 'Users can update own activity_route_points'
  ) THEN
    CREATE POLICY "Users can update own activity_route_points"
      ON public.activity_route_points FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_route_points'
      AND policyname = 'Users can delete own activity_route_points'
  ) THEN
    CREATE POLICY "Users can delete own activity_route_points"
      ON public.activity_route_points FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_stream_samples'
      AND policyname = 'Users can view own activity_stream_samples'
  ) THEN
    CREATE POLICY "Users can view own activity_stream_samples"
      ON public.activity_stream_samples FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_stream_samples'
      AND policyname = 'Users can insert own activity_stream_samples'
  ) THEN
    CREATE POLICY "Users can insert own activity_stream_samples"
      ON public.activity_stream_samples FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_stream_samples'
      AND policyname = 'Users can update own activity_stream_samples'
  ) THEN
    CREATE POLICY "Users can update own activity_stream_samples"
      ON public.activity_stream_samples FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_stream_samples'
      AND policyname = 'Users can delete own activity_stream_samples'
  ) THEN
    CREATE POLICY "Users can delete own activity_stream_samples"
      ON public.activity_stream_samples FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_provider_fields'
      AND policyname = 'Users can view own activity_provider_fields'
  ) THEN
    CREATE POLICY "Users can view own activity_provider_fields"
      ON public.activity_provider_fields FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_provider_fields'
      AND policyname = 'Users can upsert own activity_provider_fields'
  ) THEN
    CREATE POLICY "Users can upsert own activity_provider_fields"
      ON public.activity_provider_fields FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_provider_fields'
      AND policyname = 'Users can update own activity_provider_fields'
  ) THEN
    CREATE POLICY "Users can update own activity_provider_fields"
      ON public.activity_provider_fields FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_files'
      AND policyname = 'Users can view own activity_files'
  ) THEN
    CREATE POLICY "Users can view own activity_files"
      ON public.activity_files FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;
