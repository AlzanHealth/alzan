# Exercise alternatives implementation plan

**Goal:** Add useful, conservative suggestions to the existing active-workout replacement flow requested by the user.
**Architecture:** A pure deterministic movement classifier ranks visible exercises with the same primary muscle and compatible time/repetition metric. A service fetches small candidate columns in pages, respects RLS and personal overrides, and hydrates only the best twelve through the existing exercise hook. The existing confirmation and draft replacement remain authoritative.
**Tech stack:** React Native / Expo, TypeScript, React Query, Supabase SDK; no external AI, new dependency or schema migration.

## Approved interaction

The user selected the proposed equivalent-exercise feature. Extend the current Replace action with Suggested alternatives (default) and Search all. Show the source exercise, reasons and an explanation that weights need adjustment. Prefer different equipment for an occupied machine. Never label arbitrary same-muscle exercises as equivalents. Preserve the manual flow and block replacement of completed or executing exercises as today. This first version applies to the active session and its organization view; it does not automatically rewrite a saved routine.

## Tasks and evidence

- [x] Add regression tests for movement classification, muscle/metric mismatch, unknown patterns, excluded/current/archived exercises, deterministic ranking, bilingual names and bounded output.
- [x] Implement the pure classifier/ranker in `alzan-fe/src/modules/training/helpers/exerciseAlternatives.ts`; do not infer movements from descriptions or personalized aliases of Alzan exercises.
- [x] Fetch candidate rows with Supabase RLS in `services/exerciseAlternativesService.ts`, combining original-muscle rows and personal overrides moved into this muscle. Preserve cleared optional fields and remove moved-out rows. Page queries at 500, hydrate only selected candidates.
- [x] Add `hooks/useExerciseAlternatives.ts` with user-scoped cache and explicit loading/error/retry handling.
- [x] Pass the source exercise in typed navigation from ActiveWorkoutScreen; add suggestion/manual tabs and per-card reasons to ExerciseSearchScreen, using existing selection and confirmation paths. Exclude all exercises already in the session.
- [x] Add matching Spanish/English strings. Keep suggested loads empty using existing substitution behavior.
- [x] Run engine tests, existing workout replacement tests, type checks and local quality gate; verify the real browser flow against local Supabase. Run an independent review, fix concrete defects and remove only disposable QA data.

## Acceptance

A normal bench press can suggest another chest press on different equipment, not a fly, shoulder press, timed movement or already selected exercise. Unknown/custom names never produce invented movement matches. A failed suggestion query offers retry and full search. Selecting a suggestion opens the existing confirmation, resets load, preserves session organization and leaves the saved routine/history intact. No published/private catalog behavior changes.

## Verification evidence

- `verify:exercise-alternatives`, `verify:active-workout`, `verify:exercise-catalog` and `verify:exercise-history` pass.
- Root format/lint, FE and BE type checks, and local import-review integration (13 cases) pass.
- Real local browser: source barbell bench press, suggestions from local Supabase, dumbbell press selection, confirmation, three sets/eight reps retained, typed 42.5 kg cleared, template unchanged. New exercise survives minimizing/reopening the session.
- Mobile viewport 390×844: manual/suggested tabs, dark-theme metadata contrast and full last-row clearance verified. This is browser sizing, not a physical iPhone test.
- Unknown/compound/advanced movement exclusion covered by deterministic tests. Network failure has error/retry UI and static review; an actual offline interruption was not simulated.
- QA session canceled through the product; temporary template removed locally. No production deployment or schema changes.
