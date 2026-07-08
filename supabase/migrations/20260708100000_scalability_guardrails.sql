-- Scalability guardrails for hot user-scoped reads and high-volume health/import tables.

-- Nutrition: daily reads, PDF exports, and meal item lookups.
CREATE INDEX IF NOT EXISTS meal_logs_user_date_idx
ON public.meal_logs (user_id, date DESC);

CREATE INDEX IF NOT EXISTS meal_logs_user_meal_type_date_idx
ON public.meal_logs (user_id, meal_type, date DESC);

CREATE INDEX IF NOT EXISTS meal_items_meal_log_id_idx
ON public.meal_items (meal_log_id);

CREATE INDEX IF NOT EXISTS meal_items_user_meal_log_idx
ON public.meal_items (user_id, meal_log_id);

-- Training calendar/dashboard scheduling.
CREATE INDEX IF NOT EXISTS workout_plans_user_planned_date_idx
ON public.workout_plans (user_id, planned_date);

CREATE INDEX IF NOT EXISTS workout_plans_user_planned_date_not_skipped_idx
ON public.workout_plans (user_id, planned_date)
WHERE status <> 'skipped';

CREATE INDEX IF NOT EXISTS workout_plans_user_planned_date_planned_idx
ON public.workout_plans (user_id, planned_date)
WHERE status = 'planned';

CREATE INDEX IF NOT EXISTS workout_plans_user_gym_template_future_idx
ON public.workout_plans (user_id, gym_template_id, planned_date)
WHERE gym_template_id IS NOT NULL
  AND completed_at IS NULL
  AND status <> 'skipped';

CREATE INDEX IF NOT EXISTS workout_plans_user_endurance_template_future_idx
ON public.workout_plans (user_id, endurance_template_id, planned_date)
WHERE endurance_template_id IS NOT NULL
  AND completed_at IS NULL
  AND status <> 'skipped';

CREATE INDEX IF NOT EXISTS workout_plans_activity_session_id_idx
ON public.workout_plans (activity_session_id)
WHERE activity_session_id IS NOT NULL;

-- Recipe details and RLS parent checks.
CREATE INDEX IF NOT EXISTS recipe_items_recipe_order_idx
ON public.recipe_items (recipe_id, order_index);

CREATE INDEX IF NOT EXISTS recipe_items_ingredient_id_idx
ON public.recipe_items (ingredient_id);

-- Raw payload retention/dedup cleanup needs indexed nullable FKs on large child tables.
CREATE INDEX IF NOT EXISTS activity_route_points_raw_payload_id_idx
ON public.activity_route_points (raw_payload_id)
WHERE raw_payload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS activity_stream_samples_raw_payload_id_idx
ON public.activity_stream_samples (raw_payload_id)
WHERE raw_payload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS health_metric_samples_raw_payload_id_idx
ON public.health_metric_samples (raw_payload_id)
WHERE raw_payload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS step_intervals_raw_payload_id_idx
ON public.step_intervals (raw_payload_id)
WHERE raw_payload_id IS NOT NULL;

-- RLS policy rewrites: same ownership rules, cheaper auth.uid evaluation on large scans.
DROP POLICY IF EXISTS "Users can view own daily_steps" ON public.daily_steps;
CREATE POLICY "Users can view own daily_steps"
ON public.daily_steps FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own daily_steps" ON public.daily_steps;
CREATE POLICY "Users can insert own daily_steps"
ON public.daily_steps FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own daily_steps" ON public.daily_steps;
CREATE POLICY "Users can update own daily_steps"
ON public.daily_steps FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own daily_steps" ON public.daily_steps;
CREATE POLICY "Users can delete own daily_steps"
ON public.daily_steps FOR DELETE
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own step_intervals" ON public.step_intervals;
CREATE POLICY "Users can view own step_intervals"
ON public.step_intervals FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own step_intervals" ON public.step_intervals;
CREATE POLICY "Users can insert own step_intervals"
ON public.step_intervals FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own step_intervals" ON public.step_intervals;
CREATE POLICY "Users can update own step_intervals"
ON public.step_intervals FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own step_intervals" ON public.step_intervals;
CREATE POLICY "Users can delete own step_intervals"
ON public.step_intervals FOR DELETE
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own activity_route_points" ON public.activity_route_points;
CREATE POLICY "Users can view own activity_route_points"
ON public.activity_route_points FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own activity_route_points" ON public.activity_route_points;
CREATE POLICY "Users can insert own activity_route_points"
ON public.activity_route_points FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own activity_route_points" ON public.activity_route_points;
CREATE POLICY "Users can update own activity_route_points"
ON public.activity_route_points FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own activity_route_points" ON public.activity_route_points;
CREATE POLICY "Users can delete own activity_route_points"
ON public.activity_route_points FOR DELETE
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own activity_stream_samples" ON public.activity_stream_samples;
CREATE POLICY "Users can view own activity_stream_samples"
ON public.activity_stream_samples FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own activity_stream_samples" ON public.activity_stream_samples;
CREATE POLICY "Users can insert own activity_stream_samples"
ON public.activity_stream_samples FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own activity_stream_samples" ON public.activity_stream_samples;
CREATE POLICY "Users can update own activity_stream_samples"
ON public.activity_stream_samples FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own activity_stream_samples" ON public.activity_stream_samples;
CREATE POLICY "Users can delete own activity_stream_samples"
ON public.activity_stream_samples FOR DELETE
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own health_metric_samples" ON public.health_metric_samples;
CREATE POLICY "Users can view own health_metric_samples"
ON public.health_metric_samples FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own health_metric_samples" ON public.health_metric_samples;
CREATE POLICY "Users can insert own health_metric_samples"
ON public.health_metric_samples FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own health_metric_samples" ON public.health_metric_samples;
CREATE POLICY "Users can update own health_metric_samples"
ON public.health_metric_samples FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own health_metric_samples" ON public.health_metric_samples;
CREATE POLICY "Users can delete own health_metric_samples"
ON public.health_metric_samples FOR DELETE
USING ((select auth.uid()) = user_id);
