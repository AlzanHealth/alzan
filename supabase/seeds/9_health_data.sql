-- ============================================================
-- 9_health_data.sql — Sleep sessions, stages, biomarkers,
-- daily steps, step intervals, and daily recovery for Alice
-- ============================================================

-- Use Alice's user_id
-- 4424c5d6-5751-4038-aa39-bd85895ddb78

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
-- daily_steps (7 days for Alice)
-- ---------------------------------------------------------------------------
INSERT INTO public.daily_steps (id, user_id, date, timezone, source, total_steps, distance_m, calories_kcal,
  active_calories_kcal, sedentary_minutes, lightly_active_min, fairly_active_min, very_active_min,
  step_goal, goal_achieved, data_quality, source_record_id) VALUES
('00900000-0000-0000-0001-000000000001','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 6,'Europe/Madrid','garmin',
 8542,6120,1820,420,620,180,45,35,10000,false,'complete','garmin-steps-001'),
('00900000-0000-0000-0001-000000000002','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 5,'Europe/Madrid','garmin',
 11230,8050,2150,580,540,210,60,50,10000,true,'complete','garmin-steps-002'),
('00900000-0000-0000-0001-000000000003','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 4,'Europe/Madrid','garmin',
 5680,4070,1540,280,720,140,30,15,10000,false,'complete','garmin-steps-003'),
('00900000-0000-0000-0001-000000000004','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 3,'Europe/Madrid','garmin',
 9870,7080,1960,480,580,200,55,40,10000,false,'complete','garmin-steps-004'),
('00900000-0000-0000-0001-000000000005','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 2,'Europe/Madrid','garmin',
 12450,8930,2320,650,480,230,70,55,10000,true,'complete','garmin-steps-005'),
('00900000-0000-0000-0001-000000000006','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE - 1,'Europe/Madrid','garmin',
 7320,5250,1680,360,660,160,40,25,10000,false,'complete','garmin-steps-006'),
('00900000-0000-0000-0001-000000000007','4424c5d6-5751-4038-aa39-bd85895ddb78',CURRENT_DATE,'Europe/Madrid','garmin',
 3200,2300,980,150,480,80,15,5,10000,false,'partial','garmin-steps-007');

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
