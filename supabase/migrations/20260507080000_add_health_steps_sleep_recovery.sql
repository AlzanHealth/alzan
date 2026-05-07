-- =============================================================================
-- Migration: Add health tables for daily steps, sleep sessions, and recovery
-- =============================================================================
-- New tables:
--   1. daily_steps            — Daily step summary per user/source/date
--   2. step_intervals         — Intra-day step blocks for charts
--   3. sleep_sessions         — Full sleep session with physiological summary
--   4. sleep_stage_intervals  — Sleep stage timeline (hypnogram)
--   5. sleep_biomarker_samples — Generic time-series during sleep
--   6. daily_recovery         — Daily recovery/readiness scores
--
-- New enums:
--   - sleep_stage_enum
--   - health_data_quality_enum
--   - biomarker_type_enum
--   - wearable_provider_enum expansion (apple_health, health_connect)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum additions
-- ---------------------------------------------------------------------------

-- Expand wearable_provider_enum for on-device health platforms
ALTER TYPE public.wearable_provider_enum ADD VALUE IF NOT EXISTS 'apple_health';
ALTER TYPE public.wearable_provider_enum ADD VALUE IF NOT EXISTS 'health_connect';
ALTER TYPE public.wearable_provider_enum ADD VALUE IF NOT EXISTS 'manual';

-- Sleep stage enum (normalized across all providers)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sleep_stage_enum') THEN
    CREATE TYPE public.sleep_stage_enum AS ENUM (
      'unknown',
      'awake',
      'awake_in_bed',
      'out_of_bed',
      'sleeping',
      'light',
      'deep',
      'rem',
      'core'
    );
  END IF;
END$$;

-- Data quality enum (shared across health tables)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_data_quality_enum') THEN
    CREATE TYPE public.health_data_quality_enum AS ENUM (
      'complete',
      'partial',
      'estimated',
      'manual',
      'unknown'
    );
  END IF;
END$$;

-- Biomarker type enum (for generic sample table)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'biomarker_type_enum') THEN
    CREATE TYPE public.biomarker_type_enum AS ENUM (
      'heart_rate',
      'hrv_rmssd',
      'hrv_sdnn',
      'spo2',
      'respiratory_rate',
      'skin_temperature',
      'body_temperature',
      'movement',
      'stress'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. daily_steps
-- ---------------------------------------------------------------------------

CREATE TABLE public.daily_steps (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date                  date NOT NULL,
  timezone              text NOT NULL,
  source                public.wearable_provider_enum NOT NULL,
  device_id             uuid REFERENCES public.devices(id),

  -- Core metrics
  total_steps           integer NOT NULL CHECK (total_steps >= 0),
  active_steps          integer CHECK (active_steps >= 0),
  walking_steps         integer CHECK (walking_steps >= 0),
  running_steps         integer CHECK (running_steps >= 0),

  -- Distance & energy
  distance_m            numeric CHECK (distance_m >= 0),
  active_distance_m     numeric CHECK (active_distance_m >= 0),
  calories_kcal         numeric CHECK (calories_kcal >= 0),
  active_calories_kcal  numeric CHECK (active_calories_kcal >= 0),

  -- Elevation
  floors_climbed        integer CHECK (floors_climbed >= 0),
  elevation_gain_m      numeric CHECK (elevation_gain_m >= 0),

  -- Goal
  step_goal             integer CHECK (step_goal > 0),
  goal_achieved         boolean,

  -- Activity intensity minutes
  sedentary_minutes     integer CHECK (sedentary_minutes >= 0),
  lightly_active_min    integer CHECK (lightly_active_min >= 0),
  fairly_active_min     integer CHECK (fairly_active_min >= 0),
  very_active_min       integer CHECK (very_active_min >= 0),

  -- Timing
  first_step_at         timestamptz,
  last_step_at          timestamptz,

  -- Quality & provenance
  data_quality          public.health_data_quality_enum DEFAULT 'unknown',
  is_manual             boolean NOT NULL DEFAULT false,

  -- Source tracking
  source_record_id      text,
  source_created_at     timestamptz,
  source_updated_at     timestamptz,

  -- Sync & raw
  synced_at             timestamptz NOT NULL DEFAULT now(),
  raw_payload           jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, date, source)
);

-- ---------------------------------------------------------------------------
-- 3. step_intervals
-- ---------------------------------------------------------------------------

CREATE TABLE public.step_intervals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  daily_steps_id        uuid REFERENCES public.daily_steps(id) ON DELETE SET NULL,
  source                public.wearable_provider_enum NOT NULL,
  device_id             uuid REFERENCES public.devices(id),

  start_time            timestamptz NOT NULL,
  end_time              timestamptz NOT NULL CHECK (end_time > start_time),
  timezone              text NOT NULL,

  -- Metrics
  steps                 integer NOT NULL CHECK (steps >= 0),
  distance_m            numeric CHECK (distance_m >= 0),
  calories_kcal         numeric CHECK (calories_kcal >= 0),
  cadence_spm           numeric CHECK (cadence_spm >= 0),
  speed_mps             numeric CHECK (speed_mps >= 0),

  -- Context
  activity_type         text,
  context               text,

  -- Quality & provenance
  data_quality          public.health_data_quality_enum DEFAULT 'unknown',
  source_record_id      text,

  -- Raw
  raw_payload           jsonb,
  synced_at             timestamptz NOT NULL DEFAULT now(),

  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. sleep_sessions
-- ---------------------------------------------------------------------------

CREATE TABLE public.sleep_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source                public.wearable_provider_enum NOT NULL,
  device_id             uuid REFERENCES public.devices(id),

  -- Temporal
  date                  date NOT NULL,
  timezone              text NOT NULL,
  start_time            timestamptz NOT NULL,
  end_time              timestamptz NOT NULL CHECK (end_time > start_time),
  bedtime_start         timestamptz,
  bedtime_end           timestamptz,
  sleep_start           timestamptz,
  sleep_end             timestamptz,

  -- Type
  is_main_sleep         boolean NOT NULL DEFAULT true,
  is_nap                boolean NOT NULL DEFAULT false,
  nap_type              text,

  -- Duration breakdown (minutes)
  duration_in_bed_min   numeric CHECK (duration_in_bed_min >= 0),
  total_sleep_min       numeric CHECK (total_sleep_min >= 0),
  awake_min             numeric CHECK (awake_min >= 0),
  light_sleep_min       numeric CHECK (light_sleep_min >= 0),
  deep_sleep_min        numeric CHECK (deep_sleep_min >= 0),
  rem_sleep_min         numeric CHECK (rem_sleep_min >= 0),
  core_sleep_min        numeric CHECK (core_sleep_min >= 0),
  unknown_sleep_min     numeric CHECK (unknown_sleep_min >= 0),
  out_of_bed_min        numeric CHECK (out_of_bed_min >= 0),
  awake_in_bed_min      numeric CHECK (awake_in_bed_min >= 0),

  -- Latency & disruptions
  sleep_latency_min     numeric CHECK (sleep_latency_min >= 0),
  waso_min              numeric CHECK (waso_min >= 0),
  after_wakeup_min      numeric CHECK (after_wakeup_min >= 0),
  number_of_awakenings  integer CHECK (number_of_awakenings >= 0),
  restless_periods      integer CHECK (restless_periods >= 0),
  restless_min          numeric CHECK (restless_min >= 0),

  -- Efficiency & scores
  sleep_efficiency_pct  numeric CHECK (sleep_efficiency_pct >= 0 AND sleep_efficiency_pct <= 100),
  sleep_score           numeric,
  sleep_quality_label   text,

  -- Heart rate summary
  avg_heart_rate_bpm    numeric,
  min_heart_rate_bpm    numeric,
  max_heart_rate_bpm    numeric,
  resting_hr_bpm        numeric,

  -- HRV summary
  avg_hrv_ms            numeric,
  hrv_rmssd_ms          numeric,

  -- Respiratory
  avg_respiratory_rpm   numeric,
  min_respiratory_rpm   numeric,
  max_respiratory_rpm   numeric,

  -- SpO2
  avg_spo2_pct          numeric,
  min_spo2_pct          numeric,

  -- Temperature
  avg_skin_temp_c       numeric,
  skin_temp_deviation_c numeric,

  -- Quality & provenance
  data_quality          public.health_data_quality_enum DEFAULT 'unknown',
  confidence            numeric,
  is_manual             boolean NOT NULL DEFAULT false,
  source_sleep_id       text,
  source_created_at     timestamptz,
  source_updated_at     timestamptz,

  -- Sync & raw
  synced_at             timestamptz NOT NULL DEFAULT now(),
  raw_payload           jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, source, source_sleep_id)
);

-- ---------------------------------------------------------------------------
-- 5. sleep_stage_intervals
-- ---------------------------------------------------------------------------

CREATE TABLE public.sleep_stage_intervals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sleep_session_id      uuid NOT NULL REFERENCES public.sleep_sessions(id) ON DELETE CASCADE,
  source                public.wearable_provider_enum NOT NULL,

  start_time            timestamptz NOT NULL,
  end_time              timestamptz NOT NULL CHECK (end_time > start_time),
  duration_min          numeric NOT NULL CHECK (duration_min > 0),

  -- Stage (normalized)
  stage                 public.sleep_stage_enum NOT NULL,
  provider_stage        text,
  confidence            numeric,

  raw_payload           jsonb,

  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. sleep_biomarker_samples
-- ---------------------------------------------------------------------------

CREATE TABLE public.sleep_biomarker_samples (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sleep_session_id      uuid NOT NULL REFERENCES public.sleep_sessions(id) ON DELETE CASCADE,
  source                public.wearable_provider_enum NOT NULL,

  timestamp             timestamptz NOT NULL,
  metric_type           public.biomarker_type_enum NOT NULL,
  value                 numeric NOT NULL,
  unit                  text NOT NULL,

  confidence            numeric,
  raw_payload           jsonb,

  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. daily_recovery
-- ---------------------------------------------------------------------------

CREATE TABLE public.daily_recovery (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date                  date NOT NULL,
  timezone              text NOT NULL,
  source                public.wearable_provider_enum NOT NULL,
  sleep_session_id      uuid REFERENCES public.sleep_sessions(id) ON DELETE SET NULL,

  -- Scores (each provider fills what it has)
  recovery_score        numeric,
  readiness_score       numeric,
  sleep_score           numeric,
  strain_score          numeric,

  -- Body Battery (Garmin)
  body_battery_start    numeric,
  body_battery_min      numeric,
  body_battery_max      numeric,
  body_battery_end      numeric,

  -- Nightly Recharge (Polar)
  nightly_recharge_score numeric,
  ans_charge            numeric,
  sleep_charge          numeric,

  -- Baseline physiological
  resting_hr_bpm        numeric,
  avg_hrv_ms            numeric,
  hrv_balance_score     numeric,
  temp_deviation_c      numeric,
  respiratory_rate_rpm  numeric,
  spo2_avg_pct          numeric,

  -- Label
  recovery_label        text,
  recommendation        text,

  -- Provenance
  data_quality          public.health_data_quality_enum DEFAULT 'unknown',
  source_record_id      text,
  raw_payload           jsonb,
  synced_at             timestamptz NOT NULL DEFAULT now(),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, date, source)
);

-- ---------------------------------------------------------------------------
-- 8. RLS Policies
-- ---------------------------------------------------------------------------

-- daily_steps
ALTER TABLE public.daily_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own daily_steps" ON public.daily_steps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily_steps" ON public.daily_steps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily_steps" ON public.daily_steps FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily_steps" ON public.daily_steps FOR DELETE USING (auth.uid() = user_id);

-- step_intervals
ALTER TABLE public.step_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own step_intervals" ON public.step_intervals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own step_intervals" ON public.step_intervals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own step_intervals" ON public.step_intervals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own step_intervals" ON public.step_intervals FOR DELETE USING (auth.uid() = user_id);

-- sleep_sessions
ALTER TABLE public.sleep_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sleep_sessions" ON public.sleep_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sleep_sessions" ON public.sleep_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sleep_sessions" ON public.sleep_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sleep_sessions" ON public.sleep_sessions FOR DELETE USING (auth.uid() = user_id);

-- sleep_stage_intervals
ALTER TABLE public.sleep_stage_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sleep_stage_intervals" ON public.sleep_stage_intervals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sleep_stage_intervals" ON public.sleep_stage_intervals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sleep_stage_intervals" ON public.sleep_stage_intervals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sleep_stage_intervals" ON public.sleep_stage_intervals FOR DELETE USING (auth.uid() = user_id);

-- sleep_biomarker_samples
ALTER TABLE public.sleep_biomarker_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sleep_biomarker_samples" ON public.sleep_biomarker_samples FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sleep_biomarker_samples" ON public.sleep_biomarker_samples FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sleep_biomarker_samples" ON public.sleep_biomarker_samples FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sleep_biomarker_samples" ON public.sleep_biomarker_samples FOR DELETE USING (auth.uid() = user_id);

-- daily_recovery
ALTER TABLE public.daily_recovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own daily_recovery" ON public.daily_recovery FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily_recovery" ON public.daily_recovery FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily_recovery" ON public.daily_recovery FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily_recovery" ON public.daily_recovery FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 9. Indexes
-- ---------------------------------------------------------------------------

-- daily_steps: typical date-range queries
CREATE INDEX idx_daily_steps_user_date ON public.daily_steps (user_id, date DESC);

-- step_intervals: time-range queries for charts
CREATE INDEX idx_step_intervals_user_time ON public.step_intervals (user_id, start_time DESC);
CREATE INDEX idx_step_intervals_daily ON public.step_intervals (daily_steps_id);

-- sleep_sessions: date-range queries
CREATE INDEX idx_sleep_sessions_user_date ON public.sleep_sessions (user_id, date DESC);

-- sleep_stage_intervals: hypnogram rendering
CREATE INDEX idx_sleep_stages_session ON public.sleep_stage_intervals (sleep_session_id, start_time);

-- sleep_biomarker_samples: time-series queries by metric
CREATE INDEX idx_biomarker_session_type ON public.sleep_biomarker_samples (sleep_session_id, metric_type, timestamp);

-- daily_recovery: date-range queries
CREATE INDEX idx_daily_recovery_user_date ON public.daily_recovery (user_id, date DESC);
