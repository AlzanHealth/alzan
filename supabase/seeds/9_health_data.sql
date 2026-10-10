-- ============================================================
-- 9_health_data.sql — Sleep sessions, stages, biomarkers,
-- daily steps, step intervals, and daily recovery for Alice
-- ============================================================

-- Use Alice's user_id
-- 4424c5d6-5751-4038-aa39-bd85895ddb78

-- ---------------------------------------------------------------------------
-- Heart-rate zone settings demo data (safe to re-run)
-- Includes 60-day HR streams, repeatable high efforts, a single-sample artifact,
-- and activity summaries without detailed samples for algorithm coverage.
-- ---------------------------------------------------------------------------
DELETE FROM public.activity_sessions
WHERE id IN (
  'ca000000-0000-0000-0001-000000000001',
  'ca000000-0000-0000-0001-000000000002',
  'ca000000-0000-0000-0001-000000000003',
  'ca000000-0000-0000-0001-000000000004',
  'ca000000-0000-0000-0001-000000000005',
  'ca000000-0000-0000-0001-000000000006',
  'ca000000-0000-0000-0001-000000000007',
  'ca000000-0000-0000-0001-000000000008'
);

DELETE FROM public.resting_hr_logs
WHERE id IN (
  'cb000000-0000-0000-0001-000000000001',
  'cb000000-0000-0000-0001-000000000002',
  'cb000000-0000-0000-0001-000000000003',
  'cb000000-0000-0000-0001-000000000004',
  'cb000000-0000-0000-0001-000000000005'
);

INSERT INTO public.resting_hr_logs (id, user_id, measured_at, resting_hr_bpm, source) VALUES
('cb000000-0000-0000-0001-000000000001','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - INTERVAL '4 days',58,'manual'),
('cb000000-0000-0000-0001-000000000002','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - INTERVAL '3 days',56,'garmin'),
('cb000000-0000-0000-0001-000000000003','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - INTERVAL '2 days',55,'garmin'),
('cb000000-0000-0000-0001-000000000004','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - INTERVAL '1 day',54,'garmin'),
('cb000000-0000-0000-0001-000000000005','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE,53,'garmin');

INSERT INTO public.activity_sessions (
  id, user_id, sport_type, start_time, end_time, duration_s, name,
  avg_heart_rate, max_heart_rate, source, status, timezone
) VALUES
('ca000000-0000-0000-0001-000000000001','4424c5d6-5751-4038-aa39-bd85895ddb78','running',CURRENT_DATE - INTERVAL '58 days',CURRENT_DATE - INTERVAL '58 days' + INTERVAL '35 minutes',2100,'Demo HR easy run · 58d',108,126,'garmin','completed','Europe/Madrid'),
('ca000000-0000-0000-0001-000000000002','4424c5d6-5751-4038-aa39-bd85895ddb78','running',CURRENT_DATE - INTERVAL '49 days',CURRENT_DATE - INTERVAL '49 days' + INTERVAL '42 minutes',2520,'Demo HR steady run · 49d',132,148,'garmin','completed','Europe/Madrid'),
('ca000000-0000-0000-0001-000000000003','4424c5d6-5751-4038-aa39-bd85895ddb78','cycling',CURRENT_DATE - INTERVAL '40 days',CURRENT_DATE - INTERVAL '40 days' + INTERVAL '50 minutes',3000,'Demo HR tempo ride · 40d',151,169,'garmin','completed','Europe/Madrid'),
('ca000000-0000-0000-0001-000000000004','4424c5d6-5751-4038-aa39-bd85895ddb78','running',CURRENT_DATE - INTERVAL '30 days',CURRENT_DATE - INTERVAL '30 days' + INTERVAL '31 minutes',1860,'Demo HR intervals · 30d',164,181,'garmin','completed','Europe/Madrid'),
('ca000000-0000-0000-0001-000000000005','4424c5d6-5751-4038-aa39-bd85895ddb78','running',CURRENT_DATE - INTERVAL '14 days',CURRENT_DATE - INTERVAL '14 days' + INTERVAL '28 minutes',1680,'Demo HR high effort · 14d',174,198,'garmin','completed','Europe/Madrid'),
('ca000000-0000-0000-0001-000000000006','4424c5d6-5751-4038-aa39-bd85895ddb78','running',CURRENT_DATE - INTERVAL '9 days',CURRENT_DATE - INTERVAL '9 days' + INTERVAL '32 minutes',1920,'Demo HR repeated effort · 9d',170,196,'garmin','completed','Europe/Madrid'),
('ca000000-0000-0000-0001-000000000007','4424c5d6-5751-4038-aa39-bd85895ddb78','cycling',CURRENT_DATE - INTERVAL '4 days',CURRENT_DATE - INTERVAL '4 days' + INTERVAL '40 minutes',2400,'Demo HR artifact · 4d',145,248,'garmin','completed','Europe/Madrid'),
('ca000000-0000-0000-0001-000000000008','4424c5d6-5751-4038-aa39-bd85895ddb78','running',CURRENT_DATE - INTERVAL '1 day',CURRENT_DATE - INTERVAL '1 day' + INTERVAL '28 minutes',1680,'Demo HR summary only · 1d',138,177,'manual','completed','Europe/Madrid');

DELETE FROM public.activity_stream_samples
WHERE session_id IN (
  'ca000000-0000-0000-0001-000000000001', 'ca000000-0000-0000-0001-000000000002',
  'ca000000-0000-0000-0001-000000000003', 'ca000000-0000-0000-0001-000000000004',
  'ca000000-0000-0000-0001-000000000005', 'ca000000-0000-0000-0001-000000000006',
  'ca000000-0000-0000-0001-000000000007', 'ca000000-0000-0000-0001-000000000008'
);

INSERT INTO public.activity_stream_samples (session_id, user_id, stream_type, offset_s, value, unit, source)
SELECT session_id, '4424c5d6-5751-4038-aa39-bd85895ddb78', 'heart_rate', sample_offset.offset_s, sample.value, 'bpm', 'garmin'
FROM (VALUES
  ('ca000000-0000-0000-0001-000000000001'::uuid, ARRAY[100,105,108,112,118,126]::numeric[]),
  ('ca000000-0000-0000-0001-000000000002'::uuid, ARRAY[110,120,132,140,148,144]::numeric[]),
  ('ca000000-0000-0000-0001-000000000003'::uuid, ARRAY[120,140,151,160,169,165]::numeric[]),
  ('ca000000-0000-0000-0001-000000000004'::uuid, ARRAY[125,145,164,174,181,178]::numeric[]),
  ('ca000000-0000-0000-0001-000000000005'::uuid, ARRAY[130,155,174,190,196,198,196,195]::numeric[]),
  ('ca000000-0000-0000-0001-000000000006'::uuid, ARRAY[132,158,176,188,194,196,195]::numeric[]),
  ('ca000000-0000-0000-0001-000000000007'::uuid, ARRAY[120,135,145,151,248,149]::numeric[])
) AS session_samples(session_id, heart_rates)
CROSS JOIN LATERAL unnest(session_samples.heart_rates) WITH ORDINALITY AS sample(value, sample_number)
CROSS JOIN LATERAL (SELECT ((sample.sample_number - 1) * 300)::integer AS offset_s) AS sample_offset;

-- ---------------------------------------------------------------------------
-- sleep_sessions (14 nights for Alice, last 14 days)
-- ---------------------------------------------------------------------------
INSERT INTO public.sleep_sessions (id, user_id, source, date, timezone, start_time, end_time, is_main_sleep, is_nap,
  duration_in_bed_min, total_sleep_min, awake_min, light_sleep_min, deep_sleep_min, rem_sleep_min,
  sleep_latency_min, number_of_awakenings, sleep_efficiency_pct, sleep_score,
  avg_heart_rate_bpm, min_heart_rate_bpm, max_heart_rate_bpm, resting_hr_bpm,
  avg_hrv_ms, avg_respiratory_rpm, avg_spo2_pct, data_quality, source_sleep_id) VALUES
-- Night 1 (today - 13 days)
('dd000000-0000-0000-0001-000000000001','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 13,'Europe/Madrid',
 (CURRENT_DATE - 13) + TIME '23:15' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 12) + TIME '07:05' AT TIME ZONE 'Europe/Madrid',
 true,false,470,422,48,185,98,139,12,3,89.8,82,54,48,72,58,42,15.2,97.1,'complete','garmin-sleep-001'),
-- Night 2
('dd000000-0000-0000-0001-000000000002','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 12,'Europe/Madrid',
 (CURRENT_DATE - 12) + TIME '23:45' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 11) + TIME '06:30' AT TIME ZONE 'Europe/Madrid',
 true,false,405,368,37,162,85,121,8,2,90.9,78,52,46,70,56,38,15.4,97.3,'complete','garmin-sleep-002'),
-- Night 3
('dd000000-0000-0000-0001-000000000003','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 11,'Europe/Madrid',
 (CURRENT_DATE - 11) + TIME '00:10' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 10) + TIME '07:40' AT TIME ZONE 'Europe/Madrid',
 true,false,450,395,55,175,90,130,15,4,87.8,75,55,49,73,60,45,15.0,96.8,'complete','garmin-sleep-003'),
-- Night 4 (bad night)
('dd000000-0000-0000-0001-000000000004','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 10,'Europe/Madrid',
 (CURRENT_DATE - 10) + TIME '01:20' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 9) + TIME '06:15' AT TIME ZONE 'Europe/Madrid',
 true,false,295,248,47,128,52,68,18,6,84.1,58,58,52,76,62,32,16.1,96.2,'complete','garmin-sleep-004'),
-- Night 5
('dd000000-0000-0000-0001-000000000005','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 9,'Europe/Madrid',
 (CURRENT_DATE - 9) + TIME '23:00' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 8) + TIME '07:20' AT TIME ZONE 'Europe/Madrid',
 true,false,500,458,42,198,108,152,10,2,91.6,85,51,45,68,55,44,14.8,97.5,'complete','garmin-sleep-005'),
-- Night 6
('dd000000-0000-0000-0001-000000000006','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 8,'Europe/Madrid',
 (CURRENT_DATE - 8) + TIME '23:30' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 7) + TIME '07:00' AT TIME ZONE 'Europe/Madrid',
 true,false,450,410,40,180,95,135,9,2,91.1,80,53,47,71,57,41,15.1,97.2,'complete','garmin-sleep-006'),
-- Night 7
('dd000000-0000-0000-0001-000000000007','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 7,'Europe/Madrid',
 (CURRENT_DATE - 7) + TIME '22:45' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 6) + TIME '06:50' AT TIME ZONE 'Europe/Madrid',
 true,false,485,440,45,192,102,146,11,3,90.7,83,52,46,69,56,43,15.0,97.4,'complete','garmin-sleep-007'),
-- Night 8
('dd000000-0000-0000-0001-000000000008','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 6,'Europe/Madrid',
 (CURRENT_DATE - 6) + TIME '23:50' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 5) + TIME '07:10' AT TIME ZONE 'Europe/Madrid',
 true,false,440,392,48,172,88,132,14,3,89.1,77,54,48,72,58,40,15.3,97.0,'complete','garmin-sleep-008'),
-- Night 9
('dd000000-0000-0000-0001-000000000009','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 5,'Europe/Madrid',
 (CURRENT_DATE - 5) + TIME '23:20' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 4) + TIME '07:30' AT TIME ZONE 'Europe/Madrid',
 true,false,490,448,42,196,105,147,10,2,91.4,84,51,45,68,55,44,14.9,97.5,'complete','garmin-sleep-009'),
-- Night 10 (bad night)
('dd000000-0000-0000-0001-000000000010','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 4,'Europe/Madrid',
 (CURRENT_DATE - 4) + TIME '00:45' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 3) + TIME '05:50' AT TIME ZONE 'Europe/Madrid',
 true,false,305,258,47,135,55,68,20,5,84.6,60,57,51,75,61,33,16.0,96.4,'complete','garmin-sleep-010'),
-- Night 11
('dd000000-0000-0000-0001-000000000011','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 3,'Europe/Madrid',
 (CURRENT_DATE - 3) + TIME '23:10' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 2) + TIME '07:25' AT TIME ZONE 'Europe/Madrid',
 true,false,495,450,45,197,106,147,12,3,90.9,83,52,46,69,56,43,15.0,97.3,'complete','garmin-sleep-011'),
-- Night 12
('dd000000-0000-0000-0001-000000000012','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 2,'Europe/Madrid',
 (CURRENT_DATE - 2) + TIME '23:35' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 1) + TIME '07:15' AT TIME ZONE 'Europe/Madrid',
 true,false,460,418,42,184,96,138,10,2,90.9,81,53,47,70,57,42,15.1,97.2,'complete','garmin-sleep-012'),
-- Night 13 (last night)
('dd000000-0000-0000-0001-000000000013','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 1,'Europe/Madrid',
 (CURRENT_DATE - 1) + TIME '23:00' AT TIME ZONE 'Europe/Madrid',
 CURRENT_DATE + TIME '07:00' AT TIME ZONE 'Europe/Madrid',
 true,false,480,438,42,190,102,146,11,2,91.3,84,51,45,68,55,44,14.9,97.4,'complete','garmin-sleep-013'),
-- Night 14 (nap example)
('dd000000-0000-0000-0001-000000000014','4424c5d6-5751-4038-aa39-bd85895ddb78','garmin',CURRENT_DATE - 5,'Europe/Madrid',
 (CURRENT_DATE - 5) + TIME '14:00' AT TIME ZONE 'Europe/Madrid',
 (CURRENT_DATE - 5) + TIME '14:45' AT TIME ZONE 'Europe/Madrid',
 false,true,45,38,7,22,10,6,3,0,84.4,NULL,56,50,74,NULL,NULL,NULL,NULL,'complete','garmin-sleep-014');

-- ---------------------------------------------------------------------------
-- sleep_stage_intervals (for 3 representative nights)
-- ---------------------------------------------------------------------------
-- Night 13 (last night) — full hypnogram
INSERT INTO public.sleep_stage_intervals (id, user_id, sleep_session_id, source, start_time, end_time, duration_min, stage) VALUES
('ee000000-0000-0000-0001-000000000001','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE - 1) + TIME '23:11' AT TIME ZONE 'Europe/Madrid', (CURRENT_DATE) + TIME '00:05' AT TIME ZONE 'Europe/Madrid', 54, 'light'),
('ee000000-0000-0000-0001-000000000002','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '00:05' AT TIME ZONE 'Europe/Madrid', (CURRENT_DATE) + TIME '01:20' AT TIME ZONE 'Europe/Madrid', 75, 'deep'),
('ee000000-0000-0000-0001-000000000003','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '01:20' AT TIME ZONE 'Europe/Madrid', (CURRENT_DATE) + TIME '01:35' AT TIME ZONE 'Europe/Madrid', 15, 'awake'),
('ee000000-0000-0000-0001-000000000004','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '01:35' AT TIME ZONE 'Europe/Madrid', (CURRENT_DATE) + TIME '03:10' AT TIME ZONE 'Europe/Madrid', 95, 'rem'),
('ee000000-0000-0000-0001-000000000005','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '03:10' AT TIME ZONE 'Europe/Madrid', (CURRENT_DATE) + TIME '04:30' AT TIME ZONE 'Europe/Madrid', 80, 'light'),
('ee000000-0000-0000-0001-000000000006','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '04:30' AT TIME ZONE 'Europe/Madrid', (CURRENT_DATE) + TIME '05:15' AT TIME ZONE 'Europe/Madrid', 45, 'deep'),
('ee000000-0000-0000-0001-000000000007','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '05:15' AT TIME ZONE 'Europe/Madrid', (CURRENT_DATE) + TIME '06:10' AT TIME ZONE 'Europe/Madrid', 55, 'rem'),
('ee000000-0000-0000-0001-000000000008','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '06:10' AT TIME ZONE 'Europe/Madrid', (CURRENT_DATE) + TIME '07:00' AT TIME ZONE 'Europe/Madrid', 50, 'light');

-- ---------------------------------------------------------------------------
-- sleep_biomarker_samples (HR + HRV for last night)
-- ---------------------------------------------------------------------------
INSERT INTO public.sleep_biomarker_samples (id, user_id, sleep_session_id, source, timestamp, metric_type, value, unit) VALUES
('ff000000-0000-0000-0001-000000000001','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '00:00' AT TIME ZONE 'Europe/Madrid', 'heart_rate', 52, 'bpm'),
('ff000000-0000-0000-0001-000000000002','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '01:00' AT TIME ZONE 'Europe/Madrid', 'heart_rate', 48, 'bpm'),
('ff000000-0000-0000-0001-000000000003','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '03:00' AT TIME ZONE 'Europe/Madrid', 'heart_rate', 46, 'bpm'),
('ff000000-0000-0000-0001-000000000004','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '05:00' AT TIME ZONE 'Europe/Madrid', 'heart_rate', 50, 'bpm'),
('ff000000-0000-0000-0001-000000000005','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '00:00' AT TIME ZONE 'Europe/Madrid', 'hrv_rmssd', 58, 'ms'),
('ff000000-0000-0000-0001-000000000006','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '02:00' AT TIME ZONE 'Europe/Madrid', 'hrv_rmssd', 62, 'ms'),
('ff000000-0000-0000-0001-000000000007','4424c5d6-5751-4038-aa39-bd85895ddb78','dd000000-0000-0000-0001-000000000013','garmin',
 (CURRENT_DATE) + TIME '04:00' AT TIME ZONE 'Europe/Madrid', 'hrv_rmssd', 55, 'ms');

-- ---------------------------------------------------------------------------
-- daily_steps (12 months for Alice)
-- ---------------------------------------------------------------------------
INSERT INTO public.daily_steps (id, user_id, date, timezone, source, total_steps, distance_m, calories_kcal,
  active_calories_kcal, sedentary_minutes, lightly_active_min, fairly_active_min, very_active_min,
  step_goal, goal_achieved, data_quality, source_channel, source_package, source_provider_key, source_record_id)
SELECT
  gen_random_uuid(),
  '4424c5d6-5751-4038-aa39-bd85895ddb78',
  day::date,
  'Europe/Madrid',
  'garmin',
  steps.total_steps,
  round(steps.total_steps * 0.72),
  round(steps.total_steps * 0.045),
  round(steps.total_steps * 0.022),
  greatest(420, 780 - round(steps.total_steps / 75.0))::integer,
  greatest(55, round(steps.total_steps / 52.0))::integer,
  greatest(8, round(steps.total_steps / 170.0))::integer,
  greatest(0, round((steps.total_steps - 7000) / 130.0))::integer,
  10000,
  steps.total_steps >= 10000,
  (CASE WHEN day::date = CURRENT_DATE THEN 'partial' ELSE 'complete' END)::public.health_data_quality_enum,
  'cloud',
  NULL,
  'garmin-connect',
  'garmin-steps-' || to_char(day::date, 'YYYY-MM-DD')
FROM generate_series(CURRENT_DATE - 364, CURRENT_DATE, INTERVAL '1 day') AS days(day)
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN day::date = CURRENT_DATE - 2 THEN 22234
    ELSE greatest(
      1800,
      least(
        24500,
        round(
          7600
          + (1400 * sin((extract(doy from day)::numeric / 365) * 2 * pi() + 0.5))
          + CASE
              WHEN extract(dow from day) = 0 THEN -1800
              WHEN extract(dow from day) = 6 THEN 2400
              WHEN extract(dow from day) = 2 THEN 1300
              ELSE 0
            END
          + (900 * sin((CURRENT_DATE - day::date) / 5.5))
          + ((365 - (CURRENT_DATE - day::date)) * 2.5)
          + CASE WHEN extract(month from day) IN (3, 4, 9, 10) THEN 900 ELSE 0 END
        )
      )
    )
  END::integer AS total_steps
) AS steps
WHERE NOT EXISTS (
  SELECT 1
  FROM public.daily_steps existing_steps
  WHERE existing_steps.user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
    AND existing_steps.date = day::date
    AND existing_steps.source = 'garmin'
    AND existing_steps.source_package IS NULL
);

-- ---------------------------------------------------------------------------
-- daily_recovery (7 days for Alice, linked to sleep sessions)
-- ---------------------------------------------------------------------------
INSERT INTO public.daily_recovery (id, user_id, date, timezone, source, sleep_session_id,
  recovery_score, readiness_score, sleep_score, resting_hr_bpm, avg_hrv_ms,
  respiratory_rate_rpm, spo2_avg_pct, recovery_label, data_quality, source_record_id) VALUES
('00800000-0000-0000-0001-000000000001','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 6,'Europe/Madrid','garmin',
 'dd000000-0000-0000-0001-000000000007',78,75,83,56,43,15.0,97.4,'Good','complete','garmin-rec-001'),
('00800000-0000-0000-0001-000000000002','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 5,'Europe/Madrid','garmin',
 'dd000000-0000-0000-0001-000000000008',72,68,77,58,40,15.3,97.0,'Moderate','complete','garmin-rec-002'),
('00800000-0000-0000-0001-000000000003','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 4,'Europe/Madrid','garmin',
 'dd000000-0000-0000-0001-000000000009',85,82,84,55,44,14.9,97.5,'Good','complete','garmin-rec-003'),
('00800000-0000-0000-0001-000000000004','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 3,'Europe/Madrid','garmin',
 'dd000000-0000-0000-0001-000000000010',45,42,60,61,33,16.0,96.4,'Poor','complete','garmin-rec-004'),
('00800000-0000-0000-0001-000000000005','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 2,'Europe/Madrid','garmin',
 'dd000000-0000-0000-0001-000000000011',82,80,83,56,43,15.0,97.3,'Good','complete','garmin-rec-005'),
('00800000-0000-0000-0001-000000000006','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 1,'Europe/Madrid','garmin',
 'dd000000-0000-0000-0001-000000000012',79,76,81,57,42,15.1,97.2,'Good','complete','garmin-rec-006'),
('00800000-0000-0000-0001-000000000007','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE,'Europe/Madrid','garmin',
 'dd000000-0000-0000-0001-000000000013',86,84,84,55,44,14.9,97.4,'Excellent','complete','garmin-rec-007');

-- ---------------------------------------------------------------------------
-- weight_logs (14 days of weight logs for Roberto/Alice)
-- ---------------------------------------------------------------------------
INSERT INTO public.weight_logs (id, user_id, measured_at, weight_kg, bodyfat_percent, muscle_mass_kg, source) VALUES
('cc000000-0000-0000-0001-000000000001', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 13) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 75.2, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000002', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 12) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 75.0, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000003', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 11) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 74.8, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000004', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 10) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 74.9, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000005', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 9) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 74.6, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000006', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 8) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 74.5, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000007', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 7) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 76.5, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000008', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 6) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 74.2, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000009', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 5) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 74.3, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000010', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 4) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 74.1, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000011', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 3) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 73.9, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000012', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 2) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 79.0, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000013', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 1) + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 73.7, NULL, NULL, 'manual'),
('cc000000-0000-0000-0001-000000000014', '4424c5d6-5751-4038-aa39-bd85895ddb78', CURRENT_DATE + TIME '08:00' AT TIME ZONE 'Europe/Madrid', 73.6, NULL, NULL, 'manual')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- body_measurements (14 days of measurements: chest, arm, thigh, hips, abdomen)
-- ---------------------------------------------------------------------------
INSERT INTO public.body_measurements (id, user_id, measured_at, measurement_type, value_cm, notes) VALUES
-- Day 1 (CURRENT_DATE - 13)
('bb000000-0000-0000-0001-000000000001', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 13) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 85.0, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000002', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 13) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 95.0, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000003', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 13) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 98.0, 'Seed chest'),
('bb000000-0000-0000-0001-000000000004', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 13) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 34.0, 'Seed arm'),
('bb000000-0000-0000-0001-000000000005', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 13) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 56.0, 'Seed thigh'),

-- Day 2 (CURRENT_DATE - 12)
('bb000000-0000-0000-0001-000000000006', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 12) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 84.8, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000007', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 12) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 94.8, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000008', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 12) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 97.8, 'Seed chest'),
('bb000000-0000-0000-0001-000000000009', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 12) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 34.0, 'Seed arm'),
('bb000000-0000-0000-0001-000000000010', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 12) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 55.8, 'Seed thigh'),

-- Day 3 (CURRENT_DATE - 11)
('bb000000-0000-0000-0001-000000000011', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 11) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 84.6, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000012', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 11) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 94.6, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000013', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 11) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 97.6, 'Seed chest'),
('bb000000-0000-0000-0001-000000000014', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 11) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.9, 'Seed arm'),
('bb000000-0000-0000-0001-000000000015', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 11) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 55.6, 'Seed thigh'),

-- Day 4 (CURRENT_DATE - 10)
('bb000000-0000-0000-0001-000000000016', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 10) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 84.5, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000017', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 10) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 94.5, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000018', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 10) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 97.5, 'Seed chest'),
('bb000000-0000-0000-0001-000000000019', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 10) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.8, 'Seed arm'),
('bb000000-0000-0000-0001-000000000020', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 10) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 55.5, 'Seed thigh'),

-- Day 5 (CURRENT_DATE - 9)
('bb000000-0000-0000-0001-000000000021', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 9) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 84.3, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000022', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 9) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 94.3, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000023', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 9) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 97.3, 'Seed chest'),
('bb000000-0000-0000-0001-000000000024', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 9) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.8, 'Seed arm'),
('bb000000-0000-0000-0001-000000000025', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 9) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 55.3, 'Seed thigh'),

-- Day 6 (CURRENT_DATE - 8)
('bb000000-0000-0000-0001-000000000026', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 8) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 84.0, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000027', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 8) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 94.0, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000028', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 8) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 97.0, 'Seed chest'),
('bb000000-0000-0000-0001-000000000029', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 8) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.7, 'Seed arm'),
('bb000000-0000-0000-0001-000000000030', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 8) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 55.0, 'Seed thigh'),

-- Day 7 (CURRENT_DATE - 7) -- Increased risk day (abdomen = 92 -> ratio 0.53)
('bb000000-0000-0000-0001-000000000031', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 7) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 92.0, 'Increased risk waist'),
('bb000000-0000-0000-0001-000000000032', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 7) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 96.0, 'Increased risk hips'),
('bb000000-0000-0000-0001-000000000033', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 7) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 100.0, 'Increased risk chest'),
('bb000000-0000-0000-0001-000000000034', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 7) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 35.0, 'Increased risk arm'),
('bb000000-0000-0000-0001-000000000035', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 7) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 57.0, 'Increased risk thigh'),

-- Day 8 (CURRENT_DATE - 6)
('bb000000-0000-0000-0001-000000000036', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 6) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 83.8, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000037', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 6) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 93.8, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000038', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 6) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 96.8, 'Seed chest'),
('bb000000-0000-0000-0001-000000000039', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 6) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.6, 'Seed arm'),
('bb000000-0000-0000-0001-000000000040', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 6) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 54.8, 'Seed thigh'),

-- Day 9 (CURRENT_DATE - 5)
('bb000000-0000-0000-0001-000000000041', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 5) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 83.6, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000042', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 5) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 93.6, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000043', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 5) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 96.6, 'Seed chest'),
('bb000000-0000-0000-0001-000000000044', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 5) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.5, 'Seed arm'),
('bb000000-0000-0000-0001-000000000045', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 5) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 54.6, 'Seed thigh'),

-- Day 10 (CURRENT_DATE - 4)
('bb000000-0000-0000-0001-000000000046', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 4) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 83.5, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000047', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 4) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 93.5, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000048', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 4) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 96.5, 'Seed chest'),
('bb000000-0000-0000-0001-000000000049', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 4) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.4, 'Seed arm'),
('bb000000-0000-0000-0001-000000000050', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 4) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 54.5, 'Seed thigh'),

-- Day 11 (CURRENT_DATE - 3)
('bb000000-0000-0000-0001-000000000051', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 3) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 83.3, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000052', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 3) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 93.3, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000053', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 3) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 96.3, 'Seed chest'),
('bb000000-0000-0000-0001-000000000054', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 3) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.3, 'Seed arm'),
('bb000000-0000-0000-0001-000000000055', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 3) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 54.3, 'Seed thigh'),

-- Day 12 (CURRENT_DATE - 2) -- High risk day (abdomen = 106 -> ratio 0.61)
('bb000000-0000-0000-0001-000000000056', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 2) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 106.0, 'High risk waist'),
('bb000000-0000-0000-0001-000000000057', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 2) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 98.0, 'High risk hips'),
('bb000000-0000-0000-0001-000000000058', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 2) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 102.0, 'High risk chest'),
('bb000000-0000-0000-0001-000000000059', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 2) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 36.0, 'High risk arm'),
('bb000000-0000-0000-0001-000000000060', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 2) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 58.0, 'High risk thigh'),

-- Day 13 (CURRENT_DATE - 1)
('bb000000-0000-0000-0001-000000000061', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 1) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 83.0, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000062', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 1) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 93.0, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000063', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 1) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 96.0, 'Seed chest'),
('bb000000-0000-0000-0001-000000000064', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 1) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.2, 'Seed arm'),
('bb000000-0000-0000-0001-000000000065', '4424c5d6-5751-4038-aa39-bd85895ddb78', (CURRENT_DATE - 1) + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 54.0, 'Seed thigh'),

-- Day 14 (CURRENT_DATE)
('bb000000-0000-0000-0001-000000000066', '4424c5d6-5751-4038-aa39-bd85895ddb78', CURRENT_DATE + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'abdomen', 82.8, 'Seed normal waist'),
('bb000000-0000-0000-0001-000000000067', '4424c5d6-5751-4038-aa39-bd85895ddb78', CURRENT_DATE + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'hips', 92.8, 'Seed normal hips'),
('bb000000-0000-0000-0001-000000000068', '4424c5d6-5751-4038-aa39-bd85895ddb78', CURRENT_DATE + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'chest', 95.8, 'Seed chest'),
('bb000000-0000-0000-0001-000000000069', '4424c5d6-5751-4038-aa39-bd85895ddb78', CURRENT_DATE + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'arm', 33.0, 'Seed arm'),
('bb000000-0000-0000-0001-000000000070', '4424c5d6-5751-4038-aa39-bd85895ddb78', CURRENT_DATE + TIME '08:05' AT TIME ZONE 'Europe/Madrid', 'thigh', 53.8, 'Seed thigh')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Recalculate body composition logs for abdominal health
-- ---------------------------------------------------------------------------
WITH latest_abdomen AS (
  SELECT DISTINCT ON (m.user_id, m.measured_at::date)
    m.user_id,
    m.measured_at,
    m.measured_at::date AS calculated_for_date,
    m.value_cm AS abdomen_cm,
    u.height_cm,
    u.sex,
    u.date_of_birth
  FROM public.body_measurements m
  JOIN public.users u ON u.id = m.user_id
  WHERE m.measurement_type = 'abdomen'
    AND m.value_cm BETWEEN 40 AND 200
    AND u.height_cm > 0
  ORDER BY m.user_id, m.measured_at::date, m.measured_at DESC
),
computed AS (
  SELECT
    abdomen.user_id,
    abdomen.calculated_for_date,
    abdomen.abdomen_cm,
    abdomen.height_cm,
    abdomen.sex,
    hips.value_cm AS hips_cm,
    EXTRACT(YEAR FROM age(abdomen.calculated_for_date, abdomen.date_of_birth))::integer AS age_years,
    recent_weight.id AS source_weight_log_id,
    recent_weight.weight_kg AS weight_kg_used,
    round((abdomen.abdomen_cm / abdomen.height_cm)::numeric, 2) AS waist_to_height_ratio,
    CASE
      WHEN abdomen.abdomen_cm / abdomen.height_cm < 0.40 THEN 'low'
      WHEN abdomen.abdomen_cm / abdomen.height_cm < 0.50 THEN 'healthy'
      WHEN abdomen.abdomen_cm / abdomen.height_cm < 0.60 THEN 'increased_risk'
      ELSE 'high_risk'
    END AS waist_to_height_category,
    CASE
      WHEN hips.value_cm IS NULL OR abdomen.sex NOT IN ('male', 'female') THEN NULL
      ELSE round((abdomen.abdomen_cm / hips.value_cm)::numeric, 2)
    END AS waist_to_hip_ratio,
    CASE
      WHEN hips.value_cm IS NULL OR abdomen.sex NOT IN ('male', 'female') THEN NULL
      WHEN abdomen.sex = 'female' AND abdomen.abdomen_cm / hips.value_cm < 0.80 THEN 'healthy'
      WHEN abdomen.sex = 'female' AND abdomen.abdomen_cm / hips.value_cm < 0.85 THEN 'increased_risk'
      WHEN abdomen.sex = 'female' THEN 'high_risk'
      WHEN abdomen.abdomen_cm / hips.value_cm < 0.90 THEN 'healthy'
      WHEN abdomen.abdomen_cm / hips.value_cm < 1.00 THEN 'increased_risk'
      ELSE 'high_risk'
    END AS waist_to_hip_category
  FROM latest_abdomen abdomen
  LEFT JOIN LATERAL (
    SELECT h.value_cm
    FROM public.body_measurements h
    WHERE h.user_id = abdomen.user_id
      AND h.measurement_type = 'hips'
      AND h.value_cm BETWEEN 50 AND 200
      AND h.measured_at <= abdomen.measured_at
      AND h.measured_at >= abdomen.measured_at - interval '13 days'
    ORDER BY h.measured_at DESC
    LIMIT 1
  ) hips ON true
  LEFT JOIN LATERAL (
    SELECT w.id, w.weight_kg
    FROM public.weight_logs w
    WHERE w.user_id = abdomen.user_id
      AND w.weight_kg > 0
      AND w.measured_at <= abdomen.measured_at
      AND w.measured_at >= abdomen.measured_at - interval '13 days'
    ORDER BY w.measured_at DESC
    LIMIT 1
  ) recent_weight ON true
),
composition AS (
  SELECT
    computed.*,
    round((weight_kg_used / power(height_cm / 100.0, 2))::numeric, 1) AS bmi,
    round((
      CASE sex
        WHEN 'female' THEN 76 - 20 * (height_cm / abdomen_cm)
        ELSE 64 - 20 * (height_cm / abdomen_cm)
      END
    )::numeric, 1) AS bodyfat_percent,
    round((
      CASE sex
        WHEN 'female' THEN 2.89 + 0.255 * weight_kg_used - 0.175 * hips_cm - 0.038 * age_years + 0.118 * height_cm
        ELSE 39.5 + 0.665 * weight_kg_used - 0.185 * abdomen_cm - 0.418 * hips_cm - 0.08 * age_years
      END
    )::numeric, 1) AS muscle_mass_kg
  FROM computed
  WHERE weight_kg_used IS NOT NULL
    AND hips_cm IS NOT NULL
    AND age_years IS NOT NULL
    AND sex IN ('male', 'female')
)
INSERT INTO public.body_composition_logs (
  user_id,
  calculated_for_date,
  source_weight_log_id,
  weight_kg_used,
  bmi,
  bodyfat_percent,
  bodyfat_method,
  bodyfat_precision_level,
  bodyfat_formula,
  bodyfat_inputs,
  muscle_mass_kg,
  muscle_percent,
  muscle_method,
  muscle_precision_level,
  muscle_formula,
  muscle_inputs,
  waist_to_height_ratio,
  waist_to_height_category,
  waist_to_height_formula,
  waist_to_height_inputs,
  waist_to_hip_ratio,
  waist_to_hip_category,
  waist_to_hip_formula,
  waist_to_hip_inputs,
  calculation_version,
  calculation_status,
  input_snapshot
)
SELECT
  user_id,
  calculated_for_date,
  source_weight_log_id,
  weight_kg_used,
  CASE WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL ELSE bmi END,
  CASE WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL ELSE bodyfat_percent END,
  CASE WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL ELSE 'rfm' END,
  CASE WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL ELSE 3 END,
  CASE
    WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL
    WHEN sex = 'female' THEN 'RFM = 76 - 20 * (heightCm / abdomenCm)'
    ELSE 'RFM = 64 - 20 * (heightCm / abdomenCm)'
  END,
  CASE
    WHEN calculated_for_date = CURRENT_DATE - 13 THEN '[]'::jsonb
    ELSE jsonb_build_array('height', 'sex', 'abdomen')
  END,
  CASE WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL ELSE muscle_mass_kg END,
  CASE
    WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL
    ELSE round((muscle_mass_kg / weight_kg_used * 100)::numeric, 1)
  END,
  CASE WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL ELSE 'al_gindan' END,
  CASE WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL ELSE 3 END,
  CASE
    WHEN calculated_for_date = CURRENT_DATE - 13 THEN NULL
    WHEN sex = 'female' THEN 'SM = 2.89 + 0.255 * weight - 0.175 * hips - 0.038 * age + 0.118 * height'
    ELSE 'SM = 39.5 + 0.665 * weight - 0.185 * abdomen - 0.418 * hips - 0.08 * age'
  END,
  CASE
    WHEN calculated_for_date = CURRENT_DATE - 13 THEN '[]'::jsonb
    WHEN sex = 'female' THEN jsonb_build_array('weight', 'height', 'age', 'sex', 'hips')
    ELSE jsonb_build_array('weight', 'age', 'sex', 'abdomen', 'hips')
  END,
  waist_to_height_ratio,
  waist_to_height_category,
  'waistToHeight = abdomen / height',
  jsonb_build_array('height', 'abdomen'),
  waist_to_hip_ratio,
  waist_to_hip_category,
  CASE WHEN waist_to_hip_ratio IS NULL THEN NULL ELSE 'waistToHip = abdomen / hips' END,
  CASE WHEN waist_to_hip_ratio IS NULL THEN '[]'::jsonb ELSE jsonb_build_array('abdomen', 'hips', 'sex') END,
  1,
  CASE WHEN calculated_for_date = CURRENT_DATE - 13 THEN 'partial' ELSE 'complete' END,
  jsonb_build_object(
    'weightKg', weight_kg_used,
    'heightCm', height_cm,
    'age', age_years,
    'sex', sex,
    'measurements', jsonb_build_object('abdomen', abdomen_cm, 'hips', hips_cm)
  )
FROM composition
ON CONFLICT (user_id, calculated_for_date) DO UPDATE SET
  source_weight_log_id = EXCLUDED.source_weight_log_id,
  weight_kg_used = EXCLUDED.weight_kg_used,
  bmi = EXCLUDED.bmi,
  bodyfat_percent = EXCLUDED.bodyfat_percent,
  bodyfat_method = EXCLUDED.bodyfat_method,
  bodyfat_precision_level = EXCLUDED.bodyfat_precision_level,
  bodyfat_formula = EXCLUDED.bodyfat_formula,
  bodyfat_inputs = EXCLUDED.bodyfat_inputs,
  muscle_mass_kg = EXCLUDED.muscle_mass_kg,
  muscle_percent = EXCLUDED.muscle_percent,
  muscle_method = EXCLUDED.muscle_method,
  muscle_precision_level = EXCLUDED.muscle_precision_level,
  muscle_formula = EXCLUDED.muscle_formula,
  muscle_inputs = EXCLUDED.muscle_inputs,
  waist_to_height_ratio = EXCLUDED.waist_to_height_ratio,
  waist_to_height_category = EXCLUDED.waist_to_height_category,
  waist_to_height_formula = EXCLUDED.waist_to_height_formula,
  waist_to_height_inputs = EXCLUDED.waist_to_height_inputs,
  waist_to_hip_ratio = EXCLUDED.waist_to_hip_ratio,
  waist_to_hip_category = EXCLUDED.waist_to_hip_category,
  waist_to_hip_formula = EXCLUDED.waist_to_hip_formula,
  waist_to_hip_inputs = EXCLUDED.waist_to_hip_inputs,
  calculation_version = EXCLUDED.calculation_version,
  calculation_status = EXCLUDED.calculation_status,
  input_snapshot = EXCLUDED.input_snapshot,
  composition_calculated_at = now(),
  updated_at = now();
