-- Personal exercise catalog support.

CREATE TABLE IF NOT EXISTS public.exercise_favorites (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS exercise_favorites_exercise_id_idx
  ON public.exercise_favorites (exercise_id);

ALTER TABLE public.exercise_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exercise_favorites_select_own ON public.exercise_favorites;
CREATE POLICY exercise_favorites_select_own
  ON public.exercise_favorites
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exercise_favorites_insert_visible_exercise ON public.exercise_favorites;
CREATE POLICY exercise_favorites_insert_visible_exercise
  ON public.exercise_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_id
        AND (e.owner_user_id IS NULL OR e.owner_user_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS exercise_favorites_delete_own ON public.exercise_favorites;
CREATE POLICY exercise_favorites_delete_own
  ON public.exercise_favorites
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.exercise_favorites FROM anon;
GRANT SELECT, INSERT, DELETE ON public.exercise_favorites TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_exercise_catalog_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(
    translate(
      lower(coalesce(p_name, '')),
      'áéíóúüñàèìòùâêîôûäëïöüç',
      'aeiouunaeiouaeiouaeiouc'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

CREATE INDEX IF NOT EXISTS exercises_base_name_es_normalized_idx
  ON public.exercises (public.normalize_exercise_catalog_name(base_name_es))
  WHERE owner_user_id IS NULL OR is_custom = true;

CREATE INDEX IF NOT EXISTS exercises_base_name_en_normalized_idx
  ON public.exercises (public.normalize_exercise_catalog_name(base_name_en))
  WHERE owner_user_id IS NULL OR is_custom = true;

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

  IF NEW.owner_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exercise_owner_must_match_authenticated_user';
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
    WHERE e.id <> NEW.id
      AND (e.owner_user_id IS NULL OR e.owner_user_id = NEW.owner_user_id)
      AND (
        (v_name_es <> '' AND (
          public.normalize_exercise_catalog_name(e.base_name_es) = v_name_es
          OR public.normalize_exercise_catalog_name(e.base_name_en) = v_name_es
        ))
        OR (v_name_en <> '' AND (
          public.normalize_exercise_catalog_name(e.base_name_es) = v_name_en
          OR public.normalize_exercise_catalog_name(e.base_name_en) = v_name_en
        ))
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
  BEFORE INSERT OR UPDATE OF base_name_es, base_name_en, is_custom, owner_user_id
  ON public.exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_duplicate_custom_exercise_name();
