-- 1. Clean up existing padel options and insert new ones
DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'padel';

-- Modalities: singles (Individual), doubles (Dobles), training (Entrenamiento), match (Partido)
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('padel', 'modality', 'doubles', 'training.sportOptionDoubles', 'training.modalityLabel', 10),
  ('padel', 'modality', 'singles', 'training.sportOptionSingles', 'training.modalityLabel', 20),
  ('padel', 'modality', 'training', 'training.sportOptionTraining', 'training.modalityLabel', 30),
  ('padel', 'modality', 'match', 'training.sportOptionMatch', 'training.modalityLabel', 40);

-- Goals: Partido, Técnica, Bandeja/Volea, Resistencia, Velocidad
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('padel', 'goal', 'match', 'training.sportOptionMatch', 'training.mainGoal', 10),
  ('padel', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 20),
  ('padel', 'goal', 'bandeja_volley', 'training.sportOptionBandejaVolley', 'training.mainGoal', 30),
  ('padel', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 40),
  ('padel', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 50);

-- Terrains/Surfaces: Césped artificial, Hormigón, Resina sintética, Pista cubierta, Pista exterior
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('padel', 'terrain', 'artificial_grass', 'training.sportOptionArtificialGrass', 'training.surfaceLabel', 10),
  ('padel', 'terrain', 'concrete', 'training.sportOptionConcrete', 'training.surfaceLabel', 20),
  ('padel', 'terrain', 'synthetic_resin', 'training.sportOptionSyntheticResin', 'training.surfaceLabel', 30),
  ('padel', 'terrain', 'indoor_court', 'training.sportOptionIndoorCourt', 'training.surfaceLabel', 40),
  ('padel', 'terrain', 'outdoor_court', 'training.sportOptionOutdoorCourt', 'training.surfaceLabel', 50);

-- Base Load: Baja, Media, Alta, Muy Alta
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('padel', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('padel', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('padel', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('padel', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);

-- Rackets/Palas: coming_soon
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('padel', 'racket', 'coming_soon', 'training.comingSoon', 'training.palaLabel', 10);
