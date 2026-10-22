ALTER TABLE public.body_measurements ADD COLUMN measurement_protocol text;
ALTER TABLE public.body_measurements ADD CONSTRAINT body_measurements_protocol_matches_type CHECK (
 measurement_protocol IS NULL OR
 (measurement_protocol = 'waist_iliac_crest' AND measurement_type = 'waist') OR
 (measurement_protocol = 'abdomen_navel' AND measurement_type = 'abdomen') OR
 (measurement_protocol IN ('arm_relaxed_midpoint','arm_flexed_max') AND measurement_type = 'arm')
);
CREATE TABLE public.body_composition_input_revisions (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
ALTER TABLE public.body_composition_input_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own composition revision" ON public.body_composition_input_revisions FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.body_composition_input_revisions TO authenticated;
INSERT INTO public.body_composition_input_revisions(user_id) SELECT id FROM public.users;
ALTER TABLE public.body_composition_logs ADD COLUMN input_revision bigint NOT NULL DEFAULT 0;
-- All legacy snapshots must be re-evaluated under the timestamp/protocol contract.
UPDATE public.body_composition_logs SET calculation_status = 'stale';

CREATE FUNCTION public.invalidate_composition_inputs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid; old_at timestamptz; new_at timestamptz;
BEGIN
 IF TG_TABLE_NAME = 'users' THEN
  IF TG_OP = 'UPDATE' AND ROW(OLD.height_cm,OLD.sex,OLD.date_of_birth) IS NOT DISTINCT FROM ROW(NEW.height_cm,NEW.sex,NEW.date_of_birth) THEN RETURN NEW; END IF;
  owner_id := NEW.id;
 ELSE
  IF TG_OP <> 'INSERT' THEN owner_id := OLD.user_id; old_at := OLD.measured_at; END IF;
  IF TG_OP <> 'DELETE' THEN owner_id := NEW.user_id; new_at := NEW.measured_at; END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'INPUT_OWNER_IMMUTABLE' USING ERRCODE = '42501'; END IF;
 END IF;
 INSERT INTO public.body_composition_input_revisions(user_id,revision) VALUES(owner_id,1)
 ON CONFLICT(user_id) DO UPDATE SET revision = body_composition_input_revisions.revision + 1;
 UPDATE public.body_composition_logs SET calculation_status = 'stale',
 bmi = NULL, bodyfat_percent = NULL, bodyfat_method = NULL, bodyfat_precision_level = NULL, bodyfat_formula = NULL, bodyfat_inputs = '[]',
 muscle_mass_kg = NULL, muscle_percent = NULL, muscle_method = NULL, muscle_precision_level = NULL, muscle_formula = NULL, muscle_inputs = '[]',
 waist_to_height_ratio = NULL, waist_to_height_category = NULL, waist_to_height_formula = NULL, waist_to_height_inputs = '[]',
 waist_to_hip_ratio = NULL, waist_to_hip_category = NULL, waist_to_hip_formula = NULL, waist_to_hip_inputs = '[]', updated_at = now()
 WHERE user_id = owner_id AND (TG_TABLE_NAME = 'users'
 OR calculated_for_date BETWEEN (old_at AT TIME ZONE 'UTC')::date - 1 AND ((old_at + interval '72 hours') AT TIME ZONE 'UTC')::date + 1
 OR calculated_for_date BETWEEN (new_at AT TIME ZONE 'UTC')::date - 1 AND ((new_at + interval '72 hours') AT TIME ZONE 'UTC')::date + 1);
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER composition_weight_inputs AFTER INSERT OR UPDATE OR DELETE ON public.weight_logs FOR EACH ROW EXECUTE FUNCTION public.invalidate_composition_inputs();
CREATE TRIGGER composition_measurement_inputs AFTER INSERT OR UPDATE OR DELETE ON public.body_measurements FOR EACH ROW EXECUTE FUNCTION public.invalidate_composition_inputs();
CREATE TRIGGER composition_profile_inputs AFTER INSERT OR UPDATE OF height_cm,sex,date_of_birth ON public.users FOR EACH ROW EXECUTE FUNCTION public.invalidate_composition_inputs();
REVOKE ALL ON FUNCTION public.invalidate_composition_inputs() FROM PUBLIC;

-- Only the conditional RPC may write snapshots. This also prevents older clients
-- from bypassing the revision lock with an ordinary upsert.
REVOKE INSERT, UPDATE, DELETE ON public.body_composition_logs FROM authenticated, anon;
CREATE FUNCTION public.get_body_composition_context()
RETURNS TABLE(user_id uuid, revision bigint, server_now timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
 RETURN QUERY SELECT auth.uid(), coalesce((SELECT r.revision FROM public.body_composition_input_revisions r WHERE r.user_id = auth.uid()),0::bigint), clock_timestamp();
END $$;
REVOKE ALL ON FUNCTION public.get_body_composition_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_body_composition_context() TO authenticated;

CREATE FUNCTION public.commit_body_composition_snapshot(p_expected_revision bigint,p_snapshot jsonb)
RETURNS SETOF public.body_composition_logs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid := auth.uid(); current_revision bigint; snapshot public.body_composition_logs; snapshot_as_of timestamptz;
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
 IF (p_snapshot->>'user_id')::uuid IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'SNAPSHOT_OWNER_MISMATCH' USING ERRCODE = '42501'; END IF;
 INSERT INTO public.body_composition_input_revisions(user_id) VALUES(owner_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO current_revision FROM public.body_composition_input_revisions WHERE user_id = owner_id FOR UPDATE;
 IF current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'COMPOSITION_INPUTS_CHANGED' USING ERRCODE = '40001'; END IF;
 snapshot := jsonb_populate_record(NULL::public.body_composition_logs,p_snapshot);
 snapshot_as_of := (snapshot.input_snapshot->>'asOf')::timestamptz;
 IF snapshot.calculated_for_date IS NULL OR snapshot.calculated_for_date > (clock_timestamp() AT TIME ZONE coalesce(snapshot.input_snapshot->>'timezone','UTC'))::date THEN RAISE EXCEPTION 'FUTURE_SNAPSHOT_DATE' USING ERRCODE = '22023'; END IF;
 IF snapshot_as_of IS NULL OR snapshot_as_of > clock_timestamp() THEN RAISE EXCEPTION 'INVALID_SNAPSHOT_AS_OF' USING ERRCODE = '22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.body_composition_logs WHERE user_id = owner_id AND calculated_for_date = snapshot.calculated_for_date AND input_revision = current_revision AND (input_snapshot->>'asOf')::timestamptz > snapshot_as_of) THEN RAISE EXCEPTION 'COMPOSITION_SNAPSHOT_SUPERSEDED' USING ERRCODE = '40001'; END IF;
 IF snapshot.source_weight_log_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.weight_logs WHERE id = snapshot.source_weight_log_id AND user_id = owner_id) THEN RAISE EXCEPTION 'WEIGHT_OWNER_MISMATCH' USING ERRCODE = '42501'; END IF;
 snapshot.id := coalesce((SELECT id FROM public.body_composition_logs WHERE user_id = owner_id AND calculated_for_date = snapshot.calculated_for_date),gen_random_uuid());
 snapshot.user_id := owner_id; snapshot.input_revision := current_revision;
 snapshot.created_at := coalesce((SELECT created_at FROM public.body_composition_logs WHERE user_id = owner_id AND calculated_for_date = snapshot.calculated_for_date),now()); snapshot.updated_at := now(); snapshot.composition_calculated_at := now();
 IF snapshot.calculation_status NOT IN ('partial','complete') OR snapshot.calculation_status IS NULL THEN RAISE EXCEPTION 'INVALID_SNAPSHOT_STATUS' USING ERRCODE = '22023'; END IF;
 DELETE FROM public.body_composition_logs WHERE user_id = owner_id AND calculated_for_date = snapshot.calculated_for_date;
 RETURN QUERY INSERT INTO public.body_composition_logs SELECT (snapshot).* RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.commit_body_composition_snapshot(bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_body_composition_snapshot(bigint,jsonb) TO authenticated;
