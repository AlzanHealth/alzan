-- Local-only demo data for checking exercise catalog history and weight edits.
-- Re-running the seed replaces these six synthetic sessions and their sets.
-- The values are deliberately distinct per exercise and progress across dates;
-- they are sample data, not recommendations for actual training loads.

WITH demo_sessions AS (
  SELECT *
  FROM (VALUES
    (1, 'ed000000-0000-0000-0000-000000000001'::uuid, 42),
    (2, 'ed000000-0000-0000-0000-000000000002'::uuid, 35),
    (3, 'ed000000-0000-0000-0000-000000000003'::uuid, 28),
    (4, 'ed000000-0000-0000-0000-000000000004'::uuid, 21),
    (5, 'ed000000-0000-0000-0000-000000000005'::uuid, 14),
    (6, 'ed000000-0000-0000-0000-000000000006'::uuid, 7)
  ) AS sessions(session_number, session_id, days_ago)
), ranked_exercises AS (
  SELECT
    exercises.id,
    COALESCE(exercises.load_type::text, 'external') AS load_type,
    row_number() OVER (
      PARTITION BY COALESCE(exercises.load_type::text, 'external')
      ORDER BY exercises.id
    ) AS exercise_number
  FROM public.exercises AS exercises
  WHERE exercises.archived_at IS NULL
    AND (exercises.owner_user_id IS NULL OR exercises.owner_user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid)
), sample_values AS (
  SELECT
    ranked_exercises.id AS exercise_id,
    ranked_exercises.exercise_number,
    demo_sessions.session_number,
    demo_sessions.session_id,
    date_trunc('day', now()) - demo_sessions.days_ago * INTERVAL '1 day' + INTERVAL '18 hours' AS start_time,
    (
      CASE ranked_exercises.load_type
        WHEN 'bodyweight' THEN 1.00 + ranked_exercises.exercise_number * 0.02
        WHEN 'assisted' THEN 15.00 + ranked_exercises.exercise_number * 0.05
        WHEN 'external' THEN 25.00 + ranked_exercises.exercise_number * 0.05
        WHEN 'mixed' THEN 95.00 + ranked_exercises.exercise_number * 0.05
        ELSE 10.00 + ranked_exercises.exercise_number * 0.05
      END
      + (demo_sessions.session_number - 1) * 0.25
    )::numeric(7, 2) AS weight_kg,
    (6 + ((ranked_exercises.exercise_number + demo_sessions.session_number - 2) % 7))::integer AS reps
  FROM ranked_exercises
  CROSS JOIN demo_sessions
)
INSERT INTO public.activity_sessions (
  id,
  user_id,
  sport_type,
  sport_subtype,
  start_time,
  end_time,
  duration_s,
  name,
  description,
  source,
  provider,
  status,
  visibility,
  timezone,
  total_sets,
  total_reps,
  total_volume_kg
)
SELECT
  sample_values.session_id,
  '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
  'gym',
  'strength',
  sample_values.start_time,
  sample_values.start_time + INTERVAL '1 hour',
  3600,
  'Demo · catálogo de ejercicios ' || sample_values.session_number || '/6',
  'Datos locales sintéticos para probar historiales, edición y borrado de pesos.',
  'manual',
  'manual',
  'completed',
  'private',
  'Europe/Madrid',
  count(*)::integer,
  sum(sample_values.reps)::integer,
  sum(sample_values.weight_kg * sample_values.reps)
FROM sample_values
GROUP BY sample_values.session_id, sample_values.session_number, sample_values.start_time
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  sport_type = EXCLUDED.sport_type,
  sport_subtype = EXCLUDED.sport_subtype,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  duration_s = EXCLUDED.duration_s,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  provider = EXCLUDED.provider,
  status = EXCLUDED.status,
  visibility = EXCLUDED.visibility,
  timezone = EXCLUDED.timezone,
  total_sets = EXCLUDED.total_sets,
  total_reps = EXCLUDED.total_reps,
  total_volume_kg = EXCLUDED.total_volume_kg;

DELETE FROM public.workout_sets
WHERE session_id IN (
  'ed000000-0000-0000-0000-000000000001'::uuid,
  'ed000000-0000-0000-0000-000000000002'::uuid,
  'ed000000-0000-0000-0000-000000000003'::uuid,
  'ed000000-0000-0000-0000-000000000004'::uuid,
  'ed000000-0000-0000-0000-000000000005'::uuid,
  'ed000000-0000-0000-0000-000000000006'::uuid
)
  AND user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid;

WITH demo_sessions AS (
  SELECT *
  FROM (VALUES
    (1, 'ed000000-0000-0000-0000-000000000001'::uuid, 42),
    (2, 'ed000000-0000-0000-0000-000000000002'::uuid, 35),
    (3, 'ed000000-0000-0000-0000-000000000003'::uuid, 28),
    (4, 'ed000000-0000-0000-0000-000000000004'::uuid, 21),
    (5, 'ed000000-0000-0000-0000-000000000005'::uuid, 14),
    (6, 'ed000000-0000-0000-0000-000000000006'::uuid, 7)
  ) AS sessions(session_number, session_id, days_ago)
), ranked_exercises AS (
  SELECT
    exercises.id,
    COALESCE(exercises.load_type::text, 'external') AS load_type,
    row_number() OVER (
      PARTITION BY COALESCE(exercises.load_type::text, 'external')
      ORDER BY exercises.id
    ) AS exercise_number
  FROM public.exercises AS exercises
  WHERE exercises.archived_at IS NULL
    AND (exercises.owner_user_id IS NULL OR exercises.owner_user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid)
), sample_values AS (
  SELECT
    ranked_exercises.id AS exercise_id,
    ranked_exercises.exercise_number,
    demo_sessions.session_number,
    demo_sessions.session_id,
    date_trunc('day', now()) - demo_sessions.days_ago * INTERVAL '1 day' + INTERVAL '18 hours' AS start_time,
    (
      CASE ranked_exercises.load_type
        WHEN 'bodyweight' THEN 1.00 + ranked_exercises.exercise_number * 0.02
        WHEN 'assisted' THEN 15.00 + ranked_exercises.exercise_number * 0.05
        WHEN 'external' THEN 25.00 + ranked_exercises.exercise_number * 0.05
        WHEN 'mixed' THEN 95.00 + ranked_exercises.exercise_number * 0.05
        ELSE 10.00 + ranked_exercises.exercise_number * 0.05
      END
      + (demo_sessions.session_number - 1) * 0.25
    )::numeric(7, 2) AS weight_kg,
    (6 + ((ranked_exercises.exercise_number + demo_sessions.session_number - 2) % 7))::integer AS reps
  FROM ranked_exercises
  CROSS JOIN demo_sessions
)
INSERT INTO public.workout_sets (
  id,
  session_id,
  user_id,
  exercise_id,
  set_number,
  weight_kg,
  reps,
  rpe,
  is_warmup,
  created_at,
  notes
)
SELECT
  md5('alzan-exercise-catalog-demo:' || sample_values.exercise_id::text || ':' || sample_values.session_number::text)::uuid,
  sample_values.session_id,
  '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
  sample_values.exercise_id,
  1,
  sample_values.weight_kg,
  sample_values.reps,
  (6 + sample_values.session_number % 4)::numeric,
  false,
  sample_values.start_time + (sample_values.exercise_number - 1) * INTERVAL '1 second',
  'Peso sintético generado por los seeds locales para probar la gestión del historial.'
FROM sample_values
ON CONFLICT (id) DO UPDATE SET
  session_id = EXCLUDED.session_id,
  user_id = EXCLUDED.user_id,
  exercise_id = EXCLUDED.exercise_id,
  set_number = EXCLUDED.set_number,
  weight_kg = EXCLUDED.weight_kg,
  reps = EXCLUDED.reps,
  rpe = EXCLUDED.rpe,
  is_warmup = EXCLUDED.is_warmup,
  created_at = EXCLUDED.created_at,
  notes = EXCLUDED.notes;
