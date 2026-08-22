-- Minimal encrypted outbox used when a provider is unavailable during a local
-- disconnect. It intentionally has no user FK so account deletion cannot erase
-- the pending remote revocation before the 24-hour retry window ends.

CREATE TABLE public.provider_deauthorization_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.wearable_provider_enum NOT NULL,
  user_reference_hash text NOT NULL,
  encrypted_access_token text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_deauthorization_jobs_due_idx
ON public.provider_deauthorization_jobs (provider, next_attempt_at)
WHERE attempts < 10;

ALTER TABLE public.provider_deauthorization_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.provider_deauthorization_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.provider_deauthorization_jobs FROM anon;
REVOKE ALL ON TABLE public.provider_deauthorization_jobs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.provider_deauthorization_jobs TO service_role;
