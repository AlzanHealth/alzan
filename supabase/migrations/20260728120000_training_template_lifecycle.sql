-- Training template lifecycle and reusable weekly progressions.
-- Existing templates remain available: they receive a null date range and are
-- only removed automatically when a user explicitly gives them an end date.

ALTER TABLE public.workout_templates
  ADD COLUMN IF NOT EXISTS template_family_key text,
  ADD COLUMN IF NOT EXISTS auto_delete_after_end boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recurrence_start_date date,
  ADD COLUMN IF NOT EXISTS recurrence_end_date date;

ALTER TABLE public.endurance_workout_templates
  ADD COLUMN IF NOT EXISTS template_family_key text,
  ADD COLUMN IF NOT EXISTS auto_delete_after_end boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS training_settings jsonb NOT NULL DEFAULT '{"auto_delete_expired_templates": true}'::jsonb;

ALTER TABLE public.workout_templates
  DROP CONSTRAINT IF EXISTS workout_templates_recurrence_dates_check,
  ADD CONSTRAINT workout_templates_recurrence_dates_check
    CHECK (
      recurrence_start_date IS NULL OR recurrence_end_date IS NULL OR recurrence_end_date >= recurrence_start_date
    );

ALTER TABLE public.endurance_workout_templates
  DROP CONSTRAINT IF EXISTS endurance_workout_templates_recurrence_dates_check,
  ADD CONSTRAINT endurance_workout_templates_recurrence_dates_check
    CHECK (
      recurrence_start_date IS NULL OR recurrence_end_date IS NULL OR recurrence_end_date >= recurrence_start_date
    );

CREATE INDEX IF NOT EXISTS workout_templates_user_family_idx
  ON public.workout_templates (user_id, template_family_key)
  WHERE template_family_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS endurance_templates_user_family_idx
  ON public.endurance_workout_templates (user_id, template_family_key)
  WHERE template_family_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS workout_templates_expiration_idx
  ON public.workout_templates (user_id, recurrence_end_date)
  WHERE auto_delete_after_end = true AND recurrence_end_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS endurance_templates_expiration_idx
  ON public.endurance_workout_templates (user_id, recurrence_end_date)
  WHERE auto_delete_after_end = true AND recurrence_end_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.workout_template_exercise_progressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_template_id uuid NOT NULL,
  workout_template_exercise_id uuid NOT NULL,
  week_index integer NOT NULL,
  target_sets integer,
  target_reps_min integer,
  target_reps_max integer,
  target_weight_kg numeric,
  target_rpe numeric,
  rest_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_template_exercise_progressions_template_fkey
    FOREIGN KEY (workout_template_id)
    REFERENCES public.workout_templates(id)
    ON DELETE CASCADE,
  CONSTRAINT workout_template_exercise_progressions_exercise_fkey
    FOREIGN KEY (workout_template_exercise_id)
    REFERENCES public.workout_template_exercises(id)
    ON DELETE CASCADE,
  CONSTRAINT workout_template_exercise_progressions_unique_week_exercise
    UNIQUE (workout_template_id, workout_template_exercise_id, week_index),
  CONSTRAINT workout_template_exercise_progressions_week_check
    CHECK (week_index >= 1),
  CONSTRAINT workout_template_exercise_progressions_sets_check
    CHECK (target_sets IS NULL OR target_sets >= 0),
  CONSTRAINT workout_template_exercise_progressions_reps_min_check
    CHECK (target_reps_min IS NULL OR target_reps_min >= 0),
  CONSTRAINT workout_template_exercise_progressions_reps_max_check
    CHECK (target_reps_max IS NULL OR target_reps_max >= 0),
  CONSTRAINT workout_template_exercise_progressions_weight_check
    CHECK (target_weight_kg IS NULL OR target_weight_kg >= 0),
  CONSTRAINT workout_template_exercise_progressions_rpe_check
    CHECK (target_rpe IS NULL OR (target_rpe >= 0 AND target_rpe <= 10)),
  CONSTRAINT workout_template_exercise_progressions_rest_check
    CHECK (rest_seconds IS NULL OR rest_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS workout_template_exercise_progressions_week_idx
  ON public.workout_template_exercise_progressions (workout_template_id, week_index);

ALTER TABLE public.workout_template_exercise_progressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workout_template_exercise_progressions_manage_own ON public.workout_template_exercise_progressions;
CREATE POLICY workout_template_exercise_progressions_manage_own
  ON public.workout_template_exercise_progressions
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_templates template
      WHERE template.id = workout_template_exercise_progressions.workout_template_id
        AND template.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workout_templates template
      JOIN public.workout_template_exercises exercise
        ON exercise.workout_template_id = template.id
      WHERE template.id = workout_template_exercise_progressions.workout_template_id
        AND exercise.id = workout_template_exercise_progressions.workout_template_exercise_id
        AND template.user_id = (SELECT auth.uid())
    )
  );

GRANT ALL ON TABLE public.workout_template_exercise_progressions TO anon;
GRANT ALL ON TABLE public.workout_template_exercise_progressions TO authenticated;
GRANT ALL ON TABLE public.workout_template_exercise_progressions TO service_role;
