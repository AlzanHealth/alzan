UPDATE "public"."sport_catalog_options"
SET
  "label_es" = 'Bici estática',
  "label_en" = 'Stationary bike'
WHERE
  "sport_type" = 'cycling'
  AND "option_type" = 'modality'
  AND "option_key" = 'indoor_trainer';
