-- Local-only regression. Every data mutation is rolled back.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users) THEN RAISE EXCEPTION 'Seed a local user before this test'; END IF;
END $$;
CREATE TEMP TABLE composition_test_context AS SELECT id AS user_id FROM public.users LIMIT 1;
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM composition_test_context),true);
GRANT SELECT ON composition_test_context TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE owner_id uuid := (SELECT user_id FROM composition_test_context); revision_before bigint; revision_after bigint; snapshot jsonb;
BEGIN
 SELECT revision INTO revision_before FROM public.body_composition_input_revisions WHERE user_id = owner_id;
 INSERT INTO public.body_measurements(user_id,measurement_type,value_cm,measured_at,measurement_protocol)
 VALUES(owner_id,'waist',80,now(),'waist_iliac_crest');
 SELECT revision INTO revision_after FROM public.body_composition_input_revisions WHERE user_id = owner_id;
 IF revision_after <> revision_before + 1 THEN RAISE EXCEPTION 'revision did not advance'; END IF;
 BEGIN
  INSERT INTO public.body_measurements(user_id,measurement_type,value_cm,measured_at,measurement_protocol)
  VALUES(owner_id,'abdomen',80,now(),'waist_iliac_crest');
  RAISE EXCEPTION 'protocol/type mismatch accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 snapshot := jsonb_build_object('user_id',owner_id,'calculated_for_date',current_date,'calculation_version',2,
 'calculation_status','partial','bodyfat_inputs','[]'::jsonb,'muscle_inputs','[]'::jsonb,
 'waist_to_height_inputs','[]'::jsonb,'waist_to_hip_inputs','[]'::jsonb,'input_snapshot',jsonb_build_object('asOf',now()));
 BEGIN
  PERFORM public.commit_body_composition_snapshot(revision_before,snapshot);
  RAISE EXCEPTION 'stale computation accepted';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 PERFORM public.commit_body_composition_snapshot(revision_after,snapshot);
 BEGIN
  PERFORM public.commit_body_composition_snapshot(revision_after,jsonb_set(snapshot,'{calculated_for_date}',to_jsonb(current_date+2)));
  RAISE EXCEPTION 'future calendar snapshot accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.get_body_composition_context() c WHERE c.user_id = owner_id AND c.revision=revision_after AND c.server_now <= clock_timestamp()) THEN RAISE EXCEPTION 'invalid server calculation context'; END IF;
 BEGIN
  PERFORM public.commit_body_composition_snapshot(revision_after,jsonb_set(snapshot,'{input_snapshot,asOf}',to_jsonb(now()-interval '1 hour')));
  RAISE EXCEPTION 'older same-revision snapshot accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.commit_body_composition_snapshot(revision_after,jsonb_set(snapshot,'{input_snapshot,asOf}',to_jsonb(now()+interval '1 hour')));
  RAISE EXCEPTION 'future snapshot accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.body_composition_logs WHERE user_id=owner_id AND input_revision=revision_after AND calculated_for_date=current_date) THEN RAISE EXCEPTION 'snapshot not persisted'; END IF;
 BEGIN
  PERFORM public.commit_body_composition_snapshot(revision_after,snapshot || jsonb_build_object('user_id',gen_random_uuid()));
  RAISE EXCEPTION 'foreign owner accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- A deletion changes the revision even when no replacement input is available.
 DELETE FROM public.body_measurements WHERE user_id=owner_id AND measurement_protocol='waist_iliac_crest';
 IF NOT EXISTS(SELECT 1 FROM public.body_composition_logs WHERE user_id=owner_id AND calculated_for_date=current_date AND calculation_status='stale' AND bodyfat_percent IS NULL AND muscle_mass_kg IS NULL) THEN RAISE EXCEPTION 'deleted input did not invalidate snapshot'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  INSERT INTO public.body_composition_logs(user_id,calculated_for_date) VALUES(auth.uid(),current_date);
  RAISE EXCEPTION 'direct unversioned snapshot write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM public.body_composition_input_revisions WHERE user_id <> auth.uid()) THEN RAISE EXCEPTION 'revision RLS exposes another user'; END IF;
END $$;
ROLLBACK;
