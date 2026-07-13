-- Atomically associates one activity session with at most one concrete workout plan.

CREATE OR REPLACE FUNCTION public.associate_activity_session_template(
  p_user_id uuid,
  p_session_id uuid,
  p_endurance_template_id uuid DEFAULT NULL,
  p_workout_template_id uuid DEFAULT NULL,
  p_workout_plan_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.activity_sessions%ROWTYPE;
  v_plan public.workout_plans%ROWTYPE;
  v_local_date date;
  v_template_sport public.sport_type_enum;
  v_candidate_count integer := 0;
  v_candidates jsonb := '[]'::jsonb;
BEGIN
  IF p_endurance_template_id IS NOT NULL AND p_workout_template_id IS NOT NULL THEN
    RAISE EXCEPTION 'IMPORT_REVIEW_TEMPLATE_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_session_id::text, 0));

  SELECT * INTO v_session
  FROM public.activity_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_REVIEW_SESSION_NOT_FOUND';
  END IF;

  SELECT COALESCE(
    v_session.started_at_local::date,
    CASE
      WHEN COALESCE(
        v_session.timezone,
        (SELECT timezone FROM public.user_preferences WHERE user_id = p_user_id),
        'UTC'
      ) ~ '^[+-][0-9]{2}:[0-9]{2}$'
      THEN (
        v_session.start_time AT TIME ZONE 'UTC' + COALESCE(
          v_session.timezone,
          (SELECT timezone FROM public.user_preferences WHERE user_id = p_user_id),
          '+00:00'
        )::interval
      )::date
      ELSE (v_session.start_time AT TIME ZONE COALESCE(
        v_session.timezone,
        (SELECT timezone FROM public.user_preferences WHERE user_id = p_user_id),
        'UTC'
      ))::date
    END
  ) INTO v_local_date;

  IF p_endurance_template_id IS NULL AND p_workout_template_id IS NULL THEN
    UPDATE public.workout_plans
    SET status = 'planned', activity_session_id = NULL, completed_at = NULL, updated_at = now()
    WHERE user_id = p_user_id AND activity_session_id = p_session_id;

    UPDATE public.activity_sessions
    SET endurance_template_id = NULL,
        workout_template_id = NULL,
        suggested_endurance_template_id = NULL,
        template_match_score = NULL,
        template_match_method = NULL,
        updated_at = now()
    WHERE id = p_session_id;

    RETURN jsonb_build_object('status', 'associated', 'session_id', p_session_id, 'plan_id', NULL);
  END IF;

  IF p_endurance_template_id IS NOT NULL THEN
    SELECT sport_type INTO v_template_sport
    FROM public.endurance_workout_templates
    WHERE id = p_endurance_template_id AND user_id = p_user_id;

    IF v_template_sport IS NULL THEN
      RAISE EXCEPTION 'IMPORT_REVIEW_TEMPLATE_NOT_FOUND';
    END IF;
    IF v_template_sport <> v_session.sport_type THEN
      RAISE EXCEPTION 'IMPORT_REVIEW_TEMPLATE_SPORT_MISMATCH';
    END IF;
  ELSE
    IF v_session.sport_type NOT IN ('strength', 'gym') THEN
      RAISE EXCEPTION 'IMPORT_REVIEW_TEMPLATE_SPORT_MISMATCH';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.workout_templates
      WHERE id = p_workout_template_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'IMPORT_REVIEW_TEMPLATE_NOT_FOUND';
    END IF;
  END IF;

  IF p_workout_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan
    FROM public.workout_plans
    WHERE id = p_workout_plan_id
      AND user_id = p_user_id
      AND planned_date = v_local_date
      AND (status = 'planned' OR activity_session_id = p_session_id)
    FOR UPDATE;

    IF v_plan.id IS NULL THEN
      RAISE EXCEPTION 'IMPORT_REVIEW_PLAN_INVALID';
    END IF;

    IF p_endurance_template_id IS NOT NULL AND (
      v_plan.gym_template_id IS NOT NULL
      OR v_plan.endurance_template_id IS NULL
      OR NOT EXISTS (
      SELECT 1
      FROM public.endurance_workout_templates candidate_template
      WHERE candidate_template.id = v_plan.endurance_template_id
        AND candidate_template.user_id = p_user_id
        AND candidate_template.sport_type = v_template_sport
      )
    ) THEN
      RAISE EXCEPTION 'IMPORT_REVIEW_PLAN_SPORT_MISMATCH';
    END IF;

    IF p_workout_template_id IS NOT NULL AND (
      v_plan.gym_template_id IS NULL OR v_plan.endurance_template_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'IMPORT_REVIEW_PLAN_SPORT_MISMATCH';
    END IF;
  ELSIF p_endurance_template_id IS NOT NULL THEN
    SELECT count(*), COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', candidate.id,
        'planned_date', candidate.planned_date,
        'template_id', candidate.endurance_template_id,
        'template_name', candidate_template.base_name
      ) ORDER BY candidate.id),
      '[]'::jsonb
    )
    INTO v_candidate_count, v_candidates
    FROM public.workout_plans candidate
    JOIN public.endurance_workout_templates candidate_template
      ON candidate_template.id = candidate.endurance_template_id
    WHERE candidate.user_id = p_user_id
      AND candidate.planned_date = v_local_date
      AND candidate.status = 'planned'
      AND candidate.endurance_template_id = p_endurance_template_id;

    IF v_candidate_count = 1 THEN
      SELECT * INTO v_plan
      FROM public.workout_plans
      WHERE user_id = p_user_id
        AND planned_date = v_local_date
        AND status = 'planned'
        AND endurance_template_id = p_endurance_template_id
      FOR UPDATE;
    ELSIF v_candidate_count > 1 THEN
      RETURN jsonb_build_object('status', 'selection_required', 'candidates', v_candidates);
    ELSE
      SELECT count(*), COALESCE(
        jsonb_agg(jsonb_build_object(
          'id', candidate.id,
          'planned_date', candidate.planned_date,
          'template_id', candidate.endurance_template_id,
          'template_name', candidate_template.base_name
        ) ORDER BY candidate.id),
        '[]'::jsonb
      )
      INTO v_candidate_count, v_candidates
      FROM public.workout_plans candidate
      JOIN public.endurance_workout_templates candidate_template
        ON candidate_template.id = candidate.endurance_template_id
      WHERE candidate.user_id = p_user_id
        AND candidate.planned_date = v_local_date
        AND candidate.status = 'planned'
        AND candidate_template.user_id = p_user_id
        AND candidate_template.sport_type = v_template_sport;

      IF v_candidate_count = 1 THEN
        SELECT candidate.* INTO v_plan
        FROM public.workout_plans candidate
        JOIN public.endurance_workout_templates candidate_template
          ON candidate_template.id = candidate.endurance_template_id
        WHERE candidate.user_id = p_user_id
          AND candidate.planned_date = v_local_date
          AND candidate.status = 'planned'
          AND candidate_template.user_id = p_user_id
          AND candidate_template.sport_type = v_template_sport
        FOR UPDATE OF candidate;
      ELSIF v_candidate_count > 1 THEN
        RETURN jsonb_build_object('status', 'selection_required', 'candidates', v_candidates);
      END IF;
    END IF;
  ELSE
    SELECT count(*), COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', candidate.id,
        'planned_date', candidate.planned_date,
        'template_id', candidate.gym_template_id,
        'template_name', candidate_template.base_name
      ) ORDER BY candidate.id),
      '[]'::jsonb
    )
    INTO v_candidate_count, v_candidates
    FROM public.workout_plans candidate
    JOIN public.workout_templates candidate_template ON candidate_template.id = candidate.gym_template_id
    WHERE candidate.user_id = p_user_id
      AND candidate.planned_date = v_local_date
      AND candidate.status = 'planned'
      AND candidate.gym_template_id = p_workout_template_id;

    IF v_candidate_count = 1 THEN
      SELECT * INTO v_plan
      FROM public.workout_plans
      WHERE user_id = p_user_id
        AND planned_date = v_local_date
        AND status = 'planned'
        AND gym_template_id = p_workout_template_id
      FOR UPDATE;
    ELSIF v_candidate_count > 1 THEN
      RETURN jsonb_build_object('status', 'selection_required', 'candidates', v_candidates);
    END IF;
  END IF;

  UPDATE public.workout_plans
  SET status = 'planned', activity_session_id = NULL, completed_at = NULL, updated_at = now()
  WHERE user_id = p_user_id AND activity_session_id = p_session_id;

  UPDATE public.activity_sessions
  SET endurance_template_id = p_endurance_template_id,
      workout_template_id = p_workout_template_id,
      suggested_endurance_template_id = CASE WHEN p_endurance_template_id IS NOT NULL THEN NULL ELSE suggested_endurance_template_id END,
      template_match_score = NULL,
      template_match_method = NULL,
      updated_at = now()
  WHERE id = p_session_id;

  IF v_plan.id IS NOT NULL THEN
    UPDATE public.workout_plans
    SET status = 'completed',
        activity_session_id = p_session_id,
        completed_at = now(),
        endurance_template_id = CASE
          WHEN p_endurance_template_id IS NOT NULL THEN p_endurance_template_id
          ELSE endurance_template_id
        END,
        gym_template_id = CASE
          WHEN p_workout_template_id IS NOT NULL THEN p_workout_template_id
          ELSE gym_template_id
        END,
        updated_at = now()
    WHERE id = v_plan.id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'associated',
    'session_id', p_session_id,
    'plan_id', v_plan.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.associate_activity_session_template(uuid, uuid, uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.associate_activity_session_template(uuid, uuid, uuid, uuid, uuid)
TO service_role;
