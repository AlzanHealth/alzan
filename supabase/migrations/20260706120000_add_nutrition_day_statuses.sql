create table if not exists "public"."nutrition_day_statuses" (
  "user_id" uuid not null,
  "date" date not null,
  "status" text not null default 'vacation'::text,
  "note" text,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "nutrition_day_statuses_pkey" primary key ("user_id", "date"),
  constraint "nutrition_day_statuses_user_id_fkey" foreign key ("user_id") references "public"."users"("id") on delete cascade,
  constraint "nutrition_day_statuses_status_check" check ("status" = 'vacation'::text)
);

alter table "public"."nutrition_day_statuses" enable row level security;

drop policy if exists "nutrition_day_statuses_manage_own" on "public"."nutrition_day_statuses";

create policy "nutrition_day_statuses_manage_own"
  on "public"."nutrition_day_statuses"
  to authenticated
  using ("user_id" = (select auth.uid()))
  with check ("user_id" = (select auth.uid()));

create index if not exists "nutrition_day_statuses_user_date_idx"
  on "public"."nutrition_day_statuses" ("user_id", "date");
