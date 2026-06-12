# External Activity Import Decision Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository, also obey `shared-no-commit-without-approval`: do not commit, push, tag, rebase, reset, or delete branches unless the user explicitly approves that action in the current thread.

**Goal:** Implement the full external activity import behavior described in the three PDFs: always create a real completed activity for new external records, detect duplicates, match endurance templates by structure or totals, handle strength imports without losing sets, and always expose an editable Strava-style summary.

**Architecture:** Add a backend decision layer in front of the existing canonical activity writer so every automatic wearable import goes through the same rules. Persist user-facing pending decisions in a dedicated `activity_import_reviews` table, then let the frontend render and resolve those reviews from the session detail screen.

**Tech Stack:** NestJS, Supabase/Postgres migrations, React Native/Expo, TanStack Query, Supabase generated/request types, existing activity import parsers and wearable canonical writer.

---

## Prompt Para Claude

Copia y pega este bloque como primer mensaje para Claude junto con este documento:

```text
Eres Claude trabajando en el repo /Users/josep/Projects/alzan. Lee primero AGENTS.md, alzan-fe/AGENTS.md, alzan-be/AGENTS.md y .agents/skills/README.md. Usa las skills indicadas por el repo: shared-no-commit-without-approval, shared-writing-plans/ejecucion, shared-nestjs-expert-developer, shared-nestjs-patterns, shared-backend-patterns, shared-api-design, shared-database-schema, shared-supabase-expert-developer, shared-supabase-postgres-best-practices, shared-security-review, fe-react-native-expert-developer, fe-mobile-ui-ux-direction, fe-react-native-best-practices, fe-manage-translations, shared-pnpm-quality-gate y shared-verification-before-completion.

No hagas commits. Implementa el plan de este documento task-by-task, manteniendo cambios pequeños y verificables. Antes de editar, inspecciona los archivos mencionados para confirmar que siguen igual. Si algo ha cambiado, adapta el plan al estado real del repo y documenta la adaptación. Respeta los PDFs fuente: "AH-Logica importación de entrenos general-110626-145200.pdf", "AH-Importación de Actividades Endurance-110626-145325.pdf" y "AH-Importación de Actividades Gimnasio-110626-145449.pdf".

Resultado esperado: una importación externa nueva crea una sesión real completada, calcula duplicados/matches, persiste revisiones pendientes cuando el usuario debe decidir, auto-asocia sólo cuando el score lo permite, preserva los sets de gimnasio, permite resolver decisiones desde la pantalla de detalle y pasa la quality gate del repo.
```

---

## Fuentes Y Evidencia Local

PDFs entregados por el usuario:

AH-Logica importación de entrenos general-110626-145200.pdf`
AH-Importación de Actividades Endurance-110626-145325.pdf`
AH-Importación de Actividades Gimnasio-110626-145449.pdf`

Archivos locales ya inspeccionados:

- Backend import manual: `alzan-be/src/components/activity-import/activity-import.service.ts`
- Backend import manual controller: `alzan-be/src/components/activity-import/activity-import.controller.ts`
- Backend canonical model: `alzan-be/src/components/activity-import/parsers/activity-import-canonical.types.ts`
- Backend writer automatico: `alzan-be/src/components/wearables/services/canonical-activity-writer.service.ts`
- Backend dedupe actual: `alzan-be/src/components/wearables/services/dedupe.service.ts`
- Backend wearable module: `alzan-be/src/components/wearables/wearables.module.ts`
- Frontend upload helper: `alzan-fe/src/services/activityImportApi.ts`
- Frontend strength import hook: `alzan-fe/src/hooks/useStrengthActivityImport.ts`
- Frontend session detail: `alzan-fe/src/screens/training/EnduranceSessionDetailScreen.tsx`
- Frontend session detail hook: `alzan-fe/src/hooks/useSessionDetail.ts`
- Existing docs: `docs/activity-import-suunto-garmin-guide.md`, `docs/activity-import-verification.md`
- Schema base: `supabase/migrations/20260110171026_remote_schema.sql`
- Wearables provenance: `supabase/migrations/20260513100000_wearables_phase1_provenance_sync.sql`
- Wearables detail tables: `supabase/migrations/20260513101000_wearables_phase2_activity_detail.sql`
- Strength metrics migration: `supabase/migrations/20260504183000_add_strength_import_metrics_to_activity_sessions.sql`

Relevant current tables:

- `activity_sessions`: real activity rows. Has `sport_type`, `status`, `visibility`, `source`, `provider`, `provider_activity_id`, `source_record_id`, `raw_payload_id`, metrics, `workout_template_id`, `endurance_template_id`.
- `activity_laps`: imported laps/splits. Has `split_group`, `split_distance_m`, pace and HR fields.
- `activity_streams`, `activity_stream_samples`, `activity_route_points`: imported streams and route details.
- `activity_heart_rate_zones`: HR zone summary.
- `endurance_workout_templates`: endurance templates with `sport_type`, `base_name`, `total_distance_m`, `total_duration_s`, `workout_goal`, `scheduled_day`.
- `endurance_workout_steps`: structured template steps with `phase_type`, `duration_type`, `duration_s`, `distance_m`, `target_type`, `target_min`, `target_max`, `repetitions`, `parent_step_id`, `is_group`.
- `workout_templates`: strength templates.
- `workout_template_exercises`: strength template structure.
- `workout_sets`: strength session structure. These are app-owned and must be preserved.

---

## Functional Requirements From The PDFs

### Global Rules

- A new external activity always creates a real completed session. Do not block creation because there is no template match.
- The created session appears in the calendar as completed, with a generic name when no template is associated.
- The external activity data is the source of truth for real metrics: distance, duration, pace/speed, heart rate, calories, route, laps, streams, provider metadata.
- A template is an objective, not the activity itself. Templates may provide display name, goal/objective text, and future AI context, but must not overwrite real metrics.
- Never overwrite, merge, or delete user information without an explicit user action.
- Always expose a Strava-style summary in the activity detail screen:
  - edit name
  - associate template
  - change template association
  - remove template association
  - merge/fuse duplicate if applicable
  - apply watch metrics only when a conflict requires consent

### Endurance Rules

Applies to distance-based sports such as running, cycling, swimming, trail, hiking, skiing, and similar sports that use distance, duration, route, laps, or pace.

Decision priority:

1. Check if a completed session exists today for the same sport.
2. If similarity with an existing same-sport completed session is at least 80%, create the imported session but show a high-priority duplicate review.
3. If structured laps/intervals exist, calculate structural match against templates.
4. If no structured laps/intervals exist, calculate match by totals.
5. Apply auto-match, suggestion, or generic state.
6. Always show editable summary.

Duplicate behavior:

- Same-sport duplicate score `>= 80`: show high-priority review saying it looks like the same workout and offer merge/keep both.
- Same-sport duplicate score `< 80`: show a subtle notice that another workout of that sport exists today and allow manual merge later.
- If the user declines merging, both sessions remain.

Structured template match:

- Use this when external activity has structured laps/intervals.
- Compare:
  - repetition count, weight 40%
  - distance per repetition, weight 30%
  - pace per repetition, weight 20%
  - recovery duration/distance, weight 10%
- Tolerances:
  - repetitions: `<= 10%` strong, `10-20%` possible, `> 20%` no structural match
  - repetition distance: `<= 10%` valid, `10-20%` possible, `> 20%` no structural match
  - repetition pace: `<= 15%` valid, above that weak/possible depending on total score
- Score interpretation:
  - `>= 80`: auto-associate template and mark planned template as completed in calendar
  - `60-79`: keep imported session generic and show highlighted suggestion
  - `< 60`: keep generic with a small manual association action
- If structured score exists, it overrides totals score.

Totals template match:

- Use when there are no structured laps/intervals.
- Compare:
  - total distance, weight 50%
  - average pace/speed, weight 30%
  - total duration, weight 20%
- Score interpretation:
  - `>= 80`: auto-associate
  - `60-79`: suggested association
  - `< 60`: generic

### Strength Rules

Applies to external activity `sport_type = strength`.

Source of truth:

- Alzan app owns exercise structure: exercises, `workout_sets`, reps, weight, RPE, target template.
- Watch/app external source owns session metrics: duration, kcal, average/max/min HR, physiological aggregates.
- The watch does not create exercises or sets automatically.

Case A: no strength session today:

- Automatically create a new completed generic strength session with watch metrics.
- Default name: `Entrenamiento de fuerza` in Spanish UI and equivalent translation in English.
- Do not create sets.
- Detail screen shows a review action to associate a strength template.
- If the user associates a template and the session has no sets, show an action to complete exercises now.
- Completing exercises must use a new post-workout set entry flow. Do not reuse the active-workout timer/rest flow because the workout is already completed.

Case B: exactly one strength session today:

- If the existing session is completed:
  - associate external activity with that session automatically as the logical candidate.
  - if existing metrics are empty, apply watch metrics.
  - if metrics conflict, do not overwrite silently; create a metric conflict review.
- If the existing session is in progress or not completed:
  - associate external activity with that session.
  - mark it completed using external `end_time`/duration.
  - apply watch metrics.
  - if it has no sets, show a subtle complete-exercises action.

Case C: several strength sessions today:

- Create a new completed generic strength session with watch metrics.
- Detail screen shows a priority review asking which strength session it corresponds to.
- Options:
  - associate to session A
  - associate to session B
  - keep as new workout
- If the user associates to an existing session, delete the newly created generic imported session only after the target session has been updated successfully.

Case D: possible strength duplicate `>= 80`:

- Similarity may use duration, calories, and HR pattern/summary.
- Never merge automatically.
- If user confirms merge:
  - preserve app-owned sets/structure from the interactive session when present
  - use watch-owned metrics from the imported activity
  - remove the duplicate session after the target has been updated

Case E: external sport is not strength:

- Do not auto-associate with strength sessions.
- Create a generic session for the received sport.
- A manual advanced association can exist later, but it must not happen automatically.

---

## Critical Implementation Decision

The current `CanonicalActivityWriterService.upsertActivity()` writes or updates `activity_sessions` directly. That is not enough for the PDFs because user-visible decisions must be created before overwriting or merging anything.

Implement a new decision layer and route all automatic cloud/local activity writes through it:

```text
Provider parser
  -> CanonicalActivity
  -> ActivityImportDecisionService
      -> creates/updates activity_sessions safely
      -> calculates duplicate/template/strength reviews
      -> writes activity_import_reviews
      -> delegates low-level stream/lap/route persistence to CanonicalActivityWriterService helpers
  -> returns imported session id
```

Keep idempotency for exact same external provider record:

- If the same `provider + source_channel + source_package + source_record_id/provider_activity_id` is reprocessed by a sync retry, do not create endless duplicate sessions.
- Duplicate review logic applies when the incoming activity is a new external record or a manual re-import that does not have the same strong identity.
- This preserves wearable sync stability while still following the product rule that a new external activity is never silently merged into a user session.

---

## Proposed Data Model

Create a new migration:

```text
supabase/migrations/20260611160000_create_activity_import_reviews.sql
```

Add table:

```sql
CREATE TABLE IF NOT EXISTS public.activity_import_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  imported_session_id uuid NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
  candidate_session_id uuid REFERENCES public.activity_sessions(id) ON DELETE SET NULL,
  endurance_template_id uuid REFERENCES public.endurance_workout_templates(id) ON DELETE SET NULL,
  workout_template_id uuid REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  review_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'normal',
  score numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT activity_import_reviews_review_type_check CHECK (
    review_type IN (
      'duplicate_session',
      'same_sport_notice',
      'endurance_template_suggestion',
      'endurance_template_confirmation',
      'strength_candidate_session',
      'strength_metric_conflict',
      'strength_complete_sets',
      'manual_template_association'
    )
  ),
  CONSTRAINT activity_import_reviews_status_check CHECK (
    status IN ('pending', 'resolved', 'dismissed')
  ),
  CONSTRAINT activity_import_reviews_priority_check CHECK (
    priority IN ('low', 'normal', 'high')
  )
);

CREATE INDEX IF NOT EXISTS idx_activity_import_reviews_user_status
ON public.activity_import_reviews (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_import_reviews_imported_session
ON public.activity_import_reviews (imported_session_id, status);

ALTER TABLE public.activity_import_reviews ENABLE ROW LEVEL SECURITY;
```

Add RLS policies matching existing owner-scoped tables:

```sql
CREATE POLICY "Users can view own activity_import_reviews"
  ON public.activity_import_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity_import_reviews"
  ON public.activity_import_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activity_import_reviews"
  ON public.activity_import_reviews FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own activity_import_reviews"
  ON public.activity_import_reviews FOR DELETE
  USING (auth.uid() = user_id);
```

Use service-role backend writes for automatic import, but keep RLS correct for frontend reads.

Expected payload shapes:

```ts
type DuplicateSessionPayload = {
  messageKey: "activityImport.duplicateSession";
  sportType: string;
  importedMetrics: ActivityImportMetricSnapshot;
  candidateMetrics: ActivityImportMetricSnapshot;
  comparedAt: string;
};

type EnduranceTemplateSuggestionPayload = {
  matchKind: "structured" | "totals";
  templateName: string;
  scoreBreakdown: Record<string, number>;
};

type StrengthMetricConflictPayload = {
  fields: Array<
    | "duration_s"
    | "calories_kcal"
    | "avg_heart_rate"
    | "max_heart_rate"
    | "min_heart_rate"
  >;
  watchMetrics: ActivityImportMetricSnapshot;
  existingMetrics: ActivityImportMetricSnapshot;
};
```

---

## Backend Files To Create

- `alzan-be/src/components/activity-import/decision/activity-import-decision.types.ts`
  - Shared types for scores, snapshots, review creation, resolution actions.
- `alzan-be/src/components/activity-import/decision/activity-import-scoring.service.ts`
  - Pure scoring functions for endurance totals, endurance structure, same-sport duplicate, strength duplicate, metric conflicts.
- `alzan-be/src/components/activity-import/decision/activity-import-review.service.ts`
  - CRUD helpers for `activity_import_reviews`.
- `alzan-be/src/components/activity-import/decision/activity-import-decision.service.ts`
  - Orchestrates import decisions for `CanonicalActivity`.
- `alzan-be/src/components/activity-import/decision/activity-import-resolution.service.ts`
  - Applies user decisions: merge, keep both, associate template, remove association, apply watch metrics, complete/dismiss.
- `alzan-be/src/components/activity-import/dto/activity-import-review.dto.ts`
  - API DTOs for reviews and resolution.
- `alzan-be/src/components/activity-import/decision/activity-import-scoring.service.spec.ts`
- `alzan-be/src/components/activity-import/decision/activity-import-decision.service.spec.ts`
- `alzan-be/src/components/activity-import/decision/activity-import-resolution.service.spec.ts`

## Backend Files To Modify

- `alzan-be/src/components/activity-import/activity-import.module.ts`
  - Register and export decision/review/resolution/scoring services if needed.
- `alzan-be/src/components/activity-import/activity-import.controller.ts`
  - Add endpoints for fetching and resolving reviews.
- `alzan-be/src/components/activity-import/activity-import.service.ts`
  - Use review/resolution helpers where manual import flows need the same semantics.
- `alzan-be/src/components/wearables/wearables.module.ts`
  - Import `ActivityImportModule` if needed and inject decision service.
- `alzan-be/src/components/wearables/services/canonical-activity-writer.service.ts`
  - Split low-level persistence from orchestration. Keep helper methods for session insert/update, laps, streams, route points, provider fields.
- `alzan-be/src/components/wearables/services/suunto-cloud-sync.service.ts`
- `alzan-be/src/components/wearables/services/polar-access-link.service.ts`
- `alzan-be/src/components/wearables/services/local-health-sync.service.ts`
  - Replace direct writer calls with decision service calls.
- `alzan-be/src/types/database.types.ts`, `alzan-be/src/types/requests.types.ts`
  - Regenerate/copy after migration. If local Supabase generation is unavailable, add narrow overrides to `requests.types.ts` only as a temporary repo pattern, then document the need to regenerate.

## Frontend Files To Create

- `alzan-fe/src/services/activityImportReviewService.ts`
  - Fetch and resolve import reviews using backend endpoints.
- `alzan-fe/src/hooks/useActivityImportReviews.ts`
  - TanStack query/mutation wrappers.
- `alzan-fe/src/modules/training/components/ActivityImportReviewPanel.tsx`
  - Renders review blocks inside session detail.
- `alzan-fe/src/screens/training/CompletedStrengthSetsScreen.tsx`
  - New post-workout set entry flow for completed strength sessions.

## Frontend Files To Modify

- `alzan-fe/src/screens/training/EnduranceSessionDetailScreen.tsx`
  - Show review panel near the top after header/stats.
  - Keep top real metrics visible before template objective.
  - Add manual association/change/remove actions.
  - Add complete-exercises action for strength sessions without sets.
- `alzan-fe/src/navigation/types.ts` or the local training stack type file
  - Add `CompletedStrengthSets` route.
- `alzan-fe/src/navigation/*Training*`
  - Register new screen.
- `alzan-fe/src/i18n/locales/es.ts`
- `alzan-fe/src/i18n/locales/en.ts`
  - Add all user-facing strings.
- `alzan-fe/src/types/requests.types.ts`
  - Regenerate/copy after migration, or add temporary override for `activity_import_reviews`.

## Docs To Modify

- `docs/activity-import-suunto-garmin-guide.md`
  - Add the new decision engine and review table behavior.
- `docs/activity-import-verification.md`
  - Add verification scenarios for endurance/strength decisions.

---

## API Contract

Add authenticated endpoints under existing `ActivityImportController`:

```text
GET /activity-imports/reviews/session/:sessionId
POST /activity-imports/reviews/:reviewId/resolve
```

Resolution request:

```ts
export type ActivityImportReviewAction =
  | "merge_into_candidate"
  | "keep_both"
  | "associate_endurance_template"
  | "associate_strength_template"
  | "remove_template_association"
  | "apply_watch_metrics"
  | "keep_existing_metrics"
  | "dismiss"
  | "complete_sets";

export class ResolveActivityImportReviewDto {
  action!: ActivityImportReviewAction;
  targetSessionId?: string;
  enduranceTemplateId?: string;
  workoutTemplateId?: string;
}
```

Security rules:

- The backend must verify the review belongs to `ctx.user.id`.
- The backend must verify any `targetSessionId`, `enduranceTemplateId`, or `workoutTemplateId` belongs to `ctx.user.id`.
- Never trust IDs from the client without user ownership checks.
- For merge actions, perform update first, verify success, then delete the duplicate session.

---

## Scoring Details

Implement pure functions first and test them independently.

Helper:

```ts
export function scorePercentSimilarity(
  actual: number | null,
  expected: number | null,
  fullMatchTolerancePct: number,
): number {
  if (actual == null || expected == null || expected <= 0) return 0;
  const diffPct = Math.abs(actual - expected) / expected;
  if (diffPct <= fullMatchTolerancePct) return 100;
  if (diffPct >= fullMatchTolerancePct * 2) return 0;
  return Math.round(
    100 * (1 - (diffPct - fullMatchTolerancePct) / fullMatchTolerancePct),
  );
}
```

Endurance totals:

```ts
score = distanceScore * 0.5 + paceScore * 0.3 + durationScore * 0.2;
```

Use `avgPaceSecondsPerKm` when distance and duration exist:

```ts
pace = durationSeconds / (distanceM / 1000);
```

Structural intervals:

- Derive repetitions from provider custom laps when laps are structured. Ignore warmup/cooldown laps where possible.
- Derive template repetitions from `endurance_workout_steps.repetitions` and repeated child/group structure.
- Compare the main repeated work block first. If there are multiple groups, choose the highest scoring group and include the group id/order in payload.

Score:

```ts
score =
  repetitionsScore * 0.4 +
  distancePerRepScore * 0.3 +
  pacePerRepScore * 0.2 +
  recoveryScore * 0.1;
```

Duplicate endurance:

```ts
score =
  startTimeScore * 0.25 +
  durationScore * 0.25 +
  distanceScore * 0.25 +
  avgHeartRateScore * 0.15 +
  routePresenceScore * 0.1;
```

Strength duplicate:

```ts
score =
  durationScore * 0.45 +
  caloriesScore * 0.25 +
  avgHeartRateScore * 0.2 +
  maxHeartRateScore * 0.1;
```

Classification:

```ts
export type ImportMatchLevel = "strong" | "possible" | "none";

export function classifyScore(score: number): ImportMatchLevel {
  if (score >= 80) return "strong";
  if (score >= 60) return "possible";
  return "none";
}
```

---

## Task Plan

### Task 1: Database Review Table

**Files:**

- Create: `supabase/migrations/20260611160000_create_activity_import_reviews.sql`
- Modify after generation if available: `supabase/database.types.ts`
- Modify after copy if available: `alzan-be/src/types/database.types.ts`
- Modify after copy if available: `alzan-fe/src/types/database.types.ts`
- Modify temporary overrides if generation is unavailable: `alzan-be/src/types/requests.types.ts`, `alzan-fe/src/types/requests.types.ts`

- [ ] Create the migration with the table, indexes, constraints, comments and RLS policies described above.
- [ ] Run `pnpm run supabase:types` from repo root if local Supabase is configured.
- [ ] If type generation cannot run locally, add a narrow `ActivityImportReviewsOverride` in both `requests.types.ts` files, following the existing `ActivityHeartRateZonesOverride` style.
- [ ] Verify the table type is available as `Row<'activity_import_reviews'>`, `Insert<'activity_import_reviews'>`, and `Update<'activity_import_reviews'>`.

Expected checks:

```bash
pnpm --prefix alzan-be run typecheck
pnpm --prefix alzan-fe run typecheck
```

### Task 2: Backend Scoring Service

**Files:**

- Create: `alzan-be/src/components/activity-import/decision/activity-import-decision.types.ts`
- Create: `alzan-be/src/components/activity-import/decision/activity-import-scoring.service.ts`
- Create: `alzan-be/src/components/activity-import/decision/activity-import-scoring.service.spec.ts`

- [ ] Define metric snapshot, score breakdown, match level, review type/action unions.
- [ ] Implement pure score helpers for percent similarity, totals match, structural match, endurance duplicate, strength duplicate and metric conflict detection.
- [ ] Write tests for:
  - 6 reps vs 6/7 gives strong repetition score.
  - 6 reps vs 8 gives possible or weak score, below strong.
  - 400m reps vs 420m reps remains strong.
  - totals `>= 80` classifies strong.
  - totals `60-79` classifies possible.
  - strength conflict detects existing duration/kcal/HR values that differ from watch values.
  - null values do not crash and produce conservative scores.

Run:

```bash
pnpm --prefix alzan-be exec ts-node -r tsconfig-paths/register src/components/activity-import/decision/activity-import-scoring.service.spec.ts
```

### Task 3: Review Persistence Service

**Files:**

- Create: `alzan-be/src/components/activity-import/decision/activity-import-review.service.ts`
- Create/modify tests in: `alzan-be/src/components/activity-import/decision/activity-import-decision.service.spec.ts`

- [ ] Implement `createReview`, `listPendingReviewsForSession`, `resolveReview`, `dismissReview`, and `dismissPendingReviewsForSession`.
- [ ] Ensure all methods filter by `user_id`.
- [ ] For automatic backend imports, use Supabase admin client where appropriate.
- [ ] For request-scoped API operations, use `ctx.supabase` where RLS and user token should apply.

Expected method signatures:

```ts
createReview(input: ActivityImportReviewCreateInput): Promise<string>
listPendingReviewsForSession(ctx: UserCtx, sessionId: string): Promise<ActivityImportReviewDto[]>
resolveReview(ctx: UserCtx, reviewId: string, resolution: ActivityImportReviewResolution): Promise<void>
```

### Task 4: Refactor Writer Into Safe Low-Level Persistence

**Files:**

- Modify: `alzan-be/src/components/wearables/services/canonical-activity-writer.service.ts`

- [ ] Keep `upsertActivity` temporarily as a compatibility wrapper.
- [ ] Extract public methods:
  - `ensureDeviceForActivity`
  - `insertImportedSession`
  - `updateImportedSession`
  - `replaceActivityDetails`
  - `findExistingExternalRecordSessionId`
  - `buildSessionPayload`
- [ ] Preserve current behavior for exact same source record id.
- [ ] Keep existing error codes stable unless changing them is necessary.
- [ ] Add tests or adapt existing specs around payload generation and detail replacement.

Do not implement product decisions in this writer. The writer should persist what it is told to persist.

### Task 5: Decision Service For Endurance

**Files:**

- Create: `alzan-be/src/components/activity-import/decision/activity-import-decision.service.ts`
- Modify: `alzan-be/src/components/wearables/wearables.module.ts`
- Modify: `alzan-be/src/components/wearables/services/suunto-cloud-sync.service.ts`
- Modify: `alzan-be/src/components/wearables/services/polar-access-link.service.ts`
- Modify: `alzan-be/src/components/wearables/services/local-health-sync.service.ts`

- [ ] Implement `importCanonicalActivity(input: UpsertActivityInput): Promise<string>`.
- [ ] If exact external record already exists, update that same imported session idempotently and replace detail tables.
- [ ] For a new endurance external record:
  - insert a completed imported session
  - persist laps/streams/route/zone/provider fields
  - find same-day same-sport completed sessions excluding the imported session
  - create high-priority `duplicate_session` review when duplicate score `>= 80`
  - create low-priority `same_sport_notice` review when same sport exists but duplicate score `< 80`
  - evaluate template match only after duplicate review is created
  - auto-associate `endurance_template_id` when score `>= 80`
  - create `endurance_template_confirmation` review for auto-association
  - create `endurance_template_suggestion` review when score is `60-79`
  - leave generic when score `< 60`
- [ ] Query candidate templates by `user_id`, same `sport_type`, and date proximity:
  - prefer templates planned for the same day via `workout_plans` if available
  - include user templates with same sport when no plan exists
- [ ] Use structured score if `activity.laps.length > 0` and template has structured steps.
- [ ] Use totals score otherwise.

### Task 6: Decision Service For Strength

**Files:**

- Modify: `alzan-be/src/components/activity-import/decision/activity-import-decision.service.ts`
- Modify/create tests: `alzan-be/src/components/activity-import/decision/activity-import-decision.service.spec.ts`

- [ ] For strength imports, get all same-day strength sessions for the user.
- [ ] If none exist, create generic completed session with watch metrics and a `manual_template_association` review.
- [ ] If exactly one exists:
  - if completed, associate by creating a review or directly linking provider metadata to that session according to conflict state
  - if metrics are empty, apply watch metrics
  - if metrics conflict, create `strength_metric_conflict`
  - if not completed, mark completed and apply watch metrics
  - if no sets exist, create `strength_complete_sets`
- [ ] If several exist, create a generic completed imported session and a high-priority `strength_candidate_session` review listing the candidate session ids/names.
- [ ] If duplicate score `>= 80`, create `duplicate_session` review.
- [ ] Preserve `workout_sets`, `activity_session_superset_links`, exercises and template association unless the user explicitly changes association.

### Task 7: Resolution Service

**Files:**

- Create: `alzan-be/src/components/activity-import/decision/activity-import-resolution.service.ts`
- Create: `alzan-be/src/components/activity-import/dto/activity-import-review.dto.ts`
- Modify: `alzan-be/src/components/activity-import/activity-import.controller.ts`

- [ ] Implement `GET /activity-imports/reviews/session/:sessionId`.
- [ ] Implement `POST /activity-imports/reviews/:reviewId/resolve`.
- [ ] Implement actions:
  - `keep_both`: mark review resolved, no session changes.
  - `merge_into_candidate`: update target with watch-owned metrics/provider fields, preserve target sets, move route/laps/streams when appropriate, then delete imported duplicate.
  - `associate_endurance_template`: set `activity_sessions.endurance_template_id`.
  - `associate_strength_template`: set `activity_sessions.workout_template_id`.
  - `remove_template_association`: clear `endurance_template_id` or `workout_template_id` based on sport.
  - `apply_watch_metrics`: copy watch metrics from imported/candidate payload to target.
  - `keep_existing_metrics`: leave metrics untouched.
  - `dismiss`: mark dismissed.
  - `complete_sets`: return enough data for frontend navigation; do not mutate sets in this endpoint.
- [ ] Wrap multi-step merge/association operations in careful sequencing:
  - read review
  - ownership check
  - read target/imported sessions
  - update preserved session
  - move/replace detail rows where needed
  - delete duplicate only after update succeeds
  - resolve review

### Task 8: Frontend Review Fetch/Resolve

**Files:**

- Create: `alzan-fe/src/services/activityImportReviewService.ts`
- Create: `alzan-fe/src/hooks/useActivityImportReviews.ts`
- Create: `alzan-fe/src/modules/training/components/ActivityImportReviewPanel.tsx`
- Modify: `alzan-fe/src/screens/training/EnduranceSessionDetailScreen.tsx`
- Modify: `alzan-fe/src/i18n/locales/es.ts`
- Modify: `alzan-fe/src/i18n/locales/en.ts`

- [ ] Add typed service functions:
  - `fetchActivityImportReviews(sessionId, token)`
  - `resolveActivityImportReview(reviewId, body, token)`
- [ ] Query reviews when `session?.id` exists.
- [ ] Render review panel directly under the activity header or just after the metric grid so real activity data remains the first visual anchor.
- [ ] For high-priority duplicate reviews, show a prominent panel with actions:
  - merge/fuse
  - keep both
- [ ] For template suggestions, show:
  - suggested template name
  - match score
  - associate
  - keep generic
- [ ] For strength metric conflicts, show:
  - use watch data
  - keep current data
- [ ] For no-sets strength sessions, show:
  - complete exercises
  - keep without sets
- [ ] After resolution, invalidate:
  - `activityImportReviews`
  - `enduranceSessions`
  - `completedSessions`
  - `dashboard`
  - `sessionDetail`
  - `sessionHeartRateZones`

### Task 9: Completed Strength Sets Flow

**Files:**

- Create: `alzan-fe/src/screens/training/CompletedStrengthSetsScreen.tsx`
- Modify training navigation types and stack registration.
- Reuse logic from `ActiveWorkoutScreen.tsx` and `StartWorkoutScreen.tsx` only where it does not introduce timer/rest behavior.

- [ ] The screen receives `sessionId` and optional `templateId`.
- [ ] It loads template exercises if a template exists.
- [ ] It lets the user add/edit sets for a completed session.
- [ ] It writes to `workout_sets` with `session_id`, `user_id`, `exercise_id`, `set_number`, `reps`, `weight_kg`, optional `rpe`, `is_warmup`.
- [ ] It does not start timers, rest timers, live workout state, or mark an active workout.
- [ ] On save, invalidate `sessionDetail`, `enduranceSessions`, `completedSessions`, `dashboard`.

### Task 10: Manual Association And Name Editing

**Files:**

- Modify: `alzan-fe/src/screens/training/EnduranceSessionDetailScreen.tsx`
- Modify or create helper UI components inside `alzan-fe/src/modules/training/components/`
- Modify i18n files.

- [ ] Ensure every imported activity detail has actions to:
  - edit name
  - associate template
  - change association
  - remove association
  - merge if a duplicate review exists
- [ ] For endurance template picker, list same-sport templates first.
- [ ] For strength template picker, list strength routines from `workout_templates`.
- [ ] Apply changes through backend review resolution endpoints when a pending review exists.
- [ ] For simple manual association without pending review, add a small backend endpoint or use Supabase update only after confirming RLS and ownership behavior.

### Task 11: Documentation

**Files:**

- Modify: `docs/activity-import-suunto-garmin-guide.md`
- Modify: `docs/activity-import-verification.md`

- [ ] Add a section called `Decision engine for external activities`.
- [ ] Document the new table `activity_import_reviews`.
- [ ] Document how endurance scoring and strength conflict handling work.
- [ ] Add manual QA scenarios matching the PDFs.
- [ ] Mention that templates are objectives and never replace real metrics.

### Task 12: Verification

Run from repo root:

```bash
pnpm --prefix alzan-be run typecheck
pnpm --prefix alzan-be run lint:check
pnpm --prefix alzan-be run verify:activity-import
pnpm --prefix alzan-fe run typecheck
pnpm --prefix alzan-fe run lint:check
pnpm run format
pnpm run lint:check
```

If `pnpm run format` changes files, run:

```bash
pnpm run lint:check
pnpm --prefix alzan-be run typecheck
pnpm --prefix alzan-fe run typecheck
```

Manual QA scenarios:

- Endurance no template: import running with no matching template; completed generic session appears with route/metrics and manual association action.
- Endurance strong template by totals: import run whose distance/duration/pace match a planned template `>= 80`; session auto-associates and shows confirmation.
- Endurance possible template: score `60-79`; session remains generic with suggestion.
- Endurance structured intervals: import laps equivalent to `6 x 400m`; structural score wins over totals.
- Endurance duplicate: import a same-day same-sport activity with `>= 80` duplicate score; both sessions exist until user resolves.
- Strength no session: import strength; generic completed session has watch metrics, no sets, complete-exercises CTA.
- Strength one completed session with sets: import strength; sets remain, watch metrics only overwrite after user confirms when conflicts exist.
- Strength one in-progress session: import strength; session becomes completed, watch metrics apply, no sets CTA appears if empty.
- Strength several sessions: import strength; new generic session exists and review asks which existing session it corresponds to.
- Strength duplicate merge: preserve interactive session sets, apply watch metrics, delete duplicate only after success.

---

## Acceptance Criteria

- New external records create real completed sessions and are visible in training/calendar lists.
- Exact same provider record remains idempotent during sync retries.
- No user session metrics are overwritten silently when conflicts exist.
- Endurance template match thresholds follow the PDFs: strong `>= 80`, possible `60-79`, none `< 60`.
- Structured interval score overrides totals score.
- Strength imports never generate exercises/sets from watch data.
- Strength merges preserve `workout_sets` and template structure.
- UI always presents real metrics first, template/objective below, and editable actions.
- All user-facing strings use i18n keys in English and Spanish.
- Backend endpoints verify ownership for reviews, sessions and templates.
- Required quality gate passes or failures are documented with exact command output summaries.

---

## Risks And Guardrails

- Risk: current writer updates by provider record. Guardrail: keep idempotency only for exact same external identity; do not use it to merge into existing manual sessions.
- Risk: deleting imported generic strength session before target update succeeds loses data. Guardrail: update target first, copy details, then delete duplicate.
- Risk: frontend direct Supabase updates bypass backend validation. Guardrail: use backend resolution endpoints for all review actions.
- Risk: structured interval detection can overfit. Guardrail: start with conservative detection using provider laps and template repeated groups; fall back to totals when structure is ambiguous.
- Risk: generated DB types may not be available locally. Guardrail: use existing override pattern and document regeneration.

---

## Suggested Implementation Order

1. Database table and types.
2. Pure scoring service with tests.
3. Review persistence service.
4. Writer refactor with unchanged behavior.
5. Decision service for endurance.
6. Decision service for strength.
7. Resolution endpoints.
8. Frontend fetch/resolve hooks.
9. Review panel UI.
10. Completed strength sets screen.
11. Docs.
12. Full quality gate.

This order keeps the riskiest business logic testable before UI work begins.
