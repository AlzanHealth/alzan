# Request and composition safety

This review covers repeated queries, body-composition repair and automatic request logging. It is not a full application penetration test or a billing cap.

Body composition uses the latest valid recorded input at or before the evaluation time; data does not expire after 72 hours. When a historical input changes or is deleted, later composition snapshots are invalidated because the input may have been selected for them. Repair remains rate-limited and batched.

## Cost and availability limits

The Supabase organization/project was previously verified on Free. Supabase's current documentation says Free overages are not billed as paid-plan usage, but continued quota breaches can cause service restrictions. Its Free database-size allowance is 0.5 GB per active project, evaluated using the billing-period average; the database disk itself is 2 GB and can enter read-only mode at 95% disk usage, then stop when full. These are separate limits. Logs Ingest overage is also listed as not billed on Free, but quota excess can still lead to restrictions. See [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [database size](https://supabase.com/docs/guides/platform/database-size), and [Logs Ingest](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest).

On 2026-10-27, a read-only Cloud dashboard inspection reported 552.32 MB database size (116% of the 0.5 GB Free allowance); an earlier CLI summary reported 538 MB (334 MB indexes, 174 MB tables, 128 MB WAL). The dashboard identifies the organization as Free, warns `EXCEEDING USAGE LIMITS`, and says exceeded Free quotas may cause restrictions because overages are not billed. Project status was `ACTIVE_HEALTHY` at inspection time. This allowance is distinct from provisioned database disk capacity and its read-only threshold, and the display does not establish the billing-period average. The largest relation was `public.activity_stream_samples` at 458.62 MB; its session/time and user/type/time query indexes are large as well. They support current stream queries and duplicate prevention, so they were not dropped. No database records or indexes were deleted or changed. A separate CLI table-stats query could not authenticate with its temporary database role. The dashboard also showed 45.65 GB Logs Ingest against the 1 GB Free allowance (44.65 GB over) and 24.14 GB Logs Query against 100 GB. Current Supabase documentation says Free overages are not billed, but quota excess can still lead to restrictions; already ingested log usage cannot be erased. The deployed SQL migration removes the repeated composition conflict errors that produced the previous burst; the frontend/backend request guards still need the normal release to take effect in production.

The app-level retry/polling guards reduce accidental request loops; they cannot prevent a project owner from changing the subscription or enforce platform quotas from inside the app. No payment provider, paid upgrade, card, add-on or spend-cap setting was changed. A hard guarantee against platform restrictions requires either staying below quotas and keeping the project active, or changing plans—which is outside this zero-cost scope.

## Request limits

- `alzan-fe/src/lib/querySafety.ts` permits one retry for a network failure or HTTP 5xx. SQL, business-validation, permission, HTTP 4xx and quota failures are not automatically retried by React Query.
- Composition, wearable-job and active-session polling pauses after an error. Window focus, remount, reconnection or explicit invalidation can resume the query. Wearable-job polling also explicitly retries once when the user returns to the connected-apps screen or starts a fresh sync request; another failure stays paused until a new action. Active-session polling also stops when the training screen is not focused.
- `compositionRequestGuard.ts` shares a calculation between callers for the same user and date. Supabase calls inside a calculation share a 20-second abort signal. After a failed calculation, subsequent calculations for that user pause for 30 seconds, increasing to at most five minutes on repeated failures.
- A real input edit can clear a revision-conflict cooldown, but cannot bypass an outage cooldown. An older successful request cannot clear a newer failure.
- Historical background repairs process at most 12 dates per minute, with at most four concurrent calculations. A real input mutation repairs at most 12 stale dates plus the changed date; remaining history can be repaired on later refreshes.
- Failed calculations are not reported as a successful manual recalculation. Background errors omit database payloads; expected cooldowns are not logged as new errors.
- `context/authMaintenance.ts` shares overlapping startup/SIGNED_IN maintenance and permits at most one run per user per minute after completion. This prevents duplicate automatic planning work from repeated auth events; direct planning settings actions keep their existing behavior.

These client guards apply per running application instance. They are not a server rate limit against a modified client or a cross-device spending limit. Supabase authentication, ownership checks, input revisions and RLS remain the server boundaries.

## Latest composition inputs and historical upgrades

`alzan-fe/src/modules/health/services/compositionInputs.ts` retrieves the latest eligible row for each of seven measurement type/protocol combinations plus the latest valid positive weight. Each query filters the owner, evaluation cutoff and accepted values before applying `limit(1)`; timestamp ties use a stable ID order. At most eight input rows are returned, so a long history of chest or other measurements cannot hide an older valid waist. The accepted measurement ranges come from the calculation engine in `bodyComposition.ts`.

`alzan-fe/src/modules/health/helpers/compositionVersion.ts` advances snapshots to version 5. Historical snapshots from the former 72-hour policy enter the existing bounded repair queue and are excluded from displayed results until recalculated. Today's calculation runs first. Raw measured/imported body-fat values remain separate.

## Database invalidation

Migration `20261027190000_skip_unchanged_composition_inputs.sql` skips invalidation when an update changes only metadata:

- Weight invalidation checks weight, measurement timestamp and the separately displayed imported body-fat/muscle values. Migration `20261027194000_preserve_measured_composition_invalidation.sql` preserves revision updates for those measured values so other devices can refresh them; only unchanged values or provenance are skipped.
- Measurement calculations depend on type, value, protocol and timestamp.
- Profile calculations retain the existing checks for height, sex and date of birth.

Inserts, deletes, changed values, dates and protocols still invalidate snapshots. The ownership check runs before the no-op checks. Raw/imported body-fat measurements remain separate from derived estimates. No generated database types require editing because the function signatures and table schema are unchanged.

Migration `20261027191000_restrict_composition_rpc_execution.sql` removes explicit anonymous EXECUTE grants from both composition RPCs. Supabase's default privileges can include an explicit `anon` grant, which is not removed by revoking `PUBLIC` alone. Existing authentication/ownership checks remain in place. Application roles also lose direct EXECUTE permission on the trigger function; row changes still execute its trigger normally.

Migration `20261027192000_restrict_internal_rpc_execution.sql` restricts `store_external_raw_payload`, `upsert_wearable_device`, `upsert_integration_sync_state` and `persist_wearable_activity_bundle` to `service_role`. All existing call sites use `SupabaseAdminService`; these writers accept an explicit owner and must not be available to browser roles. Anonymous access to the global recipe popularity refresh is also removed, retaining its existing authenticated maintenance entry point. Signup username checks remain available.

Migration `20261027193000_restrict_authenticated_rpc_anonymous_grants.sql` removes anonymous grants from authenticated account reset/deletion and nutrition writers while retaining their internal authentication checks and signed-in grants. The SQL regression rejects any new anonymously executable public SECURITY DEFINER RPC unless explicitly reviewed; `check_username` remains the intentional signup exception, and trigger-only functions are excluded because they cannot be called as ordinary RPCs.

## Logging

`alzan-be/src/config/logger.config.ts` uses `info` for hosted environments. Automatic request logs allow only request ID, method and path, stripping query parameters and excluding headers and bodies. Redaction also covers authorization, cookies, COROS webhook secrets and response cookies. Wearable frontend failures no longer retain raw response bodies on their error objects; unstructured errors use a fallback message. File-import responses are no longer logged in full.

This does not establish that a real credential was previously exposed, and does not remove existing logs or historical ingest usage. The review does not cover every manually constructed log message in the repository.

## Timed strength sets and deployment order

The training JSON contract accepts `duration_s` without repetitions for catalog exercises whose type is time-based. Template targets and weekly progressions keep the duration in their existing target fields; completed sets persist seconds in `workout_sets.duration_s` with `reps = null`. Repetition sets retain repetitions and do not contribute artificial durations. Resuming, editing, adding missing sets and PDF exports handle both metrics; known legacy timed exercises can still read seconds from their former repetitions field.

Migration `20261028120000_allow_timed_workout_sets_without_repetitions.sql` removes the `NOT NULL` requirement on `workout_sets.reps`, preserving existing values. Apply this migration **before deploying the updated frontend**; the previous schema rejects completed timed sets with null repetitions. The database types were regenerated from local Supabase using `pnpm run supabase:types`, not edited by hand. This migration was applied only locally during this review.

## Verification

Run from the repository root:

```sh
pnpm --prefix alzan-fe run verify:request-safety
pnpm --prefix alzan-fe run verify:body-composition
pnpm --prefix alzan-be run verify:logging-safety
pnpm format
pnpm run lint:check
pnpm typecheck
pnpm run verify:import-review
```

The SQL regression is local-only and rolls back its fixture writes:

```sh
docker exec -i supabase_db_alzan-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/composition_input_revision.sql
docker exec -i supabase_db_alzan-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/internal_rpc_permissions.sql
docker exec -i supabase_db_alzan-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/timed_workout_sets.integration.sql
```

Deploy the frontend, backend and migration through the existing release process. Applying the SQL function alone does not deploy the client guards or backend logger. No paid service or billing configuration is part of this change.

### Validation and rollout on 2026-10-27

The earlier rollout verified Cloud application of the conflict handling and RPC restrictions, followed by the measured-composition invalidation adjustment. The 2026-10-28 PR review checked the final local schema, including forward invalidation for the latest-input policy. Local transaction tests cover composition invalidation, ownership/RLS, denied client execution and successful service-role writes. This review did not apply migrations or deploy application changes to Cloud.

Format, lint and TypeScript checks passed. Request safety, logger safety, body-composition, active-workout and 13 import-review integration scenarios passed. Manual localhost checks covered login, persisted login after reload, Health, Training calendar loading and the successful unchanged-recalculation modal. No physical iPhone test was performed. Frontend/backend source changes remain on `fix/composition-conflict-log-ingestion` and have not been deployed by this task.

The 2026-10-28 review added regression coverage for more than 1,200 historical measurements, snapshot version upgrades, explicit wearable polling recovery, and real HTML rendering of timed sets. Manual localhost testing imported a two-week timed routine, verified 30/40-second progression targets and optional RIR in the database and active workout, completed the second session, and confirmed that editing 40 to 42 seconds preserved `duration_s` and null repetitions. The disposable QA routine and sessions were removed after validation.
