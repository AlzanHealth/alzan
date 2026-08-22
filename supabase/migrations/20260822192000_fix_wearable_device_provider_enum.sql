CREATE OR REPLACE FUNCTION public.upsert_wearable_device(
  p_user_id uuid,
  p_provider public.wearable_provider_enum,
  p_device_name text,
  p_device_model text,
  p_device_serial text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_provider public.provider_enum := p_provider::text::public.provider_enum;
BEGIN
  IF p_device_serial IS NULL THEN
    INSERT INTO public.devices (user_id, provider, device_name, device_model, device_serial)
    VALUES (p_user_id, v_provider, p_device_name, p_device_model, NULL)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.devices (user_id, provider, device_name, device_model, device_serial)
  VALUES (p_user_id, v_provider, p_device_name, p_device_model, p_device_serial)
  ON CONFLICT (user_id, provider, device_serial) WHERE device_serial IS NOT NULL
  DO UPDATE SET
    device_name = COALESCE(EXCLUDED.device_name, devices.device_name),
    device_model = COALESCE(EXCLUDED.device_model, devices.device_model),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_wearable_device(uuid, public.wearable_provider_enum, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_wearable_device(uuid, public.wearable_provider_enum, text, text, text) TO service_role;
