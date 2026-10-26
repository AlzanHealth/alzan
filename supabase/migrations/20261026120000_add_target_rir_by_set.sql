ALTER TABLE public.workout_template_exercises
  ADD COLUMN target_rir_by_set smallint[];

ALTER TABLE public.workout_template_exercises
  ADD CONSTRAINT workout_template_exercises_target_rir_by_set_check
  CHECK (
    target_rir_by_set IS NULL
    OR (
      target_sets IS NOT NULL
      AND array_ndims(target_rir_by_set) = 1
      AND array_lower(target_rir_by_set, 1) = 1
      AND cardinality(target_rir_by_set) = target_sets
      AND 0 <= ALL (target_rir_by_set)
      AND 10 >= ALL (target_rir_by_set)
    )
  );

COMMENT ON COLUMN public.workout_template_exercises.target_rir_by_set IS
  'Optional target reps in reserve for each planned set. SQL NULL means no targets; NULL entries mean the source did not specify that set.';

ALTER TABLE public.workout_template_exercise_progressions
  ADD COLUMN target_rir_by_set smallint[];

ALTER TABLE public.workout_template_exercise_progressions
  ADD CONSTRAINT workout_template_exercise_progressions_target_rir_by_set_check
  CHECK (
    target_rir_by_set IS NULL
    OR (
      target_sets IS NOT NULL
      AND array_ndims(target_rir_by_set) = 1
      AND array_lower(target_rir_by_set, 1) = 1
      AND cardinality(target_rir_by_set) = target_sets
      AND 0 <= ALL (target_rir_by_set)
      AND 10 >= ALL (target_rir_by_set)
    )
  );

COMMENT ON COLUMN public.workout_template_exercise_progressions.target_rir_by_set IS
  'Per-set target reps in reserve. SQL NULL inherits the base template; NULL entries explicitly mean no target for that set in this week.';
