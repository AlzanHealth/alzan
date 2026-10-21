-- Match searches by whole words and word prefixes. This avoids false positives
-- such as "lat" matching the middle of "plate", while supporting singular and
-- plural forms such as "calf" and "calves".
CREATE OR REPLACE FUNCTION public.exercise_catalog_search_token_variants(p_token text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(DISTINCT variant.value) FILTER (WHERE variant.value <> ''), ARRAY[]::text[])
  FROM unnest(ARRAY[
    p_token,
    CASE WHEN char_length(p_token) > 4 AND right(p_token, 3) = 'ies'
      THEN left(p_token, char_length(p_token) - 3) || 'y' END,
    CASE WHEN char_length(p_token) > 4 AND right(p_token, 3) = 'ves'
      THEN left(p_token, char_length(p_token) - 3) || 'f' END,
    CASE WHEN char_length(p_token) > 4 AND right(p_token, 3) = 'ves'
      THEN left(p_token, char_length(p_token) - 3) || 'fe' END,
    CASE WHEN char_length(p_token) > 4 AND right(p_token, 2) = 'es'
      THEN left(p_token, char_length(p_token) - 2) END,
    CASE WHEN char_length(p_token) > 3 AND right(p_token, 1) = 's'
      THEN left(p_token, char_length(p_token) - 1) END,
    CASE WHEN char_length(p_token) > 3 AND right(p_token, 1) = 'f'
      THEN left(p_token, char_length(p_token) - 1) || 'ves' END,
    CASE WHEN char_length(p_token) > 4 AND right(p_token, 2) = 'fe'
      THEN left(p_token, char_length(p_token) - 2) || 'ves' END
  ]::text[]) AS variant(value);
$$;

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
      public.exercise_catalog_search_token_variants(raw.value) AS variants,
      raw.value NOT IN (
        'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'con', 'por', 'para',
        'the', 'of', 'and', 'to', 'a', 'an', 'in', 'on', 'da', 'do'
      ) OR (char_length(query_text.value) = 1 AND raw.value = query_text.value) AS is_meaningful
    FROM query_text
    CROSS JOIN LATERAL regexp_split_to_table(query_text.value, ' ') AS raw(value)
    WHERE raw.value <> ''
  ), candidate_tokens AS (
    SELECT
      raw.value,
      public.exercise_catalog_search_token_variants(raw.value) AS variants
    FROM normalized_candidates AS candidate
    CROSS JOIN LATERAL regexp_split_to_table(candidate.value, ' ') AS raw(value)
    WHERE raw.value <> ''
      AND raw.value NOT IN (
        'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'con', 'por', 'para',
        'the', 'of', 'and', 'to', 'a', 'an', 'in', 'on', 'da', 'do'
      )
  )
  SELECT
    btrim(coalesce(p_query, '')) = ''
    OR (
      query_text.value <> ''
      AND EXISTS (SELECT 1 FROM query_tokens WHERE is_meaningful)
      AND NOT EXISTS (
        SELECT 1
        FROM query_tokens AS query_token
        WHERE query_token.is_meaningful
          AND NOT EXISTS (
            SELECT 1
            FROM candidate_tokens AS candidate_token
            WHERE query_token.variants && candidate_token.variants
              OR EXISTS (
                SELECT 1
                FROM unnest(query_token.variants) AS query_variant(value)
                WHERE left(candidate_token.value, char_length(query_variant.value)) = query_variant.value
              )
          )
      )
    )
  FROM query_text;
$$;

REVOKE ALL ON FUNCTION public.exercise_catalog_search_token_variants(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exercise_catalog_query_matches_candidates(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exercise_catalog_search_token_variants(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exercise_catalog_query_matches_candidates(text, text[]) TO authenticated;

-- Keep form requirements enforced at the database boundary too. Trusted local
-- demo seeds run as postgres and may continue to seed legacy sample rows.
ALTER TABLE public.user_exercise_overrides
  ALTER COLUMN primary_muscle_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.require_primary_muscle_for_custom_exercise()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_custom IS TRUE
    AND NEW.owner_user_id IS NOT NULL
    AND NEW.archived_at IS NULL
    AND current_user <> 'postgres'
    AND NEW.primary_muscle_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'exercise_custom_primary_muscle_required';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER exercises_require_custom_primary_muscle
  BEFORE INSERT OR UPDATE OF base_name_es, base_name_en, primary_muscle_id, is_custom, owner_user_id, archived_at
  ON public.exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.require_primary_muscle_for_custom_exercise();
