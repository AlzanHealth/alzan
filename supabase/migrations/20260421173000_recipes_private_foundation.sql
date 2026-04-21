-- Foundation for private user recipes now, public sharing later.
-- Includes:
-- 1) recipes ownership/source/visibility model
-- 2) backfill for existing catalog recipes
-- 3) uniqueness model for system vs user recipes
-- 4) RLS for recipes + child tables
-- 5) legacy function alignment: import_recipes_batch -> description_es/description_en

-- 1) Enums (idempotent)
do $$
begin
  create type public.recipe_source_enum as enum ('system', 'user');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.recipe_visibility_enum as enum ('private', 'public');
exception
  when duplicate_object then null;
end
$$;

-- 2) Columns for recipe ownership and visibility
alter table public.recipes
  add column if not exists owner_user_id uuid,
  add column if not exists source public.recipe_source_enum,
  add column if not exists visibility public.recipe_visibility_enum;

-- FK for owner_user_id (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipes_owner_user_id_fkey'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_owner_user_id_fkey
      foreign key (owner_user_id)
      references public.users(id)
      on delete cascade;
  end if;
end
$$;

-- 3) Backfill current recipes as system/public catalog
update public.recipes
set source = 'system'::public.recipe_source_enum
where source is null;

update public.recipes
set visibility = 'public'::public.recipe_visibility_enum
where visibility is null;

-- Existing rows are catalog/system by default.
update public.recipes
set owner_user_id = null
where source = 'system'::public.recipe_source_enum
  and owner_user_id is distinct from null;

-- Defaults for future app-created recipes (private user recipes)
alter table public.recipes
  alter column source set default 'user'::public.recipe_source_enum,
  alter column visibility set default 'private'::public.recipe_visibility_enum;

-- Make source/visibility mandatory after backfill
alter table public.recipes
  alter column source set not null,
  alter column visibility set not null;

-- Enforce recipe model invariants:
-- system recipes: owner null + public
-- user recipes: owner required
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipes_source_visibility_owner_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_source_visibility_owner_check
      check (
        (source = 'system'::public.recipe_source_enum and owner_user_id is null and visibility = 'public'::public.recipe_visibility_enum)
        or
        (source = 'user'::public.recipe_source_enum and owner_user_id is not null)
      );
  end if;
end
$$;

-- 4) Uniqueness model for system and user scopes
-- Remove old global unique constraints if present
alter table public.recipes drop constraint if exists recipes_name_norm_es_key;
alter table public.recipe_aliases drop constraint if exists recipe_aliases_alias_norm_es_key;

-- System recipes: unique name within system namespace
create unique index if not exists ux_recipes_system_name_norm_es
  on public.recipes(name_norm_es)
  where owner_user_id is null;

-- User recipes: unique name per owner
create unique index if not exists ux_recipes_user_name_norm_es
  on public.recipes(owner_user_id, name_norm_es)
  where owner_user_id is not null;

-- Alias uniqueness scoped to each recipe
create unique index if not exists ux_recipe_aliases_recipe_alias_norm_es
  on public.recipe_aliases(recipe_id, alias_norm_es);

-- 5) RLS policies
-- Remove broad legacy read policies
DROP POLICY IF EXISTS recipes_select_all_authenticated ON public.recipes;
DROP POLICY IF EXISTS recipe_items_select_all_authenticated ON public.recipe_items;
DROP POLICY IF EXISTS recipe_aliases_select_all_authenticated ON public.recipe_aliases;

-- recipes: select own private + public + system
create policy recipes_select_visible
on public.recipes
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or source = 'system'::public.recipe_source_enum
);

-- recipes: insert only own user recipes
create policy recipes_insert_own
on public.recipes
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and source = 'user'::public.recipe_source_enum
);

-- recipes: update only own user recipes
create policy recipes_update_own_user
on public.recipes
for update
to authenticated
using (
  owner_user_id = auth.uid()
  and source = 'user'::public.recipe_source_enum
)
with check (
  owner_user_id = auth.uid()
  and source = 'user'::public.recipe_source_enum
);

-- recipes: delete only own user recipes
create policy recipes_delete_own_user
on public.recipes
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  and source = 'user'::public.recipe_source_enum
);

-- recipe_items: select allowed only if parent recipe is visible
create policy recipe_items_select_visible_parent
on public.recipe_items
for select
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and (
        r.owner_user_id = auth.uid()
        or r.source = 'system'::public.recipe_source_enum
      )
  )
);

-- recipe_items: manage only via owned user recipe
create policy recipe_items_insert_own_parent
on public.recipe_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

create policy recipe_items_update_own_parent
on public.recipe_items
for update
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
)
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

create policy recipe_items_delete_own_parent
on public.recipe_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_items.recipe_id
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

-- recipe_aliases: select allowed only if parent recipe is visible
create policy recipe_aliases_select_visible_parent
on public.recipe_aliases
for select
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and (
        r.owner_user_id = auth.uid()
        or r.source = 'system'::public.recipe_source_enum
      )
  )
);

-- 5.1) Favorites persisted in DB (own rows only)
create table if not exists public.recipe_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);

create index if not exists idx_recipe_favorites_user_id on public.recipe_favorites(user_id);
create index if not exists idx_recipe_favorites_recipe_id on public.recipe_favorites(recipe_id);

alter table public.recipe_favorites enable row level security;

create policy recipe_favorites_select_own
on public.recipe_favorites
for select
to authenticated
using (user_id = auth.uid());

create policy recipe_favorites_insert_own
on public.recipe_favorites
for insert
to authenticated
with check (user_id = auth.uid());

create policy recipe_favorites_delete_own
on public.recipe_favorites
for delete
to authenticated
using (user_id = auth.uid());

-- recipe_aliases: manage only via owned user recipe
create policy recipe_aliases_insert_own_parent
on public.recipe_aliases
for insert
to authenticated
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

create policy recipe_aliases_update_own_parent
on public.recipe_aliases
for update
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
)
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

create policy recipe_aliases_delete_own_parent
on public.recipe_aliases
for delete
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_aliases.recipe_id
      and r.owner_user_id = auth.uid()
      and r.source = 'user'::public.recipe_source_enum
  )
);

-- 6) Fix legacy import function to new schema columns
CREATE OR REPLACE FUNCTION public.import_recipes_batch(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_recipe      jsonb;
  v_recipe_id   uuid;
  v_name_es     text;
  v_name_en     text;
  v_desc_es     text;
  v_desc_en     text;
  v_quality     numeric;
  v_name_norm   text;
  v_existing_id uuid;
  v_has_missing_ingredient boolean;
  v_inserted_count integer := 0;
BEGIN
  FOR v_recipe IN
    SELECT jsonb_array_elements(payload->'recipes')
  LOOP
    v_name_es   := v_recipe->>'name_es';
    v_name_en   := v_recipe->>'name_en';
    v_desc_es   := COALESCE(v_recipe->>'description_es', v_recipe->>'description');
    v_desc_en   := v_recipe->>'description_en';
    v_quality   := COALESCE((v_recipe->>'quality_score')::numeric, 0.7);

    v_name_norm := lower(trim(regexp_replace(v_name_es, '\s+', ' ', 'g')));

    -- Check existing only within system namespace
    SELECT r.id
    INTO v_existing_id
    FROM public.recipes r
    WHERE r.name_norm_es = v_name_norm
      AND r.owner_user_id IS NULL;

    IF FOUND THEN
      CONTINUE;
    END IF;

    v_has_missing_ingredient := FALSE;

    IF v_recipe ? 'items' THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_recipe->'items') AS item
        LEFT JOIN public.ingredients i
          ON  lower(i.name_norm_es) = lower(item->>'ingredient_norm_es')
          OR lower(i.name_es)      = lower(item->>'ingredient_norm_es')
          OR lower(i.name_en)      = lower(item->>'ingredient_norm_es')
        WHERE i.id IS NULL
      )
      INTO v_has_missing_ingredient;

      IF v_has_missing_ingredient THEN
        RAISE NOTICE 'Saltando receta % porque falta algún ingrediente', v_name_es;
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.recipes (
      id,
      name_es,
      name_en,
      name_norm_es,
      description_es,
      description_en,
      quality_score,
      owner_user_id,
      source,
      visibility
    )
    VALUES (
      gen_random_uuid(),
      v_name_es,
      v_name_en,
      v_name_norm,
      v_desc_es,
      v_desc_en,
      v_quality,
      NULL,
      'system'::public.recipe_source_enum,
      'public'::public.recipe_visibility_enum
    )
    RETURNING id INTO v_recipe_id;

    v_inserted_count := v_inserted_count + 1;

    IF v_recipe ? 'aliases_es' THEN
      DECLARE
        v_alias text;
        v_alias_norm text;
      BEGIN
        FOR v_alias IN
          SELECT jsonb_array_elements_text(v_recipe->'aliases_es')
        LOOP
          v_alias_norm := lower(trim(regexp_replace(v_alias, '\s+', ' ', 'g')));

          INSERT INTO public.recipe_aliases (
            id,
            recipe_id,
            alias_es,
            alias_norm_es,
            created_at
          )
          VALUES (
            gen_random_uuid(),
            v_recipe_id,
            v_alias,
            v_alias_norm,
            now()
          )
          ON CONFLICT (recipe_id, alias_norm_es) DO NOTHING;
        END LOOP;
      END;
    END IF;

    IF v_recipe ? 'items' THEN
      INSERT INTO public.recipe_items (
        id,
        recipe_id,
        ingredient_id,
        order_index,
        quantity,
        unit,
        notes,
        created_at
      )
      SELECT
        gen_random_uuid(),
        v_recipe_id,
        i.id,
        COALESCE((item->>'order_index')::int, 0),
        COALESCE((item->>'quantity')::numeric, 0),
        COALESCE(item->>'unit', 'g'),
        item->>'notes',
        now()
      FROM jsonb_array_elements(v_recipe->'items') AS item
      JOIN LATERAL (
        SELECT ing.id
        FROM public.ingredients ing
        WHERE
          lower(ing.name_norm_es) = lower(item->>'ingredient_norm_es')
          OR lower(ing.name_es)   = lower(item->>'ingredient_norm_es')
          OR lower(ing.name_en)   = lower(item->>'ingredient_norm_es')
        LIMIT 1
      ) i ON TRUE
      WHERE COALESCE((item->>'quantity')::numeric, 0) > 0;
    END IF;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;
