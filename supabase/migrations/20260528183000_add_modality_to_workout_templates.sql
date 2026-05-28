-- Add modality column to workout_templates table
ALTER TABLE "public"."workout_templates"
  ADD COLUMN "modality" TEXT;

-- Insert gym goals and modalities if they don't exist
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('gym', 'goal', 'hypertrophy', 'training.sportOptionHypertrophy', 'training.mainGoal', 10),
  ('gym', 'goal', 'strength', 'training.sportOptionStrength', 'training.mainGoal', 20),
  ('gym', 'goal', 'muscular_endurance', 'training.sportOptionMuscularEndurance', 'training.mainGoal', 30),
  ('gym', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 40),
  ('gym', 'goal', 'mobility', 'training.sportOptionMobility', 'training.mainGoal', 50),
  ('gym', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 60),
  ('gym', 'modality', 'gym', 'training.sportOptionGym', 'training.modalityLabel', 10),
  ('gym', 'modality', 'free_weights', 'training.sportOptionFreeWeights', 'training.modalityLabel', 20),
  ('gym', 'modality', 'machines', 'training.sportOptionMachines', 'training.modalityLabel', 30),
  ('gym', 'modality', 'calisthenics', 'training.sportOptionCalisthenics', 'training.modalityLabel', 40),
  ('gym', 'modality', 'core', 'training.sportOptionCore', 'training.modalityLabel', 50),
  ('gym', 'modality', 'mobility', 'training.sportOptionMobility', 'training.modalityLabel', 60)
ON CONFLICT ("sport_type", "option_type", "option_key") DO NOTHING;
