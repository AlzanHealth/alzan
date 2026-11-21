-- Keep only app-consumed cardio values in the archive. The manifest tracks the
-- complete source-row set separately so deletion remains guarded even when
-- irrelevant stream types are intentionally discarded.

ALTER TABLE public.activity_stream_archives
  ADD COLUMN IF NOT EXISTS source_sample_count integer,
  ADD COLUMN IF NOT EXISTS source_sample_ids_md5 text;

-- Existing version-1 manifests archived every source row, so their original
-- source count equals the old archived sample count. The IDs remain verifiable
-- from their legacy payloads and do not need to be copied into this table.
UPDATE public.activity_stream_archives
SET source_sample_count = sample_count
WHERE archive_version = 1
  AND source_sample_count IS NULL;

ALTER TABLE public.activity_stream_archives
  DROP CONSTRAINT IF EXISTS activity_stream_archives_archive_version_check;
ALTER TABLE public.activity_stream_archives
  ADD CONSTRAINT activity_stream_archives_archive_version_check
  CHECK (archive_version IN (1, 2));

ALTER TABLE public.activity_stream_archives
  DROP CONSTRAINT IF EXISTS activity_stream_archives_source_sample_count_check;
ALTER TABLE public.activity_stream_archives
  ADD CONSTRAINT activity_stream_archives_source_sample_count_check
  CHECK (source_sample_count IS NULL OR source_sample_count >= sample_count);

ALTER TABLE public.activity_stream_archives
  DROP CONSTRAINT IF EXISTS activity_stream_archives_source_sample_ids_md5_check;
ALTER TABLE public.activity_stream_archives
  ADD CONSTRAINT activity_stream_archives_source_sample_ids_md5_check
  CHECK (source_sample_ids_md5 IS NULL OR source_sample_ids_md5 ~ '^[0-9a-f]{32}$');

ALTER TABLE public.activity_stream_archives
  DROP CONSTRAINT IF EXISTS activity_stream_archives_source_tracking_check;
ALTER TABLE public.activity_stream_archives
  ADD CONSTRAINT activity_stream_archives_source_tracking_check
  CHECK (
    archive_version = 1
    OR (source_sample_count IS NOT NULL AND source_sample_ids_md5 IS NOT NULL)
  );

COMMENT ON COLUMN public.activity_stream_archives.sample_count IS
  'Number of archived heart-rate, speed, and power samples used by the app.';
COMMENT ON COLUMN public.activity_stream_archives.source_sample_count IS
  'Total live sample rows covered by the guarded deletion, including discarded non-cardio stream types.';
COMMENT ON COLUMN public.activity_stream_archives.source_sample_ids_md5 IS
  'MD5 digest of sorted source row IDs, used only to verify the guarded deletion set.';
