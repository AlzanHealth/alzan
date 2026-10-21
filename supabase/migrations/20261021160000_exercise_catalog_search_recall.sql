-- Keep exact-name checks, cache keys and the catalog search aligned for accented names.
CREATE OR REPLACE FUNCTION public.normalize_exercise_catalog_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(
    lower(public.unaccent(coalesce(p_name, ''))),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

-- The normalizer's behavior changed, so rebuild the expression indexes that use it.
DROP INDEX IF EXISTS public.exercises_base_name_es_normalized_idx;
DROP INDEX IF EXISTS public.exercises_base_name_en_normalized_idx;

CREATE INDEX exercises_base_name_es_normalized_idx
  ON public.exercises (public.normalize_exercise_catalog_name(base_name_es))
  WHERE owner_user_id IS NULL OR is_custom = true;

CREATE INDEX exercises_base_name_en_normalized_idx
  ON public.exercises (public.normalize_exercise_catalog_name(base_name_en))
  WHERE owner_user_id IS NULL OR is_custom = true;

-- A candidate can be useful to the client-side fuzzy scorer even when it misses
-- pg_trgm's default % threshold. Keep the result bounded and rank closest first.
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
      coalesce(user_override.equipment_id, e.equipment_id) AS effective_equipment_id
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
