-- Keep shared Alzan exercises unchanged while allowing per-user catalog edits.
CREATE TABLE public.user_exercise_overrides (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  base_name_es text NOT NULL,
  base_name_en text NOT NULL,
  description_es text,
  description_en text,
  primary_muscle_id smallint,
  secondary_muscle_id smallint,
  equipment_id smallint,
  load_type public.exercise_load_type,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id),
  CONSTRAINT user_exercise_overrides_name_es_valid CHECK (char_length(btrim(base_name_es)) BETWEEN 2 AND 80),
  CONSTRAINT user_exercise_overrides_name_en_valid CHECK (char_length(btrim(base_name_en)) BETWEEN 2 AND 80),
  CONSTRAINT user_exercise_overrides_description_es_valid CHECK (char_length(coalesce(description_es, '')) <= 500),
  CONSTRAINT user_exercise_overrides_description_en_valid CHECK (char_length(coalesce(description_en, '')) <= 500),
  CONSTRAINT user_exercise_overrides_primary_muscle_fkey FOREIGN KEY (primary_muscle_id)
    REFERENCES public.muscle_groups(id),
  CONSTRAINT user_exercise_overrides_secondary_muscle_fkey FOREIGN KEY (secondary_muscle_id)
    REFERENCES public.muscle_groups(id),
  CONSTRAINT user_exercise_overrides_equipment_fkey FOREIGN KEY (equipment_id)
    REFERENCES public.equipment(id)
);

CREATE INDEX user_exercise_overrides_exercise_id_idx
  ON public.user_exercise_overrides (exercise_id);

ALTER TABLE public.user_exercise_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_exercise_overrides_select_own
  ON public.user_exercise_overrides
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_exercise_overrides_insert_own_global
  ON public.user_exercise_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_id
        AND e.owner_user_id IS NULL
        AND e.is_custom = false
        AND e.archived_at IS NULL
    )
  );

CREATE POLICY user_exercise_overrides_update_own_global
  ON public.user_exercise_overrides
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_id
        AND e.owner_user_id IS NULL
        AND e.is_custom = false
        AND e.archived_at IS NULL
    )
  );

CREATE POLICY user_exercise_overrides_delete_own
  ON public.user_exercise_overrides
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.user_exercise_overrides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_exercise_overrides TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_user_exercise_override()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_name_es text := public.normalize_exercise_catalog_name(NEW.base_name_es);
  v_name_en text := public.normalize_exercise_catalog_name(NEW.base_name_en);
  v_first_lock text;
  v_second_lock text;
BEGIN
  IF NEW.user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exercise_owner_must_match_authenticated_user';
  END IF;

  IF v_name_es = ''
    OR v_name_en = ''
    OR char_length(btrim(NEW.base_name_es)) NOT BETWEEN 2 AND 80
    OR char_length(btrim(NEW.base_name_en)) NOT BETWEEN 2 AND 80
    OR char_length(coalesce(NEW.description_es, '')) > 500
    OR char_length(coalesce(NEW.description_en, '')) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'exercise_custom_input_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.exercises AS e
    WHERE e.id = NEW.exercise_id
      AND e.owner_user_id IS NULL
      AND e.is_custom = false
      AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exercise_override_not_allowed';
  END IF;

  v_first_lock := least(v_name_es, v_name_en);
  v_second_lock := greatest(v_name_es, v_name_en);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_first_lock, 0));
  IF v_second_lock <> v_first_lock THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_second_lock, 0));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exercises AS e
    LEFT JOIN public.user_exercise_overrides AS other_override
      ON other_override.exercise_id = e.id
      AND other_override.user_id = NEW.user_id
    WHERE e.id <> NEW.exercise_id
      AND e.archived_at IS NULL
      AND (e.owner_user_id IS NULL OR e.owner_user_id = NEW.user_id)
      AND (
        public.normalize_exercise_catalog_name(e.base_name_es) IN (v_name_es, v_name_en)
        OR public.normalize_exercise_catalog_name(coalesce(e.base_name_en, '')) IN (v_name_es, v_name_en)
        OR public.normalize_exercise_catalog_name(coalesce(other_override.base_name_es, '')) IN (v_name_es, v_name_en)
        OR public.normalize_exercise_catalog_name(coalesce(other_override.base_name_en, '')) IN (v_name_es, v_name_en)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'user_exercise_overrides_exact_name_unique',
      MESSAGE = 'exercise_name_duplicate';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_exercise_overrides_validate
  BEFORE INSERT OR UPDATE ON public.user_exercise_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_user_exercise_override();

-- Custom exercises must also check names that the same user assigned to Alzan exercises.
CREATE OR REPLACE FUNCTION public.reject_duplicate_custom_exercise_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_name_es text := public.normalize_exercise_catalog_name(NEW.base_name_es);
  v_name_en text := public.normalize_exercise_catalog_name(NEW.base_name_en);
  v_lock_name text;
  v_second_lock_name text;
BEGIN
  IF NEW.is_custom IS DISTINCT FROM true OR NEW.owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Local reset seeds and trusted SQL maintenance run as the database owner.
  -- Browser clients remain strictly bound to their authenticated user id.
  IF current_user <> 'postgres'
    AND NEW.owner_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exercise_owner_must_match_authenticated_user';
  END IF;

  IF NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.base_name_es IS NULL
    OR NEW.base_name_en IS NULL
    OR char_length(btrim(NEW.base_name_es)) NOT BETWEEN 2 AND 80
    OR char_length(btrim(NEW.base_name_en)) NOT BETWEEN 2 AND 80
    OR v_name_es = ''
    OR v_name_en = ''
    OR char_length(coalesce(NEW.description_es, '')) > 500
    OR char_length(coalesce(NEW.description_en, '')) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'exercise_custom_input_invalid';
  END IF;

  v_lock_name := least(v_name_es, v_name_en);
  v_second_lock_name := greatest(v_name_es, v_name_en);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_name, 0));
  IF v_second_lock_name <> v_lock_name THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_second_lock_name, 0));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exercises AS e
    LEFT JOIN public.user_exercise_overrides AS user_override
      ON user_override.exercise_id = e.id
      AND user_override.user_id = NEW.owner_user_id
    WHERE e.id <> NEW.id
      AND e.archived_at IS NULL
      AND (e.owner_user_id IS NULL OR e.owner_user_id = NEW.owner_user_id)
      AND (
        public.normalize_exercise_catalog_name(e.base_name_es) IN (v_name_es, v_name_en)
        OR public.normalize_exercise_catalog_name(coalesce(e.base_name_en, '')) IN (v_name_es, v_name_en)
        OR public.normalize_exercise_catalog_name(coalesce(user_override.base_name_es, '')) IN (v_name_es, v_name_en)
        OR public.normalize_exercise_catalog_name(coalesce(user_override.base_name_en, '')) IN (v_name_es, v_name_en)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'exercises_custom_exact_name_unique',
      MESSAGE = 'exercise_name_duplicate';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exercises_reject_duplicate_custom_name ON public.exercises;
CREATE TRIGGER exercises_reject_duplicate_custom_name
  BEFORE INSERT OR UPDATE OF base_name_es, base_name_en, is_custom, owner_user_id, archived_at
  ON public.exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_duplicate_custom_exercise_name();

-- Exact duplicate checks are independent of fuzzy ranking so the UI never misses a top-N result.
CREATE OR REPLACE FUNCTION public.find_exact_exercise_catalog_match(
  p_name text,
  p_exclude_exercise_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH input AS (
    SELECT public.normalize_exercise_catalog_name(p_name) AS normalized_name
  )
  SELECT e.id
  FROM public.exercises AS e
  LEFT JOIN public.user_exercise_overrides AS user_override
    ON user_override.exercise_id = e.id
    AND user_override.user_id = (SELECT auth.uid())
  CROSS JOIN input
  WHERE input.normalized_name <> ''
    AND e.id IS DISTINCT FROM p_exclude_exercise_id
    AND e.archived_at IS NULL
    AND (e.owner_user_id IS NULL OR e.owner_user_id = (SELECT auth.uid()))
    AND (
      public.normalize_exercise_catalog_name(e.base_name_es) = input.normalized_name
      OR public.normalize_exercise_catalog_name(coalesce(e.base_name_en, '')) = input.normalized_name
      OR public.normalize_exercise_catalog_name(coalesce(user_override.base_name_es, '')) = input.normalized_name
      OR public.normalize_exercise_catalog_name(coalesce(user_override.base_name_en, '')) = input.normalized_name
    )
  ORDER BY e.owner_user_id NULLS FIRST, e.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_exact_exercise_catalog_match(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_exact_exercise_catalog_match(text, uuid) TO authenticated;

-- Rank using the signed-in user's visible name and the canonical name, both accent-insensitively.
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
      lower(trim(unaccent(coalesce(p_query, '')))) AS q,
      greatest(1, least(coalesce(p_limit, 30), 90)) AS result_limit,
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
      lower(unaccent(coalesce(effective_name_es, ''))) AS normalized_name_es,
      lower(unaccent(coalesce(effective_name_en, ''))) AS normalized_name_en,
      lower(unaccent(coalesce(canonical_name_es, ''))) AS normalized_canonical_name_es,
      lower(unaccent(coalesce(canonical_name_en, ''))) AS normalized_canonical_name_en
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
    AND (
      exercise.normalized_name_es % input.q
      OR exercise.normalized_name_en % input.q
      OR exercise.normalized_canonical_name_es % input.q
      OR exercise.normalized_canonical_name_en % input.q
      OR exercise.normalized_name_es LIKE '%' || input.q || '%'
      OR exercise.normalized_name_en LIKE '%' || input.q || '%'
      OR exercise.normalized_canonical_name_es LIKE '%' || input.q || '%'
      OR exercise.normalized_canonical_name_en LIKE '%' || input.q || '%'
    )
  ORDER BY search_rank DESC, exercise.effective_name_es ASC
  LIMIT (SELECT result_limit FROM input);
$$;

REVOKE ALL ON FUNCTION public.search_exercises_ranked(text, text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_exercises_ranked(text, text, integer, integer, integer) TO authenticated;
