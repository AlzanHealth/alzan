CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_ingredients_name_norm_es_trgm
  ON public.ingredients USING gin (name_norm_es gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ingredients_name_es_trgm
  ON public.ingredients USING gin (name_es gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ingredients_name_en_trgm
  ON public.ingredients USING gin (name_en gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_recipes_name_norm_es_trgm
  ON public.recipes USING gin (name_norm_es gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recipes_name_es_trgm
  ON public.recipes USING gin (name_es gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recipes_name_en_trgm
  ON public.recipes USING gin (name_en gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_date_status
  ON public.workout_plans (user_id, planned_date, status);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_user_start_completed
  ON public.activity_sessions (user_id, start_time)
  WHERE end_time IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_ingredients_ranked(
  p_query text,
  p_category public.ingredients_category DEFAULT NULL,
  p_locale text DEFAULT 'es',
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name_es text,
  name_en text,
  name_norm_es text,
  category public.ingredients_category,
  unit_basis public.ingredients_unit_basis,
  kcal_100 numeric,
  protein_g_100 numeric,
  carbs_g_100 numeric,
  fat_g_100 numeric,
  fiber_g_100 numeric,
  sugar_g_100 numeric,
  salt_g_100 numeric,
  sodium_mg_100 numeric,
  quality_score integer,
  source_primary jsonb,
  source_secondary jsonb,
  notes_es text,
  notes_en text,
  created_at timestamptz,
  updated_at timestamptz,
  search_rank numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      lower(trim(unaccent(coalesce(p_query, '')))) AS q,
      greatest(1, least(coalesce(p_limit, 10), 50)) AS result_limit
  )
  SELECT
    i.id,
    i.name_es,
    i.name_en,
    i.name_norm_es,
    i.category,
    i.unit_basis,
    i.kcal_100,
    i.protein_g_100,
    i.carbs_g_100,
    i.fat_g_100,
    i.fiber_g_100,
    i.sugar_g_100,
    i.salt_g_100,
    i.sodium_mg_100,
    i.quality_score,
    i.source_primary,
    i.source_secondary,
    i.notes_es,
    i.notes_en,
    i.created_at,
    i.updated_at,
    (
      CASE WHEN i.name_norm_es = input.q THEN 100 ELSE 0 END
      + CASE WHEN i.name_norm_es LIKE input.q || '%' THEN 60 ELSE 0 END
      + CASE WHEN lower(coalesce(i.name_es, '')) LIKE input.q || '%' THEN 35 ELSE 0 END
      + CASE WHEN lower(coalesce(i.name_en, '')) LIKE input.q || '%' THEN 30 ELSE 0 END
      + greatest(similarity(i.name_norm_es, input.q), similarity(coalesce(i.name_es, ''), input.q), similarity(coalesce(i.name_en, ''), input.q)) * 25
      + coalesce(i.quality_score, 0) * 0.05
    )::numeric AS search_rank
  FROM public.ingredients i
  CROSS JOIN input
  WHERE input.q <> ''
    AND length(input.q) >= 2
    AND (p_category IS NULL OR i.category = p_category)
    AND coalesce(i.source_primary->>'recipe_only', 'false') <> 'true'
    AND (
      i.name_norm_es % input.q
      OR coalesce(i.name_es, '') % input.q
      OR coalesce(i.name_en, '') % input.q
      OR i.name_norm_es ILIKE '%' || input.q || '%'
      OR coalesce(i.name_es, '') ILIKE '%' || input.q || '%'
      OR coalesce(i.name_en, '') ILIKE '%' || input.q || '%'
    )
  ORDER BY search_rank DESC, i.quality_score DESC, i.name_norm_es ASC
  LIMIT (SELECT result_limit FROM input);
$$;

CREATE OR REPLACE FUNCTION public.search_recipes_ranked(
  p_query text,
  p_scope text DEFAULT 'source',
  p_user_id uuid DEFAULT auth.uid(),
  p_category text DEFAULT 'all',
  p_sort text DEFAULT 'recommended',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name_es text,
  name_en text,
  name_norm_es text,
  description_es text,
  description_en text,
  kcal_100 numeric,
  protein_g_100 numeric,
  carbs_g_100 numeric,
  fat_g_100 numeric,
  quality_score integer,
  source public.recipe_source_enum,
  visibility public.recipe_visibility_enum,
  owner_user_id uuid,
  origin_recipe_id uuid,
  popularity_score integer,
  favorites_total integer,
  saves_total integer,
  uses_7d integer,
  uses_30d integer,
  uses_total integer,
  users_unique_30d integer,
  public_slug text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  search_rank numeric,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      lower(trim(unaccent(coalesce(p_query, '')))) AS q,
      greatest(1, least(coalesce(p_limit, 20), 50)) AS result_limit,
      greatest(0, coalesce(p_offset, 0)) AS result_offset
  ),
  visible_recipes AS (
    SELECT r.*
    FROM public.recipes r
    CROSS JOIN input
    WHERE r.deleted_at IS NULL
      AND (
        (p_scope = 'all' AND (
          r.source = 'system'::public.recipe_source_enum
          OR r.visibility = 'public'::public.recipe_visibility_enum
          OR r.owner_user_id = p_user_id
        ))
        OR (p_scope = 'source' AND r.source = 'system'::public.recipe_source_enum)
        OR (p_scope = 'users' AND r.source = 'user'::public.recipe_source_enum AND r.visibility = 'public'::public.recipe_visibility_enum)
        OR (p_scope = 'saved' AND r.owner_user_id = p_user_id)
        OR (p_scope = 'favorites' AND EXISTS (
          SELECT 1 FROM public.recipe_favorites rf WHERE rf.user_id = p_user_id AND rf.recipe_id = r.id
        ))
        OR (p_scope NOT IN ('source', 'all', 'users', 'saved', 'favorites') AND (
          r.source = 'system'::public.recipe_source_enum
          OR r.visibility = 'public'::public.recipe_visibility_enum
          OR r.owner_user_id = p_user_id
        ))
      )
      AND (
        p_category IS NULL
        OR p_category = 'all'
        OR (p_category = 'high_protein' AND r.protein_g_100 >= 15)
        OR (p_category = 'low_cal' AND r.kcal_100 <= 120)
        OR (p_category = 'high_carb' AND r.carbs_g_100 >= 45)
      )
      AND (
        input.q = ''
        OR length(input.q) < 2
        OR r.name_norm_es % input.q
        OR coalesce(r.name_es, '') % input.q
        OR coalesce(r.name_en, '') % input.q
        OR r.name_norm_es ILIKE '%' || input.q || '%'
        OR coalesce(r.name_es, '') ILIKE '%' || input.q || '%'
        OR coalesce(r.name_en, '') ILIKE '%' || input.q || '%'
      )
  ),
  ranked AS (
    SELECT
      r.*,
      (
        CASE WHEN input.q <> '' AND r.name_norm_es = input.q THEN 100 ELSE 0 END
        + CASE WHEN input.q <> '' AND r.name_norm_es LIKE input.q || '%' THEN 60 ELSE 0 END
        + CASE WHEN input.q <> '' AND lower(coalesce(r.name_es, '')) LIKE input.q || '%' THEN 35 ELSE 0 END
        + CASE WHEN input.q <> '' AND lower(coalesce(r.name_en, '')) LIKE input.q || '%' THEN 30 ELSE 0 END
        + CASE WHEN input.q <> '' THEN greatest(similarity(r.name_norm_es, input.q), similarity(coalesce(r.name_es, ''), input.q), similarity(coalesce(r.name_en, ''), input.q)) * 25 ELSE 0 END
        + coalesce(r.quality_score, 0) * 0.03
        + coalesce(r.popularity_score, 0) * 0.01
      )::numeric AS search_rank,
      count(*) OVER () AS total_count
    FROM visible_recipes r
    CROSS JOIN input
  )
  SELECT
    ranked.id,
    ranked.name_es,
    ranked.name_en,
    ranked.name_norm_es,
    ranked.description_es,
    ranked.description_en,
    ranked.kcal_100,
    ranked.protein_g_100,
    ranked.carbs_g_100,
    ranked.fat_g_100,
    ranked.quality_score,
    ranked.source,
    ranked.visibility,
    ranked.owner_user_id,
    ranked.origin_recipe_id,
    ranked.popularity_score,
    ranked.favorites_total,
    ranked.saves_total,
    ranked.uses_7d,
    ranked.uses_30d,
    ranked.uses_total,
    ranked.users_unique_30d,
    ranked.public_slug,
    ranked.published_at,
    ranked.created_at,
    ranked.updated_at,
    ranked.deleted_at,
    ranked.search_rank,
    ranked.total_count
  FROM ranked, input
  ORDER BY
    CASE WHEN p_sort = 'week' THEN ranked.uses_7d END DESC NULLS LAST,
    CASE WHEN p_sort = 'month' THEN ranked.uses_30d END DESC NULLS LAST,
    CASE WHEN p_sort = 'saved' THEN ranked.saves_total END DESC NULLS LAST,
    CASE WHEN p_sort = 'saved' THEN ranked.favorites_total END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('week', 'month', 'saved') THEN ranked.search_rank END DESC NULLS LAST,
    ranked.quality_score DESC,
    ranked.name_norm_es ASC
  LIMIT (SELECT result_limit FROM input)
  OFFSET (SELECT result_offset FROM input);
$$;

CREATE OR REPLACE FUNCTION public.get_training_calendar_marks(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  date date,
  planned_count integer,
  completed_count integer,
  has_planned boolean,
  has_completed boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(p_start_date, p_end_date, interval '1 day')::date AS date
  ),
  plans AS (
    SELECT planned_date::date AS date, count(*)::integer AS planned_count
    FROM public.workout_plans
    WHERE user_id = p_user_id
      AND p_user_id = auth.uid()
      AND planned_date BETWEEN p_start_date AND p_end_date
      AND status <> 'skipped'::public.workout_plans_status
    GROUP BY planned_date::date
  ),
  sessions AS (
    SELECT start_time::date AS date, count(*)::integer AS completed_count
    FROM public.activity_sessions
    WHERE user_id = p_user_id
      AND p_user_id = auth.uid()
      AND end_time IS NOT NULL
      AND needs_strength_review = false
      AND start_time >= p_start_date::timestamptz
      AND start_time < (p_end_date + 1)::timestamptz
      AND (
        duplicate_resolution IS NULL
        OR duplicate_resolution <> 'pending'::public.import_duplicate_resolution_enum
        OR duplicate_score < 80
        OR duplicate_score IS NULL
      )
    GROUP BY start_time::date
  )
  SELECT
    days.date,
    coalesce(plans.planned_count, 0) AS planned_count,
    coalesce(sessions.completed_count, 0) AS completed_count,
    coalesce(plans.planned_count, 0) > 0 AS has_planned,
    coalesce(sessions.completed_count, 0) > 0 AS has_completed
  FROM days
  LEFT JOIN plans ON plans.date = days.date
  LEFT JOIN sessions ON sessions.date = days.date
  WHERE coalesce(plans.planned_count, 0) > 0 OR coalesce(sessions.completed_count, 0) > 0
  ORDER BY days.date ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_home_summary(
  p_user_id uuid,
  p_today date,
  p_week_start date,
  p_week_end date
)
RETURNS TABLE (
  completed_workouts_today integer,
  scheduled_workouts_today jsonb,
  active_today_workout jsonb,
  weight jsonb,
  weight_trend numeric,
  weekly_workouts_count integer,
  weekly_nutrition_days integer,
  weekly_health_days integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH today_bounds AS (
    SELECT p_today::timestamptz AS day_start, (p_today + 1)::timestamptz AS day_end
  ),
  week_bounds AS (
    SELECT p_week_start::timestamptz AS week_start, (p_week_end + 1)::timestamptz AS week_end
  ),
  completed_today AS (
    SELECT count(*)::integer AS count
    FROM public.activity_sessions s, today_bounds b
    WHERE s.user_id = p_user_id
      AND p_user_id = auth.uid()
      AND s.start_time >= b.day_start
      AND s.start_time < b.day_end
      AND s.end_time IS NOT NULL
  ),
  scheduled_today AS (
    SELECT coalesce(jsonb_agg(to_jsonb(wp) ORDER BY wp.created_at ASC), '[]'::jsonb) AS plans
    FROM (
      SELECT
        p.*,
        jsonb_build_object('base_name', wt.base_name) AS workout_templates,
        jsonb_build_object('base_name', ewt.base_name, 'sport_type', ewt.sport_type) AS endurance_workout_templates
      FROM public.workout_plans p
      LEFT JOIN public.workout_templates wt ON wt.id = p.gym_template_id
      LEFT JOIN public.endurance_workout_templates ewt ON ewt.id = p.endurance_template_id
      WHERE p.user_id = p_user_id
        AND p_user_id = auth.uid()
        AND p.planned_date = p_today
        AND p.status = 'planned'::public.workout_plans_status
    ) wp
  ),
  active_today AS (
    SELECT to_jsonb(s) AS session
    FROM public.activity_sessions s, today_bounds b
    WHERE s.user_id = p_user_id
      AND p_user_id = auth.uid()
      AND s.end_time IS NULL
      AND s.start_time >= b.day_start
      AND s.start_time < b.day_end
    ORDER BY s.start_time DESC
    LIMIT 1
  ),
  weights AS (
    SELECT weight_kg, measured_at, row_number() OVER (ORDER BY measured_at DESC) AS rn
    FROM public.weight_logs
    WHERE user_id = p_user_id
      AND p_user_id = auth.uid()
    ORDER BY measured_at DESC
    LIMIT 2
  ),
  week_workouts AS (
    SELECT count(*)::integer AS count
    FROM public.activity_sessions s, week_bounds b
    WHERE s.user_id = p_user_id
      AND p_user_id = auth.uid()
      AND s.start_time >= b.week_start
      AND s.start_time < b.week_end
  ),
  nutrition_days AS (
    SELECT count(DISTINCT date)::integer AS count
    FROM public.meal_logs
    WHERE user_id = p_user_id
      AND p_user_id = auth.uid()
      AND date BETWEEN p_week_start AND p_week_end
  ),
  health_days AS (
    SELECT count(DISTINCT date)::integer AS count
    FROM (
      SELECT measured_at::date AS date FROM public.weight_logs WHERE user_id = p_user_id AND p_user_id = auth.uid() AND measured_at >= (SELECT week_start FROM week_bounds) AND measured_at < (SELECT week_end FROM week_bounds)
      UNION
      SELECT date FROM public.sleep_sessions WHERE user_id = p_user_id AND p_user_id = auth.uid() AND date BETWEEN p_week_start AND p_week_end
      UNION
      SELECT date FROM public.daily_hydration WHERE user_id = p_user_id AND p_user_id = auth.uid() AND date BETWEEN p_week_start AND p_week_end
    ) health_dates
  )
  SELECT
    (SELECT count FROM completed_today),
    (SELECT plans FROM scheduled_today),
    (SELECT session FROM active_today),
    (SELECT to_jsonb(w) FROM weights w WHERE rn = 1),
    coalesce((SELECT weight_kg FROM weights WHERE rn = 1), 0) - coalesce((SELECT weight_kg FROM weights WHERE rn = 2), coalesce((SELECT weight_kg FROM weights WHERE rn = 1), 0)),
    (SELECT count FROM week_workouts),
    (SELECT count FROM nutrition_days),
    (SELECT count FROM health_days);
$$;

GRANT EXECUTE ON FUNCTION public.search_ingredients_ranked(text, public.ingredients_category, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_recipes_ranked(text, text, uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_calendar_marks(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_home_summary(uuid, date, date, date) TO authenticated;
