-- Make editor-managed one-off schedules unambiguous and template-driven
-- activity names reversible without rewriting provider history.

ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS is_one_off_schedule boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workout_plans.is_one_off_schedule IS
  'True only for the single active one-off plan managed from a template editor.';

ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS template_name_state jsonb;

COMMENT ON COLUMN public.activity_sessions.template_name_state IS
  'Private reversible state captured before the first template association. NULL means no restorable state is known.';

CREATE UNIQUE INDEX IF NOT EXISTS workout_plans_active_one_off_endurance_uidx
  ON public.workout_plans (user_id, endurance_template_id)
  WHERE is_one_off_schedule
    AND endurance_template_id IS NOT NULL
    AND completed_at IS NULL
    AND status IN ('planned', 'rescheduled');

CREATE UNIQUE INDEX IF NOT EXISTS workout_plans_active_one_off_gym_uidx
  ON public.workout_plans (user_id, gym_template_id)
  WHERE is_one_off_schedule
    AND gym_template_id IS NOT NULL
    AND completed_at IS NULL
    AND status IN ('planned', 'rescheduled');

CREATE OR REPLACE FUNCTION public.preserve_activity_template_name_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_was_associated boolean := OLD.endurance_template_id IS NOT NULL OR OLD.workout_template_id IS NOT NULL;
  v_is_associated boolean := NEW.endurance_template_id IS NOT NULL OR NEW.workout_template_id IS NOT NULL;
BEGIN
  IF NOT v_was_associated AND v_is_associated THEN
    IF OLD.template_name_state IS NULL THEN
      NEW.template_name_state := pg_catalog.jsonb_build_object('original_name', OLD.name);
    ELSE
      NEW.template_name_state := OLD.template_name_state;
    END IF;
  ELSIF v_was_associated AND v_is_associated THEN
    NEW.template_name_state := OLD.template_name_state;
  ELSIF v_was_associated AND NOT v_is_associated THEN
    IF OLD.template_name_state IS NOT NULL THEN
      NEW.name := OLD.template_name_state ->> 'original_name';
    END IF;
    NEW.template_name_state := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_activity_template_name_state_trigger
  ON public.activity_sessions;
CREATE TRIGGER preserve_activity_template_name_state_trigger
BEFORE UPDATE OF endurance_template_id, workout_template_id
ON public.activity_sessions
FOR EACH ROW
EXECUTE FUNCTION public.preserve_activity_template_name_state();

CREATE OR REPLACE FUNCTION public.set_one_off_workout_plan(
  p_template_id uuid,
  p_template_kind text,
  p_planned_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_template_exists boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ONE_OFF_AUTH_REQUIRED';
  END IF;
  IF p_template_id IS NULL OR p_template_kind NOT IN ('endurance', 'gym') THEN
    RAISE EXCEPTION 'ONE_OFF_TEMPLATE_INPUT_INVALID';
  END IF;

  IF p_template_kind = 'endurance' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.endurance_workout_templates
      WHERE id = p_template_id AND user_id = v_user_id
    ) INTO v_template_exists;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.workout_templates
      WHERE id = p_template_id AND user_id = v_user_id
    ) INTO v_template_exists;
  END IF;

  IF NOT v_template_exists THEN
    RAISE EXCEPTION 'ONE_OFF_TEMPLATE_NOT_FOUND';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_template_kind || ':' || p_template_id::text, 0)
  );

  IF p_planned_date IS NULL THEN
    DELETE FROM public.workout_plans
    WHERE user_id = v_user_id
      AND is_one_off_schedule
      AND completed_at IS NULL
      AND status IN ('planned', 'rescheduled')
      AND (
        (p_template_kind = 'endurance' AND endurance_template_id = p_template_id)
        OR (p_template_kind = 'gym' AND gym_template_id = p_template_id)
      );
    RETURN NULL;
  END IF;

  SELECT id INTO v_plan_id
  FROM public.workout_plans
  WHERE user_id = v_user_id
    AND is_one_off_schedule
    AND completed_at IS NULL
    AND status IN ('planned', 'rescheduled')
    AND (
      (p_template_kind = 'endurance' AND endurance_template_id = p_template_id)
      OR (p_template_kind = 'gym' AND gym_template_id = p_template_id)
    )
  FOR UPDATE;

  IF v_plan_id IS NOT NULL THEN
    UPDATE public.workout_plans
    SET planned_date = p_planned_date,
        status = 'planned',
        activity_session_id = NULL,
        completed_at = NULL,
        updated_at = pg_catalog.now()
    WHERE id = v_plan_id;
    RETURN v_plan_id;
  END IF;

  INSERT INTO public.workout_plans (
    user_id,
    planned_date,
    endurance_template_id,
    gym_template_id,
    is_one_off_schedule,
    status
  ) VALUES (
    v_user_id,
    p_planned_date,
    CASE WHEN p_template_kind = 'endurance' THEN p_template_id ELSE NULL END,
    CASE WHEN p_template_kind = 'gym' THEN p_template_id ELSE NULL END,
    true,
    'planned'
  )
  RETURNING id INTO v_plan_id;

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_one_off_workout_plan(uuid, text, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_one_off_workout_plan(uuid, text, date)
TO authenticated, service_role;
