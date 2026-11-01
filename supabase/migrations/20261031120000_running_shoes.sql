CREATE TABLE public.running_shoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  brand text,
  model text,
  purchase_date date,
  in_use_since date NOT NULL DEFAULT CURRENT_DATE,
  recommended_max_km numeric CHECK (recommended_max_km IS NULL OR recommended_max_km > 0),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT running_shoes_id_user_id_key UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX running_shoes_one_default_per_user_idx
  ON public.running_shoes (user_id)
  WHERE is_default;

CREATE INDEX running_shoes_user_created_idx
  ON public.running_shoes (user_id, created_at DESC);

ALTER TABLE public.activity_sessions
  ADD COLUMN running_shoe_id uuid;

ALTER TABLE public.activity_sessions
  ADD CONSTRAINT activity_sessions_running_shoe_owner_fkey
  FOREIGN KEY (running_shoe_id, user_id)
  REFERENCES public.running_shoes (id, user_id)
  ON DELETE SET NULL (running_shoe_id);

CREATE INDEX activity_sessions_user_running_shoe_start_idx
  ON public.activity_sessions (user_id, running_shoe_id, start_time DESC)
  WHERE sport_type = 'running';

ALTER TABLE public.running_shoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY running_shoes_select_own
  ON public.running_shoes FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY running_shoes_insert_own
  ON public.running_shoes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY running_shoes_update_own
  ON public.running_shoes FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY running_shoes_delete_own
  ON public.running_shoes FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.running_shoes TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_running_shoe_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.in_use_since > CURRENT_DATE THEN
    RAISE EXCEPTION 'RUNNING_SHOE_FUTURE_START_DATE'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.purchase_date IS NOT NULL AND NEW.purchase_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'RUNNING_SHOE_FUTURE_PURCHASE_DATE'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER running_shoes_validate_dates
  BEFORE INSERT OR UPDATE OF in_use_since, purchase_date
  ON public.running_shoes
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_running_shoe_dates();

CREATE OR REPLACE FUNCTION public.touch_running_shoe_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER running_shoes_touch_updated_at
  BEFORE UPDATE ON public.running_shoes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_running_shoe_updated_at();

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
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER activity_sessions_assign_default_running_shoe
  BEFORE INSERT ON public.activity_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_default_running_shoe();

CREATE OR REPLACE FUNCTION public.create_running_shoe_with_backfill(
  p_name text,
  p_in_use_since date,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_purchase_date date DEFAULT NULL,
  p_recommended_max_km numeric DEFAULT NULL,
  p_is_default boolean DEFAULT false
)
RETURNS TABLE (shoe_id uuid, assigned_sessions integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_shoe_id uuid;
  v_assigned_sessions integer;
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

  UPDATE public.activity_sessions AS session
  SET running_shoe_id = v_shoe_id
  WHERE session.user_id = v_user_id
    AND session.sport_type = 'running'
    AND session.running_shoe_id IS NULL
    AND COALESCE(
      session.started_at_local::date,
      (session.start_time AT TIME ZONE COALESCE(NULLIF(session.timezone, ''), 'UTC'))::date
    ) >= p_in_use_since;

  GET DIAGNOSTICS v_assigned_sessions = ROW_COUNT;
  shoe_id := v_shoe_id;
  assigned_sessions := v_assigned_sessions;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_running_shoe(
  p_shoe_id uuid,
  p_make_default boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'RUNNING_SHOE_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUNNING_SHOE_USER_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.running_shoes
    WHERE id = p_shoe_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'RUNNING_SHOE_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF p_make_default THEN
    UPDATE public.running_shoes
    SET is_default = false
    WHERE user_id = v_user_id AND is_default AND id <> p_shoe_id;

    UPDATE public.running_shoes
    SET is_default = true
    WHERE id = p_shoe_id AND user_id = v_user_id AND NOT is_default;
  ELSE
    UPDATE public.running_shoes
    SET is_default = false
    WHERE id = p_shoe_id AND user_id = v_user_id AND is_default;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_running_shoe_mileage()
RETURNS TABLE (shoe_id uuid, total_distance_m numeric, sessions_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    shoe.id,
    COALESCE(SUM(session.distance_m), 0)::numeric,
    COUNT(session.id)::bigint
  FROM public.running_shoes AS shoe
  LEFT JOIN public.activity_sessions AS session
    ON session.running_shoe_id = shoe.id
    AND session.user_id = shoe.user_id
    AND session.sport_type = 'running'
  WHERE shoe.user_id = auth.uid()
  GROUP BY shoe.id
  ORDER BY shoe.created_at DESC, shoe.id;
$$;

REVOKE ALL ON FUNCTION public.create_running_shoe_with_backfill(text, date, text, text, date, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_running_shoe_with_backfill(text, date, text, text, date, numeric, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_default_running_shoe(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_running_shoe(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_running_shoe_mileage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_running_shoe_mileage() TO authenticated;
