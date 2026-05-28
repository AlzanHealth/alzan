-- 1. Alter the CHECK constraint on option_type in sport_catalog_options to allow 'pool_type' and 'stroke'
ALTER TABLE "public"."sport_catalog_options"
  DROP CONSTRAINT IF EXISTS "sport_catalog_options_option_type_check",
  ADD CONSTRAINT "sport_catalog_options_option_type_check"
    CHECK ("option_type" = ANY (ARRAY['goal'::text, 'modality'::text, 'terrain'::text, 'pool_type'::text, 'stroke'::text]));

-- 2. Add pool_type and stroke columns to endurance_workout_templates
ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN "pool_type" TEXT,
  ADD COLUMN "stroke" TEXT;

-- 3. Add pool_type and stroke columns to activity_sessions
ALTER TABLE "public"."activity_sessions"
  ADD COLUMN "pool_type" TEXT,
  ADD COLUMN "stroke" TEXT;

-- 4. Clean up existing swimming goals and insert the correct ones requested by the user
DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'swimming' AND "option_type" = 'goal';

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('swimming', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 10),
  ('swimming', 'goal', 'power', 'training.sportOptionPower', 'training.mainGoal', 20),
  ('swimming', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 30),
  ('swimming', 'goal', 'long_route', 'training.sportOptionLongRoute', 'training.mainGoal', 40),
  ('swimming', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50),
  ('swimming', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 60);

-- 5. Insert pool_type options for swimming
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('swimming', 'pool_type', '25m', 'training.poolType25m', 'training.poolTypeLabel', 10),
  ('swimming', 'pool_type', '50m', 'training.poolType50m', 'training.poolTypeLabel', 20),
  ('swimming', 'pool_type', '25yd', 'training.poolType25yd', 'training.poolTypeLabel', 30);

-- 6. Insert stroke options for swimming
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('swimming', 'stroke', 'freestyle', 'training.strokeFreestyle', 'training.strokeLabel', 10),
  ('swimming', 'stroke', 'backstroke', 'training.strokeBackstroke', 'training.strokeLabel', 20),
  ('swimming', 'stroke', 'breaststroke', 'training.strokeBreaststroke', 'training.strokeLabel', 30),
  ('swimming', 'stroke', 'butterfly', 'training.strokeButterfly', 'training.strokeLabel', 40),
  ('swimming', 'stroke', 'medley', 'training.strokeMedley', 'training.strokeLabel', 50);
