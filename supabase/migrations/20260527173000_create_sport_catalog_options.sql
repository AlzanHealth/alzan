CREATE TABLE "public"."sport_catalog_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sport_type" sport_type_enum NOT NULL,
  "option_type" text NOT NULL CHECK ("option_type" IN ('goal', 'modality', 'terrain')),
  "option_key" text NOT NULL CHECK (length(trim("option_key")) > 0),
  "translation_key" text NOT NULL CHECK (length(trim("translation_key")) > 0),
  "group_translation_key" text NOT NULL CHECK (length(trim("group_translation_key")) > 0),
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_template_selectable" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sport_catalog_options_sport_option_unique" UNIQUE ("sport_type", "option_type", "option_key")
);

CREATE INDEX "sport_catalog_options_lookup_idx"
  ON "public"."sport_catalog_options" ("sport_type", "option_type", "is_active", "sort_order");

ALTER TABLE "public"."sport_catalog_options" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sport_catalog_options_read_authenticated"
  ON "public"."sport_catalog_options"
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE "public"."sport_catalog_options" TO authenticated;
GRANT ALL ON TABLE "public"."sport_catalog_options" TO service_role;

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('running', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 10),
  ('running', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 20),
  ('running', 'goal', 'tempo_threshold', 'training.sportOptionTempoThreshold', 'training.mainGoal', 30),
  ('running', 'goal', 'long_run', 'training.sportOptionLongRun', 'training.mainGoal', 40),
  ('running', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50),
  ('running', 'goal', 'test', 'training.sportOptionTest', 'training.mainGoal', 60),
  ('running', 'modality', 'outdoor', 'training.sportOptionOutdoor', 'training.modalityLabel', 10),
  ('running', 'modality', 'treadmill', 'training.sportOptionTreadmill', 'training.modalityLabel', 20),
  ('running', 'terrain', 'asphalt', 'training.sportOptionAsphalt', 'training.surfaceLabel', 10),
  ('running', 'terrain', 'track', 'training.sportOptionTrack', 'training.surfaceLabel', 20),
  ('running', 'terrain', 'dirt', 'training.sportOptionDirt', 'training.surfaceLabel', 30),
  ('running', 'terrain', 'grass', 'training.sportOptionGrass', 'training.surfaceLabel', 40),
  ('running', 'terrain', 'treadmill', 'training.sportOptionTreadmill', 'training.surfaceLabel', 50),

  ('cycling', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 10),
  ('cycling', 'goal', 'power', 'training.sportOptionPower', 'training.mainGoal', 20),
  ('cycling', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 30),
  ('cycling', 'goal', 'long_route', 'training.sportOptionLongRoute', 'training.mainGoal', 40),
  ('cycling', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50),
  ('cycling', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 60),
  ('cycling', 'modality', 'road', 'training.sportOptionRoadCycling', 'training.modalityLabel', 10),
  ('cycling', 'modality', 'mtb', 'training.sportOptionMtb', 'training.modalityLabel', 20),
  ('cycling', 'modality', 'gravel', 'training.sportOptionGravel', 'training.modalityLabel', 30),
  ('cycling', 'modality', 'indoor_trainer', 'training.sportOptionIndoorTrainer', 'training.modalityLabel', 40),
  ('cycling', 'modality', 'spinning', 'training.sportOptionSpinning', 'training.modalityLabel', 50),
  ('cycling', 'modality', 'urban', 'training.sportOptionUrbanCycling', 'training.modalityLabel', 60),
  ('cycling', 'terrain', 'asphalt', 'training.sportOptionAsphalt', 'training.terrainLabel', 10),
  ('cycling', 'terrain', 'gravel', 'training.sportOptionGravel', 'training.terrainLabel', 20),
  ('cycling', 'terrain', 'mountain_trail', 'training.sportOptionMountainTrail', 'training.terrainLabel', 30),
  ('cycling', 'terrain', 'velodrome', 'training.sportOptionVelodrome', 'training.terrainLabel', 40),

  ('swimming', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 10),
  ('swimming', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('swimming', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 30),
  ('swimming', 'goal', 'intervals', 'training.sportOptionIntervals', 'training.mainGoal', 40),
  ('swimming', 'goal', 'breathing', 'training.sportOptionBreathing', 'training.mainGoal', 50),
  ('swimming', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 60),
  ('swimming', 'modality', 'pool', 'training.sportOptionPool', 'training.modalityLabel', 10),
  ('swimming', 'modality', 'open_water', 'training.sportOptionOpenWater', 'training.modalityLabel', 20),

  ('strength', 'goal', 'hypertrophy', 'training.sportOptionHypertrophy', 'training.mainGoal', 10),
  ('strength', 'goal', 'strength', 'training.sportOptionStrength', 'training.mainGoal', 20),
  ('strength', 'goal', 'muscular_endurance', 'training.sportOptionMuscularEndurance', 'training.mainGoal', 30),
  ('strength', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 40),
  ('strength', 'goal', 'mobility', 'training.sportOptionMobility', 'training.mainGoal', 50),
  ('strength', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 60),
  ('strength', 'modality', 'gym', 'training.sportOptionGym', 'training.modalityLabel', 10),
  ('strength', 'modality', 'free_weights', 'training.sportOptionFreeWeights', 'training.modalityLabel', 20),
  ('strength', 'modality', 'machines', 'training.sportOptionMachines', 'training.modalityLabel', 30),
  ('strength', 'modality', 'calisthenics', 'training.sportOptionCalisthenics', 'training.modalityLabel', 40),
  ('strength', 'modality', 'core', 'training.sportOptionCore', 'training.modalityLabel', 50),
  ('strength', 'modality', 'mobility', 'training.sportOptionMobility', 'training.modalityLabel', 60),

  ('football', 'goal', 'match', 'training.sportOptionMatch', 'training.mainGoal', 10),
  ('football', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('football', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 30),
  ('football', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 40),
  ('football', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50),
  ('football', 'modality', 'football_11', 'training.sportOptionFootball11', 'training.modalityLabel', 10),
  ('football', 'modality', 'football_7', 'training.sportOptionFootball7', 'training.modalityLabel', 20),
  ('football', 'modality', 'futsal', 'training.sportOptionFutsal', 'training.modalityLabel', 30),
  ('football', 'modality', 'casual_match', 'training.sportOptionCasualMatch', 'training.modalityLabel', 40),
  ('football', 'terrain', 'natural_grass', 'training.sportOptionNaturalGrass', 'training.surfaceLabel', 10),
  ('football', 'terrain', 'artificial_grass', 'training.sportOptionArtificialGrass', 'training.surfaceLabel', 20),
  ('football', 'terrain', 'indoor_court', 'training.sportOptionIndoorCourt', 'training.surfaceLabel', 30),

  ('basketball', 'goal', 'match', 'training.sportOptionMatch', 'training.mainGoal', 10),
  ('basketball', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('basketball', 'goal', 'shooting', 'training.sportOptionShooting', 'training.mainGoal', 30),
  ('basketball', 'goal', 'explosiveness', 'training.sportOptionExplosiveness', 'training.mainGoal', 40),
  ('basketball', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 50),
  ('basketball', 'modality', 'five_v_five', 'training.sportOptionFiveVsFive', 'training.modalityLabel', 10),
  ('basketball', 'modality', 'three_v_three', 'training.sportOptionThreeVsThree', 'training.modalityLabel', 20),
  ('basketball', 'modality', 'training', 'training.sportOptionTraining', 'training.modalityLabel', 30),
  ('basketball', 'modality', 'casual_match', 'training.sportOptionCasualMatch', 'training.modalityLabel', 40),

  ('tennis', 'goal', 'match', 'training.sportOptionMatch', 'training.mainGoal', 10),
  ('tennis', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('tennis', 'goal', 'serve', 'training.sportOptionServe', 'training.mainGoal', 30),
  ('tennis', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 40),
  ('tennis', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 50),
  ('tennis', 'modality', 'singles', 'training.sportOptionSingles', 'training.modalityLabel', 10),
  ('tennis', 'modality', 'doubles', 'training.sportOptionDoubles', 'training.modalityLabel', 20),
  ('tennis', 'modality', 'training', 'training.sportOptionTraining', 'training.modalityLabel', 30),
  ('tennis', 'modality', 'match', 'training.sportOptionMatch', 'training.modalityLabel', 40),
  ('tennis', 'terrain', 'hard_court', 'training.sportOptionHardCourt', 'training.surfaceLabel', 10),
  ('tennis', 'terrain', 'clay', 'training.sportOptionClay', 'training.surfaceLabel', 20),
  ('tennis', 'terrain', 'grass', 'training.sportOptionGrass', 'training.surfaceLabel', 30),
  ('tennis', 'terrain', 'indoor_court', 'training.sportOptionIndoorCourt', 'training.surfaceLabel', 40),

  ('padel', 'goal', 'match', 'training.sportOptionMatch', 'training.mainGoal', 10),
  ('padel', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('padel', 'goal', 'bandeja_volley', 'training.sportOptionBandejaVolley', 'training.mainGoal', 30),
  ('padel', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 40),
  ('padel', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 50),
  ('padel', 'modality', 'doubles', 'training.sportOptionDoubles', 'training.modalityLabel', 10),
  ('padel', 'modality', 'singles', 'training.sportOptionSingles', 'training.modalityLabel', 20),
  ('padel', 'modality', 'training', 'training.sportOptionTraining', 'training.modalityLabel', 30),
  ('padel', 'modality', 'match', 'training.sportOptionMatch', 'training.modalityLabel', 40),
  ('padel', 'terrain', 'indoor_court', 'training.sportOptionIndoorCourt', 'training.courtEnvironmentLabel', 10),
  ('padel', 'terrain', 'outdoor_court', 'training.sportOptionOutdoorCourt', 'training.courtEnvironmentLabel', 20),

  ('hiking', 'goal', 'route', 'training.sportOptionRoute', 'training.mainGoal', 10),
  ('hiking', 'goal', 'elevation', 'training.sportOptionElevation', 'training.mainGoal', 20),
  ('hiking', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 30),
  ('hiking', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 40),
  ('hiking', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 50),
  ('hiking', 'modality', 'gentle_route', 'training.sportOptionGentleRoute', 'training.modalityLabel', 10),
  ('hiking', 'modality', 'elevation_route', 'training.sportOptionElevationRoute', 'training.modalityLabel', 20),
  ('hiking', 'modality', 'trekking', 'training.sportOptionTrekking', 'training.modalityLabel', 30),
  ('hiking', 'modality', 'high_mountain', 'training.sportOptionHighMountain', 'training.modalityLabel', 40),
  ('hiking', 'modality', 'urban_walk', 'training.sportOptionUrbanWalk', 'training.modalityLabel', 50),
  ('hiking', 'modality', 'mixed_walk', 'training.sportOptionMixedWalk', 'training.modalityLabel', 60),
  ('hiking', 'terrain', 'urban', 'training.sportOptionUrban', 'training.terrainLabel', 10),
  ('hiking', 'terrain', 'trail', 'training.sportOptionTrail', 'training.terrainLabel', 20),
  ('hiking', 'terrain', 'rocky', 'training.sportOptionRocky', 'training.terrainLabel', 30),
  ('hiking', 'terrain', 'high_mountain', 'training.sportOptionHighMountain', 'training.terrainLabel', 40),
  ('hiking', 'terrain', 'mixed', 'training.sportOptionMixed', 'training.terrainLabel', 50);

-- Modality keys are catalog values and must remain extensible without enum migrations.
ALTER TABLE "public"."activity_sessions"
  ALTER COLUMN "sport_subtype" TYPE text USING "sport_subtype"::text;

UPDATE "public"."activity_sessions"
SET "sport_type" = 'hiking', "sport_subtype" = 'urban_walk'
WHERE "sport_type" = 'running' AND "sport_subtype" = 'walk';

UPDATE "public"."activity_sessions"
SET "sport_subtype" = 'mtb'
WHERE "sport_type" = 'cycling' AND "sport_subtype" = 'trail';

UPDATE "public"."endurance_workout_templates"
SET "workout_goal" = CASE "workout_goal"
  WHEN 'resistencia' THEN 'endurance'
  WHEN 'velocidad' THEN 'speed'
  WHEN 'tempo_umbral' THEN 'tempo_threshold'
  WHEN 'tirada_larga' THEN 'long_run'
  WHEN 'recuperacion' THEN 'recovery'
  WHEN 'test' THEN 'test'
  ELSE "workout_goal"
END
WHERE "sport_type" = 'running';

UPDATE "public"."endurance_workout_templates"
SET "workout_goal" = CASE "workout_goal"
  WHEN 'resistencia' THEN 'endurance'
  WHEN 'potencia' THEN 'power'
  WHEN 'velocidad' THEN 'speed'
  WHEN 'ruta_larga' THEN 'long_route'
  WHEN 'recuperacion' THEN 'recovery'
  WHEN 'tecnica' THEN 'technique'
  ELSE "workout_goal"
END
WHERE "sport_type" = 'cycling';

UPDATE "public"."endurance_workout_templates"
SET "environment_type" = CASE "environment_type"
  WHEN 'road' THEN 'outdoor'
  WHEN 'aire_libre' THEN 'outdoor'
  WHEN 'indoor' THEN 'treadmill'
  WHEN 'cinta' THEN 'treadmill'
  ELSE "environment_type"
END,
"surface" = CASE "surface"
  WHEN 'asfalto' THEN 'asphalt'
  WHEN 'pista' THEN 'track'
  WHEN 'tierra' THEN 'dirt'
  WHEN 'hierba' THEN 'grass'
  WHEN 'cinta' THEN 'treadmill'
  ELSE "surface"
END
WHERE "sport_type" = 'running';

UPDATE "public"."endurance_workout_templates"
SET "environment_type" = CASE "environment_type"
  WHEN 'trail' THEN 'mtb'
  WHEN 'indoor' THEN 'indoor_trainer'
  ELSE "environment_type"
END,
"surface" = CASE "surface"
  WHEN 'road' THEN 'asphalt'
  WHEN 'trail' THEN 'mountain_trail'
  WHEN 'track' THEN 'velodrome'
  WHEN 'indoor' THEN NULL
  ELSE "surface"
END
WHERE "sport_type" = 'cycling';
