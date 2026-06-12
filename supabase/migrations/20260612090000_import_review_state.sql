-- Import review state for externally imported activities.
-- Stores template-match suggestions, duplicate-detection results, and
-- pending watch metrics awaiting user consent (strength conflicts).

CREATE TYPE import_match_method_enum AS ENUM ('structural', 'totals');
CREATE TYPE import_duplicate_resolution_enum AS ENUM ('pending', 'merged', 'kept_both');

ALTER TABLE public.activity_sessions
  ADD COLUMN suggested_endurance_template_id uuid REFERENCES public.endurance_workout_templates(id) ON DELETE SET NULL,
  ADD COLUMN template_match_score numeric(5,2),
  ADD COLUMN template_match_method import_match_method_enum,
  ADD COLUMN duplicate_of_session_id uuid REFERENCES public.activity_sessions(id) ON DELETE SET NULL,
  ADD COLUMN duplicate_score numeric(5,2),
  ADD COLUMN duplicate_resolution import_duplicate_resolution_enum,
  ADD COLUMN pending_watch_metrics jsonb,
  ADD COLUMN needs_strength_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.activity_sessions.suggested_endurance_template_id IS
  'Template suggested by import matching (60-79% score); user decides to associate or keep generic.';
COMMENT ON COLUMN public.activity_sessions.template_match_score IS
  'Score (0-100) of the auto-associated or suggested template match.';
COMMENT ON COLUMN public.activity_sessions.template_match_method IS
  'How the template match score was computed: structural (laps/intervals) or totals.';
COMMENT ON COLUMN public.activity_sessions.duplicate_of_session_id IS
  'Existing same-sport same-day session this imported session may duplicate.';
COMMENT ON COLUMN public.activity_sessions.duplicate_score IS
  'Similarity score (0-100) against duplicate_of_session_id.';
COMMENT ON COLUMN public.activity_sessions.duplicate_resolution IS
  'pending = user has not decided yet; merged / kept_both = user decision applied.';
COMMENT ON COLUMN public.activity_sessions.pending_watch_metrics IS
  'Watch metrics (duration/kcal/HR/physio) awaiting user consent because they conflict with existing values.';
COMMENT ON COLUMN public.activity_sessions.needs_strength_review IS
  'Imported strength session created while multiple strength sessions existed today; user must pick where it belongs.';

CREATE INDEX IF NOT EXISTS idx_activity_sessions_user_sport_start
  ON public.activity_sessions (user_id, sport_type, start_time);
