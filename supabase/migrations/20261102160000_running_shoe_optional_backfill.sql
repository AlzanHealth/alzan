BEGIN;

DROP FUNCTION IF EXISTS public.create_running_shoe_with_backfill(text, date, text, text, date, numeric, boolean);
DROP FUNCTION IF EXISTS public.update_running_shoe_with_backfill(uuid, text, date, text, text, date, numeric);

CREATE FUNCTION public.create_running_shoe_with_backfill(
  p_name text,
  p_in_use_since date,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_purchase_date date DEFAULT NULL,
  p_recommended_max_km numeric DEFAULT NULL,
  p_is_default boolean DEFAULT false,
  p_backfill_previous_runs boolean DEFAULT false
)
RETURNS TABLE (shoe_id uuid, assigned_sessions integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_timezone text := COALESCE((SELECT NULLIF(timezone, '') FROM public.user_preferences WHERE user_id = v_user_id), 'UTC');
  v_today date := CASE
    WHEN v_timezone ~ '^[+-][0-9]{2}:[0-9]{2}$'
      THEN (now() AT TIME ZONE 'UTC' + v_timezone::interval)::date
    ELSE (now() AT TIME ZONE v_timezone)::date
  END;
  v_shoe_id uuid;
  v_assigned_sessions integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'RUNNING_SHOE_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_NAME_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_in_use_since IS NULL OR p_in_use_since > v_today THEN
    RAISE EXCEPTION 'RUNNING_SHOE_INVALID_START_DATE' USING ERRCODE = '22023';
  END IF;

  IF p_recommended_max_km IS NOT NULL AND p_recommended_max_km <= 0 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_INVALID_RECOMMENDED_MAXIMUM' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUNNING_SHOE_USER_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  IF p_is_default THEN
    UPDATE public.running_shoes
    SET is_default = false
    WHERE user_id = v_user_id AND is_default;
  END IF;

  INSERT INTO public.running_shoes (
    user_id, name, brand, model, purchase_date, in_use_since,
    recommended_max_km, is_default
  ) VALUES (
    v_user_id, btrim(p_name), NULLIF(btrim(p_brand), ''), NULLIF(btrim(p_model), ''),
    p_purchase_date, p_in_use_since, p_recommended_max_km, p_is_default
  )
  RETURNING id INTO v_shoe_id;

  IF p_backfill_previous_runs THEN
    UPDATE public.activity_sessions AS session
    SET running_shoe_id = v_shoe_id
    WHERE session.user_id = v_user_id
      AND session.sport_type = 'running'
      AND session.running_shoe_id IS NULL
      AND COALESCE(
        session.started_at_local::date,
        CASE
          WHEN session.timezone ~ '^[+-][0-9]{2}:[0-9]{2}$'
            THEN (session.start_time AT TIME ZONE 'UTC' + session.timezone::interval)::date
          ELSE (session.start_time AT TIME ZONE COALESCE(NULLIF(session.timezone, ''), 'UTC'))::date
        END
      ) >= p_in_use_since;

    GET DIAGNOSTICS v_assigned_sessions = ROW_COUNT;
  ELSE
    v_assigned_sessions := 0;
  END IF;

  shoe_id := v_shoe_id;
  assigned_sessions := v_assigned_sessions;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.update_running_shoe_with_backfill(
  p_shoe_id uuid,
  p_name text,
  p_in_use_since date,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_purchase_date date DEFAULT NULL,
  p_recommended_max_km numeric DEFAULT NULL,
  p_backfill_previous_runs boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_timezone text := COALESCE((SELECT NULLIF(timezone, '') FROM public.user_preferences WHERE user_id = v_user_id), 'UTC');
  v_today date := CASE
    WHEN v_timezone ~ '^[+-][0-9]{2}:[0-9]{2}$'
      THEN (now() AT TIME ZONE 'UTC' + v_timezone::interval)::date
    ELSE (now() AT TIME ZONE v_timezone)::date
  END;
  v_assigned_sessions integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'RUNNING_SHOE_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_NAME_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_in_use_since IS NULL OR p_in_use_since > v_today THEN
    RAISE EXCEPTION 'RUNNING_SHOE_INVALID_START_DATE' USING ERRCODE = '22023';
  END IF;

  IF p_recommended_max_km IS NOT NULL AND p_recommended_max_km <= 0 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_INVALID_RECOMMENDED_MAXIMUM' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUNNING_SHOE_USER_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.running_shoes
  WHERE id = p_shoe_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUNNING_SHOE_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  UPDATE public.running_shoes
  SET name = btrim(p_name),
      brand = NULLIF(btrim(p_brand), ''),
      model = NULLIF(btrim(p_model), ''),
      purchase_date = p_purchase_date,
      in_use_since = p_in_use_since,
      recommended_max_km = p_recommended_max_km
  WHERE id = p_shoe_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUNNING_SHOE_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF NOT p_backfill_previous_runs THEN
    RETURN 0;
  END IF;

  UPDATE public.activity_sessions AS session
  SET running_shoe_id = p_shoe_id
  WHERE session.user_id = v_user_id
    AND session.sport_type = 'running'
    AND session.running_shoe_id IS NULL
    AND COALESCE(
      session.started_at_local::date,
      CASE
        WHEN session.timezone ~ '^[+-][0-9]{2}:[0-9]{2}$'
          THEN (session.start_time AT TIME ZONE 'UTC' + session.timezone::interval)::date
        ELSE (session.start_time AT TIME ZONE COALESCE(NULLIF(session.timezone, ''), 'UTC'))::date
      END
    ) >= p_in_use_since;

  GET DIAGNOSTICS v_assigned_sessions = ROW_COUNT;
  RETURN v_assigned_sessions;
END;
$$;

REVOKE ALL ON FUNCTION public.create_running_shoe_with_backfill(text, date, text, text, date, numeric, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_running_shoe_with_backfill(text, date, text, text, date, numeric, boolean, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.update_running_shoe_with_backfill(uuid, text, date, text, text, date, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_running_shoe_with_backfill(uuid, text, date, text, text, date, numeric, boolean) TO authenticated;

COMMIT;
