CREATE TABLE IF NOT EXISTS public.body_composition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  calculated_for_date date NOT NULL,
  source_weight_log_id uuid REFERENCES public.weight_logs(id) ON DELETE SET NULL,
  weight_kg_used numeric NOT NULL CHECK (weight_kg_used > 0),
  bmi numeric CHECK (bmi IS NULL OR bmi > 0),
  bodyfat_percent numeric CHECK (bodyfat_percent IS NULL OR bodyfat_percent >= 0),
  bodyfat_method text,
  bodyfat_precision_level integer CHECK (
    bodyfat_precision_level IS NULL
    OR bodyfat_precision_level BETWEEN 1 AND 3
  ),
  bodyfat_formula text,
  bodyfat_inputs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(bodyfat_inputs) = 'array'),
  muscle_mass_kg numeric CHECK (muscle_mass_kg IS NULL OR muscle_mass_kg >= 0),
  muscle_percent numeric CHECK (muscle_percent IS NULL OR muscle_percent >= 0),
  muscle_method text,
  muscle_precision_level integer CHECK (
    muscle_precision_level IS NULL
    OR muscle_precision_level BETWEEN 1 AND 3
  ),
  muscle_formula text,
  muscle_inputs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(muscle_inputs) = 'array'),
  composition_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT body_composition_logs_user_date_key UNIQUE (user_id, calculated_for_date)
);

CREATE INDEX IF NOT EXISTS idx_body_composition_logs_user_date
  ON public.body_composition_logs(user_id, calculated_for_date DESC);

CREATE INDEX IF NOT EXISTS idx_body_composition_logs_source_weight
  ON public.body_composition_logs(source_weight_log_id)
  WHERE source_weight_log_id IS NOT NULL;

ALTER TABLE public.body_composition_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own body_composition_logs"
  ON public.body_composition_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own body_composition_logs"
  ON public.body_composition_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own body_composition_logs"
  ON public.body_composition_logs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own body_composition_logs"
  ON public.body_composition_logs
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.body_composition_logs TO anon;
GRANT ALL ON TABLE public.body_composition_logs TO authenticated;
GRANT ALL ON TABLE public.body_composition_logs TO service_role;
