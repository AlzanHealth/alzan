-- Local-only demo data for checking exercise history and removing recorded weights.
-- Re-running the seed restores one distinct sample weight for every active exercise.

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
WITH ranked_exercises AS (
  SELECT
    exercises.id,
    row_number() OVER (ORDER BY exercises.id) AS exercise_number
  FROM public.exercises AS exercises
  WHERE exercises.archived_at IS NULL
), sample_values AS (
  SELECT
    id,
    exercise_number,
    (10::numeric + exercise_number * 0.05::numeric)::numeric(7, 2) AS weight_kg,
    (6 + ((exercise_number - 1) % 7))::integer AS reps
  FROM ranked_exercises
)
SELECT
  'ed000000-0000-0000-0000-000000000001'::uuid,
  '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
  'gym'::public.sport_type_enum,
  'strength',
  now() - INTERVAL '1 day',
  now() - INTERVAL '1 day' + INTERVAL '1 hour',
  3600,
  'Demo · pesos del catálogo',
  'Datos locales para probar el historial y quitar pesos de ejercicios.',
  'manual',
  'manual'::public.provider_enum,
  'completed',
  'private',
  'Europe/Madrid',
  count(*)::integer,
  sum(sample_values.reps)::integer,
  sum(sample_values.weight_kg * sample_values.reps)
FROM sample_values
HAVING count(*) > 0
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
WHERE session_id = 'ed000000-0000-0000-0000-000000000001'::uuid
  AND user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid;

WITH ranked_exercises AS (
  SELECT
    exercises.id,
    row_number() OVER (ORDER BY exercises.id) AS exercise_number
  FROM public.exercises AS exercises
  WHERE exercises.archived_at IS NULL
), sample_values AS (
  SELECT
    id,
    exercise_number,
    (10::numeric + exercise_number * 0.05::numeric)::numeric(7, 2) AS weight_kg,
    (6 + ((exercise_number - 1) % 7))::integer AS reps
  FROM ranked_exercises
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
  md5('alzan-exercise-catalog-demo:' || sample_values.id::text)::uuid,
  'ed000000-0000-0000-0000-000000000001'::uuid,
  '4424c5d6-5751-4038-aa39-bd85895ddb78'::uuid,
  sample_values.id,
  1,
  sample_values.weight_kg,
  sample_values.reps,
  7,
  false,
  now() - INTERVAL '1 day' + (sample_values.exercise_number - 1) * INTERVAL '1 second',
  'Peso de ejemplo generado por los seeds locales.'
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
