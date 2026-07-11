ALTER TABLE public.workout_template_exercises
ADD COLUMN IF NOT EXISTS drop_set_mode text NOT NULL DEFAULT 'none';

ALTER TABLE public.workout_template_exercises
DROP CONSTRAINT IF EXISTS workout_template_exercises_drop_set_mode_chk;

ALTER TABLE public.workout_template_exercises
ADD CONSTRAINT workout_template_exercises_drop_set_mode_chk
CHECK (drop_set_mode IN ('none', 'last', 'all'));
