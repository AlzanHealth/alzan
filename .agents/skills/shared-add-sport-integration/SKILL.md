---
name: shared-add-sport-integration
description: Use when adding a new sport end-to-end in Alzan across the existing providers (Garmin, Suunto, Polar, Strava, Fitbit, Oura, Ultrahuman, WHOOP, Google Fit legacy, Apple Health, Health Connect, COROS), so database enums, backend parsers/mappers, frontend sport UX (color, icon, templates), analytics, exports, tests, and docs stay aligned without regressions.
---

# Add a new sport (end-to-end)

## Purpose

Use this skill to add a new sport safely across Alzan FE + BE + Supabase for the existing providers.

Hard goal:
- No partial additions.
- No enum/type drift.
- No "works in one screen but breaks in import/stats/export".

## Definition of Done

A sport is done only when all conditions are true:
- It exists in DB enums and generated types.
- It can be created manually in app with unique color + icon.
- It appears correctly in training flows (builder, form, detail, list, calendar, home).
- Imports map correctly for supported providers, with explicit fallback for unsupported ones.
- Templates/goals behavior is decided and implemented (or explicitly marked not required).
- Analytics and training PDF export include the new sport.
- Tests pass and docs are updated.

## Phase A - Pre-decisions (mandatory before code)

Decide and write these values first:
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

## Phase B - DB and Supabase

1. Enums and migrations
- Update `sport_type_enum` and `sport_subtype_enum` when needed.

2. Check dependent tables and contracts
- Validate usage in:
  - `activity_sessions`,
  - `endurance_workout_templates`,
  - goal/config tables and references using sport enums.

3. Regenerate and sync types
- Regenerate and verify:
  - `supabase/database.types.ts`,
  - `supabase/requests.types.ts`,
  - FE/BE derived type files using `SportType`/`SportSubtype`.

4. Seed coverage
- Add minimal seed rows to verify:
  - manual session for new sport,
  - template rows if applicable,
  - provider mapping example when applicable.

## Phase C - Backend import and providers

1. Parsers/mappers
- Update provider mappers:
  - Garmin
  - Suunto
  - Polar
  - Strava
  - Fitbit
  - Oura
  - Ultrahuman
  - WHOOP
  - Google Fit legacy
  - Apple Health
  - Health Connect
  - COROS
  - generic mapper fallback.
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
- Add unique color in `SPORT_COLORS`.
- Add icon mapping in `SportIcon` (and any secondary icon map used in Alzan cards).
- Add config entry in `SPORTS_CONFIG`:
  - label key,
  - required input fields,
  - metric logic,
  - display formatting behavior.

2. Training screens and flows
- Review and update all sport-dependent surfaces:
  - activity type selector,
  - endurance builder,
  - session form,
  - session detail,
  - sessions list/history filters,
  - calendar views,
  - training home cards,
  - Alzan home highlights if applicable.

3. Template decision
- If structured endurance is needed:
  - include in template creation and step flows.
- If simple sport:
  - ensure manual duration/distance flow is coherent.

4. i18n
- Add ES/EN keys for sport name and related labels/messages.
- Avoid hardcoded strings.

## Phase E - Stats, ranking, exports

- Confirm sport appears in:
  - training analytics/stats,
  - sport filters and summaries,
  - training PDF export formatting and grouping.
- Confirm no chart/filter fallback to `other` unless intentionally configured.

## Phase F - Testing checklist

1. Manual session path
- Create manual session for new sport in app.
- Verify history, detail, calendar, and home card rendering with correct color/icon.

2. Provider import path (when applicable)
- Import payloads per supported provider.
- Verify mapped `sport_type` is correct.
- Verify unsupported provider case uses explicit fallback (not accidental).

3. Template path
- Verify template visibility/creation for the new sport when applicable.
- Verify no regressions for `strength` and existing simple sports.

4. Regression checks
- Existing sports imports and UI still behave correctly.

## Phase G - Docs update

- Update integration/import docs with the new sport mapping rules.
- Update technical changelog notes for FE/BE/DB impacts.
- Record any provider-specific caveats.

## Provider x Sport matrix (required artifact)

For every change, create/update a matrix with this schema:
- Provider: `garmin | suunto | polar | strava | fitbit | oura | ultrahuman | whoop | google_fit | apple_health | health_connect | coros`
- Sport key: `<sport_type>`
- Status:
  - `mapped`,
  - `fallback to other`,
  - `not supported yet`
- Mapping rule notes:
  - exact provider sport token(s),
  - fallback condition,
  - confidence caveats.

## Common failure modes (must review before merge)

- Sport added in FE but missing in DB enum.
- Enum migrated but Supabase types were not regenerated.
- Color/icon not configured, leading to generic fallback visuals.
- Provider mapper incomplete, silently mapping to `other`.
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
3. Update backend mappers/parsers/providers (Phase C).
4. Update FE sport identity + screens + i18n (Phase D).
5. Verify stats/export (Phase E).
6. Run tests and regressions (Phase F).
7. Update docs + matrix artifact (Phase G).
8. Pass full quality gate.
