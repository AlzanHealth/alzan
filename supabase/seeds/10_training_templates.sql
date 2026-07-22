-- Demo training templates for local testing.
-- Re-runnable by design: only rows with the fixed demo IDs below are replaced.

DELETE FROM public.workout_plans
WHERE user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
  AND (
    gym_template_id IN (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002'
    )
    OR endurance_template_id IN (
      '10000000-0000-0000-0000-000000000101',
      '10000000-0000-0000-0000-000000000102',
      '10000000-0000-0000-0000-000000000103',
      '10000000-0000-0000-0000-000000000104',
      '10000000-0000-0000-0000-000000000105',
      '10000000-0000-0000-0000-000000000106'
    )
  );

DELETE FROM public.endurance_workout_step_progressions
WHERE template_id IN (
  '10000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000102',
  '10000000-0000-0000-0000-000000000103',
  '10000000-0000-0000-0000-000000000104',
  '10000000-0000-0000-0000-000000000105',
  '10000000-0000-0000-0000-000000000106'
);

DELETE FROM public.endurance_workout_steps
WHERE template_id IN (
  '10000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000102',
  '10000000-0000-0000-0000-000000000103',
  '10000000-0000-0000-0000-000000000104',
  '10000000-0000-0000-0000-000000000105',
  '10000000-0000-0000-0000-000000000106'
);

DELETE FROM public.endurance_workout_templates
WHERE id IN (
  '10000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000102',
  '10000000-0000-0000-0000-000000000103',
  '10000000-0000-0000-0000-000000000104',
  '10000000-0000-0000-0000-000000000105',
  '10000000-0000-0000-0000-000000000106'
);

DELETE FROM public.workout_template_exercises
WHERE workout_template_id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002'
);

DELETE FROM public.workout_templates
WHERE id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002'
);

DELETE FROM public.exercises
WHERE id IN (
  '11000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002',
  '11000000-0000-0000-0000-000000000003',
  '11000000-0000-0000-0000-000000000004',
  '11000000-0000-0000-0000-000000000005',
  '11000000-0000-0000-0000-000000000006',
  '11000000-0000-0000-0000-000000000007'
);

INSERT INTO public.exercises (
  id,
  base_name_es,
  base_name_en,
  difficulty,
  description_es,
  description_en,
  is_custom,
  owner_user_id,
  load_type
)
VALUES
  (
    '11000000-0000-0000-0000-000000000001',
    'Demo Goblet squat',
    'Demo Goblet squat',
    'Principiante',
    'Ejercicio demo para probar plantillas de gimnasio.',
    'Demo exercise for testing gym templates.',
    true,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'external'
  ),
  (
    '11000000-0000-0000-0000-000000000002',
    'Demo Peso muerto rumano',
    'Demo Romanian deadlift',
    'Intermedio',
    'Ejercicio demo para probar series, repeticiones y peso.',
    'Demo exercise for testing sets, reps and weight.',
    true,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'external'
  ),
  (
    '11000000-0000-0000-0000-000000000003',
    'Demo Press banca mancuernas',
    'Demo Dumbbell bench press',
    'Intermedio',
    'Ejercicio demo de empuje.',
    'Demo push exercise.',
    true,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'external'
  ),
  (
    '11000000-0000-0000-0000-000000000004',
    'Demo Remo sentado cable',
    'Demo Cable seated row',
    'Principiante',
    'Ejercicio demo de traccion.',
    'Demo pull exercise.',
    true,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'external'
  ),
  (
    '11000000-0000-0000-0000-000000000005',
    'Demo Plancha lateral 60s',
    'Demo Side plank 60s',
    'Principiante',
    'Ejercicio demo basado en tiempo con objetivo de 60 segundos.',
    'Time-based demo exercise with a 60-second target.',
    true,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'bodyweight'
  ),
  (
    '11000000-0000-0000-0000-000000000006',
    'Demo Press banca barra',
    'Demo Barbell bench press',
    'Intermedio',
    'Ejercicio demo pesado de empuje.',
    'Demo heavy push exercise.',
    true,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'external'
  ),
  (
    '11000000-0000-0000-0000-000000000007',
    'Demo Remo pecho apoyado',
    'Demo Chest-supported row',
    'Intermedio',
    'Ejercicio demo pesado de traccion.',
    'Demo heavy pull exercise.',
    true,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'external'
  );

INSERT INTO public.workout_templates (
  id,
  user_id,
  base_name,
  description,
  workout_goal,
  suggested_day_of_week,
  source,
  modality
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'Demo Gym - Full Body Strength',
    'Seed template for testing strength sessions, sets, reps and a time-based core exercise.',
    'fuerza',
    1,
    'seed',
    'gym'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'Demo Gym - Upper Push Pull',
    'Seed template for testing upper body editing and ordering.',
    'hipertrofia',
    3,
    'seed',
    'gym'
  );

INSERT INTO public.workout_template_exercises (
  id,
  workout_template_id,
  exercise_id,
  order_index,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_weight_kg,
  target_rpe,
  notes,
  rest_seconds,
  user_id
)
VALUES
  (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    1,
    3,
    8,
    10,
    24,
    7,
    'Demo lower body opener.',
    90,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000002',
    2,
    3,
    8,
    8,
    22.5,
    7,
    'Demo posterior chain movement.',
    90,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000003',
    3,
    3,
    8,
    10,
    20,
    7,
    'Demo push exercise.',
    90,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000004',
    4,
    3,
    10,
    12,
    35,
    7,
    'Demo pull exercise.',
    75,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000005',
    5,
    3,
    60,
    60,
    NULL,
    7,
    'Time-based demo exercise. Default target is 60 seconds.',
    45,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'
  ),
  (
    '50000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000006',
    1,
    4,
    5,
    6,
    60,
    8,
    'Demo heavy press.',
    120,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'
  ),
  (
    '50000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000007',
    2,
    4,
    8,
    10,
    45,
    8,
    'Demo heavy row.',
    120,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'
  ),
  (
    '50000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000004',
    3,
    3,
    10,
    12,
    32.5,
    7,
    'Demo cable row variation.',
    75,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'
  );

WITH next_days AS (
  SELECT
    CURRENT_DATE + (((1 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS monday,
    CURRENT_DATE + (((2 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS tuesday,
    CURRENT_DATE + (((3 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS wednesday,
    CURRENT_DATE + (((4 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS thursday,
    CURRENT_DATE + (((5 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS friday,
    CURRENT_DATE + (((6 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS saturday,
    CURRENT_DATE + (((0 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS sunday
)
INSERT INTO public.endurance_workout_templates (
  id,
  user_id,
  sport_type,
  base_name,
  description,
  total_distance_m,
  total_duration_s,
  workout_goal,
  scheduled_day,
  environment_type,
  surface,
  pool_type,
  stroke,
  hyrox_station_focus,
  recurrence_start_date,
  recurrence_end_date
)
SELECT *
FROM (
  SELECT
    '10000000-0000-0000-0000-000000000101'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    'running'::public.sport_type_enum,
    'Demo Running - Martes Series',
    'Two-week interval template: week 1 at 4:45/km and week 2 at 4:30/km.',
    5400,
    2700,
    'speed',
    2,
    'outdoor',
    'track',
    NULL::text,
    NULL::text,
    NULL::text,
    tuesday,
    tuesday + 7
  FROM next_days
  UNION ALL
  SELECT
    '10000000-0000-0000-0000-000000000102'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    'running'::public.sport_type_enum,
    'Demo Running - Sabado Tirada Larga',
    'Three-week long run template: 5:40/km, 5:35/km and 5:30/km.',
    12000,
    4200,
    'endurance',
    6,
    'outdoor',
    'road',
    NULL::text,
    NULL::text,
    NULL::text,
    saturday,
    saturday + 14
  FROM next_days
  UNION ALL
  SELECT
    '10000000-0000-0000-0000-000000000103'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    'cycling'::public.sport_type_enum,
    'Demo Cycling - Umbral Progresivo',
    'Two-week cycling template for testing speed and zone progression.',
    26000,
    3600,
    'threshold',
    4,
    'outdoor',
    'road',
    NULL::text,
    NULL::text,
    NULL::text,
    thursday,
    thursday + 7
  FROM next_days
  UNION ALL
  SELECT
    '10000000-0000-0000-0000-000000000104'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    'swimming'::public.sport_type_enum,
    'Demo Swimming - Ritmo Piscina',
    'Two-week swim template for testing pace progression in the pool.',
    1600,
    2100,
    'technique',
    5,
    'pool',
    NULL::text,
    '25m',
    'freestyle',
    NULL::text,
    friday,
    friday + 7
  FROM next_days
  UNION ALL
  SELECT
    '10000000-0000-0000-0000-000000000105'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    'hyrox'::public.sport_type_enum,
    'Demo HYROX - Bloques Progresivos',
    'Two-week HYROX template for testing run pace, station reps and load progression.',
    2000,
    2400,
    'race_simulation',
    0,
    'indoor',
    NULL::text,
    NULL::text,
    NULL::text,
    'wall_balls',
    sunday,
    sunday + 7
  FROM next_days
  UNION ALL
  SELECT
    '10000000-0000-0000-0000-000000000106'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    'running'::public.sport_type_enum,
    'series example',
    'Plantilla de series: Calentamiento 15min Zona 2 + 6x (400m a 4:00/km + 2min rec) + 10min enfriamiento.',
    2400,
    2796,
    'speed',
    2,
    'outdoor',
    'track',
    NULL::text,
    NULL::text,
    NULL::text,
    tuesday,
    tuesday + 7
  FROM next_days
) templates;

INSERT INTO public.endurance_workout_steps (
  id,
  template_id,
  order_index,
  phase_type,
  duration_type,
  duration_s,
  distance_m,
  target_type,
  target_min,
  target_max,
  repetitions,
  is_group,
  parent_step_id,
  user_id,
  hyrox_step_type,
  hyrox_station_key,
  load_kg,
  reps,
  progression_key
)
VALUES
  (
    '60000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000101',
    1,
    'warmup',
    'time',
    600,
    NULL,
    'none',
    NULL,
    NULL,
    1,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000101',
    2,
    'interval',
    'distance',
    NULL,
    1000,
    'pace',
    285,
    285,
    4,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000002'
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000101',
    3,
    'recovery',
    'time',
    90,
    NULL,
    'none',
    NULL,
    NULL,
    4,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000003'
  ),
  (
    '60000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000101',
    4,
    'cooldown',
    'time',
    600,
    NULL,
    'none',
    NULL,
    NULL,
    1,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000004'
  ),
  (
    '60000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000102',
    1,
    'interval',
    'distance',
    NULL,
    12000,
    'pace',
    340,
    340,
    1,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000005'
  ),
  (
    '60000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000103',
    1,
    'warmup',
    'time',
    600,
    NULL,
    'none',
    NULL,
    NULL,
    1,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000006'
  ),
  (
    '60000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000103',
    2,
    'interval',
    'time',
    480,
    NULL,
    'speed',
    30,
    32,
    3,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000007'
  ),
  (
    '60000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000103',
    3,
    'recovery',
    'time',
    180,
    NULL,
    'heart_rate_zone',
    2,
    2,
    3,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000008'
  ),
  (
    '60000000-0000-0000-0000-000000000009',
    '10000000-0000-0000-0000-000000000104',
    1,
    'warmup',
    'distance',
    NULL,
    400,
    'none',
    NULL,
    NULL,
    1,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000009'
  ),
  (
    '60000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000104',
    2,
    'interval',
    'distance',
    NULL,
    200,
    'pace',
    105,
    105,
    6,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000010'
  ),
  (
    '60000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000104',
    3,
    'recovery',
    'time',
    30,
    NULL,
    'none',
    NULL,
    NULL,
    6,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000011'
  ),
  (
    '60000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000105',
    1,
    'interval',
    'distance',
    NULL,
    1000,
    'pace',
    310,
    310,
    2,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'run',
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000012'
  ),
  (
    '60000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000105',
    2,
    'interval',
    'time',
    300,
    NULL,
    'none',
    NULL,
    NULL,
    1,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'station',
    'wall_balls',
    6,
    40,
    '20000000-0000-0000-0000-000000000013'
  ),
  (
    '60000000-0000-0000-0000-000000000014',
    '10000000-0000-0000-0000-000000000105',
    3,
    'recovery',
    'time',
    120,
    NULL,
    'none',
    NULL,
    NULL,
    2,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    'rest',
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000014'
  ),
  (
    '60000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000106',
    1,
    'warmup',
    'time',
    900,
    NULL,
    'heart_rate',
    2,
    2,
    1,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000020'
  ),
  (
    '60000000-0000-0000-0000-000000000021',
    '10000000-0000-0000-0000-000000000106',
    2,
    'interval',
    'distance',
    NULL,
    NULL,
    'none',
    NULL,
    NULL,
    6,
    true,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000021'
  ),
  (
    '60000000-0000-0000-0000-000000000022',
    '10000000-0000-0000-0000-000000000106',
    1,
    'interval',
    'distance',
    NULL,
    400,
    'pace',
    240,
    240,
    1,
    false,
    '60000000-0000-0000-0000-000000000021',
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000022'
  ),
  (
    '60000000-0000-0000-0000-000000000023',
    '10000000-0000-0000-0000-000000000106',
    2,
    'recovery',
    'time',
    120,
    NULL,
    'none',
    NULL,
    NULL,
    1,
    false,
    '60000000-0000-0000-0000-000000000021',
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000023'
  ),
  (
    '60000000-0000-0000-0000-000000000024',
    '10000000-0000-0000-0000-000000000106',
    3,
    'cooldown',
    'time',
    600,
    NULL,
    'none',
    NULL,
    NULL,
    1,
    false,
    NULL,
    '4424c5d6-5751-4038-aa39-bd85895ddb78',
    NULL,
    NULL,
    NULL,
    NULL,
    '20000000-0000-0000-0000-000000000024'
  );

INSERT INTO public.endurance_workout_step_progressions (
  id,
  template_id,
  progression_key,
  week_index,
  duration_s,
  distance_m,
  target_type,
  target_min,
  target_max,
  repetitions,
  load_kg,
  reps
)
VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000101',
    '20000000-0000-0000-0000-000000000002',
    1,
    NULL,
    1000,
    'pace',
    285,
    285,
    4,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000101',
    '20000000-0000-0000-0000-000000000002',
    2,
    NULL,
    1000,
    'pace',
    270,
    270,
    4,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000102',
    '20000000-0000-0000-0000-000000000005',
    1,
    NULL,
    12000,
    'pace',
    340,
    340,
    1,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000102',
    '20000000-0000-0000-0000-000000000005',
    2,
    NULL,
    12000,
    'pace',
    335,
    335,
    1,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000102',
    '20000000-0000-0000-0000-000000000005',
    3,
    NULL,
    12000,
    'pace',
    330,
    330,
    1,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000103',
    '20000000-0000-0000-0000-000000000007',
    1,
    480,
    NULL,
    'speed',
    30,
    32,
    3,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000103',
    '20000000-0000-0000-0000-000000000007',
    2,
    480,
    NULL,
    'speed',
    32,
    34,
    3,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000104',
    '20000000-0000-0000-0000-000000000010',
    1,
    NULL,
    200,
    'pace',
    105,
    105,
    6,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000009',
    '10000000-0000-0000-0000-000000000104',
    '20000000-0000-0000-0000-000000000010',
    2,
    NULL,
    200,
    'pace',
    100,
    100,
    6,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000105',
    '20000000-0000-0000-0000-000000000012',
    1,
    NULL,
    1000,
    'pace',
    310,
    310,
    2,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000105',
    '20000000-0000-0000-0000-000000000012',
    2,
    NULL,
    1000,
    'pace',
    300,
    300,
    2,
    NULL,
    NULL
  ),
  (
    '30000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000105',
    '20000000-0000-0000-0000-000000000013',
    1,
    300,
    NULL,
    'none',
    NULL,
    NULL,
    1,
    6,
    40
  ),
  (
    '30000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000105',
    '20000000-0000-0000-0000-000000000013',
    2,
    300,
    NULL,
    'none',
    NULL,
    NULL,
    1,
    9,
    50
  );

WITH next_days AS (
  SELECT
    CURRENT_DATE + (((1 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS monday,
    CURRENT_DATE + (((2 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS tuesday,
    CURRENT_DATE + (((3 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS wednesday,
    CURRENT_DATE + (((4 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS thursday,
    CURRENT_DATE + (((5 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS friday,
    CURRENT_DATE + (((6 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS saturday,
    CURRENT_DATE + (((0 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::int AS sunday
)
INSERT INTO public.workout_plans (
  id,
  user_id,
  planned_date,
  gym_template_id,
  endurance_template_id,
  status,
  notes
)
SELECT *
FROM (
  SELECT
    '40000000-0000-0000-0000-000000000001'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    monday,
    '10000000-0000-0000-0000-000000000001'::uuid,
    NULL::uuid,
    'planned'::public.workout_plans_status,
    'Seed demo gym plan.'
  FROM next_days
  UNION ALL
  SELECT
    '40000000-0000-0000-0000-000000000002'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    wednesday,
    '10000000-0000-0000-0000-000000000002'::uuid,
    NULL::uuid,
    'planned'::public.workout_plans_status,
    'Seed demo upper body plan.'
  FROM next_days
  UNION ALL
  SELECT
    '40000000-0000-0000-0000-000000000003'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    tuesday,
    NULL::uuid,
    '10000000-0000-0000-0000-000000000101'::uuid,
    'planned'::public.workout_plans_status,
    'Seed demo running intervals.'
  FROM next_days
  UNION ALL
  SELECT
    '40000000-0000-0000-0000-000000000004'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    saturday,
    NULL::uuid,
    '10000000-0000-0000-0000-000000000102'::uuid,
    'planned'::public.workout_plans_status,
    'Seed demo long run.'
  FROM next_days
  UNION ALL
  SELECT
    '40000000-0000-0000-0000-000000000005'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    thursday,
    NULL::uuid,
    '10000000-0000-0000-0000-000000000103'::uuid,
    'planned'::public.workout_plans_status,
    'Seed demo cycling workout.'
  FROM next_days
  UNION ALL
  SELECT
    '40000000-0000-0000-0000-000000000006'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    friday,
    NULL::uuid,
    '10000000-0000-0000-0000-000000000104'::uuid,
    'planned'::public.workout_plans_status,
    'Seed demo swimming workout.'
  FROM next_days
  UNION ALL
  SELECT
    '40000000-0000-0000-0000-000000000007'::uuid,
    '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
    sunday,
    NULL::uuid,
    '10000000-0000-0000-0000-000000000105'::uuid,
    'planned'::public.workout_plans_status,
    'Seed demo HYROX workout.'
  FROM next_days
) plans;
