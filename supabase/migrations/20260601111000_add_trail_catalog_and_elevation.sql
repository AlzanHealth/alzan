ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN IF NOT EXISTS "elev_gain_m" numeric CHECK ("elev_gain_m" IS NULL OR "elev_gain_m" >= 0);

DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'trail';

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('trail', 'goal', 'elevation', 'training.sportOptionElevation', 'training.mainGoal', 10),
  ('trail', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 20),
  ('trail', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 30),
  ('trail', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 40),
  ('trail', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50),
  ('trail', 'goal', 'target_race', 'training.sportOptionTargetRace', 'training.mainGoal', 60),

  ('trail', 'modality', 'trail_running', 'training.sportOptionTrailRunning', 'training.modalityLabel', 10),
  ('trail', 'modality', 'fast_hiking', 'training.sportOptionFastHiking', 'training.modalityLabel', 20),
  ('trail', 'modality', 'mountain_running', 'training.sportOptionMountainRunning', 'training.modalityLabel', 30),
  ('trail', 'modality', 'ultra_trail', 'training.sportOptionUltraTrail', 'training.modalityLabel', 40),

  ('trail', 'terrain', 'trail', 'training.sportOptionTrail', 'training.terrainLabel', 10),
  ('trail', 'terrain', 'technical_trail', 'training.sportOptionTechnicalTrail', 'training.terrainLabel', 20),
  ('trail', 'terrain', 'rocky', 'training.sportOptionRocky', 'training.terrainLabel', 30),
  ('trail', 'terrain', 'mud', 'training.sportOptionMud', 'training.terrainLabel', 40),
  ('trail', 'terrain', 'forest', 'training.sportOptionForest', 'training.terrainLabel', 50),
  ('trail', 'terrain', 'mixed', 'training.sportOptionMixed', 'training.terrainLabel', 60),

  ('trail', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('trail', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('trail', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('trail', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);

UPDATE "public"."activity_sessions"
SET "sport_type" = 'trail',
    "sport_subtype" = 'trail_running'
WHERE "sport_type" = 'running'
  AND "sport_subtype" = 'trail';

UPDATE "public"."endurance_workout_templates"
SET "sport_type" = 'trail',
    "environment_type" = 'trail_running',
    "surface" = COALESCE(NULLIF("surface", 'trail'), 'trail')
WHERE "sport_type" = 'running'
  AND ("environment_type" = 'trail' OR "surface" = 'trail');
