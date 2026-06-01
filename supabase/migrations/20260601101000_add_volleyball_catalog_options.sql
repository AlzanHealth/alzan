DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'volleyball';

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('volleyball', 'goal', 'match', 'training.sportOptionMatch', 'training.mainGoal', 10),
  ('volleyball', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('volleyball', 'goal', 'jump', 'training.sportOptionJump', 'training.mainGoal', 30),
  ('volleyball', 'goal', 'serve', 'training.sportOptionServe', 'training.mainGoal', 40),
  ('volleyball', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 50),

  ('volleyball', 'modality', 'indoor_volleyball', 'training.sportOptionIndoorVolleyball', 'training.modalityLabel', 10),
  ('volleyball', 'modality', 'beach_volleyball', 'training.sportOptionBeachVolleyball', 'training.modalityLabel', 20),

  ('volleyball', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('volleyball', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('volleyball', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('volleyball', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);
