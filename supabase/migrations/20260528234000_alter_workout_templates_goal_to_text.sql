-- Alter workout_goal type in workout_templates to TEXT to support arbitrary catalog goal keys
ALTER TABLE "public"."workout_templates"
  ALTER COLUMN "workout_goal" TYPE TEXT;
