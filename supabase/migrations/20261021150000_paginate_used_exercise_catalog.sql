-- Aggregate a user's used exercise list in Postgres and return one bounded page.
-- Only the caller's own non-warmup sets and visible exercises participate.
CREATE INDEX IF NOT EXISTS workout_sets_user_exercise_history_idx
  ON public.workout_sets (user_id, exercise_id, created_at DESC, id DESC)
  WHERE is_warmup = false;

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
  ), query_text AS (
    SELECT public.normalize_exercise_catalog_name(coalesce(p_query, '')) AS normalized_query
  ), filtered_exercises AS (
    SELECT searchable.*
    FROM searchable_exercises AS searchable
    CROSS JOIN query_text
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
      AND (
        char_length(query_text.normalized_query) < 2
        OR EXISTS (
          SELECT 1
          FROM unnest(searchable.search_candidates) AS candidate(value)
          CROSS JOIN LATERAL (
            SELECT public.normalize_exercise_catalog_name(candidate.value) AS normalized_candidate
          ) AS normalized
          WHERE position(query_text.normalized_query IN normalized.normalized_candidate) > 0
            OR position(
              replace(query_text.normalized_query, ' ', '')
              IN replace(normalized.normalized_candidate, ' ', '')
            ) > 0
            OR NOT EXISTS (
              SELECT 1
              FROM regexp_split_to_table(query_text.normalized_query, ' ') AS query_token(value)
              WHERE query_token.value <> ''
                AND (
                  query_token.value NOT IN (
                    'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'con', 'por', 'para',
                    'the', 'of', 'and', 'to', 'a', 'an', 'da', 'do'
                  )
                  OR NOT EXISTS (
                    SELECT 1
                    FROM regexp_split_to_table(query_text.normalized_query, ' ') AS meaningful_token(value)
                    WHERE meaningful_token.value <> ''
                      AND meaningful_token.value NOT IN (
                        'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'con', 'por', 'para',
                        'the', 'of', 'and', 'to', 'a', 'an', 'da', 'do'
                      )
                  )
                )
                AND NOT EXISTS (
                SELECT 1
                FROM regexp_split_to_table(normalized.normalized_candidate, ' ') AS candidate_token(value)
                CROSS JOIN LATERAL (
                  SELECT CASE
                    WHEN char_length(candidate_token.value) > 4 AND right(candidate_token.value, 2) = 'es'
                      THEN left(candidate_token.value, char_length(candidate_token.value) - 2)
                    WHEN char_length(candidate_token.value) > 3 AND right(candidate_token.value, 1) = 's'
                      THEN left(candidate_token.value, char_length(candidate_token.value) - 1)
                    ELSE candidate_token.value
                  END AS token
                ) AS normalized_token
                WHERE candidate_token.value <> ''
                  AND (
                    position(
                      CASE
                        WHEN char_length(query_token.value) > 4 AND right(query_token.value, 2) = 'es'
                          THEN left(query_token.value, char_length(query_token.value) - 2)
                        WHEN char_length(query_token.value) > 3 AND right(query_token.value, 1) = 's'
                          THEN left(query_token.value, char_length(query_token.value) - 1)
                        ELSE query_token.value
                      END
                      IN normalized_token.token
                    ) > 0
                    OR position(
                      normalized_token.token
                      IN CASE
                        WHEN char_length(query_token.value) > 4 AND right(query_token.value, 2) = 'es'
                          THEN left(query_token.value, char_length(query_token.value) - 2)
                        WHEN char_length(query_token.value) > 3 AND right(query_token.value, 1) = 's'
                          THEN left(query_token.value, char_length(query_token.value) - 1)
                        ELSE query_token.value
                      END
                    ) > 0
                  )
                )
            )
        )
      )
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

CREATE OR REPLACE FUNCTION public.get_exercise_catalog_usage_summaries(p_exercise_ids uuid[])
RETURNS TABLE (
  exercise_id uuid,
  set_count bigint,
  latest_at timestamptz,
  latest_weight_kg numeric,
  latest_reps integer,
  best_weight_kg numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exercise_catalog_auth_required';
  END IF;

  IF coalesce(cardinality(p_exercise_ids), 0) > 2500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'exercise_catalog_usage_page_too_large';
  END IF;

  RETURN QUERY
  SELECT
    workout_set.exercise_id,
    count(*)::bigint,
    max(workout_set.created_at),
    (array_agg(workout_set.weight_kg ORDER BY workout_set.created_at DESC, workout_set.id DESC)
      FILTER (WHERE workout_set.weight_kg > 0))[1],
    (array_agg(workout_set.reps ORDER BY workout_set.created_at DESC, workout_set.id DESC)
      FILTER (WHERE workout_set.reps > 0))[1],
    max(workout_set.weight_kg) FILTER (WHERE workout_set.weight_kg > 0)
  FROM public.workout_sets AS workout_set
  WHERE workout_set.user_id = v_user_id
    AND workout_set.is_warmup = false
    AND workout_set.exercise_id = ANY(coalesce(p_exercise_ids, ARRAY[]::uuid[]))
  GROUP BY workout_set.exercise_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_exercise_catalog_usage_summaries(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exercise_catalog_usage_summaries(uuid[]) TO authenticated;
