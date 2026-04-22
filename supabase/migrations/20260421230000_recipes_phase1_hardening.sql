-- Phase 1 hardening for private recipes:
-- - recipe nutrition snapshot (per 100g)
-- - soft delete support
-- - mobile-friendly indexes
-- - RLS alignment with soft delete
-- - uniqueness alignment with soft delete

alter table public.recipes
  add column if not exists deleted_at timestamptz,
  add column if not exists kcal_100 numeric not null default 0,
  add column if not exists protein_g_100 numeric not null default 0,
  add column if not exists carbs_g_100 numeric not null default 0,
  add column if not exists fat_g_100 numeric not null default 0;

with recipe_rollup as (
  select
    ri.recipe_id,
    sum((coalesce(i.kcal_100, 0) * ri.quantity) / 100.0) as total_kcal,
    sum((coalesce(i.protein_g_100, 0) * ri.quantity) / 100.0) as total_protein,
    sum((coalesce(i.carbs_g_100, 0) * ri.quantity) / 100.0) as total_carbs,
    sum((coalesce(i.fat_g_100, 0) * ri.quantity) / 100.0) as total_fat,
    sum(ri.quantity) as total_weight
  from public.recipe_items ri
  join public.ingredients i on i.id = ri.ingredient_id
  group by ri.recipe_id
)
update public.recipes r
set
  kcal_100 = round(
    case when rr.total_weight > 0 then (rr.total_kcal * 100.0 / rr.total_weight) else 0 end
  , 2),
  protein_g_100 = round(
    case when rr.total_weight > 0 then (rr.total_protein * 100.0 / rr.total_weight) else 0 end
  , 2),
  carbs_g_100 = round(
    case when rr.total_weight > 0 then (rr.total_carbs * 100.0 / rr.total_weight) else 0 end
  , 2),
  fat_g_100 = round(
    case when rr.total_weight > 0 then (rr.total_fat * 100.0 / rr.total_weight) else 0 end
  , 2)
from recipe_rollup rr
where r.id = rr.recipe_id;

drop index if exists public.ux_recipes_system_name_norm_es;
create unique index if not exists ux_recipes_system_name_norm_es
  on public.recipes(name_norm_es)
  where owner_user_id is null and deleted_at is null;

drop index if exists public.ux_recipes_user_name_norm_es;
create unique index if not exists ux_recipes_user_name_norm_es
  on public.recipes(owner_user_id, name_norm_es)
  where owner_user_id is not null and deleted_at is null;

create index if not exists idx_recipes_owner_updated_at
  on public.recipes(owner_user_id, updated_at desc)
  where owner_user_id is not null and deleted_at is null;

create index if not exists idx_recipes_source_visibility
  on public.recipes(source, visibility)
  where deleted_at is null;

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
  )
);

drop policy if exists recipes_insert_own on public.recipes;
create policy recipes_insert_own
on public.recipes
for insert
to authenticated
with check (
  deleted_at is null
  and owner_user_id = auth.uid()
  and source = 'user'::public.recipe_source_enum
);

drop policy if exists recipes_update_own_user on public.recipes;
create policy recipes_update_own_user
on public.recipes
for update
to authenticated
using (
  deleted_at is null
  and owner_user_id = auth.uid()
  and source = 'user'::public.recipe_source_enum
)
with check (
  owner_user_id = auth.uid()
  and source = 'user'::public.recipe_source_enum
);

drop policy if exists recipes_delete_own_user on public.recipes;
create policy recipes_delete_own_user
on public.recipes
for delete
to authenticated
using (
  deleted_at is null
  and owner_user_id = auth.uid()
  and source = 'user'::public.recipe_source_enum
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
      )
  )
);

drop policy if exists recipe_items_insert_own_parent on public.recipe_items;
create policy recipe_items_insert_own_parent
on public.recipe_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.deleted_at is null
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

drop policy if exists recipe_items_update_own_parent on public.recipe_items;
create policy recipe_items_update_own_parent
on public.recipe_items
for update
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.deleted_at is null
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
)
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.deleted_at is null
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

drop policy if exists recipe_items_delete_own_parent on public.recipe_items;
create policy recipe_items_delete_own_parent
on public.recipe_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.deleted_at is null
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
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
      )
  )
);

drop policy if exists recipe_aliases_insert_own_parent on public.recipe_aliases;
create policy recipe_aliases_insert_own_parent
on public.recipe_aliases
for insert
to authenticated
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.deleted_at is null
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

drop policy if exists recipe_aliases_update_own_parent on public.recipe_aliases;
create policy recipe_aliases_update_own_parent
on public.recipe_aliases
for update
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.deleted_at is null
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
)
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.deleted_at is null
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

drop policy if exists recipe_aliases_delete_own_parent on public.recipe_aliases;
create policy recipe_aliases_delete_own_parent
on public.recipe_aliases
for delete
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.deleted_at is null
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

create or replace function public.refresh_recipe_snapshot(p_recipe_id uuid)
returns void
language plpgsql
as $$
declare
  v_total_weight numeric := 0;
  v_total_kcal numeric := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
begin
  select
    coalesce(sum(ri.quantity), 0),
    coalesce(sum((coalesce(i.kcal_100, 0) * ri.quantity) / 100.0), 0),
    coalesce(sum((coalesce(i.protein_g_100, 0) * ri.quantity) / 100.0), 0),
    coalesce(sum((coalesce(i.carbs_g_100, 0) * ri.quantity) / 100.0), 0),
    coalesce(sum((coalesce(i.fat_g_100, 0) * ri.quantity) / 100.0), 0)
  into
    v_total_weight,
    v_total_kcal,
    v_total_protein,
    v_total_carbs,
    v_total_fat
  from public.recipe_items ri
  join public.ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = p_recipe_id;

  update public.recipes r
  set
    kcal_100 = round(case when v_total_weight > 0 then (v_total_kcal * 100.0 / v_total_weight) else 0 end, 2),
    protein_g_100 = round(case when v_total_weight > 0 then (v_total_protein * 100.0 / v_total_weight) else 0 end, 2),
    carbs_g_100 = round(case when v_total_weight > 0 then (v_total_carbs * 100.0 / v_total_weight) else 0 end, 2),
    fat_g_100 = round(case when v_total_weight > 0 then (v_total_fat * 100.0 / v_total_weight) else 0 end, 2),
    updated_at = now()
  where r.id = p_recipe_id;
end;
$$;

create or replace function public.trg_refresh_recipe_snapshot()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_recipe_snapshot(coalesce(new.recipe_id, old.recipe_id));
  return null;
end;
$$;

drop trigger if exists refresh_recipe_snapshot_after_recipe_item_change on public.recipe_items;
create trigger refresh_recipe_snapshot_after_recipe_item_change
after insert or update or delete on public.recipe_items
for each row
execute function public.trg_refresh_recipe_snapshot();
