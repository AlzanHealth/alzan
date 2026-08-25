BEGIN;

CREATE TEMP TABLE copy_session_performance_context (
  user_id uuid NOT NULL,
  source_id uuid NOT NULL,
  copy_id uuid
) ON COMMIT DROP;

INSERT INTO copy_session_performance_context (user_id, source_id)
SELECT id, gen_random_uuid()
FROM public.users
ORDER BY created_at
LIMIT 1;

DO $setup$
DECLARE
  v_user_id uuid;
  v_source_id uuid;
BEGIN
  SELECT user_id, source_id
  INTO v_user_id, v_source_id
  FROM copy_session_performance_context;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'COPY_SESSION_PERFORMANCE_TEST_REQUIRES_LOCAL_USER';
  END IF;

  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, source, provider, status, start_time, end_time,
    started_at_local, ended_at_local, duration_s, name, timezone
  ) VALUES (
    v_source_id, v_user_id, 'running', 'imported', 'coros', 'completed',
    '2098-01-01 08:00:00+00', '2098-01-01 09:00:00+00',
    '2098-01-01 09:00:00', '2098-01-01 10:00:00', 3600,
    'Copy performance source', 'Europe/Madrid'
  );

  INSERT INTO public.activity_route_points (
    session_id, user_id, point_index, lat, lon, "timestamp", source
  )
  SELECT
    v_source_id,
    v_user_id,
    point_index,
    41.3874,
    2.1686,
    '2098-01-01 08:00:00+00'::timestamptz + make_interval(secs => point_index),
    'wearable_import'
  FROM generate_series(1, 10000) AS point_index;

  INSERT INTO public.activity_stream_samples (
    session_id, user_id, stream_type, value, offset_s, source
  )
  SELECT
    v_source_id,
    v_user_id,
    'heart_rate',
    140,
    sample_offset,
    'wearable_import'
  FROM generate_series(1, 50000) AS sample_offset;
END;
$setup$;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::text FROM copy_session_performance_context),
  true
);

SET LOCAL statement_timeout = '2s';

UPDATE copy_session_performance_context
SET copy_id = public.copy_completed_activity_session(source_id, '2098-01-02');

SET LOCAL statement_timeout = '0';

DO $assertions$
DECLARE
  v_copy_id uuid;
BEGIN
  SELECT copy_id INTO v_copy_id FROM copy_session_performance_context;

  IF v_copy_id IS NULL
    OR (SELECT count(*) FROM public.activity_route_points WHERE session_id = v_copy_id) <> 10000
    OR (SELECT count(*) FROM public.activity_stream_samples WHERE session_id = v_copy_id) <> 50000
  THEN
    RAISE EXCEPTION 'COPY_SESSION_PERFORMANCE_ROWS_MISSING';
  END IF;
END;
$assertions$;

ROLLBACK;
