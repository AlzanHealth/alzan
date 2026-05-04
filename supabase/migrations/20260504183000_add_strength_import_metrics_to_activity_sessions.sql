alter table public.activity_sessions
  add column if not exists min_heart_rate numeric,
  add column if not exists tss_hr numeric,
  add column if not exists epoc numeric,
  add column if not exists pte numeric;
