BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_event_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'COROS_WEBHOOK_QUEUE_TEST_REQUIRES_LOCAL_USER'; END IF;

  INSERT INTO public.external_raw_payloads_v2 (
    id, user_id, provider, source_channel, object_type, source_record_id, payload_hash, payload
  ) VALUES (
    v_event_id, v_user_id, 'coros', 'cloud', 'coros_workout_push', 'queue-test',
    encode(digest('coros-webhook-queue-test', 'sha256'), 'hex'),
    jsonb_build_object('labelId', 'queue-test')
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.external_raw_payloads_v2
    WHERE id = v_event_id
      AND processing_status = 'pending'
      AND processing_attempts = 0
      AND next_processing_at IS NOT NULL
      AND processing_error IS NULL
  ) THEN
    RAISE EXCEPTION 'COROS_WEBHOOK_QUEUE_DEFAULTS_INVALID';
  END IF;

  UPDATE public.external_raw_payloads_v2
  SET processing_status = 'dead_letter',
      processing_attempts = 10,
      processing_error = 'invalid payload',
      processed_at = now()
  WHERE id = v_event_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.external_raw_payloads_v2
    WHERE id = v_event_id AND processing_status = 'dead_letter' AND processed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'COROS_WEBHOOK_DEAD_LETTER_STATE_INVALID';
  END IF;
END;
$$;

ROLLBACK;
