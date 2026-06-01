-- 1. Alter the CHECK constraint on option_type in sport_catalog_options to allow 'snowboard_type'
ALTER TABLE "public"."sport_catalog_options"
  DROP CONSTRAINT IF EXISTS "sport_catalog_options_option_type_check",
  ADD CONSTRAINT "sport_catalog_options_option_type_check"
    CHECK (
      "option_type" = ANY (
        ARRAY[
          'goal'::text,
          'modality'::text,
          'terrain'::text,
          'pool_type'::text,
          'stroke'::text,
          'boots'::text,
          'base_load'::text,
          'racket'::text,
          'contact_level'::text,
          'climbing_grade'::text,
          'wetsuit'::text,
          'board'::text,
          'ski_type'::text,
          'slope_type'::text,
          'snowboard_type'::text
        ]
      )
    );

-- 2. Add snowboard_type column to activity_sessions and endurance_workout_templates
ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN IF NOT EXISTS "snowboard_type" TEXT;

ALTER TABLE "public"."activity_sessions"
  ADD COLUMN IF NOT EXISTS "snowboard_type" TEXT;

-- 3. Clean up existing catalog options for snowboard
DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'snowboard';

-- 4. Goals: Técnica, Pista, Park, Freeride, Resistencia
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('snowboard', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 10),
  ('snowboard', 'goal', 'slope', 'training.sportOptionSlopeGoal', 'training.mainGoal', 20),
  ('snowboard', 'goal', 'park', 'training.sportOptionParkGoal', 'training.mainGoal', 30),
  ('snowboard', 'goal', 'freeride', 'training.sportOptionFreerideGoal', 'training.mainGoal', 40),
  ('snowboard', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 50);

-- 5. Modalities: Pista, Freeride, Park / Freestyle, Splitboard
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('snowboard', 'modality', 'slope', 'training.sportOptionSlopeModality', 'training.modalityLabel', 10),
  ('snowboard', 'modality', 'freeride', 'training.sportOptionFreerideModality', 'training.modalityLabel', 20),
  ('snowboard', 'modality', 'park_freestyle', 'training.sportOptionParkFreestyle', 'training.modalityLabel', 30),
  ('snowboard', 'modality', 'splitboard', 'training.sportOptionSplitboard', 'training.modalityLabel', 40);

-- 6. Piste Types (slope_type): Pista verde, Pista azul, Pista roja, Pista negra, Fuera de pista, Snowpark, Circuito de fondo
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('snowboard', 'slope_type', 'green', 'training.slopeGreen', 'training.slopeLabel', 10),
  ('snowboard', 'slope_type', 'blue', 'training.slopeBlue', 'training.slopeLabel', 20),
  ('snowboard', 'slope_type', 'red', 'training.slopeRed', 'training.slopeLabel', 30),
  ('snowboard', 'slope_type', 'black', 'training.slopeBlack', 'training.slopeLabel', 40),
  ('snowboard', 'slope_type', 'off_piste', 'training.slopeOffPiste', 'training.slopeLabel', 50),
  ('snowboard', 'slope_type', 'snowpark', 'training.slopeSnowpark', 'training.slopeLabel', 60),
  ('snowboard', 'slope_type', 'nordic_track', 'training.slopeNordicTrack', 'training.slopeLabel', 70);

-- 7. Snowboard Types (snowboard_type): All-mountain, Freeride, Freestyle, Splitboard, Alpine
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('snowboard', 'snowboard_type', 'all_mountain', 'training.boardAllMountain', 'training.snowboardLabel', 10),
  ('snowboard', 'snowboard_type', 'freeride', 'training.boardFreeride', 'training.snowboardLabel', 20),
  ('snowboard', 'snowboard_type', 'freestyle', 'training.boardFreestyle', 'training.snowboardLabel', 30),
  ('snowboard', 'snowboard_type', 'splitboard', 'training.boardSplitboard', 'training.snowboardLabel', 40),
  ('snowboard', 'snowboard_type', 'alpine', 'training.boardAlpine', 'training.snowboardLabel', 50);

-- 8. Base Load: Baja, Media, Alta, Muy Alta
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('snowboard', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('snowboard', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('snowboard', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('snowboard', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);
