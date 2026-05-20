# Wearables Integration

This document describes the implemented backend and database foundation for Alzan wearable imports. It is for backend, mobile, and data engineers wiring Apple HealthKit, Android Health Connect, and cloud providers into Supabase.

## Scope

Implemented in this branch:

- Supabase migrations for wearable provenance, source origins, sync state, raw payloads, activity route points, normalized activity stream samples, generic health samples, and VO2 max history.
- Backend NestJS module at `alzan-be/src/components/wearables/`.
- Local SDK sync endpoint for Apple Health and Health Connect batches.
- Alzan-owned Apple Health native module `NativeModules.AlzanAppleHealth` for read-only HealthKit sync, installed through `alzan-fe/plugins/withAlzanAppleHealth.js`.
- Alzan-owned Android Health Connect native module `NativeModules.AlzanHealthConnect` for read-only Health Connect sync, installed through `alzan-fe/plugins/withAlzanHealthConnect.js`.
- Polar AccessLink v1 manual sync through `POST /wearables/cloud/polar/sync`.
- Health Connect origin discovery and selected-source persistence.
- OAuth token hardening for future provider callbacks by moving tokens from visible `user_connections` rows into private `provider_connection_tokens`.
- Connected Apps actions for Apple Health, Health Connect, and Polar in `alzan-fe/src/screens/settings/ConnectedAppsScreen.tsx`.

Not implemented here:

- Cloud provider pull jobs, webhooks, and delete event processors.
- Cross-provider duplicate group tables.
- Health Connect high-detail records beyond v1 coverage, such as route geometry, laps, speed, power, cadence, distance summaries, calories, VO2 max, SpO2, respiratory rate, temperature, and body fat.

## Database Foundation

Migrations:

- `supabase/migrations/20260513100000_wearables_phase1_provenance_sync.sql`
- `supabase/migrations/20260513101000_wearables_phase2_activity_detail.sql`
- `supabase/migrations/20260513102000_wearables_phase3_health_metrics.sql`
- `supabase/migrations/20260513103000_wearables_phase4_indexes.sql`

Key tables:

- `provider_data_origins`: stores available source identities such as Health Connect package names.
- `health_connect_provider_selection`: stores the single selected Health Connect origin per user.
- `integration_sync_state`: stores provider/domain cursors, Health Connect change tokens, and HealthKit anchors.
- `external_raw_payloads_v2`: stores raw payload JSON and hashes before normalization. RLS is enabled with no client policy; backend service role owns writes.
- `provider_connection_tokens`: private token table for OAuth secrets. Client-facing `user_connections` keeps metadata only.
- `activity_route_points`: timestamped GPS points.
- `activity_stream_samples`: queryable HR, cadence, power, speed, distance, altitude, and temperature samples.
- `activity_provider_fields`: provider-specific workout metadata, events, segments, and dedupe fingerprints.
- `health_metric_samples`: generic 24/7 biomarkers such as HRV, SpO2, respiratory rate, temperature, resting HR, weight, and VO2 max.
- `vo2_max_logs`: VO2 max history when a provider sends point measurements.

Existing tables now have nullable provenance fields where needed: `source_channel`, `source_package`, `source_provider_key`, `source_record_id`, `source_updated_at`, and `raw_payload_id`.

## Backend Module

Module path: `alzan-be/src/components/wearables/wearables.module.ts`.

Main services:

- `RawPayloadService`: hashes and stores incoming payloads, then links them to domain rows.
- `ProviderOriginService`: upserts origins, lists Health Connect origins, and stores the selected Health Connect origin.
- `IntegrationSyncStateService`: stores cursors/anchors by user, provider, channel, package, and sync domain.
- `CanonicalActivityWriterService`: upserts workouts, laps, HR zones, JSON streams, normalized stream samples, route points, and provider fields.
- `CanonicalHealthWriterService`: upserts daily steps, step intervals, sleep sessions, stages, daily recovery, health samples, VO2 max logs, weight logs, and resting HR logs.
- `LocalHealthSyncService`: orchestrates Apple Health and Health Connect batch imports.
- `PolarAccessLinkService`: pulls Polar AccessLink exercises and writes them through the canonical activity writer.

## API Contract

All endpoints require Supabase user auth and are mounted under `/wearables`.

### List Health Connect origins

`GET /wearables/health-connect/origins`

Returns origins previously upserted from Android discovery. Each origin includes `source_package`, `source_provider_key`, `display_name`, `platform`, and `last_seen_at`.

### Upsert Health Connect origins

`POST /wearables/health-connect/origins`

Body:

```json
{
  "origins": [
    {
      "source_channel": "health_connect",
      "provider": "health_connect",
      "source_package": "com.fitbit.FitbitMobile",
      "source_provider_key": "fitbit",
      "display_name": "Fitbit",
      "platform": "android",
      "raw_payload": {}
    }
  ]
}
```

### Select Health Connect origin

`POST /wearables/health-connect/origins/select`

Body:

```json
{ "origin_id": "00000000-0000-0000-0000-000000000000" }
```

The selected origin must belong to the authenticated user, must be `provider=health_connect`, and must have a non-null package name.

### Sync local health records

`POST /wearables/local-sync`

Body:

```json
{
  "source_channel": "health_connect",
  "source_package": "com.fitbit.FitbitMobile",
  "trace_id": "android-batch-2026-05-13T10:00:00Z",
  "records": [
    {
      "object_type": "activity",
      "source_record_id": "hc-session-1",
      "payload": {
        "exerciseType": "EXERCISE_TYPE_RUNNING",
        "startTime": "2026-05-13T07:00:00Z",
        "endTime": "2026-05-13T07:45:00Z",
        "metadata": {
          "id": "hc-session-1",
          "dataOrigin": { "packageName": "com.fitbit.FitbitMobile" }
        }
      }
    }
  ],
  "sync_states": [
    {
      "sync_domain": "activities",
      "cursor_token": "health-connect-changes-token",
      "last_record_at": "2026-05-13T07:45:00Z"
    }
  ]
}
```

Supported `object_type` values: `activity`, `daily_activity`, `sleep`, `recovery`, `health_sample`, `vo2_max`, and `weight`.

Health Connect imports must include a package name and it must match the user's selected Health Connect origin. Apple Health imports may have `source_package` as the HealthKit source bundle identifier when available.

### Mobile native bridge contract

The app calls Alzan-owned native modules and uploads their batches through `POST /wearables/local-sync`:

- `NativeModules.AlzanAppleHealth`: requests HealthKit read permissions and returns an `AppleHealthLocalSyncBatch`.
- `NativeModules.AlzanHealthConnect`: discovers `DataOrigin.packageName`, requests Health Connect read permissions, reads only the selected package, and returns a `HealthConnectLocalSyncBatch`.

Open Wearables was used as historical reference material only. It is not installed, imported, required as a local folder, or used by the app/runtime.

Apple Health can only be tested through an iOS app build. Web cannot access HealthKit, and the iOS Simulator is useful mainly for compile and permission-flow checks; real Apple Watch/Fitness/Health data requires a physical iPhone with the HealthKit capability enabled for the signing team.

### Sync Polar activities

`POST /wearables/cloud/polar/sync`

This endpoint requires an active Polar OAuth connection. It reads private tokens from `provider_connection_tokens`, calls Polar AccessLink `/v3/exercises`, stores raw payloads, and upserts activities through the canonical writer.

## Mobile Responsibilities

Android Health Connect:

1. Read allowed record types.
2. Group available origins by `record.metadata.dataOrigin.packageName`.
3. Send origins to `POST /wearables/health-connect/origins`.
4. Let the user choose one origin.
5. Send the selected origin id to `POST /wearables/health-connect/origins/select`.
6. Read records filtered to that `DataOrigin`.
7. Send batches to `POST /wearables/local-sync`.
8. Store Health Connect change tokens through `sync_states`.

Health Connect v1 currently reads `StepsRecord`, `HeartRateRecord`, `ExerciseSessionRecord`, `SleepSessionRecord`, `RestingHeartRateRecord`, `HeartRateVariabilityRmssdRecord`, and `WeightRecord`. The native module is intentionally read-only and always applies `dataOriginFilter = setOf(DataOrigin(selectedPackage))` before uploading records.

iOS HealthKit:

1. Request read permissions only for the selected first version.
2. Use `NativeModules.AlzanAppleHealth` from `alzan-fe/src/modules/apple-health/appleHealthNative.ts`.
3. Read `HKWorkout`, samples, sleep analysis, biometrics, body metrics, and routes locally.
4. Upload the returned `AppleHealthLocalSyncBatch` to `POST /wearables/local-sync`.
5. Store `HKAnchoredObjectQuery` anchors through `integration_sync_state` when delta sync is added.

The native source of truth is versioned in `alzan-fe/plugins/alzan-apple-health/`; the Expo config plugin copies those files into the generated `ios/` project, adds HealthKit/CoreLocation frameworks, sets the bridging header, enables the HealthKit entitlement, and writes `NSHealthShareUsageDescription`.

Polar:

1. Set `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`, `POLAR_REDIRECT_URI`, and optionally `POLAR_DEFAULT_SCOPE`.
2. Connect from Settings through `/oauth/polar/authorize`.
3. OAuth callback registers the Polar AccessLink user at `/v3/users`.
4. Run `POST /wearables/cloud/polar/sync`.
5. Verify imported rows in `activity_sessions`, `activity_streams`, `activity_stream_samples`, `activity_route_points`, and `external_raw_payloads_v2`.

## Security Notes

- `user_connections` remains visible to the user for connection metadata, but new OAuth callbacks store secrets in `provider_connection_tokens`.
- `provider_connection_tokens` and `external_raw_payloads_v2` have RLS enabled and no client policies.
- `LocalHealthSyncService` requires `user_preferences.health_data_consent = true` before importing local health data.
- Health Connect imports are rejected if the payload package does not match the selected origin.
- Route points and health samples have user-owned RLS policies; social surfaces must still avoid exposing GPS and biomarkers without explicit product opt-in.

## Verification

Run from the repo root:

```sh
pnpm --prefix alzan-be run typecheck
pnpm --prefix alzan-fe run typecheck
pnpm verify:activity-import
```

The root quality gate remains:

```sh
pnpm format
pnpm run lint:check
```
