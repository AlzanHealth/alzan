# Cardio Zones by Sport and Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show saved heart-rate zone durations for the selected sport and analysis period, comparing its recent and earlier windows.

**Architecture:** Reuse the existing session IDs produced by the cardio period selector and query `activity_heart_rate_zones` only for providers whose mapper guarantees direct provider-reported zones. Aggregate valid stored durations separately for each window and render a compact comparison inside the sport analysis card; apply the same provider filter to the global seven-day summary. Until zone provenance is persisted, WHOOP is the only provider admitted by the current mapper audit.

**Tech Stack:** Expo/React Native, TypeScript, React Query, Supabase client, i18next, existing health-card and heart-rate-zone styles.

---

## Files and responsibilities

- `alzan-fe/src/modules/health/algorithms/cardioEvolution.ts`: aggregate stored zone durations for a session-ID set, with the same zone and duration validation as the weekly summary.
- `alzan-fe/src/modules/health/hooks/useCardioEvolution.ts`: load zone rows for the selected sport and both selected period windows; expose separate error/data fields so this query cannot overwrite the global seven-day result.
- `alzan-fe/src/modules/health/components/CardioEvolutionSection.tsx`: show Z1–Z5 with recent and earlier durations and bars inside the selected sport card; preserve the global summary below.
- `alzan-fe/src/i18n/locales/es.ts` and `alzan-fe/src/i18n/locales/en.ts`: clarify that only direct provider-reported totals are displayed and import-time estimates are omitted.
- `alzan-fe/src/components/icons/SportIcon.tsx`: no change expected; confirm the existing `gym` dumbbell mapping and the selector’s `strength` alias.

## Task 1: Extend the selected sport-period detail query

**Files:**
- Modify: `alzan-fe/src/modules/health/hooks/useCardioEvolution.ts`

- [x] Reuse `sessionIdsByPeriod.recent` and `sessionIdsByPeriod.previous`, which already come from `getCardioEvaluationSessionIds` for the selected normalized sport and period.
- [x] Filter the two ID lists to providers whose mapper guarantees direct provider-reported zones, then fetch their union through `loadZoneTimes`.
- [x] Return independent `periodZoneTimes` summaries and `periodZoneDataError`; keep empty periods and query errors isolated from laps, strength data, and the cardio summary.
- [x] Apply the same verified-provider filter to the global weekly zone query and keep `zoneDataError` isolated.

## Task 2: Aggregate and render the comparison

**Files:**
- Modify: `alzan-fe/src/modules/health/algorithms/cardioEvolution.ts`
- Modify: `alzan-fe/src/modules/health/components/CardioEvolutionSection.tsx`

- [x] Add a typed helper that accepts saved zone rows and session IDs, sums only integer zones 1–5 with finite positive durations, and returns a five-value duration tuple plus an availability flag.
- [x] Aggregate recent and earlier totals independently using eligible session IDs.
- [x] Insert a “time in heart-rate zones” block after `CardioDimensionSummary` and before the explanation divider.
- [x] Render the five existing zone colors and translated labels with recent/earlier duration columns; scale bars against the largest duration across both windows.
- [x] Show distinct no-data and load-error messages; do not infer zone totals from average/max HR or recalculate thresholds in the frontend.
- [x] Keep the global seven-day zone distribution and apply the same eligible-provider filter.
- [x] Confirm that both `gym` and the `strength` selector alias continue to use the dumbbell icon.

## Task 3: Make the data source limitation clear

**Files:**
- Modify: `alzan-fe/src/i18n/locales/es.ts`
- Modify: `alzan-fe/src/i18n/locales/en.ts`

- [x] Update the zone-source note in both locales to say only direct provider totals are shown and import-time estimates are omitted.
- [x] Keep all user-facing strings translated and explain that some devices do not provide a verifiable breakdown.

## Verification

- [x] Run `pnpm format` and inspect its changed-file list; no unrelated files were modified.
- [x] Run FE and BE typecheck, format check, and lint check; run root `pnpm run lint:check`.
- [x] Run `pnpm run verify:import-review`; it safely skipped because the configured Supabase URL is remote.
- [x] Run `git diff --check` and inspect the final diff; no backend, migration, or unrelated-file changes were made.
- [x] Do not add or run automated tests under the current instruction scope. Do not change backend code, schema, migrations, or production data.

## Self-review

- The selected activity IDs ensure the sport and period match the existing analysis; the `all` option follows its existing recent/earlier history split.
- Only provider-reported totals from audited providers are included; currently this is WHOOP. Other sources may show no zone data until provenance is stored or their mappers can guarantee direct totals.
- An error is not presented as zero, and the global seven-day summary is isolated from the detail query.
- All sports use the same zone-row rendering; no sport mapping, provider classification, or workout creation behavior changes.
