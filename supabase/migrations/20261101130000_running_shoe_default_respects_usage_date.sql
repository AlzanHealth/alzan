CREATE OR REPLACE FUNCTION public.assign_default_running_shoe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sport_type = 'running' AND NEW.running_shoe_id IS NULL THEN
    SELECT id
    INTO NEW.running_shoe_id
    FROM public.running_shoes
    WHERE user_id = NEW.user_id
      AND is_default
      AND in_use_since <= COALESCE(
        NEW.started_at_local::date,
        (NEW.start_time AT TIME ZONE COALESCE(NULLIF(NEW.timezone, ''), 'UTC'))::date,
        CURRENT_DATE
      )
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;
