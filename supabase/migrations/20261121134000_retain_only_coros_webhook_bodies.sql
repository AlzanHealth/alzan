-- The durable COROS webhook queue is the only database reader of raw bodies.
-- Keep those bodies for pending/retry/dead-letter recovery; store hashes and
-- source metadata without bodies for every synchronous provider import.
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
    AND (
      NEW.processing_status = 'dead_letter'
      OR (NEW.processing_status IN ('pending', 'retry') AND NEW.processed_at IS NULL)
    )
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
    AND (
      processing_status = 'dead_letter'
      OR (processing_status IN ('pending', 'retry') AND processed_at IS NULL)
    )
  );

COMMENT ON FUNCTION public.clear_processed_external_raw_payload_body() IS
  'Retains raw bodies only for pending, retryable, or dead-letter COROS webhooks; synchronous imports store hashes and metadata only.';

-- Provider identity and synchronization provenance are already stored on the
-- activity session. Empty provider-field rows have no app readers or unique
-- data, so skip them on future imports and remove existing empty copies.
CREATE OR REPLACE FUNCTION public.skip_empty_activity_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(NEW.fields, '{}'::jsonb) = '{}'::jsonb AND NEW.raw_metadata IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS skip_empty_activity_provider_fields ON public.activity_provider_fields;
CREATE TRIGGER skip_empty_activity_provider_fields
  BEFORE INSERT ON public.activity_provider_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.skip_empty_activity_provider_fields();

DELETE FROM public.activity_provider_fields
WHERE COALESCE(fields, '{}'::jsonb) = '{}'::jsonb
  AND raw_metadata IS NULL;

COMMENT ON FUNCTION public.skip_empty_activity_provider_fields() IS
  'Skips provider-field rows with no app-consumed vendor fields or metadata.';
