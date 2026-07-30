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

ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS import_dedupe_key text;

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

CREATE UNIQUE INDEX IF NOT EXISTS workout_templates_import_range_family_uq
  ON public.workout_templates (
    user_id,
    template_family_key,
    recurrence_start_date,
    recurrence_end_date
  )
  WHERE source = 'imported'
    AND template_family_key IS NOT NULL
    AND recurrence_start_date IS NOT NULL
    AND recurrence_end_date IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS endurance_templates_import_range_family_uq
  ON public.endurance_workout_templates (
    user_id,
    template_family_key,
    recurrence_start_date,
    recurrence_end_date
  )
  WHERE source = 'imported'
    AND template_family_key IS NOT NULL
    AND recurrence_start_date IS NOT NULL
    AND recurrence_end_date IS NOT NULL;

DROP INDEX IF EXISTS public.workout_plans_import_dedupe_uq;
CREATE UNIQUE INDEX workout_plans_import_dedupe_uq
  ON public.workout_plans (user_id, import_dedupe_key);

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

CREATE TABLE IF NOT EXISTS public.endurance_workout_template_progressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  week_index integer NOT NULL,
  total_distance_m integer,
  total_duration_s integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT endurance_workout_template_progressions_template_fkey
    FOREIGN KEY (template_id)
    REFERENCES public.endurance_workout_templates(id)
    ON DELETE CASCADE,
  CONSTRAINT endurance_workout_template_progressions_unique_week
    UNIQUE (template_id, week_index),
  CONSTRAINT endurance_workout_template_progressions_week_check
    CHECK (week_index >= 1),
  CONSTRAINT endurance_workout_template_progressions_distance_check
    CHECK (total_distance_m IS NULL OR total_distance_m >= 0),
  CONSTRAINT endurance_workout_template_progressions_duration_check
    CHECK (total_duration_s IS NULL OR total_duration_s >= 0),
  CONSTRAINT endurance_workout_template_progressions_has_value_check
    CHECK (total_distance_m IS NOT NULL OR total_duration_s IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS endurance_workout_template_progressions_week_idx
  ON public.endurance_workout_template_progressions (template_id, week_index);

ALTER TABLE public.endurance_workout_template_progressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS endurance_workout_template_progressions_manage_own
  ON public.endurance_workout_template_progressions;
CREATE POLICY endurance_workout_template_progressions_manage_own
  ON public.endurance_workout_template_progressions
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.endurance_workout_templates template
      WHERE template.id = endurance_workout_template_progressions.template_id
        AND template.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.endurance_workout_templates template
      WHERE template.id = endurance_workout_template_progressions.template_id
        AND template.user_id = (SELECT auth.uid())
    )
  );

GRANT ALL ON TABLE public.endurance_workout_template_progressions TO anon;
GRANT ALL ON TABLE public.endurance_workout_template_progressions TO authenticated;
GRANT ALL ON TABLE public.endurance_workout_template_progressions TO service_role;

CREATE OR REPLACE FUNCTION public.expire_training_templates(
  p_local_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '15s'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_template record;
  v_deleted_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_AUTH_REQUIRED';
  END IF;
  IF p_local_date IS NULL THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_DATE_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('training-template-lifecycle:' || v_user_id::text, 0)
  );

  -- Imports publish templates only after every child row exists. Clean up
  -- abandoned unpublished rows from crashed clients without touching an
  -- import that could still be running.
  DELETE FROM public.workout_templates template
  WHERE template.user_id = v_user_id
    AND template.source = 'importing'
    AND template.created_at < now() - interval '24 hours'
    AND NOT EXISTS (
      SELECT 1
      FROM public.workout_plans plan
      WHERE plan.gym_template_id = template.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.activity_sessions session
      WHERE session.workout_template_id = template.id
    );

  FOR v_template IN
    SELECT template.id
    FROM public.endurance_workout_templates template
    WHERE template.user_id = v_user_id
      AND template.source = 'importing'
      AND template.created_at < now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM public.workout_plans plan
        WHERE plan.endurance_template_id = template.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.activity_sessions session
        WHERE session.endurance_template_id = template.id
          OR session.suggested_endurance_template_id = template.id
      )
    FOR UPDATE
  LOOP
    DELETE FROM public.endurance_workout_steps
    WHERE template_id = v_template.id;

    DELETE FROM public.endurance_workout_templates
    WHERE id = v_template.id
      AND user_id = v_user_id
      AND source = 'importing';
  END LOOP;

  FOR v_template IN
    SELECT id, recurrence_end_date
    FROM public.workout_templates
    WHERE user_id = v_user_id
      AND auto_delete_after_end = true
      AND recurrence_end_date IS NOT NULL
      AND recurrence_end_date < p_local_date
    FOR UPDATE
  LOOP
    DELETE FROM public.workout_plans
    WHERE user_id = v_user_id
      AND gym_template_id = v_template.id
      AND planned_date > v_template.recurrence_end_date
      AND completed_at IS NULL
      AND status IS DISTINCT FROM 'completed';

    UPDATE public.workout_plans
    SET gym_template_id = NULL
    WHERE user_id = v_user_id
      AND gym_template_id = v_template.id;

    UPDATE public.activity_sessions
    SET workout_template_id = NULL
    WHERE user_id = v_user_id
      AND workout_template_id = v_template.id;

    DELETE FROM public.workout_template_translations
    WHERE workout_template_id = v_template.id;

    DELETE FROM public.workout_templates
    WHERE id = v_template.id
      AND user_id = v_user_id;

    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  FOR v_template IN
    SELECT id, recurrence_end_date
    FROM public.endurance_workout_templates
    WHERE user_id = v_user_id
      AND auto_delete_after_end = true
      AND recurrence_end_date IS NOT NULL
      AND recurrence_end_date < p_local_date
    FOR UPDATE
  LOOP
    DELETE FROM public.workout_plans
    WHERE user_id = v_user_id
      AND endurance_template_id = v_template.id
      AND planned_date > v_template.recurrence_end_date
      AND completed_at IS NULL
      AND status IS DISTINCT FROM 'completed';

    UPDATE public.workout_plans
    SET endurance_template_id = NULL
    WHERE user_id = v_user_id
      AND endurance_template_id = v_template.id;

    UPDATE public.activity_sessions
    SET
      endurance_template_id = CASE
        WHEN endurance_template_id = v_template.id THEN NULL
        ELSE endurance_template_id
      END,
      suggested_endurance_template_id = CASE
        WHEN suggested_endurance_template_id = v_template.id THEN NULL
        ELSE suggested_endurance_template_id
      END
    WHERE user_id = v_user_id
      AND (
        endurance_template_id = v_template.id
        OR suggested_endurance_template_id = v_template.id
      );

    DELETE FROM public.endurance_workout_steps
    WHERE template_id = v_template.id;

    DELETE FROM public.endurance_workout_templates
    WHERE id = v_template.id
      AND user_id = v_user_id;

    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_training_templates(date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_training_templates(date)
TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_training_template(
  p_template_kind text,
  p_template_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '15s'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_AUTH_REQUIRED';
  END IF;
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_ID_REQUIRED';
  END IF;
  IF p_template_kind NOT IN ('gym', 'endurance') THEN
    RAISE EXCEPTION 'TRAINING_TEMPLATE_KIND_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('training-template-lifecycle:' || v_user_id::text, 0)
  );

  IF p_template_kind = 'gym' THEN
    PERFORM 1
    FROM public.workout_templates
    WHERE id = p_template_id
      AND user_id = v_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN false;
    END IF;

    DELETE FROM public.workout_plans
    WHERE user_id = v_user_id
      AND gym_template_id = p_template_id
      AND completed_at IS NULL
      AND status IS DISTINCT FROM 'completed';

    UPDATE public.workout_plans
    SET gym_template_id = NULL
    WHERE user_id = v_user_id
      AND gym_template_id = p_template_id;

    UPDATE public.activity_sessions
    SET workout_template_id = NULL
    WHERE user_id = v_user_id
      AND workout_template_id = p_template_id;

    DELETE FROM public.workout_template_translations
    WHERE workout_template_id = p_template_id;

    DELETE FROM public.workout_templates
    WHERE id = p_template_id
      AND user_id = v_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  ELSE
    PERFORM 1
    FROM public.endurance_workout_templates
    WHERE id = p_template_id
      AND user_id = v_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN false;
    END IF;

    DELETE FROM public.workout_plans
    WHERE user_id = v_user_id
      AND endurance_template_id = p_template_id
      AND completed_at IS NULL
      AND status IS DISTINCT FROM 'completed';

    UPDATE public.workout_plans
    SET endurance_template_id = NULL
    WHERE user_id = v_user_id
      AND endurance_template_id = p_template_id;

    UPDATE public.activity_sessions
    SET
      endurance_template_id = CASE
        WHEN endurance_template_id = p_template_id THEN NULL
        ELSE endurance_template_id
      END,
      suggested_endurance_template_id = CASE
        WHEN suggested_endurance_template_id = p_template_id THEN NULL
        ELSE suggested_endurance_template_id
      END
    WHERE user_id = v_user_id
      AND (
        endurance_template_id = p_template_id
        OR suggested_endurance_template_id = p_template_id
      );

    DELETE FROM public.endurance_workout_steps
    WHERE template_id = p_template_id;

    DELETE FROM public.endurance_workout_templates
    WHERE id = p_template_id
      AND user_id = v_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  RETURN v_deleted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_training_template(text, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_training_template(text, uuid)
TO authenticated;
