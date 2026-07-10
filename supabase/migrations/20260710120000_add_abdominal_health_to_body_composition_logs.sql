ALTER TABLE public.body_composition_logs
  ALTER COLUMN weight_kg_used DROP NOT NULL;

ALTER TABLE public.body_composition_logs
  ADD COLUMN IF NOT EXISTS waist_to_height_ratio numeric CHECK (
    waist_to_height_ratio IS NULL
    OR waist_to_height_ratio > 0
  ),
  ADD COLUMN IF NOT EXISTS waist_to_height_category text,
  ADD COLUMN IF NOT EXISTS waist_to_height_formula text,
  ADD COLUMN IF NOT EXISTS waist_to_height_inputs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(waist_to_height_inputs) = 'array'
  ),
  ADD COLUMN IF NOT EXISTS waist_to_hip_ratio numeric CHECK (
    waist_to_hip_ratio IS NULL
    OR waist_to_hip_ratio > 0
  ),
  ADD COLUMN IF NOT EXISTS waist_to_hip_category text,
  ADD COLUMN IF NOT EXISTS waist_to_hip_formula text,
  ADD COLUMN IF NOT EXISTS waist_to_hip_inputs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(waist_to_hip_inputs) = 'array'
  );

WITH latest_abdomen AS (
  SELECT DISTINCT ON (m.user_id, m.measured_at::date)
    m.user_id,
    m.measured_at,
    m.measured_at::date AS calculated_for_date,
    m.value_cm AS abdomen_cm,
    u.height_cm,
    u.sex
  FROM public.body_measurements m
  JOIN public.users u ON u.id = m.user_id
  WHERE m.measurement_type = 'abdomen'
    AND m.value_cm BETWEEN 40 AND 200
    AND u.height_cm > 0
  ORDER BY m.user_id, m.measured_at::date, m.measured_at DESC
),
computed AS (
  SELECT
    abdomen.user_id,
    abdomen.calculated_for_date,
    recent_weight.id AS source_weight_log_id,
    recent_weight.weight_kg AS weight_kg_used,
    round((abdomen.abdomen_cm / abdomen.height_cm)::numeric, 2) AS waist_to_height_ratio,
    CASE
      WHEN abdomen.abdomen_cm / abdomen.height_cm < 0.40 THEN 'low'
      WHEN abdomen.abdomen_cm / abdomen.height_cm < 0.50 THEN 'healthy'
      WHEN abdomen.abdomen_cm / abdomen.height_cm < 0.60 THEN 'increased_risk'
      ELSE 'high_risk'
    END AS waist_to_height_category,
    CASE
      WHEN hips.value_cm IS NULL OR abdomen.sex NOT IN ('male', 'female') THEN NULL
      ELSE round((abdomen.abdomen_cm / hips.value_cm)::numeric, 2)
    END AS waist_to_hip_ratio,
    CASE
      WHEN hips.value_cm IS NULL OR abdomen.sex NOT IN ('male', 'female') THEN NULL
      WHEN abdomen.sex = 'female' AND abdomen.abdomen_cm / hips.value_cm < 0.80 THEN 'healthy'
      WHEN abdomen.sex = 'female' AND abdomen.abdomen_cm / hips.value_cm < 0.85 THEN 'increased_risk'
      WHEN abdomen.sex = 'female' THEN 'high_risk'
      WHEN abdomen.abdomen_cm / hips.value_cm < 0.90 THEN 'healthy'
      WHEN abdomen.abdomen_cm / hips.value_cm < 1.00 THEN 'increased_risk'
      ELSE 'high_risk'
    END AS waist_to_hip_category
  FROM latest_abdomen abdomen
  LEFT JOIN LATERAL (
    SELECT h.value_cm
    FROM public.body_measurements h
    WHERE h.user_id = abdomen.user_id
      AND h.measurement_type = 'hips'
      AND h.value_cm BETWEEN 50 AND 200
      AND h.measured_at <= abdomen.measured_at
      AND h.measured_at >= abdomen.measured_at - interval '13 days'
    ORDER BY h.measured_at DESC
    LIMIT 1
  ) hips ON true
  LEFT JOIN LATERAL (
    SELECT w.id, w.weight_kg
    FROM public.weight_logs w
    WHERE w.user_id = abdomen.user_id
      AND w.weight_kg > 0
      AND w.measured_at <= abdomen.measured_at
      AND w.measured_at >= abdomen.measured_at - interval '13 days'
    ORDER BY w.measured_at DESC
    LIMIT 1
  ) recent_weight ON true
)
INSERT INTO public.body_composition_logs (
  user_id,
  calculated_for_date,
  source_weight_log_id,
  weight_kg_used,
  waist_to_height_ratio,
  waist_to_height_category,
  waist_to_height_formula,
  waist_to_height_inputs,
  waist_to_hip_ratio,
  waist_to_hip_category,
  waist_to_hip_formula,
  waist_to_hip_inputs
)
SELECT
  user_id,
  calculated_for_date,
  source_weight_log_id,
  weight_kg_used,
  waist_to_height_ratio,
  waist_to_height_category,
  'waistToHeight = abdomen / height',
  jsonb_build_array('height', 'abdomen'),
  waist_to_hip_ratio,
  waist_to_hip_category,
  CASE WHEN waist_to_hip_ratio IS NULL THEN NULL ELSE 'waistToHip = abdomen / hips' END,
  CASE WHEN waist_to_hip_ratio IS NULL THEN '[]'::jsonb ELSE jsonb_build_array('abdomen', 'hips', 'sex') END
FROM computed
ON CONFLICT (user_id, calculated_for_date) DO UPDATE SET
  source_weight_log_id = COALESCE(public.body_composition_logs.source_weight_log_id, EXCLUDED.source_weight_log_id),
  weight_kg_used = COALESCE(public.body_composition_logs.weight_kg_used, EXCLUDED.weight_kg_used),
  waist_to_height_ratio = EXCLUDED.waist_to_height_ratio,
  waist_to_height_category = EXCLUDED.waist_to_height_category,
  waist_to_height_formula = EXCLUDED.waist_to_height_formula,
  waist_to_height_inputs = EXCLUDED.waist_to_height_inputs,
  waist_to_hip_ratio = EXCLUDED.waist_to_hip_ratio,
  waist_to_hip_category = EXCLUDED.waist_to_hip_category,
  waist_to_hip_formula = EXCLUDED.waist_to_hip_formula,
  waist_to_hip_inputs = EXCLUDED.waist_to_hip_inputs,
  updated_at = now();
