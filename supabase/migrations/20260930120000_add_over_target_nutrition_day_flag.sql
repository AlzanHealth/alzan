-- Manual nutrition signal used in progress reviews and PDF exports.
-- It is independent from vacation status so both flags can coexist.

ALTER TABLE public.nutrition_day_statuses
  ADD COLUMN IF NOT EXISTS is_over_target boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.nutrition_day_statuses.is_over_target IS
  'Manual user flag indicating that the day should be treated as nutritionally worse in progress reviews.';
