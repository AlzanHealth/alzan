-- Clean up existing options if any
DELETE FROM "public"."sport_catalog_options" WHERE "sport_type" = 'surf';

-- Modalities: surf, longboard, shortboard, bodyboard, paddle_surf
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('surf', 'modality', 'surf', 'training.sportOptionSurf', 'training.modalityLabel', 10),
  ('surf', 'modality', 'longboard', 'training.sportOptionLongboard', 'training.modalityLabel', 20),
  ('surf', 'modality', 'shortboard', 'training.sportOptionShortboard', 'training.modalityLabel', 30),
  ('surf', 'modality', 'bodyboard', 'training.sportOptionBodyboard', 'training.modalityLabel', 40),
  ('surf', 'modality', 'paddle_surf', 'training.sportOptionPaddleSurf', 'training.modalityLabel', 50);

-- Goals: technique, waves, paddling, endurance, recovery
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('surf', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 10),
  ('surf', 'goal', 'waves', 'training.sportOptionWaves', 'training.mainGoal', 20),
  ('surf', 'goal', 'paddling', 'training.sportOptionPaddling', 'training.mainGoal', 30),
  ('surf', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 40),
  ('surf', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50);

-- Base Load: Baja, Media, Alta, Muy Alta
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('surf', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('surf', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('surf', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('surf', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);
