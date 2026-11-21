-- Keep raw bodies only for the durable COROS webhook queue. Synchronous imports
-- retain normalized values and provenance hashes without storing the body.

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

DROP TRIGGER IF EXISTS clear_processed_external_raw_payload_body ON public.external_raw_payloads_v2;
CREATE TRIGGER clear_processed_external_raw_payload_body
  BEFORE INSERT OR UPDATE ON public.external_raw_payloads_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_processed_external_raw_payload_body();

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

-- These JSON copies are not read by the app; keep the canonical metric fields
-- and source identifiers instead.
UPDATE public.provider_data_origins SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.daily_steps SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.step_intervals SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.sleep_sessions SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.sleep_stage_intervals SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.sleep_biomarker_samples SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.daily_recovery SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.health_metric_samples SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.activity_route_points SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
UPDATE public.activity_stream_samples SET raw_payload = NULL WHERE raw_payload IS NOT NULL;

-- The app renders the encoded route stored on activity_sessions. The legacy
-- per-point wearable table is a duplicate and has no app readers.
DELETE FROM public.activity_route_points WHERE source = 'wearable_import';

-- Only the three streams below have app readers. New imports filter at write
-- time; existing sample rows remain subject to the separate 90-day archive.
-- Preserve session summaries, heart-rate zones, laps and imported-strength
-- JSON streams.
DELETE FROM public.activity_streams
WHERE source = 'wearable_import';

-- Provider provenance remains available on activity_sessions; vendor fields
-- and fingerprints in this table have no app readers.
UPDATE public.activity_provider_fields
SET fields = '{}'::jsonb,
    raw_metadata = NULL
WHERE fields <> '{}'::jsonb OR raw_metadata IS NOT NULL;

COMMENT ON FUNCTION public.clear_processed_external_raw_payload_body() IS
  'Retains bodies only for active or dead-letter COROS webhook recovery; other provider bodies are not persisted.';
