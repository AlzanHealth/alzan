-- Harden exercise catalog RLS.
-- Global catalog rows are public to authenticated users (owner_user_id IS NULL).
-- Custom exercises and their dependent content are visible/manageable only by owner.

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muscle_groups ENABLE ROW LEVEL SECURITY;

-- Remove legacy permissive policies where they exist. DROP POLICY is idempotent.
DROP POLICY IF EXISTS "CRUD own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Insert own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Update own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Delete own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Read public and own exercises" ON public.exercises;
DROP POLICY IF EXISTS "exercises_manage_own_custom" ON public.exercises;
DROP POLICY IF EXISTS "exercises_select_all_authenticated" ON public.exercises;

CREATE POLICY exercises_select_visible
  ON public.exercises
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id IS NULL
    OR owner_user_id = (SELECT auth.uid())
  );

CREATE POLICY exercises_insert_own_custom
  ON public.exercises
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_custom = true
    AND owner_user_id = (SELECT auth.uid())
  );

CREATE POLICY exercises_update_own_custom
  ON public.exercises
  FOR UPDATE
  TO authenticated
  USING (
    is_custom = true
    AND owner_user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    is_custom = true
    AND owner_user_id = (SELECT auth.uid())
  );

CREATE POLICY exercises_delete_own_custom
  ON public.exercises
  FOR DELETE
  TO authenticated
  USING (
    is_custom = true
    AND owner_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Public read access" ON public.exercise_translations;
DROP POLICY IF EXISTS "Public read exercise_translations" ON public.exercise_translations;
DROP POLICY IF EXISTS "exercise_translations_select_all_authenticated" ON public.exercise_translations;

CREATE POLICY exercise_translations_select_visible
  ON public.exercise_translations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_translations.exercise_id
        AND (
          e.owner_user_id IS NULL
          OR e.owner_user_id = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY exercise_translations_insert_own_custom
  ON public.exercise_translations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_translations.exercise_id
        AND e.is_custom = true
        AND e.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY exercise_translations_update_own_custom
  ON public.exercise_translations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_translations.exercise_id
        AND e.is_custom = true
        AND e.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_translations.exercise_id
        AND e.is_custom = true
        AND e.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY exercise_translations_delete_own_custom
  ON public.exercise_translations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_translations.exercise_id
        AND e.is_custom = true
        AND e.owner_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Public read access" ON public.exercise_media;
DROP POLICY IF EXISTS "exercise_media_select_all_authenticated" ON public.exercise_media;

CREATE POLICY exercise_media_select_visible
  ON public.exercise_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercises AS e
      WHERE e.id = exercise_media.exercise_id
        AND (
          e.owner_user_id IS NULL
          OR e.owner_user_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Public read access" ON public.equipment;
DROP POLICY IF EXISTS "equipment_select_all_authenticated" ON public.equipment;
CREATE POLICY equipment_select_catalog
  ON public.equipment
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.exercise_types;
DROP POLICY IF EXISTS "exercise_types_select_all_authenticated" ON public.exercise_types;
CREATE POLICY exercise_types_select_catalog
  ON public.exercise_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.muscle_groups;
DROP POLICY IF EXISTS "muscle_groups_select_all_authenticated" ON public.muscle_groups;
CREATE POLICY muscle_groups_select_catalog
  ON public.muscle_groups
  FOR SELECT
  TO authenticated
  USING (true);
