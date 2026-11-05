ALTER TABLE public.activity_laps
  ADD COLUMN IF NOT EXISTS lap_name text;

DO $$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
  v_matches integer;
BEGIN
  v_definition := pg_get_functiondef(
    'public.persist_wearable_activity_bundle(uuid, uuid, jsonb, uuid, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, text, jsonb, uuid, uuid, uuid, integer)'::regprocedure
  );
  v_old := $old$avg_pace_s_per_km, start_offset_s, end_offset_s$old$;
  v_new := $new$avg_pace_s_per_km, start_offset_s, end_offset_s, lap_name$new$;
  v_matches := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  IF v_matches <> 2 THEN
    RAISE EXCEPTION 'Unexpected wearable bundle lap insert definition';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.copy_completed_activity_session(uuid, date)'::regprocedure);
  v_old := $old$user_id, split_group, split_distance_m, split_group_order$old$;
  v_new := $new$user_id, split_group, split_distance_m, split_group_order, lap_name$new$;
  v_matches := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  IF v_matches <> 1 THEN
    RAISE EXCEPTION 'Unexpected copied activity lap insert definition';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$split_distance_m,
    split_group_order$old$;
  v_new := $new$split_distance_m,
    split_group_order, lap_name$new$;
  v_matches := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  IF v_matches <> 1 THEN
    RAISE EXCEPTION 'Unexpected copied activity lap select definition';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END $$;
