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

REVOKE ALL ON FUNCTION public.set_default_running_shoe(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_running_shoe(uuid, boolean) TO authenticated;
