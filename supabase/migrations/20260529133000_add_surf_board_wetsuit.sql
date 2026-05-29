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
          'board'::text
        ]
      )
    );

ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN IF NOT EXISTS "wetsuit" TEXT,
  ADD COLUMN IF NOT EXISTS "board" TEXT;

ALTER TABLE "public"."activity_sessions"
  ADD COLUMN IF NOT EXISTS "wetsuit" TEXT,
  ADD COLUMN IF NOT EXISTS "board" TEXT;

INSERT INTO "public"."sport_catalog_options"
  ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
VALUES
  ('surf', 'wetsuit', 'none', 'training.wetsuitNone', 'training.wetsuitLabel', 10),
  ('surf', 'wetsuit', 'rash_guard', 'training.wetsuitRashGuard', 'training.wetsuitLabel', 20),
  ('surf', 'wetsuit', 'shorty', 'training.wetsuitShorty', 'training.wetsuitLabel', 30),
  ('surf', 'wetsuit', '3_2mm', 'training.wetsuit32mm', 'training.wetsuitLabel', 40),
  ('surf', 'wetsuit', '4_3mm', 'training.wetsuit43mm', 'training.wetsuitLabel', 50),
  ('surf', 'wetsuit', '5_4mm_plus', 'training.wetsuit54mmPlus', 'training.wetsuitLabel', 60),

  ('surf', 'board', 'shortboard', 'training.boardShortboard', 'training.boardLabel', 10),
  ('surf', 'board', 'longboard', 'training.boardLongboard', 'training.boardLabel', 20),
  ('surf', 'board', 'fish', 'training.boardFish', 'training.boardLabel', 30),
  ('surf', 'board', 'funboard', 'training.boardFunboard', 'training.boardLabel', 40),
  ('surf', 'board', 'softboard', 'training.boardSoftboard', 'training.boardLabel', 50),
  ('surf', 'board', 'gun', 'training.boardGun', 'training.boardLabel', 60),
  ('surf', 'board', 'bodyboard', 'training.boardBodyboard', 'training.boardLabel', 70);
