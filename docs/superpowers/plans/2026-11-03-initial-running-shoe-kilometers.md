# Initial Running Shoe Kilometers Implementation Plan

> **For agentic workers:** Implement each task in order, keeping the SQL and frontend types synchronized. Leave changes uncommitted per repository policy.

**Goal:** Let users record a pair's previously accumulated, untracked kilometers and include that base in shoe mileage and wear-limit warnings.

**Architecture:** Store `initial_km` on `public.running_shoes` with a zero default and a nonnegative constraint. Extend the create/update RPCs to persist it and `get_running_shoe_mileage` to return the base converted to meters plus associated running sessions; keep `sessions_count` based on real sessions only. Add a localized optional field to the existing settings form.

**Tech Stack:** Supabase/Postgres migrations and SQL integration tests; generated Supabase TypeScript types; Expo/React Native settings screen; i18next English and Spanish locales.

---

## Files and responsibilities

- `supabase/tests/running_shoes.integration.sql`: verify base kilometers, aggregation with sessions, edits, and rejection of negative values.
- `supabase/migrations/20261103170000_running_shoe_initial_kilometers.sql`: add the database column and constraints, replace the shoe RPCs, and include the base in the mileage RPC.
- `supabase/migrations/20261103180000_running_shoe_initial_kilometers_finite.sql`: harden an already-applied local version and stop if existing rows contain invalid values, without rewriting data.
- `supabase/database.types.ts`, `alzan-fe/src/types/database.types.ts`, `alzan-be/src/types/database.types.ts`: generated table/RPC types; update only through `pnpm run supabase:types`.
- `alzan-fe/src/modules/training/helpers/runningShoeInitialKilometers.ts` and `.spec.ts`: parse optional kilometer input, including decimal commas and scientific notation from number serialization, with a `1e305` km ceiling.
- `alzan-fe/src/modules/training/services/runningShoesService.ts`: select and pass `initial_km` through typed Supabase calls.
- `alzan-fe/src/screens/settings/RunningShoesSettingsScreen.tsx`: manage the field on create/edit, validate it, and submit it.
- `alzan-fe/src/i18n/locales/en.ts`, `alzan-fe/src/i18n/locales/es.ts`: add the field label, explanation, and validation message.
- `alzan-fe/package.json`, `.github/workflows/code-quality.yml`: expose and run the shoe helper checks in CI.

### Task 1: Add database behavior with a failing integration check

**Files:**
- Modify: `supabase/tests/running_shoes.integration.sql`
- Create: `supabase/migrations/20261103170000_running_shoe_initial_kilometers.sql`

- [ ] Add an integration block that creates a shoe with `p_initial_km => 12.5`, assigns a real 4,000 m running session, and asserts that `get_running_shoe_mileage()` returns `16,500` m with one session; make the assertions fail if the RPC returns no row.
- [ ] In the same block, update the base to `5.25` and assert `9,250` m with the same one session; attempt a negative base on create and update and assert SQLSTATE `22023`.
- [ ] Run `supabase test db supabase/tests/running_shoes.integration.sql` against the local Supabase database and confirm the new checks fail because the column and RPC argument do not exist yet.
- [ ] Add `initial_km numeric NOT NULL DEFAULT 0` to `running_shoes` with a check that accepts only finite values from `0` through `1e305`; test direct table updates with `-0.1`, `NaN`, `Infinity`, `-Infinity`, and `1e306`.
- [ ] Drop and recreate `create_running_shoe_with_backfill` and `update_running_shoe_with_backfill` with a trailing optional `p_initial_km numeric DEFAULT 0`; preserve existing authorization, name/date/maximum validation, default selection, and opt-in backfill behavior, then reject null, negative, non-finite, or greater-than-`1e305` input with SQLSTATE `22023` and store valid values.
- [ ] Replace `get_running_shoe_mileage()` so `total_distance_m` is `COALESCE(shoe.initial_km, 0) * 1000 + COALESCE(SUM(session.distance_m), 0)` and `sessions_count` remains `COUNT(session.id)`.
- [ ] Restore the existing function grants for `authenticated` and revoke execution from `PUBLIC` and `anon` for the recreated create/update RPCs.
- [ ] Apply the migration locally and rerun the integration file; expect all shoe integration assertions to pass.
- [ ] Because the first migration is already applied locally, keep the follow-up migration. Have it preflight existing rows and raise a clear exception without rewriting data before applying the strict constraint and validators; verify both its no-invalid-row path and its rollback behavior with temporary rows inside a transaction.

### Task 2: Add typed, localized form input

**Files:**
- Create: `alzan-fe/src/modules/training/helpers/runningShoeInitialKilometers.ts`
- Create: `alzan-fe/src/modules/training/helpers/runningShoeInitialKilometers.spec.ts`
- Modify: `alzan-fe/src/modules/training/services/runningShoesService.ts`
- Modify: `alzan-fe/src/screens/settings/RunningShoesSettingsScreen.tsx`
- Modify: `alzan-fe/src/i18n/locales/en.ts`
- Modify: `alzan-fe/src/i18n/locales/es.ts`

- [ ] Add parser assertions first: blank input returns `0`, `12,5` returns `12.5`, and the serialized form of `1e-7` remains valid; reject negatives, malformed values, nonfinite input, values above `1e305`, and meter-conversion overflow. Run the focused helper check and confirm the new assertions fail before implementation.
- [ ] Implement a small parser returning `number | null`; normalize a decimal comma, accept finite values from `0` through `1e305` km, preserve valid scientific notation from JavaScript number serialization, and treat blank input as zero.
- [ ] Add `initial_km` to the service input types and selected shoe columns, and pass it as `p_initial_km` to both create and update RPC calls.
- [ ] Add state that resets to blank on create/reset and loads `shoe.initial_km` on edit; validate through the parser before save and show a translated validation alert on invalid input.
- [ ] Add the decimal-pad field and an `accessibilityLabel`, plus helper text explaining that it covers only distance not registered in Alzan and is added to the recommended-limit total; keep it visible in create and edit forms.
- [ ] Add matching English and Spanish translation keys for the field label, explanation, and invalid-value message.
- [ ] Add `verify:running-shoes` to `alzan-fe/package.json` to run `runningShoeInitialKilometers.spec.ts` and `runningShoeMileage.spec.ts`; add a CI step in `.github/workflows/code-quality.yml` to run it from `alzan-fe`.
- [ ] Run `pnpm --prefix alzan-fe run verify:running-shoes` and `pnpm --prefix alzan-fe run typecheck`; expect parser checks and typecheck to pass.

### Task 3: Regenerate types and verify the complete change

**Files:**
- Generated: `supabase/database.types.ts`
- Generated: `alzan-fe/src/types/database.types.ts`
- Generated: `alzan-be/src/types/database.types.ts`

- [ ] Run `pnpm run supabase:types` with the local database containing the new migration; confirm the new table column and optional RPC arguments appear in generated types.
- [ ] Run `pnpm format`, `pnpm run lint:check`, and `pnpm run verify:import-review`; report an import-review skip if local Supabase is unavailable.
- [ ] Run `pnpm --prefix alzan-fe run typecheck`, `supabase test db supabase/tests/running_shoes.integration.sql`, and `pnpm --prefix alzan-fe run verify:running-shoes`.
- [ ] Manually verify in the local web/PWA settings flow: create a pair with `12.5` initial km, confirm its total and wear warning, edit the base, and confirm the mileage changes while the history session count does not.
