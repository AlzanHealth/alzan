-- Repeatable running shoe fixtures for the local demo account.
-- The cardio seed creates 58 running sessions; keep one unassigned to exercise that state.

INSERT INTO public.running_shoes (
  id,
  user_id,
  name,
  brand,
  model,
  purchase_date,
  in_use_since,
  initial_km,
  recommended_max_km,
  is_default
)
SELECT
  'd4000000-0000-0000-0000-000000000001'::uuid,
  demo_user.id,
  'DEMO · Entrenamiento diario',
  'Brooks',
  'Ghost',
  CURRENT_DATE - 365,
  CURRENT_DATE - 365,
  18.5,
  800,
  NOT EXISTS (
    SELECT 1
    FROM public.running_shoes AS existing_shoe
    WHERE existing_shoe.user_id = demo_user.id
      AND existing_shoe.is_default
      AND existing_shoe.id <> 'd4000000-0000-0000-0000-000000000001'::uuid
  )
FROM public.users AS demo_user
WHERE demo_user.id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  name = EXCLUDED.name,
  brand = EXCLUDED.brand,
  model = EXCLUDED.model,
  purchase_date = EXCLUDED.purchase_date,
  in_use_since = EXCLUDED.in_use_since,
  initial_km = EXCLUDED.initial_km,
  recommended_max_km = EXCLUDED.recommended_max_km,
  is_default = EXCLUDED.is_default;

INSERT INTO public.running_shoes (
  id,
  user_id,
  name,
  brand,
  model,
  purchase_date,
  in_use_since,
  initial_km,
  recommended_max_km,
  is_default
)
SELECT
  'd4000000-0000-0000-0000-000000000002'::uuid,
  '4424c5d6-5751-4038-aa39-bd85895ddb78',
  'DEMO · Competición',
  'Nike',
  'ZoomX Vaporfly',
  CURRENT_DATE - 45,
  CURRENT_DATE - 45,
  6,
  500,
  false
WHERE EXISTS (
  SELECT 1 FROM public.users WHERE id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
)
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  name = EXCLUDED.name,
  brand = EXCLUDED.brand,
  model = EXCLUDED.model,
  purchase_date = EXCLUDED.purchase_date,
  in_use_since = EXCLUDED.in_use_since,
  initial_km = EXCLUDED.initial_km,
  recommended_max_km = EXCLUDED.recommended_max_km,
  is_default = false;

UPDATE public.activity_sessions
SET running_shoe_id = CASE
  WHEN id IN (
    'ce000000-0000-0000-0000-000000000051',
    'ce000000-0000-0000-0000-000000000052',
    'ce000000-0000-0000-0000-000000000053'
  ) THEN 'd4000000-0000-0000-0000-000000000002'::uuid
  WHEN id = 'ce000000-0000-0000-0000-000000000054' THEN NULL
  ELSE 'd4000000-0000-0000-0000-000000000001'::uuid
END
WHERE user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
  AND sport_type = 'running'
  AND name LIKE 'Demo cardio evolution: running · %';
