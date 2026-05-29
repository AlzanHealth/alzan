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
          'contact_level'::text
        ]
      )
    );

ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN IF NOT EXISTS "contact_level" TEXT;

ALTER TABLE "public"."activity_sessions"
  ADD COLUMN IF NOT EXISTS "contact_level" TEXT;

DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'martial_arts';

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('martial_arts', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 10),
  ('martial_arts', 'goal', 'sparring', 'training.sportOptionSparring', 'training.mainGoal', 20),
  ('martial_arts', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 30),
  ('martial_arts', 'goal', 'strength', 'training.sportOptionStrength', 'training.mainGoal', 40),
  ('martial_arts', 'goal', 'mobility', 'training.sportOptionMobility', 'training.mainGoal', 50),
  ('martial_arts', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 60),

  ('martial_arts', 'modality', 'boxing', 'training.sportOptionBoxing', 'training.modalityLabel', 10),
  ('martial_arts', 'modality', 'kickboxing', 'training.sportOptionKickboxing', 'training.modalityLabel', 20),
  ('martial_arts', 'modality', 'muay_thai', 'training.sportOptionMuayThai', 'training.modalityLabel', 30),
  ('martial_arts', 'modality', 'mma', 'training.sportOptionMma', 'training.modalityLabel', 40),
  ('martial_arts', 'modality', 'karate', 'training.sportOptionKarate', 'training.modalityLabel', 50),
  ('martial_arts', 'modality', 'judo', 'training.sportOptionJudo', 'training.modalityLabel', 60),
  ('martial_arts', 'modality', 'taekwondo', 'training.sportOptionTaekwondo', 'training.modalityLabel', 70),
  ('martial_arts', 'modality', 'jiu_jitsu_bjj', 'training.sportOptionJiuJitsuBjj', 'training.modalityLabel', 80),
  ('martial_arts', 'modality', 'krav_maga', 'training.sportOptionKravMaga', 'training.modalityLabel', 90),

  ('martial_arts', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
  ('martial_arts', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
  ('martial_arts', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
  ('martial_arts', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40),

  ('martial_arts', 'contact_level', 'no_contact', 'training.contactNoContact', 'training.contactLevelLabel', 10),
  ('martial_arts', 'contact_level', 'light_contact', 'training.contactLightContact', 'training.contactLevelLabel', 20),
  (
    'martial_arts',
    'contact_level',
    'controlled_sparring',
    'training.contactControlledSparring',
    'training.contactLevelLabel',
    30
  ),
  ('martial_arts', 'contact_level', 'full_contact', 'training.contactFullContact', 'training.contactLevelLabel', 40);
