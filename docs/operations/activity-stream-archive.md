# Activity stream archive operations

This runbook is for maintainers who need to reduce Postgres space used by old wearable samples without deleting an activity or its visible summary.

## What is archived

The process copies only the app-consumed heart-rate, speed, and power samples for an eligible session into a private, gzip-compressed JSON object, downloads it again, and verifies its SHA-256 checksum and sample count before deleting live rows. New imports no longer write other per-sample types; older unsupported samples remain subject to the same 90-day age and row-set guard, then are discarded because the app has no readers for them. A manifest in `public.activity_stream_archives` records the retained sample count plus the source-row count and ID digest needed to verify the full deletion set.

The session, its laps and splits, encoded route polyline, heart-rate zone summaries, and activity summary metrics remain in Postgres. Wearable imports no longer duplicate metric streams into `activity_streams` or write point-by-point route rows; the app displays the encoded route polyline from the session, and the migration removes historical wearable route-point copies. New per-sample rows keep only heart rate, speed, and power, the streams consumed by cardio history and heart-rate analysis. Synchronous provider imports keep hashes and source identifiers but do not persist the raw body or its byte size. Raw bodies are retained only while COROS webhook events are pending or retryable, because the durable queue needs them to process the event; after processing or exhausting retries, only the hash and processing metadata remain. Duplicate raw JSON copies are cleared while normalized values remain. Provider-origin metadata excludes its raw JSON body because the app does not use it. An authenticated Wearables endpoint can verify and return archived cardio samples, merged with any newer live samples; live data wins when both have the same offset or timestamp. The cardio analysis only selects sessions from the latest 28 days and heart-rate-zone history covers 60 days, so the 90-day archive floor keeps those normal UI reads on live rows. The archive remains available for archive-aware reads, including when a partial resync leaves older points missing from Postgres.

Only completed sessions at least 90 days old are eligible. `--before` can move the cutoff further into the past; a later date is clamped to the 90-day minimum. The CLI also enforces a 512 MiB budget for archived objects and a 50 MiB per-object limit. Sessions with an existing archive are not deleted again.

## Preview and apply

Run commands from the repository root. The default is a read-only preview; it reports eligible sessions, total source sample rows, retained cardio sample rows, discarded non-cardio sample rows, sessions with no app-used samples, uncompressed JSON bytes, expected gzip bytes, existing archive bytes, and pending object cleanup.

```sh
pnpm --prefix alzan-be archive:activity-streams
pnpm --prefix alzan-be archive:activity-streams -- --before 2026-08-01
```

Apply to the configured local Supabase instance only after the migration is applied locally and the preview is reviewed:

```sh
pnpm --prefix alzan-be archive:activity-streams -- --apply --confirm-delete
```

Remote apply is blocked unless the operator explicitly supplies both the project reference that matches `SUPABASE_URL` and the remote flag:

```sh
pnpm --prefix alzan-be archive:activity-streams -- --apply --confirm-delete --allow-remote --project-ref <project-ref> --before 2026-08-01
```

The command reads the service-role key from `alzan-be/.env`. Never print or paste that file into a terminal transcript. The apply command drains pending private-object cleanup first, then processes sessions one by one. Each deletion is guarded by a database function that locks the session, checks ownership and age, and confirms the sample IDs have not changed since the archive was prepared. When a session contains no cardio samples, its old non-cardio samples are deleted only after the guarded row-set check; no archive is created for values the app does not use. If a step fails, the live rows remain or the verified archive manifest remains, so the command can be reviewed and rerun.

## How archived data is read and deleted

- `POST /wearables/activity-stream-archives/read` requires a signed-in user and accepts at most 20 session IDs. The backend only returns archives owned by that user.
- The backend verifies the object path, compressed byte count, SHA-256, archive version, session owner, and sample count before returning data.
- The storage bucket is private. Authenticated users can read only objects under their own user-ID folder; uploads and deletions use the protected backend service role.
- Deleting an activity queues its archive object before the session and manifest cascade. The next archive apply drains that queue. The queue is not a scheduled job, so run the maintenance command periodically if archived activities are deleted.

## Reclaiming physical database size

The migration drops `idx_stream_samples_session_type_offset`, a non-unique index with the same key columns and partial predicate as the existing unique `uq_activity_stream_sample_offset` index. That saves the duplicate index space as soon as the migration runs.

Deleting or nulling values makes their space reusable, but does not guarantee the database-size meter falls. A plain `VACUUM` makes dead-row space reusable inside the table. `VACUUM FULL` rewrites the table so PostgreSQL can return the reclaimed space to the operating system; it is only worth considering after a large measured deletion:

```sql
VACUUM (FULL, ANALYZE) public.activity_stream_samples;
```

`VACUUM FULL` takes an exclusive lock and needs additional temporary disk space. Review current database disk headroom and schedule an acceptable maintenance window before running it. It is intentionally not part of the archive CLI or migrations. The development database preview found no eligible sample rows; run a separate preview against the target environment before deciding whether archival or vacuuming is warranted.

## Implementation references

- Schema, private bucket, deletion guard, cleanup queue, and duplicate-index removal: `supabase/migrations/20261121120000_archive_old_activity_stream_samples.sql`
- Compact archive format and verified source-row tracking: `supabase/migrations/20261121123000_reduce_archived_activity_stream_payload.sql`
- Unused wearable payload removal and processed raw-body cleanup: `supabase/migrations/20261121130000_minimize_unrendered_wearable_payloads.sql`
- Raw-body recovery-state handling and removal of legacy wearable route-point copies: `supabase/migrations/20261121133000_keep_retry_payloads_only.sql`
- Body retention limited to COROS recovery plus removal of empty provider-field rows: `supabase/migrations/20261121134000_retain_only_coros_webhook_bodies.sql`
- Dead-letter COROS webhook bodies are cleared after retries are exhausted: `supabase/migrations/20261121135000_discard_dead_letter_webhook_bodies.sql`
- Archive, verification, merged reads, cleanup, and 90-day policy: `alzan-be/src/components/wearables/services/activity-stream-archive.service.ts`
- Safe-by-default operator command: `alzan-be/src/components/wearables/services/archive-activity-streams.ts`
- Authenticated archive endpoint: `alzan-be/src/components/wearables/controllers/activity-stream-archive.controller.ts`
- Cardio history fallback: `alzan-fe/src/modules/health/hooks/useCardioEvolution.ts`

Deploy the backend code and apply the migrations before running the archive command. `supabase db push` applies schema and cleanup migrations; it does not archive old activity samples. Run a read-only preview against the target environment, review its counts and storage estimate, then use the guarded apply command if the result is expected. The migrations also clear redundant raw payload bodies and historical wearable route-point copies as described above.
