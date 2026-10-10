ALTER TABLE public.sleep_sessions
  ADD COLUMN max_spo2_pct numeric CHECK (max_spo2_pct IS NULL OR max_spo2_pct BETWEEN 0 AND 100);
