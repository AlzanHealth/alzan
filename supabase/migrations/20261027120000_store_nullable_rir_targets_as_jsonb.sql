CREATE SCHEMA IF NOT EXISTS private;

GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_valid_target_rir_by_set(targets jsonb, set_count integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN targets IS NULL THEN true
    WHEN set_count IS NULL OR pg_catalog.jsonb_typeof(targets) IS DISTINCT FROM 'array' THEN false
    WHEN pg_catalog.jsonb_array_length(targets) <> set_count THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(targets) AS item(value)
      WHERE CASE
        WHEN item.value = 'null'::pg_catalog.jsonb THEN false
        WHEN pg_catalog.jsonb_typeof(item.value) <> 'number' THEN true
        WHEN item.value #>> '{}'::text[] !~ '^(0|[1-9][0-9]*)$' THEN true
        ELSE (item.value #>> '{}'::text[])::numeric NOT BETWEEN 0 AND 10
      END
    )
  END;
$function$;

REVOKE ALL ON FUNCTION private.is_valid_target_rir_by_set(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_valid_target_rir_by_set(jsonb, integer) TO anon, authenticated, service_role;

ALTER TABLE public.workout_template_exercises
  DROP CONSTRAINT workout_template_exercises_target_rir_by_set_check,
  ALTER COLUMN target_rir_by_set TYPE jsonb USING pg_catalog.to_jsonb(target_rir_by_set);

ALTER TABLE public.workout_template_exercises
  ADD CONSTRAINT workout_template_exercises_target_rir_by_set_check
  CHECK (private.is_valid_target_rir_by_set(target_rir_by_set, target_sets));

COMMENT ON COLUMN public.workout_template_exercises.target_rir_by_set IS
  'Optional target reps in reserve for each planned set. SQL NULL means no targets; JSON null entries mean no target for that set.';

ALTER TABLE public.workout_template_exercise_progressions
  DROP CONSTRAINT workout_template_exercise_progressions_target_rir_by_set_check,
  ALTER COLUMN target_rir_by_set TYPE jsonb USING pg_catalog.to_jsonb(target_rir_by_set);

ALTER TABLE public.workout_template_exercise_progressions
  ADD CONSTRAINT workout_template_exercise_progressions_target_rir_by_set_check
  CHECK (private.is_valid_target_rir_by_set(target_rir_by_set, target_sets));

COMMENT ON COLUMN public.workout_template_exercise_progressions.target_rir_by_set IS
  'Per-set target reps in reserve. SQL NULL inherits the base template; JSON null entries explicitly mean no target for that set in this week.';
