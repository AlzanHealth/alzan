-- Tracks when the user has acknowledged the post-import review summary of an
-- activity (Strava-like "new activity" prompt). Hard conflicts surface
-- regardless of this column; the soft "new import" notice clears once seen.

ALTER TABLE public.activity_sessions
  ADD COLUMN import_review_seen_at timestamptz;

COMMENT ON COLUMN public.activity_sessions.import_review_seen_at IS
  'When the user opened or dismissed the post-import review summary for this imported session. NULL = not yet reviewed.';
