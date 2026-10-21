-- Archive used personal exercises without breaking workout history or routines.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

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
    WHERE e.id <> NEW.id
      AND e.archived_at IS NULL
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
  BEFORE INSERT OR UPDATE OF base_name_es, base_name_en, is_custom, owner_user_id, archived_at
  ON public.exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_duplicate_custom_exercise_name();
