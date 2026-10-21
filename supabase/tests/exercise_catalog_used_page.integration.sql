\set ON_ERROR_STOP on
BEGIN;

SELECT id AS test_user_id FROM public.users WHERE email = 'info@alzan.com' LIMIT 1 \gset
SELECT gen_random_uuid() AS test_other_user_id \gset
SELECT primary_muscle_id AS test_muscle_id
FROM public.exercises
WHERE primary_muscle_id IS NOT NULL
LIMIT 1 \gset
SELECT equipment_id AS test_equipment_id
FROM public.exercises
WHERE equipment_id IS NOT NULL
LIMIT 1 \gset
SELECT gen_random_uuid() AS test_session_id \gset
SELECT set_config('test.muscle_id', :'test_muscle_id', true);
SELECT set_config('test.equipment_id', :'test_equipment_id', true);

DO $$
BEGIN
  IF to_regprocedure('public.get_used_exercise_catalog_page(integer,integer,text,integer,integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'the authenticated used exercise page RPC is missing';
  END IF;

  IF NOT public.exercise_catalog_query_matches_candidates('lat', ARRAY['Lat pulldown'])
    OR public.exercise_catalog_query_matches_candidates('lat', ARRAY['Plate raise']) THEN
    RAISE EXCEPTION 'whole-word prefix matching returned a false positive or missed a prefix';
  END IF;

  IF NOT public.exercise_catalog_query_matches_candidates('calves', ARRAY['Calf raise'])
    OR NOT public.exercise_catalog_query_matches_candidates('calf', ARRAY['Calves']) THEN
    RAISE EXCEPTION 'irregular calf/calves matching did not work in both directions';
  END IF;

  IF NOT public.exercise_catalog_query_matches_candidates('a', ARRAY['Abductor'])
    OR public.exercise_catalog_query_matches_candidates('a', ARRAY['Bench press']) THEN
    RAISE EXCEPTION 'single-character search did not remain narrow';
  END IF;

  IF NOT public.exercise_catalog_query_matches_candidates('   ', ARRAY['Any exercise'])
    OR public.exercise_catalog_query_matches_candidates('!!!', ARRAY['Any exercise']) THEN
    RAISE EXCEPTION 'empty and punctuation-only queries were not distinguished';
  END IF;

  IF has_function_privilege(
    'anon',
    to_regprocedure('public.get_used_exercise_catalog_page(integer,integer,text,integer,integer,boolean)'),
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anonymous users must not be able to execute the used exercise page RPC';
  END IF;
END;
$$;

INSERT INTO public.exercises (id, base_name_es, base_name_en, primary_muscle_id, equipment_id, is_custom, owner_user_id, load_type)
SELECT
  md5('used-page-test-exercise:' || n::text)::uuid,
  'Used pagination sample ' || lpad(n::text, 2, '0'),
  'Used pagination sample ' || lpad(n::text, 2, '0'),
  :'test_muscle_id',
  :'test_equipment_id',
  false,
  NULL,
  'external'
FROM generate_series(1, 31) AS n;

INSERT INTO public.activity_sessions (
  id, user_id, sport_type, sport_subtype, start_time, end_time, duration_s,
  name, source, provider, status, visibility, timezone
)
VALUES (
  :'test_session_id', :'test_user_id', 'gym', 'strength', now() - interval '1 day', now() - interval '23 hours', 3600,
  'Used catalog pagination test', 'manual', 'manual', 'completed', 'private', 'Europe/Madrid'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'test_user_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.workout_sets (id, session_id, user_id, exercise_id, set_number, weight_kg, reps, created_at)
SELECT
  md5('used-page-test-set:' || n::text)::uuid,
  :'test_session_id',
  :'test_user_id',
  md5('used-page-test-exercise:' || n::text)::uuid,
  1,
  20 + n,
  8,
  now() - interval '1 day' + n * interval '1 second'
FROM generate_series(1, 31) AS n;

INSERT INTO public.exercise_favorites (user_id, exercise_id)
VALUES (:'test_user_id', md5('used-page-test-exercise:1')::uuid);

INSERT INTO public.user_exercise_overrides (
  user_id, exercise_id, base_name_es, base_name_en, primary_muscle_id, load_type
)
VALUES (
  :'test_user_id', md5('used-page-test-exercise:31')::uuid,
  'Used pagination sample con alias', 'Used pagination sample with alias',
  current_setting('test.muscle_id')::smallint, 'external'
);

DO $$
DECLARE
  page_count integer;
  total_items bigint;
  current_page integer;
  first_id uuid;
  second_page_count integer;
  second_page_id uuid;
  filtered_count integer;
  favorite_id uuid;
  alias_count integer;
  no_match_count integer;
BEGIN
  SELECT count(*)::integer, min(result.total_items), max(result.current_page),
    (array_agg(result.exercise_id ORDER BY result.latest_at DESC, result.exercise_id))[1]
  INTO page_count, total_items, current_page, first_id
  FROM public.get_used_exercise_catalog_page(
    1, 30, 'used pagination sample', current_setting('test.muscle_id')::smallint,
    current_setting('test.equipment_id')::smallint, false
  ) AS result;

  IF page_count <> 30 OR total_items <> 31 OR current_page <> 1
    OR first_id IS DISTINCT FROM md5('used-page-test-exercise:31')::uuid THEN
    RAISE EXCEPTION 'first used page was not bounded, counted, or ordered correctly: rows %, total %, page %, first %',
      page_count, total_items, current_page, first_id;
  END IF;

  SELECT count(*)::integer, (array_agg(result.exercise_id))[1], min(result.total_items), min(result.current_page)
  INTO second_page_count, second_page_id, total_items, current_page
  FROM public.get_used_exercise_catalog_page(
    2, 30, 'used pagination sample', current_setting('test.muscle_id')::smallint,
    current_setting('test.equipment_id')::smallint, false
  ) AS result;

  IF second_page_count <> 1 OR second_page_id IS DISTINCT FROM md5('used-page-test-exercise:1')::uuid
    OR total_items <> 31 OR current_page <> 2 THEN
    RAISE EXCEPTION 'second used page did not return the final ordered item';
  END IF;

  SELECT count(*)::integer INTO filtered_count
  FROM public.get_used_exercise_catalog_page(
    1, 30, 'used pagination sample', current_setting('test.muscle_id')::smallint,
    current_setting('test.equipment_id')::smallint, true
  );
  SELECT exercise_id INTO favorite_id
  FROM public.get_used_exercise_catalog_page(
    1, 30, 'used pagination sample', current_setting('test.muscle_id')::smallint,
    current_setting('test.equipment_id')::smallint, true
  );
  IF filtered_count <> 1 OR favorite_id IS DISTINCT FROM md5('used-page-test-exercise:1')::uuid THEN
    RAISE EXCEPTION 'favorites-only filter did not limit the used page';
  END IF;

  SELECT count(*)::integer INTO alias_count
  FROM public.get_used_exercise_catalog_page(
    1, 30, 'used pagination sample with alias', NULL, NULL, false
  );
  IF alias_count <> 1 THEN
    RAISE EXCEPTION 'the used page did not search the caller personal exercise name';
  END IF;

  SELECT count(*)::integer INTO no_match_count
  FROM public.get_used_exercise_catalog_page(
    1, 30, 'missing zzqa token exercise', NULL, NULL, false
  );
  IF no_match_count <> 0 THEN
    RAISE EXCEPTION 'a query with unmatched words returned unrelated used exercises';
  END IF;

  SELECT count(*)::integer INTO no_match_count
  FROM public.get_used_exercise_catalog_page(1, 30, '!!!', NULL, NULL, false);
  IF no_match_count <> 0 THEN
    RAISE EXCEPTION 'a punctuation-only query returned every used exercise';
  END IF;
END;
$$;

SET LOCAL request.jwt.claim.sub = :'test_other_user_id';
DO $$
DECLARE
  page_count integer;
BEGIN
  SELECT count(*)::integer INTO page_count
  FROM public.get_used_exercise_catalog_page(1, 30, NULL, NULL, NULL, false);
  IF page_count <> 0 THEN
    RAISE EXCEPTION 'another user received rows from the test user used exercise page';
  END IF;
END;
$$;

SET LOCAL ROLE postgres;
ROLLBACK;
