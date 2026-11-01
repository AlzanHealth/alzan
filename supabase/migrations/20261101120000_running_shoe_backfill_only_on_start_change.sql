CREATE OR REPLACE FUNCTION public.update_running_shoe_with_backfill(
  p_shoe_id uuid,
  p_name text,
  p_in_use_since date,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_purchase_date date DEFAULT NULL,
  p_recommended_max_km numeric DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_assigned_sessions integer;
  v_previous_in_use_since date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'RUNNING_SHOE_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_NAME_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_in_use_since IS NULL OR p_in_use_since > CURRENT_DATE THEN
    RAISE EXCEPTION 'RUNNING_SHOE_INVALID_START_DATE' USING ERRCODE = '22023';
  END IF;

  IF p_recommended_max_km IS NOT NULL AND p_recommended_max_km <= 0 THEN
    RAISE EXCEPTION 'RUNNING_SHOE_INVALID_RECOMMENDED_MAXIMUM' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUNNING_SHOE_USER_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  SELECT in_use_since INTO v_previous_in_use_since
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

  IF v_previous_in_use_since IS NOT DISTINCT FROM p_in_use_since THEN
    RETURN 0;
  END IF;

  UPDATE public.activity_sessions AS session
  SET running_shoe_id = p_shoe_id
  WHERE session.user_id = v_user_id
    AND session.sport_type = 'running'
    AND session.running_shoe_id IS NULL
    AND COALESCE(
      session.started_at_local::date,
      (session.start_time AT TIME ZONE COALESCE(NULLIF(session.timezone, ''), 'UTC'))::date
    ) >= p_in_use_since;

  GET DIAGNOSTICS v_assigned_sessions = ROW_COUNT;
  RETURN v_assigned_sessions;
END;
$$;

REVOKE ALL ON FUNCTION public.update_running_shoe_with_backfill(uuid, text, date, text, text, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_running_shoe_with_backfill(uuid, text, date, text, text, date, numeric) TO authenticated;
