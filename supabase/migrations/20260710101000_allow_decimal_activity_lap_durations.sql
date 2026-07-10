ALTER TABLE public.activity_laps
ALTER COLUMN duration_s TYPE numeric
USING duration_s::numeric;
