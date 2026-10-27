-- These SECURITY DEFINER writers accept an explicit owner and are called only
-- through SupabaseAdminService. Remove default client grants, not just PUBLIC.
REVOKE ALL ON FUNCTION public.store_external_raw_payload(uuid,public.wearable_provider_enum,text,text,text,text,text,jsonb,bigint,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_wearable_device(uuid,public.wearable_provider_enum,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_integration_sync_state(uuid,public.wearable_provider_enum,text,text,text,text,text,timestamptz,text,text,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_wearable_activity_bundle(uuid,uuid,jsonb,uuid,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,text,jsonb,uuid,uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_external_raw_payload(uuid,public.wearable_provider_enum,text,text,text,text,text,jsonb,bigint,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_wearable_device(uuid,public.wearable_provider_enum,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_integration_sync_state(uuid,public.wearable_provider_enum,text,text,text,text,text,timestamptz,text,text,jsonb,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_wearable_activity_bundle(uuid,uuid,jsonb,uuid,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,text,jsonb,uuid,uuid,uuid,integer) TO service_role;

-- Keep the existing authenticated testing/admin entry point, but do not let
-- unauthenticated traffic trigger a full catalogue aggregation.
REVOKE ALL ON FUNCTION public.refresh_recipe_popularity_aggregates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_recipe_popularity_aggregates() TO authenticated, service_role;
