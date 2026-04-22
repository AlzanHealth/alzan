-- Phase 2: Public recipes + popularity ranking (without status workflow)
-- Builds on:
-- - 20260421173000_recipes_private_foundation.sql
-- - 20260421230000_recipes_phase1_hardening.sql

-- 1) Schema additions on recipes
alter table public.recipes
  add column if not exists published_at timestamptz,
  add column if not exists public_slug text,
  add column if not exists origin_recipe_id uuid,
  add column if not exists uses_total integer not null default 0,
  add column if not exists uses_30d integer not null default 0,
  add column if not exists uses_7d integer not null default 0,
  add column if not exists users_unique_30d integer not null default 0,
  add column if not exists saves_total integer not null default 0,
  add column if not exists favorites_total integer not null default 0,
  add column if not exists popularity_score numeric not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipes_origin_recipe_id_fkey'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_origin_recipe_id_fkey
      foreign key (origin_recipe_id)
      references public.recipes(id)
      on delete set null;
  end if;
end
$$;

-- For currently public/system recipes, set published_at if absent
update public.recipes
set published_at = coalesce(published_at, created_at)
where deleted_at is null
  and (
    source = 'system'::public.recipe_source_enum
    or visibility = 'public'::public.recipe_visibility_enum
  );

-- Discovery + sharing indexes
create unique index if not exists ux_recipes_public_slug
  on public.recipes(public_slug)
  where public_slug is not null and deleted_at is null;

create index if not exists idx_recipes_public_discovery
  on public.recipes(visibility, source, popularity_score desc, uses_7d desc, updated_at desc)
  where deleted_at is null;

create index if not exists idx_recipes_origin_recipe_id
  on public.recipes(origin_recipe_id)
  where origin_recipe_id is not null and deleted_at is null;

-- 2) Usage event model

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'recipe_usage_context_enum'
  ) then
    create type public.recipe_usage_context_enum as enum ('meal_log', 'planner', 'quick_add');
  end if;
end
$$;

create table if not exists public.recipe_usage_events (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  context public.recipe_usage_context_enum not null,
  used_at timestamptz not null default now(),
  event_bucket_10m timestamptz not null,
  is_public_eligible boolean not null default false
);

create index if not exists idx_recipe_usage_events_recipe_used_at
  on public.recipe_usage_events(recipe_id, used_at desc);

create index if not exists idx_recipe_usage_events_user_used_at
  on public.recipe_usage_events(user_id, used_at desc);

create unique index if not exists ux_recipe_usage_dedupe
  on public.recipe_usage_events(user_id, recipe_id, context, event_bucket_10m);

-- 3) Functions (slug, publish, duplicate, usage logging, aggregates)

create or replace function public.slugify_recipe_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_slug text;
begin
  v_slug := lower(coalesce(trim(p_name), ''));
  v_slug := translate(
    v_slug,
    'áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaaeeeeiiiiooooouuuuncaaaaaaeeeeiiiiooooouuuunc'
  );
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-|-$)', '', 'g');
  v_slug := regexp_replace(v_slug, '-{2,}', '-', 'g');

  if v_slug = '' then
    v_slug := 'receta';
  end if;

  return v_slug;
end;
$$;

create or replace function public.ensure_recipe_public_slug(p_recipe_id uuid)
returns text
language plpgsql
as $$
declare
  v_existing_slug text;
  v_name_es text;
  v_base text;
  v_candidate text;
  v_attempt integer := 0;
  v_suffix text;
begin
  select r.public_slug, r.name_es
  into v_existing_slug, v_name_es
  from public.recipes r
  where r.id = p_recipe_id
    and r.deleted_at is null
  for update;

  if not found then
    raise exception 'recipe_not_found_or_deleted';
  end if;

  if v_existing_slug is not null and btrim(v_existing_slug) <> '' then
    return v_existing_slug;
  end if;

  v_base := public.slugify_recipe_name(v_name_es);
  v_candidate := v_base;

  while exists (
    select 1
    from public.recipes r
    where r.public_slug = v_candidate
      and r.id <> p_recipe_id
      and r.deleted_at is null
  ) loop
    v_attempt := v_attempt + 1;
    v_suffix := substring(md5(p_recipe_id::text || ':' || v_attempt::text), 1, 6);
    v_candidate := v_base || '-' || v_suffix;
  end loop;

  update public.recipes
  set public_slug = v_candidate
  where id = p_recipe_id;

  return v_candidate;
end;
$$;

create or replace function public.publish_recipe(p_recipe_id uuid)
returns void
language plpgsql
as $$
declare
  v_owner_user_id uuid;
  v_source public.recipe_source_enum;
  v_deleted_at timestamptz;
begin
  select r.owner_user_id, r.source, r.deleted_at
  into v_owner_user_id, v_source, v_deleted_at
  from public.recipes r
  where r.id = p_recipe_id;

  if not found then
    raise exception 'recipe_not_found';
  end if;

  if v_deleted_at is not null then
    raise exception 'recipe_deleted';
  end if;

  if v_source <> 'user'::public.recipe_source_enum then
    raise exception 'only_user_recipes_can_be_published';
  end if;

  if v_owner_user_id is distinct from auth.uid() then
    raise exception 'not_recipe_owner';
  end if;

  update public.recipes
  set
    visibility = 'public'::public.recipe_visibility_enum,
    published_at = coalesce(published_at, now()),
    updated_at = now()
  where id = p_recipe_id;

  perform public.ensure_recipe_public_slug(p_recipe_id);
end;
$$;

create or replace function public.unpublish_recipe(p_recipe_id uuid)
returns void
language plpgsql
as $$
declare
  v_owner_user_id uuid;
  v_source public.recipe_source_enum;
  v_deleted_at timestamptz;
begin
  select r.owner_user_id, r.source, r.deleted_at
  into v_owner_user_id, v_source, v_deleted_at
  from public.recipes r
  where r.id = p_recipe_id;

  if not found then
    raise exception 'recipe_not_found';
  end if;

  if v_deleted_at is not null then
    raise exception 'recipe_deleted';
  end if;

  if v_source <> 'user'::public.recipe_source_enum then
    raise exception 'only_user_recipes_can_be_unpublished';
  end if;

  if v_owner_user_id is distinct from auth.uid() then
    raise exception 'not_recipe_owner';
  end if;

  update public.recipes
  set
    visibility = 'private'::public.recipe_visibility_enum,
    published_at = null,
    updated_at = now()
  where id = p_recipe_id;
end;
$$;

create or replace function public.duplicate_recipe(p_recipe_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_source_recipe public.recipes%rowtype;
  v_new_recipe_id uuid;
  v_default_visibility text := 'private';
  v_new_visibility public.recipe_visibility_enum := 'private'::public.recipe_visibility_enum;
  v_name_attempt integer := 1;
  v_new_name_es text;
  v_new_name_norm_es text;
begin
  select r.*
  into v_source_recipe
  from public.recipes r
  where r.id = p_recipe_id
    and r.deleted_at is null
    and (
      r.source = 'system'::public.recipe_source_enum
      or r.visibility = 'public'::public.recipe_visibility_enum
      or r.owner_user_id = auth.uid()
    );

  if not found then
    raise exception 'recipe_not_visible';
  end if;

  select coalesce(up.nutrition_prefs->>'default_recipe_visibility', 'private')
  into v_default_visibility
  from public.user_preferences up
  where up.user_id = auth.uid();

  if v_default_visibility = 'public' then
    v_new_visibility := 'public'::public.recipe_visibility_enum;
  end if;

  v_new_name_es := v_source_recipe.name_es || ' (copia)';
  v_new_name_norm_es := v_source_recipe.name_norm_es || ' copia';

  while exists (
    select 1
    from public.recipes r
    where r.owner_user_id = auth.uid()
      and r.deleted_at is null
      and r.name_norm_es = v_new_name_norm_es
  ) loop
    v_name_attempt := v_name_attempt + 1;
    v_new_name_es := v_source_recipe.name_es || format(' (copia %s)', v_name_attempt);
    v_new_name_norm_es := v_source_recipe.name_norm_es || format(' copia %s', v_name_attempt);
  end loop;

  insert into public.recipes (
    name_es,
    name_en,
    name_norm_es,
    description_es,
    description_en,
    quality_score,
    owner_user_id,
    source,
    visibility,
    published_at,
    public_slug,
    origin_recipe_id,
    kcal_100,
    protein_g_100,
    carbs_g_100,
    fat_g_100
  )
  values (
    v_new_name_es,
    v_source_recipe.name_en,
    v_new_name_norm_es,
    v_source_recipe.description_es,
    v_source_recipe.description_en,
    v_source_recipe.quality_score,
    auth.uid(),
    'user'::public.recipe_source_enum,
    v_new_visibility,
    null,
    null,
    p_recipe_id,
    v_source_recipe.kcal_100,
    v_source_recipe.protein_g_100,
    v_source_recipe.carbs_g_100,
    v_source_recipe.fat_g_100
  )
  returning id into v_new_recipe_id;

  insert into public.recipe_items (
    recipe_id,
    ingredient_id,
    quantity,
    unit,
    order_index
  )
  select
    v_new_recipe_id,
    ri.ingredient_id,
    ri.quantity,
    ri.unit,
    ri.order_index
  from public.recipe_items ri
  where ri.recipe_id = v_source_recipe.id
  order by ri.order_index;

  perform public.refresh_recipe_snapshot(v_new_recipe_id);

  return v_new_recipe_id;
end;
$$;

create or replace function public.log_recipe_usage(
  p_recipe_id uuid,
  p_context public.recipe_usage_context_enum
)
returns void
language plpgsql
as $$
declare
  v_user_id uuid;
  v_target_recipe_id uuid;
  v_is_public_eligible boolean;
  v_event_bucket timestamptz;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select
    coalesce(r.origin_recipe_id, r.id)
  into v_target_recipe_id
  from public.recipes r
  where r.id = p_recipe_id
    and r.deleted_at is null
    and (
      r.source = 'system'::public.recipe_source_enum
      or r.visibility = 'public'::public.recipe_visibility_enum
      or r.owner_user_id = v_user_id
    );

  if not found then
    raise exception 'recipe_not_visible';
  end if;

  select
    (r.deleted_at is null and (r.source = 'system'::public.recipe_source_enum or r.visibility = 'public'::public.recipe_visibility_enum))
  into v_is_public_eligible
  from public.recipes r
  where r.id = v_target_recipe_id;

  v_is_public_eligible := coalesce(v_is_public_eligible, false);
  v_event_bucket := date_bin('10 minutes'::interval, now(), '2000-01-01'::timestamptz);

  insert into public.recipe_usage_events (
    recipe_id,
    user_id,
    context,
    used_at,
    event_bucket_10m,
    is_public_eligible
  )
  values (
    v_target_recipe_id,
    v_user_id,
    p_context,
    now(),
    v_event_bucket,
    v_is_public_eligible
  )
  on conflict (user_id, recipe_id, context, event_bucket_10m)
  do nothing;
end;
$$;

create or replace function public.refresh_recipe_popularity_aggregates()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with usage_agg as (
    select
      rue.recipe_id,
      count(*) filter (where rue.is_public_eligible and rue.used_at >= now() - interval '7 days')::int as uses_7d,
      count(*) filter (where rue.is_public_eligible and rue.used_at >= now() - interval '30 days')::int as uses_30d,
      count(*) filter (where rue.is_public_eligible)::int as uses_total,
      count(distinct rue.user_id) filter (where rue.is_public_eligible and rue.used_at >= now() - interval '30 days')::int as users_unique_30d
    from public.recipe_usage_events rue
    group by rue.recipe_id
  ),
  saves_agg as (
    select
      r.origin_recipe_id as recipe_id,
      count(distinct r.owner_user_id)::int as saves_total
    from public.recipes r
    where r.origin_recipe_id is not null
      and r.deleted_at is null
      and r.source = 'user'::public.recipe_source_enum
    group by r.origin_recipe_id
  ),
  favorites_agg as (
    select
      coalesce(rf_recipe.origin_recipe_id, rf_recipe.id) as recipe_id,
      count(*)::int as favorites_total
    from public.recipe_favorites rf
    join public.recipes rf_recipe on rf_recipe.id = rf.recipe_id
    join public.recipes target_recipe on target_recipe.id = coalesce(rf_recipe.origin_recipe_id, rf_recipe.id)
    where target_recipe.deleted_at is null
      and (
        target_recipe.source = 'system'::public.recipe_source_enum
        or target_recipe.visibility = 'public'::public.recipe_visibility_enum
      )
    group by coalesce(rf_recipe.origin_recipe_id, rf_recipe.id)
  ),
  combined as (
    select
      r.id as recipe_id,
      coalesce(u.uses_7d, 0) as uses_7d,
      coalesce(u.uses_30d, 0) as uses_30d,
      coalesce(u.uses_total, 0) as uses_total,
      coalesce(u.users_unique_30d, 0) as users_unique_30d,
      coalesce(s.saves_total, 0) as saves_total,
      coalesce(f.favorites_total, 0) as favorites_total
    from public.recipes r
    left join usage_agg u on u.recipe_id = r.id
    left join saves_agg s on s.recipe_id = r.id
    left join favorites_agg f on f.recipe_id = r.id
    where r.deleted_at is null
  )
  update public.recipes r
  set
    uses_7d = c.uses_7d,
    uses_30d = c.uses_30d,
    uses_total = c.uses_total,
    users_unique_30d = c.users_unique_30d,
    saves_total = c.saves_total,
    favorites_total = c.favorites_total,
    popularity_score = (
      (c.uses_30d * 1)
      + (c.users_unique_30d * 2)
      + (c.saves_total * 3)
      + (c.favorites_total * 5)
      + (coalesce(r.quality_score, 0) * 10)
    )
  from combined c
  where r.id = c.recipe_id;
end;
$$;

-- Backfill public slugs for already-public recipes

do $$
declare
  v_recipe_id uuid;
begin
  for v_recipe_id in
    select r.id
    from public.recipes r
    where r.deleted_at is null
      and r.public_slug is null
      and (
        r.source = 'system'::public.recipe_source_enum
        or r.visibility = 'public'::public.recipe_visibility_enum
      )
  loop
    perform public.ensure_recipe_public_slug(v_recipe_id);
  end loop;
end
$$;

-- 4) RLS updates for public recipe reads

drop policy if exists recipes_select_visible on public.recipes;
create policy recipes_select_visible
on public.recipes
for select
to authenticated
using (
  deleted_at is null
  and (
    owner_user_id = auth.uid()
    or source = 'system'::public.recipe_source_enum
    or visibility = 'public'::public.recipe_visibility_enum
  )
);

drop policy if exists recipe_items_select_visible_parent on public.recipe_items;
create policy recipe_items_select_visible_parent
on public.recipe_items
for select
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.deleted_at is null
      and (
        r.owner_user_id = auth.uid()
        or r.source = 'system'::public.recipe_source_enum
        or r.visibility = 'public'::public.recipe_visibility_enum
      )
  )
);

drop policy if exists recipe_aliases_select_visible_parent on public.recipe_aliases;
create policy recipe_aliases_select_visible_parent
on public.recipe_aliases
for select
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.deleted_at is null
      and (
        r.owner_user_id = auth.uid()
        or r.source = 'system'::public.recipe_source_enum
        or r.visibility = 'public'::public.recipe_visibility_enum
      )
  )
);

-- Usage events RLS
alter table public.recipe_usage_events enable row level security;

drop policy if exists recipe_usage_events_select_service on public.recipe_usage_events;
create policy recipe_usage_events_select_service
on public.recipe_usage_events
for select
to service_role
using (true);

drop policy if exists recipe_usage_events_insert_own on public.recipe_usage_events;
create policy recipe_usage_events_insert_own
on public.recipe_usage_events
for insert
to authenticated
with check (user_id = auth.uid());

-- 5) Grants for RPC functions
revoke all on function public.publish_recipe(uuid) from public;
revoke all on function public.unpublish_recipe(uuid) from public;
revoke all on function public.duplicate_recipe(uuid) from public;
revoke all on function public.log_recipe_usage(uuid, public.recipe_usage_context_enum) from public;
revoke all on function public.refresh_recipe_popularity_aggregates() from public;

grant execute on function public.publish_recipe(uuid) to authenticated, service_role;
grant execute on function public.unpublish_recipe(uuid) to authenticated, service_role;
grant execute on function public.duplicate_recipe(uuid) to authenticated, service_role;
grant execute on function public.log_recipe_usage(uuid, public.recipe_usage_context_enum) to authenticated, service_role;
grant execute on function public.refresh_recipe_popularity_aggregates() to service_role;

-- 6) Schedule aggregate refresh (if pg_cron is available)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'refresh_recipe_popularity_aggregates_q15') then
      perform cron.unschedule((select jobid from cron.job where jobname = 'refresh_recipe_popularity_aggregates_q15' limit 1));
    end if;

    perform cron.schedule(
      'refresh_recipe_popularity_aggregates_q15',
      '*/15 * * * *',
      'select public.refresh_recipe_popularity_aggregates();'
    );
  end if;
end
$$;

-- Run once after migration
select public.refresh_recipe_popularity_aggregates();
