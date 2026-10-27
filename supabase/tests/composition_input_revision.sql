-- Local-only regression. Every data mutation is rolled back.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users) THEN RAISE EXCEPTION 'Seed a local user before this test'; END IF;
 IF has_function_privilege('anon','public.commit_body_composition_snapshot(bigint,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.get_body_composition_context()','EXECUTE') THEN
  RAISE EXCEPTION 'anonymous role can execute authenticated composition RPCs';
 END IF;
END $$;
CREATE TEMP TABLE composition_test_context AS SELECT id AS user_id FROM public.users LIMIT 1;
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM composition_test_context),true);
GRANT SELECT ON composition_test_context TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE owner_id uuid := (SELECT user_id FROM composition_test_context); revision_before bigint; revision_after bigint; snapshot jsonb; measurement_id uuid; weight_id uuid; arm_id uuid;
BEGIN
 SELECT revision INTO revision_before FROM public.body_composition_input_revisions WHERE user_id = owner_id;
 INSERT INTO public.body_measurements(user_id,measurement_type,value_cm,measured_at,measurement_protocol)
 VALUES(owner_id,'waist',80,now(),'waist_iliac_crest') RETURNING id INTO measurement_id;
 SELECT revision INTO revision_after FROM public.body_composition_input_revisions WHERE user_id = owner_id;
 IF revision_after <> revision_before + 1 THEN RAISE EXCEPTION 'revision did not advance'; END IF;
 UPDATE public.body_measurements SET value_cm=value_cm, notes='test metadata' WHERE id=measurement_id;
 IF (SELECT revision FROM public.body_composition_input_revisions WHERE user_id=owner_id) <> revision_after THEN
  RAISE EXCEPTION 'unchanged measurement invalidated composition';
 END IF;
 INSERT INTO public.weight_logs(user_id,weight_kg,measured_at) VALUES(owner_id,75,now()) RETURNING id INTO weight_id;
 SELECT revision INTO revision_after FROM public.body_composition_input_revisions WHERE user_id=owner_id;
 UPDATE public.weight_logs SET weight_kg=75, source_record_id='metadata-only' WHERE id=weight_id;
 IF (SELECT revision FROM public.body_composition_input_revisions WHERE user_id=owner_id) <> revision_after THEN
  RAISE EXCEPTION 'unchanged weight invalidated composition';
 END IF;
 UPDATE public.weight_logs SET bodyfat_percent=20 WHERE id=weight_id;
 UPDATE public.weight_logs SET muscle_mass_kg=31 WHERE id=weight_id;
 UPDATE public.weight_logs SET weight_kg=76 WHERE id=weight_id;
 UPDATE public.weight_logs SET measured_at=measured_at-interval '1 day' WHERE id=weight_id;
 IF (SELECT revision FROM public.body_composition_input_revisions WHERE user_id=owner_id) <> revision_after+4 THEN
  RAISE EXCEPTION 'weight, measured composition or measurement date change failed to invalidate';
 END IF;
 INSERT INTO public.body_measurements(user_id,measurement_type,value_cm,measured_at,measurement_protocol)
 VALUES(owner_id,'arm',32,now(),'arm_relaxed_midpoint') RETURNING id INTO arm_id;
 SELECT revision INTO revision_after FROM public.body_composition_input_revisions WHERE user_id=owner_id;
 UPDATE public.body_measurements SET measurement_protocol='arm_flexed_max' WHERE id=arm_id;
 IF (SELECT revision FROM public.body_composition_input_revisions WHERE user_id=owner_id) <> revision_after+1 THEN
  RAISE EXCEPTION 'protocol change failed to invalidate';
 END IF;
 SELECT revision INTO revision_after FROM public.body_composition_input_revisions WHERE user_id=owner_id;
 BEGIN
  INSERT INTO public.body_measurements(user_id,measurement_type,value_cm,measured_at,measurement_protocol)
  VALUES(owner_id,'abdomen',80,now(),'waist_iliac_crest');
  RAISE EXCEPTION 'protocol/type mismatch accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 snapshot := jsonb_build_object('user_id',owner_id,'calculated_for_date',current_date,'calculation_version',2,
 'calculation_status','partial','bodyfat_inputs','[]'::jsonb,'muscle_inputs','[]'::jsonb,
 'waist_to_height_inputs','[]'::jsonb,'waist_to_hip_inputs','[]'::jsonb,'input_snapshot',jsonb_build_object('asOf',now()));
 IF EXISTS(SELECT 1 FROM public.commit_body_composition_snapshot(revision_before,snapshot)) THEN
  RAISE EXCEPTION 'stale computation accepted';
 END IF;
 PERFORM public.commit_body_composition_snapshot(revision_after,snapshot);
 UPDATE public.body_measurements SET notes='another note' WHERE id=measurement_id;
 IF NOT EXISTS(SELECT 1 FROM public.body_composition_logs WHERE user_id=owner_id AND calculated_for_date=current_date AND calculation_status='partial') THEN
  RAISE EXCEPTION 'metadata-only update invalidated a valid snapshot';
 END IF;
 BEGIN
  PERFORM public.commit_body_composition_snapshot(revision_after,jsonb_set(snapshot,'{calculated_for_date}',to_jsonb(current_date+2)));
  RAISE EXCEPTION 'future calendar snapshot accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.get_body_composition_context() c WHERE c.user_id = owner_id AND c.revision=revision_after AND c.server_now <= clock_timestamp()) THEN RAISE EXCEPTION 'invalid server calculation context'; END IF;
 IF EXISTS(SELECT 1 FROM public.commit_body_composition_snapshot(revision_after,jsonb_set(snapshot,'{input_snapshot,asOf}',to_jsonb(now()-interval '1 hour')))) THEN
  RAISE EXCEPTION 'older same-revision snapshot accepted';
 END IF;
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
 DELETE FROM public.body_measurements WHERE id=measurement_id;
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
