-- Deploy before clients that persist timed gym sets with reps = NULL.
-- Existing repetition-based sets remain unchanged.
ALTER TABLE public.workout_sets
  ALTER COLUMN reps DROP NOT NULL;
