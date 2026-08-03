# Production Static Seeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local Supabase resets load the same shared catalog data as production without exporting users, health records, meal logs, workouts, or other personal data.

**Architecture:** A read-only exporter uses the production Supabase REST API with the service-role key only for SELECT requests, filters recipes and related items to system/public rows, and writes deterministic SQL snapshots. Seeds `0_user.sql` and `9_health_data.sql` remain untouched; demo training data remains separate. A final catalog seed synchronizes `sport_catalog_options`, which is otherwise populated by migrations.

**Tech Stack:** Node.js, `@supabase/supabase-js`, dotenv, PostgreSQL seed SQL, Supabase local `db reset`.

---

### Task 1: Add a guarded production catalog exporter

**Files:**
- Create: `scripts/export-production-static-seeds.mjs`
- Modify: `package.json`

- [ ] Add a script that refuses to run unless `EXPORT_PRODUCTION_STATIC_SEEDS=1`, validates that the configured URL is not localhost, performs only paginated SELECT queries, and never calls insert/update/delete/upsert.
- [ ] Export only `exercise_types`, `equipment`, `muscle_groups`, system exercises and translations, all ingredients, system/public recipes, their recipe items, and `sport_catalog_options`.
- [ ] Generate deterministic SQL literals for nulls, booleans, numbers, timestamps, strings, JSON values, and escaped apostrophes.
- [ ] Keep user-owned recipes and recipe items out of the snapshot and leave `0_user.sql`, `9_health_data.sql`, and `10_training_templates.sql` untouched.

### Task 2: Regenerate static seed snapshots from production

**Files:**
- Modify: `supabase/seeds/1_exercise_types.sql`
- Modify: `supabase/seeds/2_equipment.sql`
- Create: `supabase/seeds/2_equipment_translations.sql`
- Modify: `supabase/seeds/3_muscle_groups.sql`
- Create: `supabase/seeds/3_muscle_group_translations.sql`
- Modify: `supabase/seeds/4_exercises.sql`
- Modify: `supabase/seeds/5_exercise_translations.sql`
- Modify: `supabase/seeds/6_ingredients.sql`
- Modify: `supabase/seeds/7_recipes.sql`
- Modify: `supabase/seeds/8_recipe_items.sql`
- Create: `supabase/seeds/9_recipe_aliases.sql`
- Create: `supabase/seeds/5_exercise_media.sql`
- Create: `supabase/seeds/11_sport_catalog_options.sql`

- [ ] Preserve production IDs and all current columns so foreign keys and import resolvers behave identically locally.
- [ ] Ensure recipe items reference only the exported system recipes.
- [ ] Load the catalog snapshot after migrations so production labels and active/selectable flags override migration defaults.
- [ ] Keep personal/demo seed files unchanged and document the exported row counts in generated file headers.

### Task 3: Verify synchronization and safety

**Files:**
- Create: `scripts/export-production-static-seeds.spec.mjs`

- [ ] Test filtering logic with system and user recipe fixtures.
- [ ] Test SQL escaping and deterministic ordering.
- [ ] Run the exporter in read-only mode against production and verify counts without printing row contents.
- [ ] Run local `supabase db reset` when Docker is available, then compare local counts and IDs with the exported snapshots.
- [ ] Run `pnpm format`, `pnpm run lint:check`, `pnpm run typecheck`, and `git diff --check`.
