-- A revision mismatch is an expected optimistic-concurrency race. Returning no
-- row lets the client refresh its inputs and retry without writing an ERROR log.
CREATE OR REPLACE FUNCTION public.commit_body_composition_snapshot(p_expected_revision bigint,p_snapshot jsonb)
RETURNS SETOF public.body_composition_logs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid := auth.uid(); current_revision bigint; snapshot public.body_composition_logs; snapshot_as_of timestamptz;
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
 IF (p_snapshot->>'user_id')::uuid IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'SNAPSHOT_OWNER_MISMATCH' USING ERRCODE = '42501'; END IF;
 INSERT INTO public.body_composition_input_revisions(user_id) VALUES(owner_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO current_revision FROM public.body_composition_input_revisions WHERE user_id = owner_id FOR UPDATE;
 IF current_revision IS DISTINCT FROM p_expected_revision THEN RETURN; END IF;
 snapshot := jsonb_populate_record(NULL::public.body_composition_logs,p_snapshot);
 snapshot_as_of := (snapshot.input_snapshot->>'asOf')::timestamptz;
 IF snapshot.calculated_for_date IS NULL OR snapshot.calculated_for_date > (clock_timestamp() AT TIME ZONE coalesce(snapshot.input_snapshot->>'timezone','UTC'))::date THEN RAISE EXCEPTION 'FUTURE_SNAPSHOT_DATE' USING ERRCODE = '22023'; END IF;
 IF snapshot_as_of IS NULL OR snapshot_as_of > clock_timestamp() THEN RAISE EXCEPTION 'INVALID_SNAPSHOT_AS_OF' USING ERRCODE = '22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.body_composition_logs WHERE user_id = owner_id AND calculated_for_date = snapshot.calculated_for_date AND input_revision = current_revision AND (input_snapshot->>'asOf')::timestamptz > snapshot_as_of) THEN RETURN; END IF;
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
