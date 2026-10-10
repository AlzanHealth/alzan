-- Heart-rate zone profiles live in the existing per-user training settings JSON.
-- The user_preferences row is already protected by owner-only RLS policies.
COMMENT ON COLUMN public.user_preferences.training_settings IS
  'Per-user training preferences, including optional heart-rate zone profile metadata and ranges.';
