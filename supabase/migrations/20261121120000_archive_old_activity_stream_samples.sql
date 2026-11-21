-- Preserve detailed wearable samples in private object storage before removing
-- old rows from the hot database table. Activity summaries, laps, routes, and
-- provider metadata remain in their existing tables.

CREATE TABLE IF NOT EXISTS public.activity_stream_archives (
  session_id uuid PRIMARY KEY REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  object_path text NOT NULL UNIQUE,
  sample_count integer NOT NULL CHECK (sample_count > 0),
  compressed_bytes bigint NOT NULL CHECK (compressed_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  archive_version smallint NOT NULL DEFAULT 1 CHECK (archive_version = 1),
  archived_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_stream_archives_object_path_check
    CHECK (object_path = user_id::text || '/' || session_id::text || '/' || sha256 || '.json.gz')
);

COMMENT ON TABLE public.activity_stream_archives IS
  'Private object-storage manifests for archived activity_stream_samples; original activities and summaries remain in Postgres.';

ALTER TABLE public.activity_stream_archives ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.activity_stream_archives TO authenticated;

DROP POLICY IF EXISTS "Users can view own activity_stream_archives" ON public.activity_stream_archives;
CREATE POLICY "Users can view own activity_stream_archives"
  ON public.activity_stream_archives FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.activity_stream_archive_cleanup_queue (
  object_path text PRIMARY KEY,
  user_id uuid NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text
);

ALTER TABLE public.activity_stream_archive_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_stream_archive_cleanup_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.activity_stream_archive_cleanup_queue TO service_role;

CREATE OR REPLACE FUNCTION public.queue_activity_stream_archive_cleanup_on_session_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.activity_stream_archive_cleanup_queue (object_path, user_id)
  SELECT archives.object_path, archives.user_id
  FROM public.activity_stream_archives AS archives
  WHERE archives.session_id = OLD.id
  ON CONFLICT (object_path) DO NOTHING;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_activity_stream_archive_cleanup_on_session_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_activity_stream_archive_cleanup_on_session_delete ON public.activity_sessions;
CREATE TRIGGER queue_activity_stream_archive_cleanup_on_session_delete
  BEFORE DELETE ON public.activity_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_activity_stream_archive_cleanup_on_session_delete();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-stream-archives',
  'activity-stream-archives',
  false,
  52428800,
  ARRAY['application/gzip']
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read own activity stream archives" ON storage.objects;
CREATE POLICY "Users can read own activity stream archives"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'activity-stream-archives'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- The unique offset index already provides this lookup and uniqueness rule.
-- Dropping only the duplicate non-unique copy immediately returns its disk use.
DROP INDEX IF EXISTS public.idx_stream_samples_session_type_offset;

CREATE OR REPLACE FUNCTION public.delete_archived_activity_stream_samples(
  p_session_id uuid,
  p_user_id uuid,
  p_expected_sample_count integer,
  p_expected_ids_md5 text,
  p_minimum_age_days integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  session_user_id uuid;
  session_status text;
  session_start_time timestamptz;
  session_end_time timestamptz;
  current_sample_count integer;
  current_ids_md5 text;
  deleted_sample_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'ACTIVITY_STREAM_ARCHIVE_SERVICE_ROLE_REQUIRED';
  END IF;

  IF p_session_id IS NULL
    OR p_user_id IS NULL
    OR p_expected_sample_count IS NULL
    OR p_expected_ids_md5 IS NULL
    OR p_minimum_age_days IS NULL
    OR p_expected_sample_count <= 0
    OR p_expected_ids_md5 !~ '^[0-9a-f]{32}$'
    OR p_minimum_age_days < 90
    OR p_minimum_age_days > 3650
  THEN
    RAISE EXCEPTION 'ACTIVITY_STREAM_ARCHIVE_RETENTION_REQUIREMENT_FAILED';
  END IF;

  SELECT sessions.user_id, sessions.status::text, sessions.start_time, sessions.end_time
    INTO session_user_id, session_status, session_start_time, session_end_time
  FROM public.activity_sessions AS sessions
  WHERE sessions.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND
    OR session_user_id <> p_user_id
    OR session_status <> 'completed'
    OR session_start_time IS NULL
    OR session_end_time IS NULL
    OR session_start_time >= now() - make_interval(days => p_minimum_age_days)
  THEN
    RETURN false;
  END IF;

  SELECT
    count(*)::integer,
    md5(COALESCE(string_agg(samples.id::text, ',' ORDER BY samples.id), ''))
    INTO current_sample_count, current_ids_md5
  FROM public.activity_stream_samples AS samples
  WHERE samples.session_id = p_session_id
    AND samples.user_id = p_user_id;

  IF current_sample_count <> p_expected_sample_count OR current_ids_md5 <> p_expected_ids_md5 THEN
    RETURN false;
  END IF;

  DELETE FROM public.activity_stream_samples AS samples
  WHERE samples.session_id = p_session_id
    AND samples.user_id = p_user_id;
  GET DIAGNOSTICS deleted_sample_count = ROW_COUNT;

  RETURN deleted_sample_count = p_expected_sample_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_archived_activity_stream_samples(uuid, uuid, integer, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_archived_activity_stream_samples(uuid, uuid, integer, text, integer)
  TO service_role;
