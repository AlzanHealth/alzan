ALTER TABLE public.external_raw_payloads_v2
  ADD COLUMN processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'retry', 'processed', 'dead_letter')),
  ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  ADD COLUMN next_processing_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN processing_error text;

CREATE INDEX external_raw_payloads_v2_processing_queue_idx
ON public.external_raw_payloads_v2 (provider, object_type, processing_status, next_processing_at, received_at)
WHERE processed_at IS NULL;

ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS pre_wearable_merge_snapshot jsonb
  CHECK (pre_wearable_merge_snapshot IS NULL OR jsonb_typeof(pre_wearable_merge_snapshot) = 'object');

COMMENT ON COLUMN public.activity_sessions.pre_wearable_merge_snapshot IS
  'Native Alzan session fields captured before a wearable association so provider deletion can restore them exactly.';
