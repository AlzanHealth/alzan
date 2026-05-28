-- 1. Alter the CHECK constraint on option_type in sport_catalog_options to allow 'racket'
ALTER TABLE "public"."sport_catalog_options"
  DROP CONSTRAINT IF EXISTS "sport_catalog_options_option_type_check",
  ADD CONSTRAINT "sport_catalog_options_option_type_check"
    CHECK ("option_type" = ANY (ARRAY['goal'::text, 'modality'::text, 'terrain'::text, 'pool_type'::text, 'stroke'::text, 'boots'::text, 'base_load'::text, 'racket'::text]));

-- 2. Add tennis-specific columns to endurance_workout_templates
ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN "racket_used" TEXT;

-- 3. Add tennis-specific columns to activity_sessions
ALTER TABLE "public"."activity_sessions"
  ADD COLUMN "racket_used" TEXT;

-- 4. Clean up existing tennis options and insert new ones
DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'tennis';

-- Modalities: singles (Individual), doubles (Dobles), training (Entrenamiento), match (Partido)
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('tennis', 'modality', 'singles', 'training.sportOptionSingles', 'training.modalityLabel', 10),
  ('tennis', 'modality', 'doubles', 'training.sportOptionDoubles', 'training.modalityLabel', 20),
  ('tennis', 'modality', 'training', 'training.sportOptionTraining', 'training.modalityLabel', 30),
  ('tennis', 'modality', 'match', 'training.sportOptionMatch', 'training.modalityLabel', 40);

-- Goals: Partido, Técnica, Saque, Resistencia, Velocidad
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('tennis', 'goal', 'match', 'training.sportOptionMatch', 'training.mainGoal', 10),
  ('tennis', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('tennis', 'goal', 'serve', 'training.sportOptionServe', 'training.mainGoal', 30),
  ('tennis', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 40),
  ('tennis', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 50);

-- Terrains/Surfaces: Clay, Hard court, Grass, Indoor court
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('tennis', 'terrain', 'clay', 'training.sportOptionClay', 'training.surfaceLabel', 10),
  ('tennis', 'terrain', 'hard_court', 'training.sportOptionHardCourt', 'training.surfaceLabel', 20),
  ('tennis', 'terrain', 'grass', 'training.sportOptionGrass', 'training.surfaceLabel', 30),
  ('tennis', 'terrain', 'indoor_court', 'training.sportOptionIndoorCourt', 'training.surfaceLabel', 40);

-- Base Load: Baja, Media, Alta, Muy Alta
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('tennis', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('tennis', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('tennis', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('tennis', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);

-- Rackets: coming_soon
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('tennis', 'racket', 'coming_soon', 'training.comingSoon', 'training.racketLabel', 10);
