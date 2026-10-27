-- Supabase default privileges may explicitly grant EXECUTE to anon. Revoking
-- PUBLIC alone does not remove those grants. The RPCs require a signed-in user.
REVOKE ALL ON FUNCTION public.get_body_composition_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_body_composition_snapshot(bigint,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_body_composition_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_body_composition_snapshot(bigint,jsonb) TO authenticated;

-- Trigger execution does not require application roles to invoke it directly.
REVOKE ALL ON FUNCTION public.invalidate_composition_inputs() FROM PUBLIC, anon, authenticated;
