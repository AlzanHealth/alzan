ALTER TABLE public.body_composition_logs
  ADD COLUMN IF NOT EXISTS calculation_version integer NOT NULL DEFAULT 1
    CHECK (calculation_version > 0),
  ADD COLUMN IF NOT EXISTS calculation_status text NOT NULL DEFAULT 'partial'
    CHECK (calculation_status IN ('complete', 'partial', 'stale')),
  ADD COLUMN IF NOT EXISTS input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(input_snapshot) = 'object');

UPDATE public.body_composition_logs
SET calculation_status = CASE
  WHEN bmi IS NOT NULL
    AND bodyfat_percent IS NOT NULL
    AND muscle_mass_kg IS NOT NULL
    AND muscle_percent IS NOT NULL
  THEN 'complete'
  ELSE 'partial'
END;

CREATE INDEX IF NOT EXISTS idx_body_composition_logs_repair
  ON public.body_composition_logs (user_id, calculated_for_date DESC)
  WHERE calculation_status IN ('partial', 'stale');

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_steps_manual_user_date
  ON public.daily_steps (user_id, date)
  WHERE source = 'manual' AND source_package IS NULL;

CREATE OR REPLACE FUNCTION public.upsert_manual_daily_steps(
  p_date date,
  p_steps integer,
  p_timezone text
)
RETURNS public.daily_steps
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result public.daily_steps;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_steps < 0 THEN
    RAISE EXCEPTION 'INVALID_STEPS' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(BTRIM(p_timezone), '') IS NULL THEN
    RAISE EXCEPTION 'TIMEZONE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.daily_steps (
    user_id,
    date,
    timezone,
    source,
    source_package,
    total_steps,
    is_manual,
    data_quality,
    synced_at,
    updated_at
  ) VALUES (
    auth.uid(),
    p_date,
    p_timezone,
    'manual',
    NULL,
    p_steps,
    true,
    'manual',
    now(),
    now()
  )
  ON CONFLICT (user_id, date)
    WHERE source = 'manual' AND source_package IS NULL
  DO UPDATE SET
    timezone = EXCLUDED.timezone,
    total_steps = EXCLUDED.total_steps,
    is_manual = true,
    data_quality = 'manual',
    synced_at = now(),
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_manual_daily_steps(date, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_manual_daily_steps(date, integer, text) TO authenticated;
