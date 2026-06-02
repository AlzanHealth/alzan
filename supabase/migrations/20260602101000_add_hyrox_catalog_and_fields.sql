ALTER TABLE "public"."sport_catalog_options"
  DROP CONSTRAINT IF EXISTS "sport_catalog_options_option_type_check",
  ADD CONSTRAINT "sport_catalog_options_option_type_check"
    CHECK ("option_type" = ANY (
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
        'snowboard_type'::text,
        'golf_club_focus'::text,
        'hyrox_station_focus'::text
      ]
    ));

ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN IF NOT EXISTS "hyrox_station_focus" TEXT;

ALTER TABLE "public"."activity_sessions"
  ADD COLUMN IF NOT EXISTS "hyrox_station_focus" TEXT;

ALTER TABLE "public"."endurance_workout_steps"
  ADD COLUMN IF NOT EXISTS "hyrox_step_type" TEXT,
  ADD COLUMN IF NOT EXISTS "hyrox_station_key" TEXT,
  ADD COLUMN IF NOT EXISTS "load_kg" NUMERIC,
  ADD COLUMN IF NOT EXISTS "reps" INTEGER;

ALTER TABLE "public"."endurance_workout_steps"
  DROP CONSTRAINT IF EXISTS "endurance_workout_steps_hyrox_step_type_check",
  ADD CONSTRAINT "endurance_workout_steps_hyrox_step_type_check"
    CHECK ("hyrox_step_type" IS NULL OR "hyrox_step_type" = ANY (ARRAY['run'::text, 'station'::text, 'rest'::text]));

DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'hyrox';

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order", "label_es", "label_en", "group_label_es", "group_label_en")
VALUES
  ('hyrox', 'goal', 'race_simulation', 'training.sportOptionHyroxRaceSimulation', 'training.mainGoal', 10, 'Simulación carrera', 'Race simulation', 'Objetivo Principal', 'Main Goal'),
  ('hyrox', 'goal', 'hybrid_endurance', 'training.sportOptionHybridEndurance', 'training.mainGoal', 20, 'Resistencia híbrida', 'Hybrid endurance', 'Objetivo Principal', 'Main Goal'),
  ('hyrox', 'goal', 'compromised_running', 'training.sportOptionCompromisedRunning', 'training.mainGoal', 30, 'Running comprometido', 'Compromised running', 'Objetivo Principal', 'Main Goal'),
  ('hyrox', 'goal', 'functional_strength', 'training.sportOptionFunctionalStrength', 'training.mainGoal', 40, 'Fuerza funcional', 'Functional strength', 'Objetivo Principal', 'Main Goal'),
  ('hyrox', 'goal', 'station_technique', 'training.sportOptionStationTechnique', 'training.mainGoal', 50, 'Técnica de estaciones', 'Station technique', 'Objetivo Principal', 'Main Goal'),
  ('hyrox', 'goal', 'transitions', 'training.sportOptionTransitions', 'training.mainGoal', 60, 'Transiciones', 'Transitions', 'Objetivo Principal', 'Main Goal');

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order", "label_es", "label_en", "group_label_es", "group_label_en")
VALUES
  ('hyrox', 'modality', 'individual', 'training.sportOptionIndividual', 'training.modalityLabel', 10, 'Individual', 'Individual', 'Modalidad', 'Modality'),
  ('hyrox', 'modality', 'doubles', 'training.sportOptionDoubles', 'training.modalityLabel', 20, 'Doubles', 'Doubles', 'Modalidad', 'Modality'),
  ('hyrox', 'modality', 'relay', 'training.sportOptionRelay', 'training.modalityLabel', 30, 'Relay', 'Relay', 'Modalidad', 'Modality'),
  ('hyrox', 'modality', 'full_simulation', 'training.sportOptionFullSimulation', 'training.modalityLabel', 40, 'Simulación completa', 'Full simulation', 'Modalidad', 'Modality'),
  ('hyrox', 'modality', 'partial_workout', 'training.sportOptionPartialWorkout', 'training.modalityLabel', 50, 'Entreno parcial', 'Partial workout', 'Modalidad', 'Modality'),
  ('hyrox', 'modality', 'station_technique', 'training.sportOptionStationTechnique', 'training.modalityLabel', 60, 'Técnica de estaciones', 'Station technique', 'Modalidad', 'Modality');

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order", "label_es", "label_en", "group_label_es", "group_label_en")
VALUES
  ('hyrox', 'hyrox_station_focus', 'skierg', 'training.hyroxStationSkiErg', 'training.hyroxStationFocusLabel', 10, 'Esquí ergómetro', 'SkiErg', 'Foco de estación', 'Station focus'),
  ('hyrox', 'hyrox_station_focus', 'sled_push', 'training.hyroxStationSledPush', 'training.hyroxStationFocusLabel', 20, 'Empuje de trineo', 'Sled Push', 'Foco de estación', 'Station focus'),
  ('hyrox', 'hyrox_station_focus', 'sled_pull', 'training.hyroxStationSledPull', 'training.hyroxStationFocusLabel', 30, 'Tirón de trineo', 'Sled Pull', 'Foco de estación', 'Station focus'),
  ('hyrox', 'hyrox_station_focus', 'burpee_broad_jump', 'training.hyroxStationBurpeeBroadJump', 'training.hyroxStationFocusLabel', 40, 'Burpee con salto largo', 'Burpee Broad Jump', 'Foco de estación', 'Station focus'),
  ('hyrox', 'hyrox_station_focus', 'rowing', 'training.hyroxStationRowing', 'training.hyroxStationFocusLabel', 50, 'Remo', 'Rowing', 'Foco de estación', 'Station focus'),
  ('hyrox', 'hyrox_station_focus', 'farmers_carry', 'training.hyroxStationFarmersCarry', 'training.hyroxStationFocusLabel', 60, 'Paseo del granjero', 'Farmers Carry', 'Foco de estación', 'Station focus'),
  ('hyrox', 'hyrox_station_focus', 'sandbag_lunges', 'training.hyroxStationSandbagLunges', 'training.hyroxStationFocusLabel', 70, 'Zancadas con saco', 'Sandbag Lunges', 'Foco de estación', 'Station focus'),
  ('hyrox', 'hyrox_station_focus', 'wall_balls', 'training.hyroxStationWallBalls', 'training.hyroxStationFocusLabel', 80, 'Lanzamientos a pared', 'Wall Balls', 'Foco de estación', 'Station focus');

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order", "label_es", "label_en", "group_label_es", "group_label_en")
VALUES
  ('hyrox', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10, 'Baja', 'Low', 'Carga base', 'Base load'),
  ('hyrox', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20, 'Media', 'Medium', 'Carga base', 'Base load'),
  ('hyrox', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30, 'Alta', 'High', 'Carga base', 'Base load'),
  ('hyrox', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40, 'Muy Alta', 'Very High', 'Carga base', 'Base load');
