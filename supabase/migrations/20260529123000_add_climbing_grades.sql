-- 1. Alter the CHECK constraint on option_type in sport_catalog_options to allow 'climbing_grade'
ALTER TABLE "public"."sport_catalog_options"
  DROP CONSTRAINT IF EXISTS "sport_catalog_options_option_type_check",
  ADD CONSTRAINT "sport_catalog_options_option_type_check"
    CHECK ("option_type" = ANY (ARRAY['goal'::text, 'modality'::text, 'terrain'::text, 'pool_type'::text, 'stroke'::text, 'boots'::text, 'base_load'::text, 'racket'::text, 'contact_level'::text, 'climbing_grade'::text]));

-- 2. Add climbing_grade column to endurance_workout_templates
ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN "climbing_grade" TEXT;

-- 3. Add climbing_grade column to activity_sessions
ALTER TABLE "public"."activity_sessions"
  ADD COLUMN "climbing_grade" TEXT;

-- 4. Clean up existing climbing grades (idempotent)
DELETE FROM "public"."sport_catalog_options"
WHERE "sport_type" = 'climbing' AND "option_type" = 'climbing_grade';

-- 5. Insert French scale grades (Sport Climbing)
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('climbing', 'climbing_grade', 'fr_4', 'training.gradeFr4', 'training.climbingGradeSport', 10),
  ('climbing', 'climbing_grade', 'fr_5a', 'training.gradeFr5a', 'training.climbingGradeSport', 20),
  ('climbing', 'climbing_grade', 'fr_5b', 'training.gradeFr5b', 'training.climbingGradeSport', 30),
  ('climbing', 'climbing_grade', 'fr_5c', 'training.gradeFr5c', 'training.climbingGradeSport', 40),
  ('climbing', 'climbing_grade', 'fr_6a', 'training.gradeFr6a', 'training.climbingGradeSport', 50),
  ('climbing', 'climbing_grade', 'fr_6a_plus', 'training.gradeFr6aPlus', 'training.climbingGradeSport', 60),
  ('climbing', 'climbing_grade', 'fr_6b', 'training.gradeFr6b', 'training.climbingGradeSport', 70),
  ('climbing', 'climbing_grade', 'fr_6b_plus', 'training.gradeFr6bPlus', 'training.climbingGradeSport', 80),
  ('climbing', 'climbing_grade', 'fr_6c', 'training.gradeFr6c', 'training.climbingGradeSport', 90),
  ('climbing', 'climbing_grade', 'fr_6c_plus', 'training.gradeFr6cPlus', 'training.climbingGradeSport', 100),
  ('climbing', 'climbing_grade', 'fr_7a', 'training.gradeFr7a', 'training.climbingGradeSport', 110),
  ('climbing', 'climbing_grade', 'fr_7a_plus', 'training.gradeFr7aPlus', 'training.climbingGradeSport', 120),
  ('climbing', 'climbing_grade', 'fr_7b', 'training.gradeFr7b', 'training.climbingGradeSport', 130),
  ('climbing', 'climbing_grade', 'fr_7b_plus', 'training.gradeFr7bPlus', 'training.climbingGradeSport', 140),
  ('climbing', 'climbing_grade', 'fr_7c', 'training.gradeFr7c', 'training.climbingGradeSport', 150),
  ('climbing', 'climbing_grade', 'fr_7c_plus', 'training.gradeFr7cPlus', 'training.climbingGradeSport', 160),
  ('climbing', 'climbing_grade', 'fr_8a', 'training.gradeFr8a', 'training.climbingGradeSport', 170),
  ('climbing', 'climbing_grade', 'fr_8a_plus', 'training.gradeFr8aPlus', 'training.climbingGradeSport', 180),
  ('climbing', 'climbing_grade', 'fr_8b', 'training.gradeFr8b', 'training.climbingGradeSport', 190),
  ('climbing', 'climbing_grade', 'fr_8b_plus', 'training.gradeFr8bPlus', 'training.climbingGradeSport', 200),
  ('climbing', 'climbing_grade', 'fr_8c', 'training.gradeFr8c', 'training.climbingGradeSport', 210),
  ('climbing', 'climbing_grade', 'fr_8c_plus', 'training.gradeFr8cPlus', 'training.climbingGradeSport', 220),
  ('climbing', 'climbing_grade', 'fr_9a', 'training.gradeFr9a', 'training.climbingGradeSport', 230),
  ('climbing', 'climbing_grade', 'fr_9a_plus', 'training.gradeFr9aPlus', 'training.climbingGradeSport', 240),
  ('climbing', 'climbing_grade', 'fr_9b', 'training.gradeFr9b', 'training.climbingGradeSport', 250),
  ('climbing', 'climbing_grade', 'fr_9b_plus', 'training.gradeFr9bPlus', 'training.climbingGradeSport', 260),
  ('climbing', 'climbing_grade', 'fr_9c', 'training.gradeFr9c', 'training.climbingGradeSport', 270);

-- 6. Insert Fontainebleau scale grades (Bouldering)
INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('climbing', 'climbing_grade', 'fb_4', 'training.gradeFb4', 'training.climbingGradeBoulder', 310),
  ('climbing', 'climbing_grade', 'fb_5', 'training.gradeFb5', 'training.climbingGradeBoulder', 320),
  ('climbing', 'climbing_grade', 'fb_6a', 'training.gradeFb6a', 'training.climbingGradeBoulder', 330),
  ('climbing', 'climbing_grade', 'fb_6a_plus', 'training.gradeFb6aPlus', 'training.climbingGradeBoulder', 340),
  ('climbing', 'climbing_grade', 'fb_6b', 'training.gradeFb6b', 'training.climbingGradeBoulder', 350),
  ('climbing', 'climbing_grade', 'fb_6b_plus', 'training.gradeFb6bPlus', 'training.climbingGradeBoulder', 360),
  ('climbing', 'climbing_grade', 'fb_7a', 'training.gradeFb7a', 'training.climbingGradeBoulder', 370),
  ('climbing', 'climbing_grade', 'fb_7a_plus', 'training.gradeFb7aPlus', 'training.climbingGradeBoulder', 380),
  ('climbing', 'climbing_grade', 'fb_7b', 'training.gradeFb7b', 'training.climbingGradeBoulder', 390),
  ('climbing', 'climbing_grade', 'fb_7b_plus', 'training.gradeFb7bPlus', 'training.climbingGradeBoulder', 400),
  ('climbing', 'climbing_grade', 'fb_7c', 'training.gradeFb7c', 'training.climbingGradeBoulder', 410),
  ('climbing', 'climbing_grade', 'fb_7c_plus', 'training.gradeFb7cPlus', 'training.climbingGradeBoulder', 420),
  ('climbing', 'climbing_grade', 'fb_8a', 'training.gradeFb8a', 'training.climbingGradeBoulder', 430),
  ('climbing', 'climbing_grade', 'fb_8a_plus', 'training.gradeFb8aPlus', 'training.climbingGradeBoulder', 440),
  ('climbing', 'climbing_grade', 'fb_8b', 'training.gradeFb8b', 'training.climbingGradeBoulder', 450),
  ('climbing', 'climbing_grade', 'fb_8b_plus', 'training.gradeFb8bPlus', 'training.climbingGradeBoulder', 460),
  ('climbing', 'climbing_grade', 'fb_8c', 'training.gradeFb8c', 'training.climbingGradeBoulder', 470),
  ('climbing', 'climbing_grade', 'fb_8c_plus', 'training.gradeFb8cPlus', 'training.climbingGradeBoulder', 480),
  ('climbing', 'climbing_grade', 'fb_9a', 'training.gradeFb9a', 'training.climbingGradeBoulder', 490);
