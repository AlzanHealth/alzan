\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.exercises (base_name_es, base_name_en, is_custom, owner_user_id, load_type)
VALUES ('Test Press-Jalón Singular', 'Test Cable Pulldown Singular', false, NULL, 'external')
RETURNING id AS test_exercise_id \gset

INSERT INTO public.exercises (base_name_es, base_name_en, is_custom, owner_user_id, load_type)
VALUES ('QA Press činka', 'QA Press činka', false, NULL, 'external')
RETURNING id AS unicode_match_exercise_id \gset

INSERT INTO public.exercises (base_name_es, base_name_en, is_custom, owner_user_id, load_type)
VALUES ('Press dumbbell', 'Press dumbbell', false, NULL, 'external')
RETURNING id AS fuzzy_match_exercise_id \gset

SELECT id AS test_user_id FROM public.users WHERE email = 'info@alzan.com' LIMIT 1 \gset
SELECT id AS test_muscle_id FROM public.muscle_groups ORDER BY id LIMIT 1 \gset
SELECT gen_random_uuid() AS test_other_user_id \gset
SELECT set_config('test.exercise_id', :'test_exercise_id', true);
SELECT set_config('test.unicode_match_exercise_id', :'unicode_match_exercise_id', true);
SELECT set_config('test.fuzzy_match_exercise_id', :'fuzzy_match_exercise_id', true);
SELECT set_config('test.muscle_id', :'test_muscle_id', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'test_user_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  IF public.find_exact_exercise_catalog_match('test press jalon singular') IS DISTINCT FROM current_setting('test.exercise_id')::uuid THEN
    RAISE EXCEPTION 'accent- and punctuation-insensitive exact matching failed';
  END IF;

  IF public.normalize_exercise_catalog_name('Press činka')
    IS DISTINCT FROM public.normalize_exercise_catalog_name('Press cinka') THEN
    RAISE EXCEPTION 'frontend-equivalent accented letters were normalized differently';
  END IF;

  IF public.find_exact_exercise_catalog_match('QA Press cinka')
    IS DISTINCT FROM current_setting('test.unicode_match_exercise_id')::uuid THEN
    RAISE EXCEPTION 'exact matching missed a non-Spanish diacritic';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.search_exercises_ranked('press machine', 'es', NULL, NULL, 180) AS result
    WHERE result.id = current_setting('test.fuzzy_match_exercise_id')::uuid
  ) THEN
    RAISE EXCEPTION 'ranked search omitted a useful low-trigram fuzzy candidate';
  END IF;
END;
$$;

INSERT INTO public.user_exercise_overrides (
  user_id,
  exercise_id,
  base_name_es,
  base_name_en,
  description_es,
  description_en,
  primary_muscle_id,
  load_type
)
VALUES (
  :'test_user_id',
  :'test_exercise_id',
  'Mi jalón personal',
  'My personal pulldown',
  'Ajuste solo para esta cuenta',
  'Personal detail for this account',
  :'test_muscle_id',
  'external'
);

INSERT INTO public.exercises (
  base_name_es,
  base_name_en,
  primary_muscle_id,
  is_custom,
  owner_user_id,
  load_type
)
VALUES ('Ejercicio personal QA', 'QA personal exercise', :'test_muscle_id', true, auth.uid(), 'external')
RETURNING id AS test_custom_exercise_id \gset
SELECT set_config('test.custom_exercise_id', :'test_custom_exercise_id', true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.exercises
    WHERE id = current_setting('test.custom_exercise_id')::uuid
      AND owner_user_id = auth.uid()
      AND is_custom = true
  ) THEN
    RAISE EXCEPTION 'the user could not create a personal exercise';
  END IF;

  BEGIN
    INSERT INTO public.exercises (
      base_name_es,
      base_name_en,
      is_custom,
      owner_user_id,
      load_type
    )
    VALUES ('QA Sin músculo', 'QA Missing Muscle', true, auth.uid(), 'external');
    RAISE EXCEPTION 'a personal exercise without a primary muscle was accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    INSERT INTO public.user_exercise_overrides (
      user_id,
      exercise_id,
      base_name_es,
      base_name_en
    )
    VALUES (auth.uid(), current_setting('test.unicode_match_exercise_id')::uuid,
      'QA Override Missing Muscle', 'QA Override Missing Muscle');
    RAISE EXCEPTION 'an Alzan override without a primary muscle was accepted';
  EXCEPTION
    WHEN not_null_violation THEN NULL;
  END;

  UPDATE public.exercises
  SET base_name_es = 'Ejercicio personal QA editado',
      base_name_en = 'Edited QA personal exercise'
  WHERE id = current_setting('test.custom_exercise_id')::uuid
    AND owner_user_id = auth.uid();

  IF NOT FOUND OR public.find_exact_exercise_catalog_match('ejercicio personal qa editado')
    IS DISTINCT FROM current_setting('test.custom_exercise_id')::uuid THEN
    RAISE EXCEPTION 'the user could not edit and search their personal exercise';
  END IF;

  BEGIN
    INSERT INTO public.exercises (
      base_name_es,
      base_name_en,
      primary_muscle_id,
      is_custom,
      owner_user_id,
      load_type
    )
    VALUES ('Test Press Jalón Singular', 'Test Cable Pulldown Singular', current_setting('test.muscle_id')::smallint, true, auth.uid(), 'external');
    RAISE EXCEPTION 'a custom exercise duplicated a shared Alzan name';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.exercises (
      base_name_es,
      base_name_en,
      primary_muscle_id,
      is_custom,
      owner_user_id,
      load_type
    )
    VALUES ('QA Press cinka', 'QA Press cinka', current_setting('test.muscle_id')::smallint, true, auth.uid(), 'external');
    RAISE EXCEPTION 'a custom exercise duplicated a non-Spanish diacritic variant';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  UPDATE public.user_exercise_overrides
  SET
    base_name_es = 'Mi jalón editado',
    base_name_en = 'My edited pulldown'
  WHERE user_id = auth.uid()
    AND exercise_id = current_setting('test.exercise_id')::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'the owner could not edit their personal exercise override';
  END IF;

  IF public.find_exact_exercise_catalog_match('MI JALON PERSONAL') IS NOT DISTINCT FROM current_setting('test.exercise_id')::uuid THEN
    RAISE EXCEPTION 'the old personal name remained after editing the override';
  END IF;

  IF public.find_exact_exercise_catalog_match('MI JALON EDITADO') IS DISTINCT FROM current_setting('test.exercise_id')::uuid THEN
    RAISE EXCEPTION 'exact matching did not include the edited user override';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.search_exercises_ranked('Mi jalón editado', 'es', NULL, NULL, 10) AS result
    WHERE result.id = current_setting('test.exercise_id')::uuid
  ) THEN
    RAISE EXCEPTION 'ranked search did not include the edited user override';
  END IF;

  IF (SELECT base_name_es FROM public.exercises WHERE id = current_setting('test.exercise_id')::uuid)
      <> 'Test Press-Jalón Singular' THEN
    RAISE EXCEPTION 'the shared Alzan exercise row was changed by a personal edit';
  END IF;
END;
$$;

DO $$
DECLARE
  v_updated_rows integer;
BEGIN
  UPDATE public.exercises
  SET base_name_es = 'Should Not Be Shared'
  WHERE id = current_setting('test.exercise_id')::uuid;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 0 THEN
    RAISE EXCEPTION 'authenticated user unexpectedly updated a shared Alzan exercise';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.exercises (
      base_name_es,
      base_name_en,
      primary_muscle_id,
      is_custom,
      owner_user_id,
      load_type
    )
    VALUES ('Mi Jalon Editado', 'My edited pulldown', current_setting('test.muscle_id')::smallint, true, auth.uid(), 'external');
    RAISE EXCEPTION 'the exact duplicate against a personal override was accepted';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END;
$$;

SET LOCAL request.jwt.claim.sub = :'test_other_user_id';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_exercise_overrides
    WHERE exercise_id = current_setting('test.exercise_id')::uuid
  ) THEN
    RAISE EXCEPTION 'another user can read the personal exercise override';
  END IF;

  UPDATE public.user_exercise_overrides
  SET base_name_es = 'Nombre ajeno'
  WHERE exercise_id = current_setting('test.exercise_id')::uuid;

  IF FOUND THEN
    RAISE EXCEPTION 'another user can edit the personal exercise override';
  END IF;

  DELETE FROM public.user_exercise_overrides
  WHERE exercise_id = current_setting('test.exercise_id')::uuid;

  IF FOUND THEN
    RAISE EXCEPTION 'another user can delete the personal exercise override';
  END IF;
END;
$$;

SET LOCAL request.jwt.claim.sub = :'test_user_id';

DELETE FROM public.user_exercise_overrides
WHERE user_id = auth.uid()
  AND exercise_id = current_setting('test.exercise_id')::uuid;

DO $$
BEGIN
  IF public.find_exact_exercise_catalog_match('mi jalon editado') IS NOT NULL THEN
    RAISE EXCEPTION 'restoring the Alzan exercise did not remove its personal label';
  END IF;

  IF public.find_exact_exercise_catalog_match('test press jalon singular')
    IS DISTINCT FROM current_setting('test.exercise_id')::uuid THEN
    RAISE EXCEPTION 'restoring the Alzan exercise did not return its shared name';
  END IF;
END;
$$;

SET LOCAL ROLE postgres;
ROLLBACK;
