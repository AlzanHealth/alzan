-- COROS MCP uses the same connection/token tables as legacy COROS OAuth.
-- The kind distinguishes the active transport without creating a second
-- connection or changing existing user data.

ALTER TABLE public.user_connections
  DROP CONSTRAINT IF EXISTS user_connections_connection_kind_check;

ALTER TABLE public.user_connections
  ADD CONSTRAINT user_connections_connection_kind_check
  CHECK (connection_kind IN ('oauth', 'local_sdk', 'file_import', 'mcp'));

ALTER TABLE public.provider_oauth_states
  ADD COLUMN IF NOT EXISTS client_id text;

COMMENT ON COLUMN public.provider_oauth_states.client_id IS
  'OAuth public client identifier used for this authorization attempt; needed when COROS MCP dynamic registration is enabled.';

ALTER TABLE public.user_connections
  ADD COLUMN IF NOT EXISTS client_id text;

COMMENT ON COLUMN public.user_connections.client_id IS
  'Public OAuth client identifier used by a connection; populated for COROS MCP dynamic registration.';

ALTER TABLE public.provider_deauthorization_jobs
  ADD COLUMN IF NOT EXISTS connection_kind text NOT NULL DEFAULT 'oauth';

ALTER TABLE public.provider_deauthorization_jobs
  ADD COLUMN IF NOT EXISTS client_id text;

ALTER TABLE public.provider_deauthorization_jobs
  DROP CONSTRAINT IF EXISTS provider_deauthorization_jobs_connection_kind_check;

ALTER TABLE public.provider_deauthorization_jobs
  ADD CONSTRAINT provider_deauthorization_jobs_connection_kind_check
  CHECK (connection_kind IN ('oauth', 'mcp'));
