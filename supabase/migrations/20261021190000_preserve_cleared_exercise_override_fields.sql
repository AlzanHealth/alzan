-- An override stores the complete personal value, including intentionally cleared
-- optional fields. Fall back to canonical values only when no override exists.
CREATE OR REPLACE FUNCTION public.search_exercises_ranked(
  p_query text,
  p_locale text DEFAULT 'es',
  p_muscle_id integer DEFAULT NULL,
  p_equipment_id integer DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  search_rank numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      lower(public.unaccent(trim(coalesce(p_query, '')))) AS q,
      greatest(1, least(coalesce(p_limit, 30), 180)) AS result_limit,
      CASE WHEN coalesce(p_locale, 'es') = 'en' THEN 'en' ELSE 'es' END AS locale
  ),
  visible_exercises AS (
    SELECT
      e.id,
      coalesce(user_override.base_name_es, e.base_name_es) AS effective_name_es,
      coalesce(user_override.base_name_en, e.base_name_en, e.base_name_es) AS effective_name_en,
      e.base_name_es AS canonical_name_es,
      coalesce(e.base_name_en, e.base_name_es) AS canonical_name_en,
      coalesce(user_override.primary_muscle_id, e.primary_muscle_id) AS effective_primary_muscle_id,
      CASE WHEN user_override.exercise_id IS NOT NULL
        THEN user_override.equipment_id ELSE e.equipment_id END AS effective_equipment_id
    FROM public.exercises AS e
    LEFT JOIN public.user_exercise_overrides AS user_override
      ON user_override.exercise_id = e.id
      AND user_override.user_id = (SELECT auth.uid())
    WHERE e.archived_at IS NULL
  ),
  normalized_exercises AS (
    SELECT
      visible_exercises.*,
      lower(public.unaccent(coalesce(effective_name_es, ''))) AS normalized_name_es,
      lower(public.unaccent(coalesce(effective_name_en, ''))) AS normalized_name_en,
      lower(public.unaccent(coalesce(canonical_name_es, ''))) AS normalized_canonical_name_es,
      lower(public.unaccent(coalesce(canonical_name_en, ''))) AS normalized_canonical_name_en
    FROM visible_exercises
  )
  SELECT
    exercise.id,
    (
      CASE
        WHEN input.locale = 'en' AND (exercise.normalized_name_en = input.q OR exercise.normalized_canonical_name_en = input.q) THEN 120
        WHEN input.locale <> 'en' AND (exercise.normalized_name_es = input.q OR exercise.normalized_canonical_name_es = input.q) THEN 120
        WHEN exercise.normalized_name_es = input.q OR exercise.normalized_name_en = input.q
          OR exercise.normalized_canonical_name_es = input.q OR exercise.normalized_canonical_name_en = input.q THEN 100
        ELSE 0
      END
      + CASE
        WHEN input.locale = 'en' AND (exercise.normalized_name_en LIKE input.q || '%' OR exercise.normalized_canonical_name_en LIKE input.q || '%') THEN 60
        WHEN input.locale <> 'en' AND (exercise.normalized_name_es LIKE input.q || '%' OR exercise.normalized_canonical_name_es LIKE input.q || '%') THEN 60
        ELSE 0
      END
      + greatest(
        similarity(exercise.normalized_name_es, input.q),
        similarity(exercise.normalized_name_en, input.q),
        similarity(exercise.normalized_canonical_name_es, input.q),
        similarity(exercise.normalized_canonical_name_en, input.q)
      ) * 25
    )::numeric AS search_rank
  FROM normalized_exercises AS exercise
  CROSS JOIN input
  WHERE input.q <> ''
    AND length(input.q) >= 2
    AND (p_muscle_id IS NULL OR exercise.effective_primary_muscle_id = p_muscle_id)
    AND (p_equipment_id IS NULL OR exercise.effective_equipment_id = p_equipment_id)
    AND greatest(
      similarity(exercise.normalized_name_es, input.q),
      similarity(exercise.normalized_name_en, input.q),
      similarity(exercise.normalized_canonical_name_es, input.q),
      similarity(exercise.normalized_canonical_name_en, input.q)
    ) >= 0.18
  ORDER BY search_rank DESC, exercise.effective_name_es ASC
  LIMIT (SELECT result_limit FROM input);
$$;

REVOKE ALL ON FUNCTION public.search_exercises_ranked(text, text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_exercises_ranked(text, text, integer, integer, integer) TO authenticated;

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
      CASE WHEN user_override.exercise_id IS NOT NULL
        THEN user_override.secondary_muscle_id ELSE exercise.secondary_muscle_id END AS effective_secondary_muscle_id,
      CASE WHEN user_override.exercise_id IS NOT NULL
        THEN user_override.equipment_id ELSE exercise.equipment_id END AS effective_equipment_id
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
