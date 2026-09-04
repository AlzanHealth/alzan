-- COROS is supported through the direct Partner API OAuth flow only.
-- Keep the earlier migration in history, but restore the original constraints
-- without touching users, connections, tokens, or imported activities.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_connections
    WHERE connection_kind = 'mcp'
  ) THEN
    RAISE EXCEPTION
      'Cannot remove COROS MCP support while user_connections contains MCP connections; migrate them first';
  END IF;

  IF to_regclass('public.provider_deauthorization_jobs') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.provider_deauthorization_jobs
      WHERE connection_kind = 'mcp'
    ) THEN
    RAISE EXCEPTION
      'Cannot remove COROS MCP support while provider_deauthorization_jobs contains MCP jobs; migrate them first';
  END IF;
END $$;

ALTER TABLE public.user_connections
  DROP CONSTRAINT IF EXISTS user_connections_connection_kind_check;

ALTER TABLE public.user_connections
  ADD CONSTRAINT user_connections_connection_kind_check
  CHECK (connection_kind IN ('oauth', 'local_sdk', 'file_import'));

DO $$
BEGIN
  IF to_regclass('public.provider_deauthorization_jobs') IS NOT NULL THEN
    ALTER TABLE public.provider_deauthorization_jobs
      DROP CONSTRAINT IF EXISTS provider_deauthorization_jobs_connection_kind_check;

    ALTER TABLE public.provider_deauthorization_jobs
      ADD CONSTRAINT provider_deauthorization_jobs_connection_kind_check
      CHECK (connection_kind IN ('oauth'));
  END IF;
END $$;

COMMENT ON COLUMN public.provider_oauth_states.client_id IS
  'Legacy optional OAuth client metadata retained for schema compatibility; direct COROS OAuth uses server configuration.';

COMMENT ON COLUMN public.user_connections.client_id IS
  'Legacy optional OAuth client metadata retained for schema compatibility; direct COROS OAuth uses server configuration.';

COMMENT ON COLUMN public.provider_deauthorization_jobs.client_id IS
  'Legacy optional OAuth client metadata retained for schema compatibility; direct COROS deauthorization uses server configuration.';
