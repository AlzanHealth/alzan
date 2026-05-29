DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'climbing';

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('climbing', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 10),
  ('climbing', 'goal', 'bouldering', 'training.sportOptionBouldering', 'training.mainGoal', 20),
  ('climbing', 'goal', 'sport_route', 'training.sportOptionSportRoute', 'training.mainGoal', 30),
  ('climbing', 'goal', 'strength', 'training.sportOptionStrength', 'training.mainGoal', 40),
  ('climbing', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 50),
  ('climbing', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 60),

  ('climbing', 'modality', 'bouldering', 'training.sportOptionBouldering', 'training.modalityLabel', 10),
  ('climbing', 'modality', 'sport_climbing', 'training.sportOptionSportClimbing', 'training.modalityLabel', 20),
  ('climbing', 'modality', 'trad_climbing', 'training.sportOptionTradClimbing', 'training.modalityLabel', 30),
  ('climbing', 'modality', 'indoor_climbing', 'training.sportOptionIndoorClimbing', 'training.modalityLabel', 40),
  ('climbing', 'modality', 'deep_water_soloing', 'training.sportOptionDeepWaterSoloing', 'training.modalityLabel', 50),

  ('climbing', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('climbing', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('climbing', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('climbing', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);
