# Request and composition safety

This review covers repeated queries, body-composition repair and automatic request logging. It is not a full application penetration test or a billing cap.

## Request limits

- `alzan-fe/src/lib/querySafety.ts` permits one retry for a network failure or HTTP 5xx. SQL, business-validation, permission, HTTP 4xx and quota failures are not automatically retried by React Query.
- Composition, wearable-job and active-session polling pauses after an error. Window focus, remount, reconnection or explicit invalidation can resume the query. Active-session polling also stops when the training screen is not focused.
- `compositionRequestGuard.ts` shares a calculation between callers for the same user and date. Supabase calls inside a calculation share a 20-second abort signal. After a failed calculation, subsequent calculations for that user pause for 30 seconds, increasing to at most five minutes on repeated failures.
- A real input edit can clear a revision-conflict cooldown, but cannot bypass an outage cooldown. An older successful request cannot clear a newer failure.
- Historical background repairs process at most 12 dates per minute, with at most four concurrent calculations. A real input mutation repairs at most 12 stale dates plus the changed date; remaining history can be repaired on later refreshes.
- Failed calculations are not reported as a successful manual recalculation. Background errors omit database payloads; expected cooldowns are not logged as new errors.
- `context/authMaintenance.ts` shares overlapping startup/SIGNED_IN maintenance and permits at most one run per user per minute after completion. This prevents duplicate automatic planning work from repeated auth events; direct planning settings actions keep their existing behavior.

These client guards apply per running application instance. They are not a server rate limit against a modified client or a cross-device spending limit. Supabase authentication, ownership checks, input revisions and RLS remain the server boundaries.

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
```

Deploy the frontend, backend and migration through the existing release process. Applying the SQL function alone does not deploy the client guards or backend logger. No paid service or billing configuration is part of this change.

### Validation and rollout on 2026-10-27

All five SQL migrations in this change were applied locally and to the linked Cloud project with the Supabase CLI. Cloud schema readback verified restricted RPC grants and the invalidation branches; the final measured-composition adjustment was subsequently applied successfully. Local transaction tests cover composition invalidation, ownership/RLS, denied client execution, successful service-role writes and wearable bundles.

Format, lint and TypeScript checks passed. Request safety, logger safety, body-composition, active-workout and 13 import-review integration scenarios passed. Manual localhost checks covered login, persisted login after reload, Health, Training calendar loading and the successful unchanged-recalculation modal. No physical iPhone test was performed. Frontend/backend source changes remain on `fix/composition-conflict-log-ingestion` and have not been deployed by this task.
