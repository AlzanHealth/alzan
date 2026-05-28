-- 1. Alter the CHECK constraint on option_type in sport_catalog_options to allow 'boots' and 'base_load'
ALTER TABLE "public"."sport_catalog_options"
  DROP CONSTRAINT IF EXISTS "sport_catalog_options_option_type_check",
  ADD CONSTRAINT "sport_catalog_options_option_type_check"
    CHECK ("option_type" = ANY (ARRAY['goal'::text, 'modality'::text, 'terrain'::text, 'pool_type'::text, 'stroke'::text, 'boots'::text, 'base_load'::text]));

-- 2. Add football-specific columns to endurance_workout_templates
ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN "football_session_type" TEXT,
  ADD COLUMN "base_load" TEXT,
  ADD COLUMN "boots_used" TEXT,
  ADD COLUMN "rival" TEXT,
  ADD COLUMN "notes" TEXT;

-- 3. Add football-specific columns and surface to activity_sessions
ALTER TABLE "public"."activity_sessions"
  ADD COLUMN "football_session_type" TEXT,
  ADD COLUMN "base_load" TEXT,
  ADD COLUMN "boots_used" TEXT,
  ADD COLUMN "rival" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "surface" TEXT;

-- 4. Clean up existing football options and insert new ones
DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'football';

-- Modalities: Fútbol 11, Fútbol 7, Fútbol sala, Pachanga
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('football', 'modality', 'football_11', 'training.sportOptionFootball11', 'training.modalityLabel', 10),
  ('football', 'modality', 'football_7', 'training.sportOptionFootball7', 'training.modalityLabel', 20),
  ('football', 'modality', 'futsal', 'training.sportOptionFutsal', 'training.modalityLabel', 30),
  ('football', 'modality', 'casual_match', 'training.sportOptionCasualMatch', 'training.modalityLabel', 40);

-- Goals: Partido, Técnica, Resistencia, Velocidad, Recuperación
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('football', 'goal', 'match', 'training.sportOptionMatch', 'training.mainGoal', 10),
  ('football', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('football', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 30),
  ('football', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 40),
  ('football', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50);

-- Terrains/Surfaces: Césped natural, Césped artificial, Pista, Tierra, Arena
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('football', 'terrain', 'natural_grass', 'training.sportOptionNaturalGrass', 'training.surfaceLabel', 10),
  ('football', 'terrain', 'artificial_grass', 'training.sportOptionArtificialGrass', 'training.surfaceLabel', 20),
  ('football', 'terrain', 'indoor_court', 'training.sportOptionIndoorCourt', 'training.surfaceLabel', 30),
  ('football', 'terrain', 'dirt', 'training.sportOptionDirt', 'training.surfaceLabel', 40),
  ('football', 'terrain', 'sand', 'training.sportOptionSand', 'training.surfaceLabel', 50);

-- Base Load: Baja, Media, Alta, Muy Alta
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('football', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('football', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('football', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('football', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);

-- Boots: coming_soon
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('football', 'boots', 'coming_soon', 'training.comingSoon', 'training.bootsLabel', 10);
