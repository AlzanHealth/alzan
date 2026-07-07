ALTER TABLE public.meal_logs
ADD COLUMN IF NOT EXISTS source_recipe_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meal_logs_source_recipe_id_fkey'
      AND conrelid = 'public.meal_logs'::regclass
  ) THEN
    ALTER TABLE public.meal_logs
    ADD CONSTRAINT meal_logs_source_recipe_id_fkey
    FOREIGN KEY (source_recipe_id)
    REFERENCES public.recipes(id)
    ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS meal_logs_user_source_recipe_idx
ON public.meal_logs (user_id, source_recipe_id)
WHERE source_recipe_id IS NOT NULL;
