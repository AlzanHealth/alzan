-- =============================================================================
-- Wearables phase 4: query and dedupe indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_activity_sessions_user_start
ON public.activity_sessions (user_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_provider_record
ON public.activity_sessions (provider, provider_activity_id)
WHERE provider_activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_sessions_source_record
ON public.activity_sessions (
  user_id,
  provider,
  COALESCE(source_channel, ''),
  COALESCE(source_package, ''),
  source_record_id
)
WHERE source_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_route_points_session_time
ON public.activity_route_points (session_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_route_points_user_time
ON public.activity_route_points (user_id, timestamp DESC)
WHERE timestamp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stream_samples_user_type_time
ON public.activity_stream_samples (user_id, stream_type, timestamp DESC)
WHERE timestamp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stream_samples_session_type_offset
ON public.activity_stream_samples (session_id, stream_type, offset_s)
WHERE offset_s IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_health_metric_user_type_time
ON public.health_metric_samples (user_id, metric_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_payload_hash
ON public.external_raw_payloads_v2 (payload_hash);

CREATE INDEX IF NOT EXISTS idx_sync_state_user_provider
ON public.integration_sync_state (user_id, provider, sync_domain);
