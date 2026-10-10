-- Repeatable cardio evolution examples for the local demo account.
-- The sessions span one year, with denser recent weeks to exercise every period selector.

DELETE FROM public.activity_heart_rate_zones AS zones
USING public.activity_sessions AS sessions
WHERE zones.session_id = sessions.id
  AND sessions.user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
  AND sessions.name LIKE 'Demo cardio evolution:%';

DELETE FROM public.activity_stream_samples AS samples
USING public.activity_sessions AS sessions
WHERE samples.session_id = sessions.id
  AND samples.user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
  AND sessions.name LIKE 'Demo cardio evolution:%';

-- Keep session IDs stable and upsert them below instead of deleting them.
-- Local users may have linked a seeded session to a plan or external mapping.

INSERT INTO public.devices (id, user_id, provider, device_name, device_model)
VALUES
  ('00000000-0000-0000-0000-000000000001', '4424c5d6-5751-4038-aa39-bd85895ddb78', 'suunto', 'Demo watch A', 'Synthetic device'),
  ('00000000-0000-0000-0000-000000000002', '4424c5d6-5751-4038-aa39-bd85895ddb78', 'garmin', 'Demo watch B', 'Synthetic device')
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  provider = EXCLUDED.provider,
  device_name = EXCLUDED.device_name,
  device_model = EXCLUDED.device_model;

WITH sport_fixtures AS (
  SELECT *
  FROM (VALUES
    ('running'::text, 0, 'road'::text, 2700, 150, 176, 2.80::numeric, NULL::integer, 20::numeric, 20::numeric),
    ('cycling'::text, 100, 'outdoor'::text, 3600, 148, 172, 7.20::numeric, 135, 20::numeric, 100::numeric),
    ('swimming'::text, 200, 'pool'::text, 1800, 145, 166, 0.620::numeric, NULL::integer, 26::numeric, 0::numeric),
    ('gym'::text, 300, 'strength'::text, 3600, 121, 158, NULL::numeric, NULL::integer, NULL::numeric, NULL::numeric),
    ('football'::text, 400, 'football'::text, 2400, 146, 184, NULL::numeric, NULL::integer, 19::numeric, 35::numeric),
    ('trail'::text, 500, 'trail'::text, 3000, 145, 176, 3.25::numeric, NULL::integer, 17::numeric, 80::numeric),
    ('hiking'::text, 600, 'hiking'::text, 3000, 140, 170, 1.30::numeric, NULL::integer, 17::numeric, 180::numeric),
    ('basketball'::text, 700, 'basketball'::text, 2400, 148, 190, NULL::numeric, NULL::integer, 20::numeric, 5::numeric)
  ) AS fixtures(sport_type, id_offset, sport_subtype, duration_s, base_hr, max_hr, base_speed, base_power, temperature, elevation)
),
fixture_days AS (
  SELECT workout_number, days_ago
  FROM (
    SELECT 15 + (50 - week_number) * 7 AS days_ago, week_number AS workout_number
    FROM generate_series(1, 50) AS weeks(week_number)
    UNION ALL
    SELECT recent.days_ago, recent.workout_number
    FROM (VALUES (1, 51), (3, 52), (5, 53), (6, 54), (8, 55), (10, 56), (12, 57), (14, 58))
      AS recent(days_ago, workout_number)
  ) AS seeded_days
),
seed_rows AS (
  SELECT
    sport_fixtures.*,
    fixture_days.workout_number,
    fixture_days.days_ago,
    (sport_fixtures.id_offset + fixture_days.workout_number)::bigint AS id_number,
    CASE
      WHEN sport_fixtures.sport_type = 'gym' AND fixture_days.workout_number % 8 = 0 THEN 900
      ELSE sport_fixtures.duration_s + ((fixture_days.workout_number % 5) - 2) * 120
    END AS session_duration_s,
    CASE
      WHEN fixture_days.workout_number % 7 = 0 THEN NULL
      WHEN fixture_days.workout_number <= 26 THEN sport_fixtures.base_hr
      WHEN sport_fixtures.sport_type = 'football'
        THEN sport_fixtures.base_hr + 2 + (fixture_days.workout_number % 3) + ((fixture_days.workout_number % 5) - 2)
      WHEN sport_fixtures.sport_type IN ('gym', 'strength')
        THEN sport_fixtures.base_hr + (fixture_days.workout_number % 2) + ((fixture_days.workout_number % 5) - 2)
      ELSE sport_fixtures.base_hr + ((fixture_days.workout_number % 5) - 2)
    END AS avg_hr,
    CASE
      WHEN sport_fixtures.base_speed IS NULL THEN NULL
      WHEN fixture_days.workout_number % 9 = 0 THEN NULL
      WHEN sport_fixtures.sport_type = 'running' AND fixture_days.workout_number <= 26
        THEN sport_fixtures.base_speed + (fixture_days.workout_number - 1) * 0.01 + ((fixture_days.workout_number % 4) - 1) * 0.025
      WHEN sport_fixtures.sport_type = 'running' AND fixture_days.workout_number < 48
        THEN 3.05 + (fixture_days.workout_number - 27) * 0.01 + ((fixture_days.workout_number % 4) - 1) * 0.025
      WHEN sport_fixtures.sport_type = 'running'
        THEN 3.33 + (fixture_days.workout_number - 48) * 0.02 + ((fixture_days.workout_number % 4) - 1) * 0.025
      WHEN sport_fixtures.sport_type = 'cycling' AND fixture_days.workout_number <= 26
        THEN sport_fixtures.base_speed + (fixture_days.workout_number - 1) * 0.04 + ((fixture_days.workout_number % 4) - 1) * 0.08
      WHEN sport_fixtures.sport_type = 'cycling' AND fixture_days.workout_number < 48
        THEN 7.55 + (fixture_days.workout_number - 27) * 0.03 + ((fixture_days.workout_number % 4) - 1) * 0.08
      WHEN sport_fixtures.sport_type = 'cycling'
        THEN 8.0 + (fixture_days.workout_number - 48) * 0.06 + ((fixture_days.workout_number % 4) - 1) * 0.08
      WHEN sport_fixtures.sport_type = 'swimming' AND fixture_days.workout_number <= 26
        THEN sport_fixtures.base_speed + (fixture_days.workout_number - 1) * 0.005 + ((fixture_days.workout_number % 4) - 1) * 0.01
      WHEN sport_fixtures.sport_type = 'swimming' AND fixture_days.workout_number < 48
        THEN 0.67 + (fixture_days.workout_number - 27) * 0.005 + ((fixture_days.workout_number % 4) - 1) * 0.01
      WHEN sport_fixtures.sport_type = 'swimming'
        THEN 0.80 + (fixture_days.workout_number - 48) * 0.01 + ((fixture_days.workout_number % 4) - 1) * 0.01
      WHEN sport_fixtures.sport_type = 'trail' THEN 3.25 + ((fixture_days.workout_number % 4) - 1) * 0.03
      WHEN sport_fixtures.sport_type = 'hiking' AND fixture_days.workout_number <= 26
        THEN sport_fixtures.base_speed + (fixture_days.workout_number - 1) * 0.005 + ((fixture_days.workout_number % 4) - 1) * 0.015
      WHEN fixture_days.workout_number < 48
        THEN 1.18 - (fixture_days.workout_number - 27) * 0.005 + ((fixture_days.workout_number % 4) - 1) * 0.015
      ELSE 1.04 - (fixture_days.workout_number - 48) * 0.01 + ((fixture_days.workout_number % 4) - 1) * 0.015
    END AS avg_speed,
    CASE
      WHEN sport_fixtures.sport_type <> 'cycling' THEN NULL
      WHEN fixture_days.workout_number % 6 = 0 THEN NULL
      WHEN fixture_days.workout_number <= 26 THEN sport_fixtures.base_power + (fixture_days.workout_number - 1)
      ELSE 180 + (fixture_days.workout_number - 48) * 2
    END AS avg_power,
    CASE
      WHEN sport_fixtures.sport_type <> 'gym' THEN NULL
      WHEN fixture_days.workout_number = 51 THEN 1905
      WHEN fixture_days.workout_number = 52 THEN 1040
      WHEN fixture_days.workout_number = 53 THEN 975
      WHEN fixture_days.workout_number <= 26 THEN 3500 + (fixture_days.workout_number - 1) * 80
      ELSE 4050 + (fixture_days.workout_number - 27) * 80
    END AS total_volume
  FROM sport_fixtures
  CROSS JOIN fixture_days
)
INSERT INTO public.activity_sessions (
  id, user_id, sport_type, sport_subtype, start_time, end_time, duration_s,
  distance_m, elev_gain_m, avg_heart_rate, max_heart_rate, avg_speed_m_per_s,
  avg_power_w, avg_temp_c, total_volume_kg, total_sets, total_reps,
  workout_template_id, name, source, provider, device_id, status, timezone
)
SELECT
  ('ce000000-0000-0000-0000-' || lpad(id_number::text, 12, '0'))::uuid,
  '4424c5d6-5751-4038-aa39-bd85895ddb78',
  sport_type::public.sport_type_enum,
  CASE
    WHEN sport_type = 'cycling' AND workout_number % 4 = 0 THEN 'indoor_trainer'
    ELSE sport_subtype
  END,
  starts_at,
  starts_at + session_duration_s * INTERVAL '1 second',
  session_duration_s,
  CASE WHEN avg_speed IS NULL THEN NULL ELSE round(avg_speed * session_duration_s)::integer END,
  elevation,
  avg_hr,
  CASE WHEN avg_hr IS NULL THEN NULL ELSE max_hr END,
  avg_speed,
  avg_power,
  temperature,
  total_volume,
  CASE
    WHEN total_volume IS NULL THEN NULL
    WHEN sport_type = 'gym' AND workout_number = 51 THEN 4
    WHEN sport_type = 'gym' AND workout_number IN (52, 53) THEN 2
    ELSE 18
  END,
  CASE
    WHEN total_volume IS NULL THEN NULL
    WHEN sport_type = 'gym' AND workout_number = 51 THEN 36
    WHEN sport_type = 'gym' AND workout_number = 52 THEN 16
    WHEN sport_type = 'gym' AND workout_number = 53 THEN 18
    ELSE 72
  END,
  CASE
    WHEN sport_type <> 'gym' THEN NULL
    WHEN workout_number % 2 = 0 THEN '10000000-0000-0000-0000-000000000001'::uuid
    ELSE '10000000-0000-0000-0000-000000000002'::uuid
  END,
  'Demo cardio evolution: ' || sport_type || ' · ' || days_ago || 'd',
  'manual',
  CASE workout_number % 4
    WHEN 0 THEN 'suunto'::public.provider_enum
    WHEN 1 THEN 'garmin'::public.provider_enum
    WHEN 2 THEN 'apple_health'::public.provider_enum
    ELSE 'manual'::public.provider_enum
  END,
  CASE workout_number % 4
    WHEN 0 THEN '00000000-0000-0000-0000-000000000001'::uuid
    WHEN 1 THEN '00000000-0000-0000-0000-000000000002'::uuid
    ELSE NULL
  END,
  'completed',
  'Europe/Madrid'
FROM (
  SELECT seed_rows.*, now() - days_ago * INTERVAL '1 day' AS starts_at
  FROM seed_rows
) AS prepared
ON CONFLICT (id) DO UPDATE SET
  sport_type = EXCLUDED.sport_type,
  sport_subtype = EXCLUDED.sport_subtype,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  duration_s = EXCLUDED.duration_s,
  distance_m = EXCLUDED.distance_m,
  elev_gain_m = EXCLUDED.elev_gain_m,
  avg_heart_rate = EXCLUDED.avg_heart_rate,
  max_heart_rate = EXCLUDED.max_heart_rate,
  avg_speed_m_per_s = EXCLUDED.avg_speed_m_per_s,
  avg_power_w = EXCLUDED.avg_power_w,
  avg_temp_c = EXCLUDED.avg_temp_c,
  total_volume_kg = EXCLUDED.total_volume_kg,
  total_sets = EXCLUDED.total_sets,
  total_reps = EXCLUDED.total_reps,
  workout_template_id = EXCLUDED.workout_template_id,
  name = EXCLUDED.name,
  source = EXCLUDED.source,
  provider = EXCLUDED.provider,
  device_id = EXCLUDED.device_id,
  status = EXCLUDED.status,
  timezone = EXCLUDED.timezone;

-- A high-confidence pending duplicate exercises the same exclusion rule as the history list.
INSERT INTO public.activity_sessions (
  id, user_id, sport_type, sport_subtype, start_time, end_time, duration_s,
  distance_m, avg_heart_rate, max_heart_rate, avg_speed_m_per_s,
  name, source, provider, status, timezone, duplicate_resolution, duplicate_score, duplicate_of_session_id
)
SELECT
  'ce000000-0000-0000-0000-000000999999'::uuid,
  session.user_id,
  session.sport_type,
  session.sport_subtype,
  session.start_time + INTERVAL '30 seconds',
  session.end_time + INTERVAL '30 seconds',
  session.duration_s,
  session.distance_m,
  session.avg_heart_rate,
  session.max_heart_rate,
  session.avg_speed_m_per_s,
  'Demo cardio evolution: pending duplicate',
  session.source,
  session.provider,
  session.status,
  session.timezone,
  'pending',
  98,
  session.id
FROM public.activity_sessions AS session
WHERE session.id = 'ce000000-0000-0000-0000-000000000051'::uuid
ON CONFLICT (id) DO UPDATE SET
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  duration_s = EXCLUDED.duration_s,
  distance_m = EXCLUDED.distance_m,
  avg_heart_rate = EXCLUDED.avg_heart_rate,
  max_heart_rate = EXCLUDED.max_heart_rate,
  avg_speed_m_per_s = EXCLUDED.avg_speed_m_per_s,
  name = EXCLUDED.name,
  duplicate_resolution = EXCLUDED.duplicate_resolution,
  duplicate_score = EXCLUDED.duplicate_score,
  duplicate_of_session_id = EXCLUDED.duplicate_of_session_id;

-- Several demo gym sessions include real set rows so strength-detail screens can be checked too.
INSERT INTO public.workout_sets (
  id, session_id, user_id, exercise_id, set_number, weight_kg, reps, rpe
)
VALUES
  ('ce100000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000351', '4424c5d6-5751-4038-aa39-bd85895ddb78', '11000000-0000-0000-0000-000000000006', 1, 60, 8, 7),
  ('ce100000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-000000000351', '4424c5d6-5751-4038-aa39-bd85895ddb78', '11000000-0000-0000-0000-000000000006', 2, 62.5, 8, 8),
  ('ce100000-0000-0000-0000-000000000003', 'ce000000-0000-0000-0000-000000000351', '4424c5d6-5751-4038-aa39-bd85895ddb78', '11000000-0000-0000-0000-000000000007', 3, 45, 10, 7),
  ('ce100000-0000-0000-0000-000000000004', 'ce000000-0000-0000-0000-000000000351', '4424c5d6-5751-4038-aa39-bd85895ddb78', '11000000-0000-0000-0000-000000000007', 4, 47.5, 10, 8),
  ('ce100000-0000-0000-0000-000000000005', 'ce000000-0000-0000-0000-000000000352', '4424c5d6-5751-4038-aa39-bd85895ddb78', '11000000-0000-0000-0000-000000000001', 1, 70, 8, 7),
  ('ce100000-0000-0000-0000-000000000006', 'ce000000-0000-0000-0000-000000000352', '4424c5d6-5751-4038-aa39-bd85895ddb78', '11000000-0000-0000-0000-000000000002', 2, 60, 8, 7),
  ('ce100000-0000-0000-0000-000000000007', 'ce000000-0000-0000-0000-000000000353', '4424c5d6-5751-4038-aa39-bd85895ddb78', '11000000-0000-0000-0000-000000000006', 1, 62.5, 8, 8),
  ('ce100000-0000-0000-0000-000000000008', 'ce000000-0000-0000-0000-000000000353', '4424c5d6-5751-4038-aa39-bd85895ddb78', '11000000-0000-0000-0000-000000000007', 2, 47.5, 10, 8)
ON CONFLICT (id) DO UPDATE SET
  session_id = EXCLUDED.session_id,
  user_id = EXCLUDED.user_id,
  exercise_id = EXCLUDED.exercise_id,
  set_number = EXCLUDED.set_number,
  weight_kg = EXCLUDED.weight_kg,
  reps = EXCLUDED.reps,
  rpe = EXCLUDED.rpe;

-- Zone totals for workouts in the last week.
WITH recent_sessions AS (
  SELECT id, duration_s
  FROM public.activity_sessions
  WHERE user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
    AND name LIKE 'Demo cardio evolution:%'
    AND start_time >= now() - INTERVAL '7 days'
    AND avg_heart_rate BETWEEN 40 AND 220
),
zone_fractions AS (
  SELECT * FROM (VALUES
    (1::smallint, 0.10::numeric),
    (2::smallint, 0.45::numeric),
    (3::smallint, 0.30::numeric),
    (4::smallint, 0.12::numeric),
    (5::smallint, 0.03::numeric)
  ) AS zones(zone, fraction)
)
INSERT INTO public.activity_heart_rate_zones (session_id, zone, duration_s, percentage)
SELECT
  recent_sessions.id,
  zone_fractions.zone,
  round(recent_sessions.duration_s * zone_fractions.fraction)::integer,
  (zone_fractions.fraction * 100)::numeric(5,2)
FROM recent_sessions
CROSS JOIN zone_fractions;

-- Sparse but paired samples for the latest long run and ride. They let the UI
-- test its conservative within-session output/heart-rate stability calculation.
WITH stream_fixtures AS (
  SELECT fixtures.*, sessions.duration_s
  FROM (VALUES
    ('ce000000-0000-0000-0000-000000000051'::uuid, 'running'::text, 3.09::numeric, 3.13::numeric),
    ('ce000000-0000-0000-0000-000000000151'::uuid, 'cycling'::text, 155::numeric, 157::numeric),
    ('ce000000-0000-0000-0000-000000000451'::uuid, 'football'::text, NULL::numeric, NULL::numeric)
  ) AS fixtures(session_id, sport_type, late_output, early_output)
  JOIN public.activity_sessions AS sessions ON sessions.id = fixtures.session_id
),
sample_points AS (
  SELECT
    stream_fixtures.*,
    point.offset_s,
    CASE
      WHEN stream_fixtures.sport_type = 'football' AND point.offset_s % 360 = 300 THEN 176
      WHEN stream_fixtures.sport_type = 'football' AND point.offset_s > 0 AND point.offset_s % 360 = 0 THEN 150
      WHEN stream_fixtures.sport_type = 'football' THEN 145
      WHEN point.offset_s < stream_fixtures.duration_s / 2 THEN 144
      ELSE 152
    END::numeric AS heart_rate
  FROM stream_fixtures
  CROSS JOIN LATERAL generate_series(
    0,
    stream_fixtures.duration_s - CASE WHEN stream_fixtures.sport_type = 'football' THEN 30 ELSE 60 END,
    CASE WHEN stream_fixtures.sport_type = 'football' THEN 30 ELSE 60 END
  ) AS point(offset_s)
)
INSERT INTO public.activity_stream_samples (session_id, user_id, stream_type, offset_s, value, unit, source)
SELECT
  session_id,
  '4424c5d6-5751-4038-aa39-bd85895ddb78',
  samples.stream_type::public.stream_type_enum,
  offset_s,
  samples.value,
  samples.unit,
  'manual'
FROM sample_points
CROSS JOIN LATERAL (
  VALUES
    ('heart_rate', heart_rate, 'bpm'),
    (
      CASE WHEN sport_type = 'cycling' THEN 'power' ELSE 'speed' END,
      CASE WHEN offset_s < duration_s / 2 THEN early_output ELSE late_output END,
      CASE WHEN sport_type = 'cycling' THEN 'w' ELSE 'm/s' END
    )
) AS samples(stream_type, value, unit)
WHERE samples.stream_type = 'heart_rate' OR sport_type <> 'football';
