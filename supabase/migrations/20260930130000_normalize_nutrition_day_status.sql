-- Make nutrition day markers mutually exclusive. A missing row represents normal.
ALTER TABLE public.nutrition_day_statuses
  DROP CONSTRAINT IF EXISTS nutrition_day_statuses_status_check;

UPDATE public.nutrition_day_statuses
SET status = CASE
  WHEN status = 'vacation' THEN 'vacation'
  WHEN is_over_target THEN 'over_target'
  ELSE 'vacation'
END,
updated_at = now();

ALTER TABLE public.nutrition_day_statuses
  ADD CONSTRAINT nutrition_day_statuses_status_check
  CHECK (status IN ('vacation', 'over_target'));

ALTER TABLE public.nutrition_day_statuses
  DROP COLUMN IF EXISTS is_over_target;

COMMENT ON COLUMN public.nutrition_day_statuses.status IS
  'Exclusive nutrition marker: vacation or over_target. Missing row means normal.';
