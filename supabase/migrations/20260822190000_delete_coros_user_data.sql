-- Remove every COROS-owned record for one user while preserving native Alzan
-- sessions that merely absorbed watch metrics during reconciliation.

CREATE OR REPLACE FUNCTION public.delete_coros_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_imported_session_ids uuid[];
  v_linked_session_ids uuid[];
  v_deleted_activities integer := 0;
  v_deleted_health_rows integer := 0;
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_imported_session_ids
  FROM public.activity_sessions
  WHERE user_id = p_user_id
    AND provider = 'coros'
    AND source = 'imported';

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_linked_session_ids
  FROM public.activity_sessions
  WHERE user_id = p_user_id
    AND provider = 'coros'
    AND source <> 'imported';

  UPDATE public.workout_plans
  SET activity_session_id = NULL,
      updated_at = now()
  WHERE user_id = p_user_id
    AND activity_session_id = ANY(v_imported_session_ids);

  DELETE FROM public.external_activity_mappings
  WHERE user_id = p_user_id
    AND provider = 'coros';

  DELETE FROM public.activity_files
  WHERE user_id = p_user_id
    AND provider = 'coros';

  DELETE FROM public.activity_provider_fields
  WHERE user_id = p_user_id
    AND session_id = ANY(v_linked_session_ids);
  DELETE FROM public.activity_route_points
  WHERE user_id = p_user_id
    AND session_id = ANY(v_linked_session_ids);
  DELETE FROM public.activity_stream_samples
  WHERE user_id = p_user_id
    AND session_id = ANY(v_linked_session_ids);
  DELETE FROM public.activity_streams
  WHERE user_id = p_user_id
    AND session_id = ANY(v_linked_session_ids);
  DELETE FROM public.activity_heart_rate_zones
  WHERE session_id = ANY(v_linked_session_ids);
  DELETE FROM public.activity_laps
  WHERE session_id = ANY(v_linked_session_ids);

  UPDATE public.activity_sessions
  SET provider = 'manual',
      provider_activity_id = NULL,
      device_id = NULL,
      imported_at = NULL,
      source_channel = NULL,
      source_package = NULL,
      source_provider_key = NULL,
      source_record_id = NULL,
      source_updated_at = NULL,
      raw_payload_id = NULL,
      distance_m = NULL,
      elev_gain_m = NULL,
      elev_loss_m = NULL,
      avg_heart_rate = NULL,
      max_heart_rate = NULL,
      min_heart_rate = NULL,
      avg_speed_m_per_s = NULL,
      calories_kcal = NULL,
      avg_cadence = NULL,
      max_cadence = NULL,
      avg_power_w = NULL,
      max_power_w = NULL,
      avg_temp_c = NULL,
      max_temp_c = NULL,
      recovery_time_s = NULL,
      total_steps = NULL,
      vo2_max = NULL,
      tss_hr = NULL,
      epoc = NULL,
      pte = NULL,
      updated_at = now()
  WHERE id = ANY(v_linked_session_ids)
    AND user_id = p_user_id;

  DELETE FROM public.activity_sessions
  WHERE id = ANY(v_imported_session_ids)
    AND user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_activities = ROW_COUNT;

  DELETE FROM public.health_metric_samples WHERE user_id = p_user_id AND provider = 'coros';
  GET DIAGNOSTICS v_deleted_health_rows = ROW_COUNT;
  DELETE FROM public.resting_hr_logs WHERE user_id = p_user_id AND source = 'coros';
  DELETE FROM public.vo2_max_logs WHERE user_id = p_user_id AND provider = 'coros';
  DELETE FROM public.weight_logs WHERE user_id = p_user_id AND source = 'coros';
  DELETE FROM public.daily_steps WHERE user_id = p_user_id AND source = 'coros';
  DELETE FROM public.sleep_sessions WHERE user_id = p_user_id AND source = 'coros';
  DELETE FROM public.daily_recovery WHERE user_id = p_user_id AND source = 'coros';

  DELETE FROM public.wearable_activity_imports WHERE user_id = p_user_id AND provider = 'coros';
  DELETE FROM public.wearable_sync_jobs WHERE user_id = p_user_id AND provider = 'coros';
  DELETE FROM public.integration_sync_state WHERE user_id = p_user_id AND provider = 'coros';
  DELETE FROM public.provider_data_origins WHERE user_id = p_user_id AND provider = 'coros';
  DELETE FROM public.external_raw_payloads_v2 WHERE user_id = p_user_id AND provider = 'coros';
  DELETE FROM public.user_connections WHERE user_id = p_user_id AND provider = 'coros';
  DELETE FROM public.devices WHERE user_id = p_user_id AND provider = 'coros';

  RETURN jsonb_build_object(
    'activities_deleted', v_deleted_activities,
    'linked_sessions_cleaned', cardinality(v_linked_session_ids),
    'health_samples_deleted', v_deleted_health_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_coros_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_coros_user_data(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_coros_user_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_coros_user_data(uuid) TO service_role;
