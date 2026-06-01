-- 1. Alter the CHECK constraint on option_type in sport_catalog_options to allow 'ski_type' and 'slope_type'
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
          'slope_type'::text
        ]
      )
    );

-- 2. Add columns to activity_sessions and endurance_workout_templates
ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN IF NOT EXISTS "ski_type" TEXT,
  ADD COLUMN IF NOT EXISTS "slope_type" TEXT;

ALTER TABLE "public"."activity_sessions"
  ADD COLUMN IF NOT EXISTS "ski_type" TEXT,
  ADD COLUMN IF NOT EXISTS "slope_type" TEXT;

-- 3. Clean up existing catalog options for skiing
DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'skiing';

-- 4. Goals: Técnica, Pista, Resistencia, Velocidad, Recuperación
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('skiing', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 10),
  ('skiing', 'goal', 'slope', 'training.sportOptionSlopeGoal', 'training.mainGoal', 20),
  ('skiing', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 30),
  ('skiing', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 40),
  ('skiing', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50);

-- 5. Modalities: Esquí alpino, Esquí de fondo, Esquí de travesía, Freeride
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('skiing', 'modality', 'alpine', 'training.sportOptionAlpineSki', 'training.modalityLabel', 10),
  ('skiing', 'modality', 'cross_country', 'training.sportOptionCrossCountrySki', 'training.modalityLabel', 20),
  ('skiing', 'modality', 'backcountry', 'training.sportOptionBackcountrySki', 'training.modalityLabel', 30),
  ('skiing', 'modality', 'freeride', 'training.sportOptionFreerideSki', 'training.modalityLabel', 40);

-- 6. Piste Types (slope_type): Pista verde, Pista azul, Pista roja, Pista negra, Fuera de pista, Snowpark, Circuito de fondo
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('skiing', 'slope_type', 'green', 'training.slopeGreen', 'training.slopeLabel', 10),
  ('skiing', 'slope_type', 'blue', 'training.slopeBlue', 'training.slopeLabel', 20),
  ('skiing', 'slope_type', 'red', 'training.slopeRed', 'training.slopeLabel', 30),
  ('skiing', 'slope_type', 'black', 'training.slopeBlack', 'training.slopeLabel', 40),
  ('skiing', 'slope_type', 'off_piste', 'training.slopeOffPiste', 'training.slopeLabel', 50),
  ('skiing', 'slope_type', 'snowpark', 'training.slopeSnowpark', 'training.slopeLabel', 60),
  ('skiing', 'slope_type', 'nordic_track', 'training.slopeNordicTrack', 'training.slopeLabel', 70);

-- 7. Ski Types (ski_type): Esquís de pista, Esquís de freeride, Esquís polivalentes, Esquís de fondo, Esquís de travesía, Esquís de freestyle
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('skiing', 'ski_type', 'carving', 'training.skiCarving', 'training.skiLabel', 10),
  ('skiing', 'ski_type', 'freeride', 'training.skiFreeride', 'training.skiLabel', 20),
  ('skiing', 'ski_type', 'all_mountain', 'training.skiAllMountain', 'training.skiLabel', 30),
  ('skiing', 'ski_type', 'classic_nordic', 'training.skiClassicNordic', 'training.skiLabel', 40),
  ('skiing', 'ski_type', 'touring', 'training.skiTouring', 'training.skiLabel', 50),
  ('skiing', 'ski_type', 'freestyle', 'training.skiFreestyle', 'training.skiLabel', 60);

-- 8. Base Load: Baja, Media, Alta, Muy Alta
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('skiing', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('skiing', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('skiing', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('skiing', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);
