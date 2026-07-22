ALTER TABLE public.activity_sessions
  ADD COLUMN template_suggestion_deferred_at timestamptz;

COMMENT ON COLUMN public.activity_sessions.template_suggestion_deferred_at IS
  'When the user chose to keep the activity generic without deleting its current template suggestion.';

CREATE OR REPLACE FUNCTION public.reset_deferred_template_suggestion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.endurance_template_id IS NOT NULL
     OR NEW.workout_template_id IS NOT NULL
     OR NEW.suggested_endurance_template_id IS DISTINCT FROM OLD.suggested_endurance_template_id THEN
    NEW.template_suggestion_deferred_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reset_deferred_template_suggestion
BEFORE UPDATE ON public.activity_sessions
FOR EACH ROW
EXECUTE FUNCTION public.reset_deferred_template_suggestion();
