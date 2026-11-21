-- Preserve raw bodies only for incomplete/retryable or dead-letter COROS
-- webhooks. Synchronous imports keep hashes and source metadata, not bodies.
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

-- Preserve the session route polyline, which is what the app renders, while
-- dropping the redundant point-by-point wearable copy.
DELETE FROM public.activity_route_points WHERE source = 'wearable_import';

COMMENT ON FUNCTION public.clear_processed_external_raw_payload_body() IS
  'Retains bodies only for active or dead-letter COROS webhook recovery; other provider bodies are not persisted.';
