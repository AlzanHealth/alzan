-- Reproducible last-completed-month nutrition fixture for local PDF export testing.
-- This seed only touches the local demo account and its own marked records.

BEGIN;

DELETE FROM public.meal_items AS items
USING public.meal_logs AS logs
WHERE items.meal_log_id = logs.id
  AND logs.user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
  AND logs.notes IN (
    'Comida sintética mensual para probar el PDF local; eliminar después.',
    'Datos sintéticos para validar el PDF local; eliminar después de la prueba.',
    'Dato demo para pruebas de PDF.'
  );

DELETE FROM public.meal_logs
WHERE user_id = '4424c5d6-5751-4038-aa39-bd85895ddb78'
  AND notes IN (
    'Comida sintética mensual para probar el PDF local; eliminar después.',
    'Datos sintéticos para validar el PDF local; eliminar después de la prueba.',
    'Dato demo para pruebas de PDF.'
  );

-- Repeat the item CTE for both inserts; Supabase's seed runner sends statements
-- in separate batches, so a temporary table does not reliably survive between them.
WITH month_start AS (
  SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') - INTERVAL '1 month')::date AS first_day
),
days AS (
  SELECT month_start.first_day + day_offset AS meal_date, day_offset
  FROM month_start
  CROSS JOIN LATERAL generate_series(
    0,
    (month_start.first_day + INTERVAL '1 month')::date - month_start.first_day - 1
  ) AS offsets(day_offset)
),
meal_products (meal_type, meal_name, logged_time, item_order, item_name, base_quantity_g, per_100g_kcal, per_100g_protein_g, per_100g_carbs_g, per_100g_fats_g) AS (
  VALUES
    ('breakfast', 'Tostada integral con huevo', TIME '08:00', 1, 'Pan integral', 75::numeric, 247::numeric, 9::numeric, 43::numeric, 3.4::numeric),
    ('breakfast', 'Tostada integral con huevo', TIME '08:00', 2, 'Huevo', 100::numeric, 143::numeric, 13::numeric, 0.7::numeric, 9.5::numeric),
    ('breakfast', 'Tostada integral con huevo', TIME '08:00', 3, 'Tomate', 60::numeric, 18::numeric, 0.9::numeric, 3.9::numeric, 0.2::numeric),
    ('almuerzo', 'Yogur con frutos secos', TIME '11:00', 1, 'Yogur natural', 125::numeric, 61::numeric, 3.5::numeric, 4.7::numeric, 3.3::numeric),
    ('almuerzo', 'Yogur con frutos secos', TIME '11:00', 2, 'Plátano', 70::numeric, 89::numeric, 1.1::numeric, 22.8::numeric, 0.3::numeric),
    ('almuerzo', 'Yogur con frutos secos', TIME '11:00', 3, 'Nueces', 12::numeric, 654::numeric, 15.2::numeric, 13.7::numeric, 65.2::numeric),
    ('lunch', 'Arroz con pollo y verduras', TIME '14:00', 1, 'Arroz cocido', 180::numeric, 130::numeric, 2.7::numeric, 28.2::numeric, 0.3::numeric),
    ('lunch', 'Arroz con pollo y verduras', TIME '14:00', 2, 'Pechuga de pollo', 120::numeric, 165::numeric, 31::numeric, 0::numeric, 3.6::numeric),
    ('lunch', 'Arroz con pollo y verduras', TIME '14:00', 3, 'Verduras variadas', 120::numeric, 45::numeric, 2.5::numeric, 8.8::numeric, 0.5::numeric),
    ('merienda', 'Queso fresco con fresas', TIME '17:00', 1, 'Queso fresco', 100::numeric, 98::numeric, 12::numeric, 3::numeric, 4.5::numeric),
    ('merienda', 'Queso fresco con fresas', TIME '17:00', 2, 'Fresas', 150::numeric, 32::numeric, 0.7::numeric, 7.7::numeric, 0.3::numeric),
    ('merienda', 'Queso fresco con fresas', TIME '17:00', 3, 'Miel', 8::numeric, 304::numeric, 0.3::numeric, 82.4::numeric, 0::numeric),
    ('dinner', 'Salmón con patata y ensalada', TIME '20:00', 1, 'Salmón', 130::numeric, 208::numeric, 20.4::numeric, 0::numeric, 13.4::numeric),
    ('dinner', 'Salmón con patata y ensalada', TIME '20:00', 2, 'Patata cocida', 180::numeric, 87::numeric, 1.9::numeric, 20.1::numeric, 0.1::numeric),
    ('dinner', 'Salmón con patata y ensalada', TIME '20:00', 3, 'Ensalada con aceite de oliva', 80::numeric, 120::numeric, 1.5::numeric, 4::numeric, 10::numeric),
    ('snack', 'Requesón con frutos rojos', TIME '22:00', 1, 'Requesón', 100::numeric, 98::numeric, 11::numeric, 3.4::numeric, 4.3::numeric),
    ('snack', 'Requesón con frutos rojos', TIME '22:00', 2, 'Frutos rojos', 80::numeric, 57::numeric, 0.7::numeric, 14.5::numeric, 0.3::numeric),
    ('snack', 'Requesón con frutos rojos', TIME '22:00', 3, 'Almendras', 8::numeric, 579::numeric, 21.2::numeric, 21.6::numeric, 49.9::numeric)
),
prepared_quantities AS (
  SELECT days.meal_date, meal_products.*,
    round(meal_products.base_quantity_g * (0.94 + (days.day_offset % 7) * 0.02), 1) AS quantity_g
  FROM days CROSS JOIN meal_products
),
prepared_items AS (
  SELECT prepared_quantities.*,
    round(quantity_g * per_100g_kcal / 100, 1) AS kcal,
    round(quantity_g * per_100g_protein_g / 100, 1) AS protein_g,
    round(quantity_g * per_100g_carbs_g / 100, 1) AS carbs_g,
    round(quantity_g * per_100g_fats_g / 100, 1) AS fats_g
  FROM prepared_quantities
)
INSERT INTO public.meal_logs (
  id,
  user_id,
  logged_at,
  date,
  meal_type,
  name,
  notes,
  kcal,
  protein_g,
  carbs_g,
  fats_g,
  source,
  data_quality,
  calc_version,
  origin
)
SELECT
  md5('alzan-pdf-demo-log:' || meal_date::text || ':' || meal_type)::uuid,
  '4424c5d6-5751-4038-aa39-bd85895ddb78',
  (meal_date + logged_time) AT TIME ZONE 'Europe/Madrid',
  meal_date,
  meal_type::public.meal_type_enum,
  meal_name,
  'Dato demo para pruebas de PDF.',
  sum(kcal),
  sum(protein_g),
  sum(carbs_g),
  sum(fats_g),
  'manual',
  'manual'::public.meal_logs_data_quality,
  'nutrition_v1',
  'user'::public.meal_logs_origin
FROM prepared_items
GROUP BY meal_date, meal_type, meal_name, logged_time
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  logged_at = EXCLUDED.logged_at,
  date = EXCLUDED.date,
  meal_type = EXCLUDED.meal_type,
  name = EXCLUDED.name,
  notes = EXCLUDED.notes,
  kcal = EXCLUDED.kcal,
  protein_g = EXCLUDED.protein_g,
  carbs_g = EXCLUDED.carbs_g,
  fats_g = EXCLUDED.fats_g,
  source = EXCLUDED.source,
  data_quality = EXCLUDED.data_quality,
  calc_version = EXCLUDED.calc_version,
  origin = EXCLUDED.origin;

WITH month_start AS (
  SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') - INTERVAL '1 month')::date AS first_day
),
days AS (
  SELECT month_start.first_day + day_offset AS meal_date, day_offset
  FROM month_start
  CROSS JOIN LATERAL generate_series(
    0,
    (month_start.first_day + INTERVAL '1 month')::date - month_start.first_day - 1
  ) AS offsets(day_offset)
),
meal_products (meal_type, meal_name, logged_time, item_order, item_name, base_quantity_g, per_100g_kcal, per_100g_protein_g, per_100g_carbs_g, per_100g_fats_g) AS (
  VALUES
    ('breakfast', 'Tostada integral con huevo', TIME '08:00', 1, 'Pan integral', 75::numeric, 247::numeric, 9::numeric, 43::numeric, 3.4::numeric),
    ('breakfast', 'Tostada integral con huevo', TIME '08:00', 2, 'Huevo', 100::numeric, 143::numeric, 13::numeric, 0.7::numeric, 9.5::numeric),
    ('breakfast', 'Tostada integral con huevo', TIME '08:00', 3, 'Tomate', 60::numeric, 18::numeric, 0.9::numeric, 3.9::numeric, 0.2::numeric),
    ('almuerzo', 'Yogur con frutos secos', TIME '11:00', 1, 'Yogur natural', 125::numeric, 61::numeric, 3.5::numeric, 4.7::numeric, 3.3::numeric),
    ('almuerzo', 'Yogur con frutos secos', TIME '11:00', 2, 'Plátano', 70::numeric, 89::numeric, 1.1::numeric, 22.8::numeric, 0.3::numeric),
    ('almuerzo', 'Yogur con frutos secos', TIME '11:00', 3, 'Nueces', 12::numeric, 654::numeric, 15.2::numeric, 13.7::numeric, 65.2::numeric),
    ('lunch', 'Arroz con pollo y verduras', TIME '14:00', 1, 'Arroz cocido', 180::numeric, 130::numeric, 2.7::numeric, 28.2::numeric, 0.3::numeric),
    ('lunch', 'Arroz con pollo y verduras', TIME '14:00', 2, 'Pechuga de pollo', 120::numeric, 165::numeric, 31::numeric, 0::numeric, 3.6::numeric),
    ('lunch', 'Arroz con pollo y verduras', TIME '14:00', 3, 'Verduras variadas', 120::numeric, 45::numeric, 2.5::numeric, 8.8::numeric, 0.5::numeric),
    ('merienda', 'Queso fresco con fresas', TIME '17:00', 1, 'Queso fresco', 100::numeric, 98::numeric, 12::numeric, 3::numeric, 4.5::numeric),
    ('merienda', 'Queso fresco con fresas', TIME '17:00', 2, 'Fresas', 150::numeric, 32::numeric, 0.7::numeric, 7.7::numeric, 0.3::numeric),
    ('merienda', 'Queso fresco con fresas', TIME '17:00', 3, 'Miel', 8::numeric, 304::numeric, 0.3::numeric, 82.4::numeric, 0::numeric),
    ('dinner', 'Salmón con patata y ensalada', TIME '20:00', 1, 'Salmón', 130::numeric, 208::numeric, 20.4::numeric, 0::numeric, 13.4::numeric),
    ('dinner', 'Salmón con patata y ensalada', TIME '20:00', 2, 'Patata cocida', 180::numeric, 87::numeric, 1.9::numeric, 20.1::numeric, 0.1::numeric),
    ('dinner', 'Salmón con patata y ensalada', TIME '20:00', 3, 'Ensalada con aceite de oliva', 80::numeric, 120::numeric, 1.5::numeric, 4::numeric, 10::numeric),
    ('snack', 'Requesón con frutos rojos', TIME '22:00', 1, 'Requesón', 100::numeric, 98::numeric, 11::numeric, 3.4::numeric, 4.3::numeric),
    ('snack', 'Requesón con frutos rojos', TIME '22:00', 2, 'Frutos rojos', 80::numeric, 57::numeric, 0.7::numeric, 14.5::numeric, 0.3::numeric),
    ('snack', 'Requesón con frutos rojos', TIME '22:00', 3, 'Almendras', 8::numeric, 579::numeric, 21.2::numeric, 21.6::numeric, 49.9::numeric)
),
prepared_quantities AS (
  SELECT days.meal_date, meal_products.*,
    round(meal_products.base_quantity_g * (0.94 + (days.day_offset % 7) * 0.02), 1) AS quantity_g
  FROM days CROSS JOIN meal_products
),
prepared_items AS (
  SELECT prepared_quantities.*,
    round(quantity_g * per_100g_kcal / 100, 1) AS kcal,
    round(quantity_g * per_100g_protein_g / 100, 1) AS protein_g,
    round(quantity_g * per_100g_carbs_g / 100, 1) AS carbs_g,
    round(quantity_g * per_100g_fats_g / 100, 1) AS fats_g
  FROM prepared_quantities
)
INSERT INTO public.meal_items (
  id,
  meal_log_id,
  user_id,
  name,
  source,
  quantity_g,
  per_100g_kcal,
  per_100g_protein_g,
  per_100g_carbs_g,
  per_100g_fats_g,
  kcal,
  protein_g,
  carbs_g,
  fats_g,
  data_quality,
  origin
)
SELECT
  md5('alzan-pdf-demo-item:' || meal_date::text || ':' || meal_type || ':' || item_order)::uuid,
  md5('alzan-pdf-demo-log:' || meal_date::text || ':' || meal_type)::uuid,
  '4424c5d6-5751-4038-aa39-bd85895ddb78',
  item_name,
  'manual'::public.meal_items_source,
  quantity_g,
  per_100g_kcal,
  per_100g_protein_g,
  per_100g_carbs_g,
  per_100g_fats_g,
  kcal,
  protein_g,
  carbs_g,
  fats_g,
  'manual'::public.meal_items_data_quality,
  'user'::public.meal_items_origin
FROM prepared_items
ON CONFLICT (id) DO UPDATE SET
  meal_log_id = EXCLUDED.meal_log_id,
  user_id = EXCLUDED.user_id,
  name = EXCLUDED.name,
  source = EXCLUDED.source,
  quantity_g = EXCLUDED.quantity_g,
  per_100g_kcal = EXCLUDED.per_100g_kcal,
  per_100g_protein_g = EXCLUDED.per_100g_protein_g,
  per_100g_carbs_g = EXCLUDED.per_100g_carbs_g,
  per_100g_fats_g = EXCLUDED.per_100g_fats_g,
  kcal = EXCLUDED.kcal,
  protein_g = EXCLUDED.protein_g,
  carbs_g = EXCLUDED.carbs_g,
  fats_g = EXCLUDED.fats_g,
  data_quality = EXCLUDED.data_quality,
  origin = EXCLUDED.origin;

COMMIT;
