---
name: shared-add-sport-integration
description: Use when adding a sport or modifying any sport-dependent behavior in Alzan, including subtypes, provider mappings, fallbacks, templates, UI, analytics, or exports.
---

# Add or modify a sport (end-to-end)

## Purpose

Use this skill whenever work adds a sport or changes anything sport-dependent for an existing sport across Alzan FE + BE + Supabase.

Trigger this skill for:
- New `sport_type` or `sport_subtype` values.
- Changed provider tokens, mappings, or fallbacks for an existing sport.
- Changed templates, metric behavior, color/icon, labels, filters, analytics, exports, or display rules for an existing sport.
- Fixes or refactors that can alter how any sport is created, imported, stored, or shown.

Hard goal:
- No partial additions.
- No partial modifications.
- No enum/type drift.
- No "works in one screen but breaks in import/stats/export".

Provider review rule:
- Every new or modified sport requires an explicit review of every current provider integration and the generic fallback, even when only one mapper is expected to change.
- A provider recorded as already correct, intentionally falling back, unsupported, or unaffected is still a reviewed provider.
- Silence is not verification: document every provider result in the Provider x Sport matrix.
- Derive the active-provider checklist from `alzan-be/src/components/providers/providers.types.ts` and `alzan-be/src/components/activity-import/parsers/activity-import-canonical.parser.ts`; update this skill when those sources gain or remove an integration.
- `manual` is a creation source, not a provider integration; verify it in the manual-session path instead of the provider matrix.

## Definition of Done

A sport addition or modification is done only when all conditions are true:
- Its canonical type/subtype and DB/type contracts are correct, updating enums only when required.
- Its manual creation and display behavior is correct in the app, including color and icon when applicable.
- It appears correctly in affected training flows (builder, form, detail, list, calendar, home).
- Every provider in this skill and the generic fallback have been reviewed and recorded in the matrix.
- Imports map correctly for supported providers, with explicit fallback for unsupported ones.
- Templates/goals behavior is decided and implemented, preserved, or explicitly marked not required.
- Analytics and training PDF export represent the new or modified behavior correctly.
- Tests pass and docs are updated.

## Phase A - Pre-decisions and impact (mandatory before code)

Confirm or decide and write these values first:
- `sport_type` canonical key (lowercase, stable, no aliases in DB).
- Optional `sport_subtype` usage.
- Main metric model:
  - pace based,
  - speed based,
  - distance+duration only,
  - duration only.
- Unit behavior:
  - land pace (min/km, min/mi),
  - swim pace (/100m, /100yd),
  - cycling speed (km/h, mph),
  - other custom.
- Template behavior:
  - endurance structured template required,
  - simple sport flow only.
- Fallback behavior:
  - when provider cannot map precisely, use explicit fallback (`other` or agreed fallback sport).
- For modifications to an existing sport, state what behavior changes and what must remain unchanged.

## Phase B - DB and Supabase

1. Enums and migrations
- Update `sport_type_enum` and `sport_subtype_enum` only when required by the addition or modification.

2. Sport Catalog Options
- Insert or update the sport's goals, modalities, and terrains in the `sport_catalog_options` table via a database migration.
- Ensure that the options represent the dynamic configuration of the sport, separating goals, modalities, and terrains using the correct `option_type` value (`goal`, `modality`, or `terrain`).
- Assign descriptive and structured translation keys (e.g. `training.sportOptionPower`) and specify appropriate `sort_order` values.

3. Check dependent tables and contracts
- Validate usage in:
  - `activity_sessions`,
  - `endurance_workout_templates`,
  - goal/config tables and references using sport enums.

4. Regenerate and sync types
- Regenerate and verify:
  - `supabase/database.types.ts`,
  - `supabase/requests.types.ts`,
  - FE/BE derived type files using `SportType`/`SportSubtype`.

5. Seed coverage
- Add or update minimal seed rows/fixtures to verify:
  - manual session for the new or modified sport,
  - template rows if applicable,
  - provider mapping example when applicable.

## Phase C - Backend import and providers

1. Parsers/mappers
- Review every provider mapper for every added or modified sport. Update code where mapping behavior changes; record `reviewed, no change required` where it does not:
  - Garmin
  - Suunto
  - Polar
  - Strava
  - Fitbit
  - Oura
  - Ultrahuman
  - WHOOP
  - Apple Health
  - Health Connect
  - COROS
  - generic mapper fallback.
- Review `Google Fit legacy` only when the change touches historical Google Fit payloads, compatibility contracts, or a reintroduced Google Fit mapper; it is not present in the current activity-provider dispatcher.
- Do not restrict the review to the provider mentioned in the request or the mapper that first exposed a bug.
- Ensure canonical parser and route parser include the sport where applicable.

2. Canonical activity validation
- Confirm final canonical payload correctness:
  - `provider`,
  - `providerActivityId`,
  - `sportType`,
  - `sportSubtype`,
  - `summary`,
  - `streams` and `laps` if present,
  - HR zones behavior if present.

## Phase D - Frontend sport experience

1. Core sport identity (mandatory)
- Add or confirm unique color in `SPORT_COLORS`.
- Add or confirm icon mapping in `SportIcon` (and any secondary icon map used in Alzan cards).
- Add or confirm config entry in `SPORTS_CONFIG`:
  - label key,
  - required input fields,
  - metric logic,
  - display formatting behavior.

2. Sport Catalog Hook Usage
- Verify that screens displaying sport goals, modalities, or terrains (e.g., endurance builder, session details, templates list, calendar summaries) fetch their options dynamically using the `useSportCatalog` hook (`getOptions`, `getOptionLabel`, `getGroupLabel`).
- Avoid hardcoding arrays or structures of goals/modalities/terrains on any UI screen.
- Ensure any legacy or compatibility options mapping is added/updated in the `LEGACY_TRANSLATION_KEYS` map within `alzan-fe/src/hooks/useSportCatalog.ts` if needed.

3. Training screens and flows
- Review all sport-dependent surfaces and update those affected by the behavior change:
  - activity type selector,
  - endurance builder,
  - session form,
  - session detail,
  - sessions list/history filters,
  - calendar views,
  - training home cards,
  - Alzan home highlights if applicable.

4. Template decision
- If structured endurance is needed:
  - include in template creation and step flows.
- If simple sport:
  - ensure manual duration/distance flow is coherent.

5. i18n
- Add ES/EN keys for sport name and related labels/messages.
- Include translations for all option keys inserted into the `sport_catalog_options` table.
- Avoid hardcoded strings.

## Phase E - Stats, ranking, exports

- Confirm the new or modified sport behaves correctly in:
  - training analytics/stats,
  - sport filters and summaries,
  - training PDF export formatting and grouping.
- Confirm no chart/filter fallback to `other` unless intentionally configured.

## Phase F - Testing checklist

1. Manual session path
- Create or update a manual session for the new or modified sport in app.
- Verify history, detail, calendar, and home card rendering with correct color/icon.

2. Provider import path (mandatory audit; executable fixture where applicable)
- For every provider in the matrix, check whether the new or modified sport maps correctly, remains unchanged, deliberately falls back, or is unsupported.
- Import/run payload fixtures for providers whose sport path exists or whose mapping changes.
- Record review-only providers explicitly when no executable provider path applies.
- Verify unsupported provider cases use an explicit fallback, not an accidental one.

3. Template path
- Verify template visibility/creation for the new sport when applicable.
- Verify no regressions for `strength` and existing simple sports.

4. Regression checks
- Existing behavior for a modified sport remains correct outside the intended change.
- Existing sports imports and UI still behave correctly.

## Phase G - Docs update

- Update integration/import docs with new or changed sport mapping rules.
- Update technical changelog notes for FE/BE/DB impacts.
- Record any provider-specific caveats.

## Provider x Sport matrix (required artifact)

For every sport addition or modification, create/update a row for every provider below, even if code does not change in that provider. No provider may be omitted.

Required integration audit:
- [ ] Garmin
- [ ] Suunto
- [ ] Polar
- [ ] Strava
- [ ] Fitbit
- [ ] Oura
- [ ] Ultrahuman
- [ ] WHOOP
- [ ] Apple Health
- [ ] Health Connect
- [ ] COROS
- [ ] Generic mapper fallback

Matrix schema:
- Provider: `garmin | suunto | polar | strava | fitbit | oura | ultrahuman | whoop | apple_health | health_connect | coros`
- Sport key: `<sport_type>`
- Status:
  - `mapped (changed)`,
  - `mapped (reviewed, unchanged)`,
  - `fallback to other (intentional)`,
  - `not supported yet (confirmed)`,
  - `not affected (reviewed)` for non-import sport behavior changes.
- Mapping rule notes:
  - exact provider sport token(s),
  - fallback condition,
  - confidence caveats,
  - files/tests inspected or justification when no code change is required.

Record the generic mapper fallback alongside the matrix, using the same status and notes fields.

Conditional legacy check:
- If historical Google Fit input/contracts are affected or Google Fit is reintroduced, add `google_fit` to the matrix and review it with the same standard.

## Common failure modes (must review before merge)

- Sport added in FE but missing in DB enum.
- Enum migrated but Supabase types were not regenerated.
- Sport options missing from `sport_catalog_options` database table.
- Option keys added in `sport_catalog_options` but missing translations in `en.ts` or `es.ts`.
- Options hardcoded in UI screens instead of using the `useSportCatalog` hook.
- Color/icon not configured, leading to generic fallback visuals.
- Provider mapper incomplete, silently mapping to `other`.
- Existing sport changed in one mapper or UI surface without checking the remaining integrations.
- Provider omitted from the matrix because it was assumed unrelated.
- Sport missing from history filters, calendar summaries, analytics, or PDF export.
- Template flow broken because sport metric model was not decided early.

## Quality gate (mandatory)

Run all commands:
- `pnpm --prefix alzan-fe run typecheck`
- `pnpm --prefix alzan-fe run format:check`
- `pnpm --prefix alzan-fe run lint:check`
- `pnpm --prefix alzan-be run typecheck`
- `pnpm --prefix alzan-be run format:check`
- `pnpm --prefix alzan-be run lint:check`
- `pnpm format`
- `pnpm run lint:check`

If any command fails:
- Do not mark sport integration as complete.
- Fix first, rerun full gate.

## Quick execution order (copy/paste guide)

1. Lock pre-decisions (Phase A).
2. Apply DB enum/migration and regenerate types (Phase B).
3. Audit all provider mappers/fallback and update affected mappings (Phase C).
4. Update FE sport identity + screens + i18n (Phase D).
5. Verify stats/export (Phase E).
6. Run tests and regressions (Phase F).
7. Update docs + matrix artifact (Phase G).
8. Pass full quality gate.
