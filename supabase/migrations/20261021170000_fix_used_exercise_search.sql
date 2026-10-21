-- Require every meaningful search word to occur in the caller-visible exercise
-- name, muscle, or equipment fields. The previous nested NOT EXISTS inverted
-- this check for longer queries and returned unrelated rows.
CREATE OR REPLACE FUNCTION public.exercise_catalog_query_matches_candidates(
  p_query text,
  p_candidates text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH query_text AS (
    SELECT public.normalize_exercise_catalog_name(coalesce(p_query, '')) AS value
  ), normalized_candidates AS (
    SELECT public.normalize_exercise_catalog_name(candidate.value) AS value
    FROM unnest(coalesce(p_candidates, ARRAY[]::text[])) AS candidate(value)
  ), query_tokens AS (
    SELECT
      raw.value,
      CASE
        WHEN char_length(raw.value) > 4 AND right(raw.value, 2) = 'es'
          THEN left(raw.value, char_length(raw.value) - 2)
        WHEN char_length(raw.value) > 3 AND right(raw.value, 1) = 's'
          THEN left(raw.value, char_length(raw.value) - 1)
        ELSE raw.value
      END AS stem
    FROM query_text
    CROSS JOIN LATERAL regexp_split_to_table(query_text.value, ' ') AS raw(value)
    WHERE raw.value <> ''
  ), candidate_tokens AS (
    SELECT
      CASE
        WHEN char_length(raw.value) > 4 AND right(raw.value, 2) = 'es'
          THEN left(raw.value, char_length(raw.value) - 2)
        WHEN char_length(raw.value) > 3 AND right(raw.value, 1) = 's'
          THEN left(raw.value, char_length(raw.value) - 1)
        ELSE raw.value
      END AS stem
    FROM normalized_candidates AS candidate
    CROSS JOIN LATERAL regexp_split_to_table(candidate.value, ' ') AS raw(value)
    WHERE raw.value <> ''
      AND raw.value NOT IN (
        'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'con', 'por', 'para',
        'the', 'of', 'and', 'to', 'a', 'an', 'da', 'do'
      )
  )
  SELECT
    btrim(coalesce(p_query, '')) = ''
    OR (
      char_length(query_text.value) < 2
      AND char_length(btrim(coalesce(p_query, ''))) < 2
    )
    OR EXISTS (
      SELECT 1
      FROM normalized_candidates AS candidate
      WHERE query_text.value <> ''
        AND (
          position(query_text.value IN candidate.value) > 0
          OR position(
            replace(query_text.value, ' ', '')
            IN replace(candidate.value, ' ', '')
          ) > 0
        )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM query_tokens AS token
        WHERE token.value NOT IN (
          'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'con', 'por', 'para',
          'the', 'of', 'and', 'to', 'a', 'an', 'da', 'do'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM query_tokens AS query_token
        WHERE query_token.value NOT IN (
          'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'con', 'por', 'para',
          'the', 'of', 'and', 'to', 'a', 'an', 'da', 'do'
        )
          AND NOT EXISTS (
            SELECT 1
            FROM candidate_tokens AS candidate_token
            WHERE position(query_token.stem IN candidate_token.stem) > 0
          )
      )
    )
  FROM query_text;
$$;

REVOKE ALL ON FUNCTION public.exercise_catalog_query_matches_candidates(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exercise_catalog_query_matches_candidates(text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_used_exercise_catalog_page(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 30,
  p_query text DEFAULT NULL,
  p_muscle_id integer DEFAULT NULL,
  p_equipment_id integer DEFAULT NULL,
  p_favorites_only boolean DEFAULT false
)
RETURNS TABLE (
  exercise_id uuid,
  set_count bigint,
  latest_at timestamptz,
  latest_weight_kg numeric,
  latest_reps integer,
  best_weight_kg numeric,
  total_items bigint,
  current_page integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_page_size integer := greatest(1, least(coalesce(p_page_size, 30), 30));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exercise_catalog_auth_required';
  END IF;

  RETURN QUERY
  WITH usage_by_exercise AS (
    SELECT
      workout_set.exercise_id,
      count(*)::bigint AS set_count,
      max(workout_set.created_at) AS latest_at,
      (array_agg(workout_set.weight_kg ORDER BY workout_set.created_at DESC, workout_set.id DESC)
        FILTER (WHERE workout_set.weight_kg > 0))[1] AS latest_weight_kg,
      (array_agg(workout_set.reps ORDER BY workout_set.created_at DESC, workout_set.id DESC)
        FILTER (WHERE workout_set.reps > 0))[1] AS latest_reps,
      max(workout_set.weight_kg) FILTER (WHERE workout_set.weight_kg > 0) AS best_weight_kg
    FROM public.workout_sets AS workout_set
    WHERE workout_set.user_id = v_user_id
      AND workout_set.is_warmup = false
    GROUP BY workout_set.exercise_id
  ), effective_exercises AS (
    SELECT
      exercise.id AS exercise_id,
      usage.set_count,
      usage.latest_at,
      usage.latest_weight_kg,
      usage.latest_reps,
      usage.best_weight_kg,
      coalesce(user_override.base_name_es, exercise.base_name_es) AS effective_name_es,
      coalesce(user_override.base_name_en, exercise.base_name_en, exercise.base_name_es) AS effective_name_en,
      coalesce(user_override.primary_muscle_id, exercise.primary_muscle_id) AS effective_primary_muscle_id,
      coalesce(user_override.secondary_muscle_id, exercise.secondary_muscle_id) AS effective_secondary_muscle_id,
      coalesce(user_override.equipment_id, exercise.equipment_id) AS effective_equipment_id
    FROM usage_by_exercise AS usage
    JOIN public.exercises AS exercise ON exercise.id = usage.exercise_id
    LEFT JOIN public.user_exercise_overrides AS user_override
      ON user_override.exercise_id = exercise.id
      AND user_override.user_id = v_user_id
    WHERE (exercise.owner_user_id IS NULL AND exercise.is_custom = false)
      OR (exercise.owner_user_id = v_user_id AND exercise.is_custom = true)
  ), searchable_exercises AS (
    SELECT
      effective.*,
      array_remove(
        ARRAY[
          effective.effective_name_es,
          effective.effective_name_en,
          primary_muscle.code,
          secondary_muscle.code,
          equipment.code
        ]::text[]
        || coalesce((
          SELECT array_agg(translation.name)
          FROM public.muscle_group_translations AS translation
          WHERE translation.muscle_group_id = effective.effective_primary_muscle_id
        ), ARRAY[]::text[])
        || coalesce((
          SELECT array_agg(translation.name)
          FROM public.muscle_group_translations AS translation
          WHERE translation.muscle_group_id = effective.effective_secondary_muscle_id
        ), ARRAY[]::text[])
        || coalesce((
          SELECT array_agg(translation.name)
          FROM public.equipment_translations AS translation
          WHERE translation.equipment_id = effective.effective_equipment_id
        ), ARRAY[]::text[]),
        NULL
      ) AS search_candidates
    FROM effective_exercises AS effective
    LEFT JOIN public.muscle_groups AS primary_muscle
      ON primary_muscle.id = effective.effective_primary_muscle_id
    LEFT JOIN public.muscle_groups AS secondary_muscle
      ON secondary_muscle.id = effective.effective_secondary_muscle_id
    LEFT JOIN public.equipment AS equipment
      ON equipment.id = effective.effective_equipment_id
  ), filtered_exercises AS (
    SELECT searchable.*
    FROM searchable_exercises AS searchable
    WHERE (p_muscle_id IS NULL OR searchable.effective_primary_muscle_id = p_muscle_id)
      AND (p_equipment_id IS NULL OR searchable.effective_equipment_id = p_equipment_id)
      AND (
        p_favorites_only IS DISTINCT FROM true
        OR EXISTS (
          SELECT 1
          FROM public.exercise_favorites AS favorite
          WHERE favorite.user_id = v_user_id
            AND favorite.exercise_id = searchable.exercise_id
        )
      )
      AND public.exercise_catalog_query_matches_candidates(p_query, searchable.search_candidates)
  ), totals AS (
    SELECT count(*)::bigint AS total_items
    FROM filtered_exercises
  ), page_state AS (
    SELECT
      totals.total_items,
      greatest(
        1,
        least(
          greatest(coalesce(p_page, 1), 1),
          greatest(1, ceil(totals.total_items::numeric / v_page_size)::integer)
        )
      ) AS effective_page
    FROM totals
  )
  SELECT
    page.exercise_id,
    page.set_count,
    page.latest_at,
    page.latest_weight_kg,
    page.latest_reps,
    page.best_weight_kg,
    page_state.total_items,
    page_state.effective_page
  FROM page_state
  CROSS JOIN LATERAL (
    SELECT filtered_exercises.*
    FROM filtered_exercises
    ORDER BY filtered_exercises.latest_at DESC, filtered_exercises.exercise_id ASC
    LIMIT v_page_size
    OFFSET (page_state.effective_page - 1) * v_page_size
  ) AS page;
END;
$$;

REVOKE ALL ON FUNCTION public.get_used_exercise_catalog_page(integer, integer, text, integer, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_used_exercise_catalog_page(integer, integer, text, integer, integer, boolean)
  TO authenticated;
