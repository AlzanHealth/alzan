\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.exercises (id, base_name_es, base_name_en, is_custom, owner_user_id, load_type)
SELECT
  md5('ranked-pagination-test:' || n)::uuid,
  'zzcatalogrankedpageregression',
  'zzcatalogrankedpageregression',
  false, NULL, 'external'
FROM generate_series(1, 205) AS n;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  first_ids uuid[];
  second_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO first_ids
  FROM public.search_exercises_ranked_page('zzcatalogrankedpageregression', 'es', NULL, NULL, 500, 0);
  SELECT array_agg(id) INTO second_ids
  FROM public.search_exercises_ranked_page('zzcatalogrankedpageregression', 'es', NULL, NULL, 180, 180);

  IF cardinality(first_ids) <> 180 THEN
    RAISE EXCEPTION 'ranked page must retain the 180-row request bound';
  END IF;
  IF cardinality(second_ids) <> 25 OR first_ids && second_ids THEN
    RAISE EXCEPTION 'ranked pages must load every remaining match without overlapping equal-name/rank ties';
  END IF;
  IF (SELECT count(*) FROM public.search_exercises_ranked('zzcatalogrankedpageregression', 'es', NULL, NULL, 500)) <> 180 THEN
    RAISE EXCEPTION 'legacy ranked search must preserve its bounded first-page contract';
  END IF;
  IF has_function_privilege('anon', 'public.search_exercises_ranked_page(text,text,integer,integer,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ranked pagination must not be executable by anonymous users';
  END IF;
END;
$$;

ROLLBACK;
