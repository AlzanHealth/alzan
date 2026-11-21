-- Dead-letter COROS events are no longer read by the durable queue. Keep the
-- processing error and source fingerprint for diagnosis, but discard the raw
-- body after retries are exhausted.
CREATE OR REPLACE FUNCTION public.clear_processed_external_raw_payload_body()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    NEW.provider::text = 'coros'
    AND NEW.source_channel = 'cloud'
    AND NEW.object_type = 'coros_workout_push'
    AND NEW.processing_status IN ('pending', 'retry')
    AND NEW.processed_at IS NULL
  ) THEN
    NEW.payload := NULL;
    NEW.size_bytes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.external_raw_payloads_v2
SET payload = NULL,
    size_bytes = NULL
WHERE (payload IS NOT NULL OR size_bytes IS NOT NULL)
  AND NOT (
    provider::text = 'coros'
    AND source_channel = 'cloud'
    AND object_type = 'coros_workout_push'
    AND processing_status IN ('pending', 'retry')
    AND processed_at IS NULL
  );

COMMENT ON FUNCTION public.clear_processed_external_raw_payload_body() IS
  'Retains raw bodies only for unprocessed pending or retryable COROS webhooks; processed and dead-letter events retain metadata only.';
