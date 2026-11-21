# Activity stream archive operations

This runbook is for maintainers who need to reduce Postgres space used by old wearable samples without deleting an activity or its visible summary.

## What is archived

The process copies every row for an eligible session from `public.activity_stream_samples` into a private, gzip-compressed JSON object, downloads that object again, and verifies its SHA-256 checksum and sample count before deleting database rows. A manifest in `public.activity_stream_archives` records the owner, object path, format version, count, size, and checksum.

The session, its laps and splits, route points, heart-rate zone summaries, provider fields, and other activity summary data remain in Postgres. An authenticated Wearables endpoint can verify and return archived cardio samples, merged with any newer heart-rate, speed, and power samples; live data wins when both have the same offset or timestamp. The current cardio analysis only selects sessions from the latest 28 days and heart-rate-zone history covers 60 days, so the 90-day archive floor keeps those normal UI reads on live rows. The archive remains available for archive-aware reads, including when a partial resync leaves older points missing from Postgres.

Only completed sessions at least 90 days old are eligible. `--before` can move the cutoff further into the past; a later date is clamped to the 90-day minimum. The CLI also enforces a 512 MiB budget for archived objects and a 50 MiB per-object limit. Sessions with an existing archive are not deleted again.

## Preview and apply

Run commands from the repository root. The default is a read-only preview; it reports eligible sessions, sample count, uncompressed JSON bytes, expected gzip bytes, existing archive bytes, and pending object cleanup.

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

The command reads the service-role key from `alzan-be/.env`. Never print or paste that file into a terminal transcript. The apply command drains pending private-object cleanup first, then processes sessions one by one. Each deletion is guarded by a database function that locks the session, checks ownership and age, and confirms the sample IDs have not changed since the archive was prepared. If a step fails, the live rows remain or the verified archive manifest remains, so the command can be reviewed and rerun.

## How archived data is read and deleted

- `POST /wearables/activity-stream-archives/read` requires a signed-in user and accepts at most 20 session IDs. The backend only returns archives owned by that user.
- The backend verifies the object path, compressed byte count, SHA-256, archive version, session owner, and sample count before returning data.
- The storage bucket is private. Authenticated users can read only objects under their own user-ID folder; uploads and deletions use the protected backend service role.
- Deleting an activity queues its archive object before the session and manifest cascade. The next archive apply drains that queue. The queue is not a scheduled job, so run the maintenance command periodically if archived activities are deleted.

## Reclaiming physical database size

The migration drops `idx_stream_samples_session_type_offset`, a non-unique index with the same key columns and partial predicate as the existing unique `uq_activity_stream_sample_offset` index. That saves the duplicate index space as soon as the migration runs.

Deleting sample rows makes table pages reusable but does not guarantee the database-size meter falls. To return freed table pages to the operating system, PostgreSQL needs a table rewrite such as:

```sql
VACUUM (FULL, ANALYZE) public.activity_stream_samples;
```

`VACUUM FULL` takes an exclusive lock and needs additional temporary disk space. Review current database disk headroom and schedule an acceptable maintenance window before running it. It is intentionally not part of the archive CLI, migration, or this branch's development work.

## Implementation references

- Schema, private bucket, deletion guard, cleanup queue, and duplicate-index removal: `supabase/migrations/20261121120000_archive_old_activity_stream_samples.sql`
- Archive, verification, merged reads, cleanup, and 90-day policy: `alzan-be/src/components/wearables/services/activity-stream-archive.service.ts`
- Safe-by-default operator command: `alzan-be/src/components/wearables/services/archive-activity-streams.ts`
- Authenticated archive endpoint: `alzan-be/src/components/wearables/controllers/activity-stream-archive.controller.ts`
- Cardio history fallback: `alzan-fe/src/modules/health/hooks/useCardioEvolution.ts`

The migration and code must be deployed before running the apply command against any environment. The current implementation branch has not applied this migration or removed any production data.
