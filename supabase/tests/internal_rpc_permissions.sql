-- Local-only permission regression; all fixture writes are rolled back.
BEGIN;
DO $$
DECLARE fn regprocedure;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
  'public.store_external_raw_payload(uuid,public.wearable_provider_enum,text,text,text,text,text,jsonb,bigint,uuid)'::regprocedure,
  'public.upsert_wearable_device(uuid,public.wearable_provider_enum,text,text,text)'::regprocedure,
  'public.upsert_integration_sync_state(uuid,public.wearable_provider_enum,text,text,text,text,text,timestamptz,text,text,jsonb,timestamptz)'::regprocedure,
  'public.persist_wearable_activity_bundle(uuid,uuid,jsonb,uuid,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,text,jsonb,uuid,uuid,uuid,integer)'::regprocedure
 ] LOOP
  IF has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE') THEN
   RAISE EXCEPTION 'internal RPC executable by a client role: %',fn;
  END IF;
  IF NOT has_function_privilege('service_role',fn,'EXECUTE') THEN RAISE EXCEPTION 'backend lost execute permission: %',fn; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.refresh_recipe_popularity_aggregates()','EXECUTE') THEN
  RAISE EXCEPTION 'anonymous role can trigger global recipe aggregation';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef AND p.prorettype <> 'trigger'::regtype
   AND p.proname <> 'check_username' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'unreviewed privileged RPC is exposed to anonymous clients';
 END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM public.upsert_wearable_device(gen_random_uuid(),'suunto','test',NULL,NULL);
  RAISE EXCEPTION 'anonymous invocation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
CREATE TEMP TABLE internal_rpc_test_user AS SELECT id FROM public.users LIMIT 1;
GRANT SELECT ON internal_rpc_test_user TO service_role;
SET LOCAL ROLE service_role;
DO $$ DECLARE owner_id uuid := (SELECT id FROM internal_rpc_test_user); device_id uuid; payload_id uuid;
BEGIN
 device_id := public.upsert_wearable_device(owner_id,'suunto','Permission regression',NULL,'permission-regression');
 IF device_id IS NULL THEN RAISE EXCEPTION 'backend device insert failed'; END IF;
 payload_id := public.store_external_raw_payload(owner_id,'suunto','cloud',NULL,'permission_test',NULL,repeat('a',64),'{}',2,NULL);
 IF payload_id IS NULL THEN RAISE EXCEPTION 'backend payload insert failed'; END IF;
 PERFORM public.upsert_integration_sync_state(owner_id,'suunto','cloud',NULL,'activities',NULL,NULL,now(),'success',NULL,'{}',now());
END $$;
ROLLBACK;
