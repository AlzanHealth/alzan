ALTER TABLE "public"."endurance_workout_templates"
  ADD COLUMN IF NOT EXISTS "recurrence_start_date" date,
  ADD COLUMN IF NOT EXISTS "recurrence_end_date" date;

ALTER TABLE "public"."endurance_workout_steps"
  ADD COLUMN IF NOT EXISTS "progression_key" uuid DEFAULT "gen_random_uuid"() NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."endurance_workout_step_progressions" (
  "id" uuid DEFAULT "gen_random_uuid"() NOT NULL,
  "template_id" uuid NOT NULL,
  "progression_key" uuid NOT NULL,
  "week_index" integer NOT NULL,
  "duration_s" integer,
  "distance_m" integer,
  "target_type" "public"."target_type_enum",
  "target_min" numeric,
  "target_max" numeric,
  "repetitions" integer,
  "load_kg" numeric,
  "reps" integer,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "endurance_workout_step_progressions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "endurance_workout_step_progressions_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "public"."endurance_workout_templates"("id") ON DELETE CASCADE,
  CONSTRAINT "endurance_workout_step_progressions_unique_week_step"
    UNIQUE ("template_id", "progression_key", "week_index"),
  CONSTRAINT "endurance_workout_step_progressions_week_index_check"
    CHECK ("week_index" >= 1),
  CONSTRAINT "endurance_workout_step_progressions_duration_check"
    CHECK ("duration_s" IS NULL OR "duration_s" >= 0),
  CONSTRAINT "endurance_workout_step_progressions_distance_check"
    CHECK ("distance_m" IS NULL OR "distance_m" >= 0),
  CONSTRAINT "endurance_workout_step_progressions_repetitions_check"
    CHECK ("repetitions" IS NULL OR "repetitions" >= 1),
  CONSTRAINT "endurance_workout_step_progressions_load_check"
    CHECK ("load_kg" IS NULL OR "load_kg" >= 0),
  CONSTRAINT "endurance_workout_step_progressions_reps_check"
    CHECK ("reps" IS NULL OR "reps" >= 0)
);

ALTER TABLE "public"."endurance_workout_step_progressions" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "endurance_workout_step_progressions_template_week_idx"
  ON "public"."endurance_workout_step_progressions" ("template_id", "week_index");

ALTER TABLE "public"."endurance_workout_step_progressions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "endurance_workout_step_progressions_manage_own_template"
  ON "public"."endurance_workout_step_progressions"
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."endurance_workout_templates" "t"
      WHERE "t"."id" = "endurance_workout_step_progressions"."template_id"
        AND "t"."user_id" = (SELECT "auth"."uid"() AS "uid")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "public"."endurance_workout_templates" "t"
      WHERE "t"."id" = "endurance_workout_step_progressions"."template_id"
        AND "t"."user_id" = (SELECT "auth"."uid"() AS "uid")
    )
  );

GRANT ALL ON TABLE "public"."endurance_workout_step_progressions" TO "anon";
GRANT ALL ON TABLE "public"."endurance_workout_step_progressions" TO "authenticated";
GRANT ALL ON TABLE "public"."endurance_workout_step_progressions" TO "service_role";
