-- Alter workout_goal type to TEXT to allow arbitrary text / structured goals
ALTER TABLE "public"."endurance_workout_templates"
  ALTER COLUMN "workout_goal" TYPE TEXT;

-- Add environment_type and surface columns
ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN "environment_type" TEXT,
  ADD COLUMN "surface" TEXT;
