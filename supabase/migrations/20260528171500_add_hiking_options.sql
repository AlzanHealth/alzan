-- 1. Clean up existing hiking options
DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'hiking';

-- Modalities: gentle_route (Ruta suave), elevation_route (Ruta con desnivel), trekking (Trekking), high_mountain (Alta montaña), urban_walk (Caminata urbana)
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('hiking', 'modality', 'gentle_route', 'training.sportOptionGentleRoute', 'training.modalityLabel', 10),
  ('hiking', 'modality', 'elevation_route', 'training.sportOptionElevationRoute', 'training.modalityLabel', 20),
  ('hiking', 'modality', 'trekking', 'training.sportOptionTrekking', 'training.modalityLabel', 30),
  ('hiking', 'modality', 'high_mountain', 'training.sportOptionHighMountain', 'training.modalityLabel', 40),
  ('hiking', 'modality', 'urban_walk', 'training.sportOptionUrbanWalk', 'training.modalityLabel', 50);

-- Goals: route (Ruta), elevation (Desnivel), endurance (Resistencia), recovery (Recuperación), technique (Técnica)
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('hiking', 'goal', 'route', 'training.sportOptionRoute', 'training.mainGoal', 10),
  ('hiking', 'goal', 'elevation', 'training.sportOptionElevation', 'training.mainGoal', 20),
  ('hiking', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 30),
  ('hiking', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 40),
  ('hiking', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 50);

-- Terrains/Surfaces: urban (Urbano), trail (Sendero), rocky (Rocoso), high_mountain (Alta montaña), mixed (Mixto)
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('hiking', 'terrain', 'urban', 'training.sportOptionUrban', 'training.surfaceLabel', 10),
  ('hiking', 'terrain', 'trail', 'training.sportOptionTrail', 'training.surfaceLabel', 20),
  ('hiking', 'terrain', 'rocky', 'training.sportOptionRocky', 'training.surfaceLabel', 30),
  ('hiking', 'terrain', 'high_mountain', 'training.sportOptionHighMountain', 'training.surfaceLabel', 40),
  ('hiking', 'terrain', 'mixed', 'training.sportOptionMixed', 'training.surfaceLabel', 50);

-- Base Load: low (Baja), medium (Media), high (Alta), very_high (Muy Alta)
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('hiking', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('hiking', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('hiking', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('hiking', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);

-- Shoes: coming_soon
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('hiking', 'boots', 'coming_soon', 'training.comingSoon', 'training.shoesLabel', 10);
