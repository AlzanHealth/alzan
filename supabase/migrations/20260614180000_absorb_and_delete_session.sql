-- Atomic merge primitive: moves every child artifact and back-reference from
-- one activity session onto another and deletes the source, all inside a
-- single transaction. Used by the import-review merge / strength-assignment
-- flows so a mid-operation failure can never leave a half-moved state.
--
-- Ownership is validated by the caller (service-role backend) AND here as
-- defense-in-depth: both sessions must belong to the same user.

CREATE OR REPLACE FUNCTION public.absorb_and_delete_session(p_source uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_user uuid;
  v_target_user uuid;
  v_source_sets integer;
  v_target_links integer;
  r RECORD;
  v_next integer;
BEGIN
  IF p_source = p_target THEN
    RAISE EXCEPTION 'absorb_and_delete_session: source and target must differ';
  END IF;

  SELECT user_id INTO v_source_user FROM activity_sessions WHERE id = p_source;
  SELECT user_id INTO v_target_user FROM activity_sessions WHERE id = p_target;
  IF v_source_user IS NULL OR v_target_user IS NULL THEN
    RAISE EXCEPTION 'absorb_and_delete_session: session not found';
  END IF;
  IF v_source_user IS DISTINCT FROM v_target_user THEN
    RAISE EXCEPTION 'absorb_and_delete_session: session owner mismatch';
  END IF;

  -- Heart rate zones: replace the target's only when the source has any.
  IF EXISTS (SELECT 1 FROM activity_heart_rate_zones WHERE session_id = p_source) THEN
    DELETE FROM activity_heart_rate_zones WHERE session_id = p_target;
    UPDATE activity_heart_rate_zones SET session_id = p_target WHERE session_id = p_source;
  END IF;

  -- Wearable streams + samples.
  IF EXISTS (SELECT 1 FROM activity_streams WHERE session_id = p_source AND source = 'wearable_import') THEN
    DELETE FROM activity_streams WHERE session_id = p_target AND source = 'wearable_import';
    UPDATE activity_streams SET session_id = p_target WHERE session_id = p_source AND source = 'wearable_import';
    DELETE FROM activity_stream_samples WHERE session_id = p_target AND source = 'wearable_import';
    UPDATE activity_stream_samples SET session_id = p_target WHERE session_id = p_source AND source = 'wearable_import';
  END IF;

  -- Provider fields.
  IF EXISTS (SELECT 1 FROM activity_provider_fields WHERE session_id = p_source) THEN
    DELETE FROM activity_provider_fields WHERE session_id = p_target;
    UPDATE activity_provider_fields SET session_id = p_target WHERE session_id = p_source;
  END IF;

  -- Laps (custom split group) and route points.
  IF EXISTS (SELECT 1 FROM activity_laps WHERE session_id = p_source) THEN
    DELETE FROM activity_laps WHERE session_id = p_target AND split_group = 'custom';
    UPDATE activity_laps SET session_id = p_target WHERE session_id = p_source;
  END IF;
  IF EXISTS (SELECT 1 FROM activity_route_points WHERE session_id = p_source) THEN
    DELETE FROM activity_route_points WHERE session_id = p_target;
    UPDATE activity_route_points SET session_id = p_target WHERE session_id = p_source;
  END IF;

  -- Workout sets: move, renumbering each exercise after the target's existing sets.
  SELECT COUNT(*) INTO v_source_sets FROM workout_sets WHERE session_id = p_source;
  IF v_source_sets > 0 THEN
    FOR r IN SELECT id, exercise_id FROM workout_sets WHERE session_id = p_source ORDER BY set_number LOOP
      SELECT COALESCE(MAX(set_number), 0) + 1 INTO v_next
      FROM workout_sets WHERE session_id = p_target AND exercise_id = r.exercise_id;
      UPDATE workout_sets SET session_id = p_target, set_number = v_next WHERE id = r.id;
    END LOOP;

    -- Superset links only move when the target has none of its own.
    SELECT COUNT(*) INTO v_target_links FROM activity_session_superset_links WHERE session_id = p_target;
    IF v_target_links = 0 THEN
      UPDATE activity_session_superset_links SET session_id = p_target WHERE session_id = p_source;
    END IF;

    -- Recompute the target's strength totals from its final set list.
    UPDATE activity_sessions s
    SET total_sets = t.cnt, total_reps = t.reps, total_volume_kg = t.vol
    FROM (
      SELECT COUNT(*) AS cnt,
             COALESCE(SUM(reps), 0) AS reps,
             ROUND(COALESCE(SUM(reps * weight_kg), 0)::numeric, 2) AS vol
      FROM workout_sets WHERE session_id = p_target
    ) t
    WHERE s.id = p_target;
  END IF;

  -- Repoint remaining references so nothing is lost when the source is deleted.
  UPDATE workout_plans SET activity_session_id = p_target WHERE activity_session_id = p_source;
  UPDATE activity_files SET session_id = p_target WHERE session_id = p_source;
  UPDATE health_metric_samples SET activity_session_id = p_target WHERE activity_session_id = p_source;
  UPDATE vo2_max_logs SET activity_session_id = p_target WHERE activity_session_id = p_source;
  UPDATE session_feedback SET session_id = p_target WHERE session_id = p_source;
  UPDATE activity_session_tags SET session_id = p_target WHERE session_id = p_source;

  DELETE FROM activity_sessions WHERE id = p_source;
END;
$$;

-- Only the service-role backend (which validates ownership first) may call it.
REVOKE ALL ON FUNCTION public.absorb_and_delete_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.absorb_and_delete_session(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.absorb_and_delete_session(uuid, uuid) FROM authenticated;
