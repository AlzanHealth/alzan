-- Remove every COROS-owned record for one user while preserving native Alzan
-- sessions that merely absorbed watch metrics during reconciliation.

ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS pre_wearable_merge_snapshot jsonb
  CHECK (pre_wearable_merge_snapshot IS NULL OR jsonb_typeof(pre_wearable_merge_snapshot) = 'object');

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
  SET sport_type = CASE
        WHEN pre_wearable_merge_snapshot ? 'sport_type'
          THEN (pre_wearable_merge_snapshot->>'sport_type')::public.sport_type_enum
        ELSE sport_type
      END,
      sport_subtype = CASE WHEN pre_wearable_merge_snapshot ? 'sport_subtype'
        THEN NULLIF(pre_wearable_merge_snapshot->>'sport_subtype', '') ELSE sport_subtype END,
      start_time = CASE WHEN pre_wearable_merge_snapshot ? 'start_time'
        THEN (pre_wearable_merge_snapshot->>'start_time')::timestamptz ELSE start_time END,
      end_time = CASE WHEN pre_wearable_merge_snapshot ? 'end_time'
        THEN NULLIF(pre_wearable_merge_snapshot->>'end_time', '')::timestamptz ELSE NULL END,
      duration_s = CASE WHEN pre_wearable_merge_snapshot ? 'duration_s'
        THEN NULLIF(pre_wearable_merge_snapshot->>'duration_s', '')::integer ELSE NULL END,
      timezone = CASE WHEN pre_wearable_merge_snapshot ? 'timezone'
        THEN NULLIF(pre_wearable_merge_snapshot->>'timezone', '') ELSE NULL END,
      started_at_local = CASE WHEN pre_wearable_merge_snapshot ? 'started_at_local'
        THEN NULLIF(pre_wearable_merge_snapshot->>'started_at_local', '')::timestamp ELSE NULL END,
      ended_at_local = CASE WHEN pre_wearable_merge_snapshot ? 'ended_at_local'
        THEN NULLIF(pre_wearable_merge_snapshot->>'ended_at_local', '')::timestamp ELSE NULL END,
      route_polyline = CASE WHEN pre_wearable_merge_snapshot ? 'route_polyline'
        THEN NULLIF(pre_wearable_merge_snapshot->>'route_polyline', '') ELSE NULL END,
      status = CASE WHEN pre_wearable_merge_snapshot ? 'status'
        THEN (pre_wearable_merge_snapshot->>'status')::public.activity_status_enum ELSE 'active'::public.activity_status_enum END,
      provider = 'manual',
      provider_activity_id = NULL,
      device_id = CASE WHEN pre_wearable_merge_snapshot ? 'device_id'
        THEN NULLIF(pre_wearable_merge_snapshot->>'device_id', '')::uuid ELSE NULL END,
      imported_at = NULL,
      source_channel = NULL,
      source_package = NULL,
      source_provider_key = NULL,
      source_record_id = NULL,
      source_updated_at = NULL,
      raw_payload_id = NULL,
      distance_m = CASE WHEN pre_wearable_merge_snapshot ? 'distance_m' THEN NULLIF(pre_wearable_merge_snapshot->>'distance_m', '')::numeric ELSE NULL END,
      elev_gain_m = CASE WHEN pre_wearable_merge_snapshot ? 'elev_gain_m' THEN NULLIF(pre_wearable_merge_snapshot->>'elev_gain_m', '')::numeric ELSE NULL END,
      elev_loss_m = CASE WHEN pre_wearable_merge_snapshot ? 'elev_loss_m' THEN NULLIF(pre_wearable_merge_snapshot->>'elev_loss_m', '')::numeric ELSE NULL END,
      avg_heart_rate = CASE WHEN pre_wearable_merge_snapshot ? 'avg_heart_rate' THEN NULLIF(pre_wearable_merge_snapshot->>'avg_heart_rate', '')::integer ELSE NULL END,
      max_heart_rate = CASE WHEN pre_wearable_merge_snapshot ? 'max_heart_rate' THEN NULLIF(pre_wearable_merge_snapshot->>'max_heart_rate', '')::integer ELSE NULL END,
      min_heart_rate = CASE WHEN pre_wearable_merge_snapshot ? 'min_heart_rate' THEN NULLIF(pre_wearable_merge_snapshot->>'min_heart_rate', '')::numeric ELSE NULL END,
      avg_speed_m_per_s = CASE WHEN pre_wearable_merge_snapshot ? 'avg_speed_m_per_s' THEN NULLIF(pre_wearable_merge_snapshot->>'avg_speed_m_per_s', '')::numeric ELSE NULL END,
      calories_kcal = CASE WHEN pre_wearable_merge_snapshot ? 'calories_kcal' THEN NULLIF(pre_wearable_merge_snapshot->>'calories_kcal', '')::numeric ELSE NULL END,
      avg_cadence = CASE WHEN pre_wearable_merge_snapshot ? 'avg_cadence' THEN NULLIF(pre_wearable_merge_snapshot->>'avg_cadence', '')::integer ELSE NULL END,
      max_cadence = CASE WHEN pre_wearable_merge_snapshot ? 'max_cadence' THEN NULLIF(pre_wearable_merge_snapshot->>'max_cadence', '')::integer ELSE NULL END,
      avg_power_w = CASE WHEN pre_wearable_merge_snapshot ? 'avg_power_w' THEN NULLIF(pre_wearable_merge_snapshot->>'avg_power_w', '')::integer ELSE NULL END,
      max_power_w = CASE WHEN pre_wearable_merge_snapshot ? 'max_power_w' THEN NULLIF(pre_wearable_merge_snapshot->>'max_power_w', '')::integer ELSE NULL END,
      avg_temp_c = CASE WHEN pre_wearable_merge_snapshot ? 'avg_temp_c' THEN NULLIF(pre_wearable_merge_snapshot->>'avg_temp_c', '')::numeric ELSE NULL END,
      max_temp_c = CASE WHEN pre_wearable_merge_snapshot ? 'max_temp_c' THEN NULLIF(pre_wearable_merge_snapshot->>'max_temp_c', '')::numeric ELSE NULL END,
      recovery_time_s = CASE WHEN pre_wearable_merge_snapshot ? 'recovery_time_s' THEN NULLIF(pre_wearable_merge_snapshot->>'recovery_time_s', '')::integer ELSE NULL END,
      total_steps = CASE WHEN pre_wearable_merge_snapshot ? 'total_steps' THEN NULLIF(pre_wearable_merge_snapshot->>'total_steps', '')::integer ELSE NULL END,
      vo2_max = CASE WHEN pre_wearable_merge_snapshot ? 'vo2_max' THEN NULLIF(pre_wearable_merge_snapshot->>'vo2_max', '')::numeric ELSE NULL END,
      tss_hr = CASE WHEN pre_wearable_merge_snapshot ? 'tss_hr' THEN NULLIF(pre_wearable_merge_snapshot->>'tss_hr', '')::numeric ELSE NULL END,
      epoc = CASE WHEN pre_wearable_merge_snapshot ? 'epoc' THEN NULLIF(pre_wearable_merge_snapshot->>'epoc', '')::numeric ELSE NULL END,
      pte = CASE WHEN pre_wearable_merge_snapshot ? 'pte' THEN NULLIF(pre_wearable_merge_snapshot->>'pte', '')::numeric ELSE NULL END,
      duplicate_of_session_id = CASE WHEN pre_wearable_merge_snapshot ? 'duplicate_of_session_id' THEN NULLIF(pre_wearable_merge_snapshot->>'duplicate_of_session_id', '')::uuid ELSE NULL END,
      duplicate_score = CASE WHEN pre_wearable_merge_snapshot ? 'duplicate_score' THEN NULLIF(pre_wearable_merge_snapshot->>'duplicate_score', '')::numeric ELSE NULL END,
      duplicate_resolution = CASE WHEN pre_wearable_merge_snapshot ? 'duplicate_resolution' THEN NULLIF(pre_wearable_merge_snapshot->>'duplicate_resolution', '')::public.import_duplicate_resolution_enum ELSE NULL END,
      needs_strength_review = CASE WHEN pre_wearable_merge_snapshot ? 'needs_strength_review' THEN COALESCE((pre_wearable_merge_snapshot->>'needs_strength_review')::boolean, false) ELSE false END,
      pending_watch_metrics = CASE WHEN pre_wearable_merge_snapshot ? 'pending_watch_metrics' THEN pre_wearable_merge_snapshot->'pending_watch_metrics' ELSE NULL END,
      pre_wearable_merge_snapshot = NULL,
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
