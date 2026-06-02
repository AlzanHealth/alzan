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
          'contact_level'::text,
          'climbing_grade'::text,
          'wetsuit'::text,
          'board'::text,
          'ski_type'::text,
          'slope_type'::text,
          'snowboard_type'::text,
          'golf_club_focus'::text
        ]
      )
    );

ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN IF NOT EXISTS "golf_club_focus" TEXT;

ALTER TABLE "public"."activity_sessions"
  ADD COLUMN IF NOT EXISTS "golf_club_focus" TEXT;

DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'golf';

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order", "label_es", "label_en", "group_label_es", "group_label_en")
VALUES
  ('golf', 'goal', 'round', 'training.sportOptionGolfRound', 'training.mainGoal', 10, 'Ronda', 'Round', 'Objetivo Principal', 'Main Goal'),
  ('golf', 'goal', 'swing', 'training.sportOptionSwing', 'training.mainGoal', 20, 'Swing', 'Swing', 'Objetivo Principal', 'Main Goal'),
  ('golf', 'goal', 'putt', 'training.sportOptionPutt', 'training.mainGoal', 30, 'Putt', 'Putt', 'Objetivo Principal', 'Main Goal'),
  ('golf', 'goal', 'approach', 'training.sportOptionApproach', 'training.mainGoal', 40, 'Approach', 'Approach', 'Objetivo Principal', 'Main Goal'),
  ('golf', 'goal', 'accuracy', 'training.sportOptionAccuracy', 'training.mainGoal', 50, 'Precisión', 'Accuracy', 'Objetivo Principal', 'Main Goal');

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order", "label_es", "label_en", "group_label_es", "group_label_en")
VALUES
  ('golf', 'modality', 'round_18_holes', 'training.sportOptionRound18Holes', 'training.modalityLabel', 10, 'Ronda 18 hoyos', '18-hole round', 'Modalidad', 'Modality'),
  ('golf', 'modality', 'round_9_holes', 'training.sportOptionRound9Holes', 'training.modalityLabel', 20, 'Ronda 9 hoyos', '9-hole round', 'Modalidad', 'Modality'),
  ('golf', 'modality', 'driving_range', 'training.sportOptionDrivingRange', 'training.modalityLabel', 30, 'Driving range', 'Driving range', 'Modalidad', 'Modality'),
  ('golf', 'modality', 'pitch_and_putt', 'training.sportOptionPitchAndPutt', 'training.modalityLabel', 40, 'Pitch & putt', 'Pitch & putt', 'Modalidad', 'Modality');

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order", "label_es", "label_en", "group_label_es", "group_label_en")
VALUES
  ('golf', 'golf_club_focus', 'driver', 'training.golfClubDriver', 'training.golfClubFocusLabel', 10, 'Driver', 'Driver', 'Foco de palos', 'Club focus'),
  ('golf', 'golf_club_focus', 'woods', 'training.golfClubWoods', 'training.golfClubFocusLabel', 20, 'Maderas', 'Woods', 'Foco de palos', 'Club focus'),
  ('golf', 'golf_club_focus', 'irons', 'training.golfClubIrons', 'training.golfClubFocusLabel', 30, 'Hierros', 'Irons', 'Foco de palos', 'Club focus'),
  ('golf', 'golf_club_focus', 'wedges', 'training.golfClubWedges', 'training.golfClubFocusLabel', 40, 'Wedges', 'Wedges', 'Foco de palos', 'Club focus'),
  ('golf', 'golf_club_focus', 'putter', 'training.golfClubPutter', 'training.golfClubFocusLabel', 50, 'Putter', 'Putter', 'Foco de palos', 'Club focus'),
  ('golf', 'golf_club_focus', 'mixed_bag', 'training.golfClubMixedBag', 'training.golfClubFocusLabel', 60, 'Bolsa completa', 'Mixed bag', 'Foco de palos', 'Club focus');

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order", "label_es", "label_en", "group_label_es", "group_label_en")
VALUES
  ('golf', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10, 'Baja', 'Low', 'Carga base', 'Base load'),
  ('golf', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20, 'Media', 'Medium', 'Carga base', 'Base load'),
  ('golf', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30, 'Alta', 'High', 'Carga base', 'Base load'),
  ('golf', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40, 'Muy Alta', 'Very High', 'Carga base', 'Base load');
