CREATE OR REPLACE FUNCTION public.store_external_raw_payload(
  p_user_id uuid,
  p_provider public.wearable_provider_enum,
  p_source_channel text,
  p_source_package text,
  p_object_type text,
  p_source_record_id text,
  p_payload_hash text,
  p_payload jsonb,
  p_size_bytes bigint,
  p_trace_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_source_record_id IS NULL THEN
    INSERT INTO public.external_raw_payloads_v2 (
      user_id, provider, source_channel, source_package, object_type,
      source_record_id, payload_hash, payload, size_bytes, trace_id
    ) VALUES (
      p_user_id, p_provider, p_source_channel, p_source_package, p_object_type,
      p_source_record_id, p_payload_hash, p_payload, p_size_bytes, p_trace_id
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.external_raw_payloads_v2 (
    user_id, provider, source_channel, source_package, object_type,
    source_record_id, payload_hash, payload, size_bytes, trace_id
  ) VALUES (
    p_user_id, p_provider, p_source_channel, p_source_package, p_object_type,
    p_source_record_id, p_payload_hash, p_payload, p_size_bytes, p_trace_id
  )
  ON CONFLICT (
    user_id, provider, source_channel, (COALESCE(source_package, '')),
    object_type, source_record_id, payload_hash
  ) WHERE source_record_id IS NOT NULL
  DO UPDATE SET id = external_raw_payloads_v2.id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

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
BEGIN
  IF p_device_serial IS NULL THEN
    INSERT INTO public.devices (user_id, provider, device_name, device_model, device_serial)
    VALUES (p_user_id, p_provider, p_device_name, p_device_model, NULL)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.devices (user_id, provider, device_name, device_model, device_serial)
  VALUES (p_user_id, p_provider, p_device_name, p_device_model, p_device_serial)
  ON CONFLICT (user_id, provider, device_serial) WHERE device_serial IS NOT NULL
  DO UPDATE SET
    device_name = COALESCE(EXCLUDED.device_name, devices.device_name),
    device_model = COALESCE(EXCLUDED.device_model, devices.device_model),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_integration_sync_state(
  p_user_id uuid,
  p_provider public.wearable_provider_enum,
  p_source_channel text,
  p_source_package text,
  p_sync_domain text,
  p_cursor_token text,
  p_anchor_token text,
  p_last_record_at timestamptz,
  p_status text,
  p_last_error text,
  p_metadata jsonb,
  p_attempted_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.integration_sync_state (
    user_id, provider, source_channel, source_package, sync_domain,
    cursor_token, anchor_token, last_record_at, status, last_error,
    metadata, last_attempt_at, last_success_at, updated_at
  ) VALUES (
    p_user_id, p_provider, p_source_channel, p_source_package, p_sync_domain,
    p_cursor_token, p_anchor_token, p_last_record_at, p_status, p_last_error,
    p_metadata, p_attempted_at,
    CASE WHEN p_status IN ('error', 'partial') THEN NULL ELSE p_attempted_at END,
    p_attempted_at
  )
  ON CONFLICT (
    user_id, provider, source_channel, (COALESCE(source_package, '')), sync_domain
  )
  DO UPDATE SET
    cursor_token = COALESCE(EXCLUDED.cursor_token, integration_sync_state.cursor_token),
    anchor_token = COALESCE(EXCLUDED.anchor_token, integration_sync_state.anchor_token),
    last_record_at = COALESCE(EXCLUDED.last_record_at, integration_sync_state.last_record_at),
    status = EXCLUDED.status,
    last_error = EXCLUDED.last_error,
    metadata = EXCLUDED.metadata,
    last_attempt_at = EXCLUDED.last_attempt_at,
    last_success_at = CASE
      WHEN EXCLUDED.status IN ('error', 'partial') THEN integration_sync_state.last_success_at
      ELSE EXCLUDED.last_attempt_at
    END,
    updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.store_external_raw_payload(uuid, public.wearable_provider_enum, text, text, text, text, text, jsonb, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_wearable_device(uuid, public.wearable_provider_enum, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_integration_sync_state(uuid, public.wearable_provider_enum, text, text, text, text, text, timestamptz, text, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_external_raw_payload(uuid, public.wearable_provider_enum, text, text, text, text, text, jsonb, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_wearable_device(uuid, public.wearable_provider_enum, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_integration_sync_state(uuid, public.wearable_provider_enum, text, text, text, text, text, timestamptz, text, text, jsonb, timestamptz) TO service_role;
