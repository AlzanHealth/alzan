# Hiking (Senderismo) Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full Hiking (Senderismo) support including modalities, goals, custom builder/form settings (superficie, zapatillas utilizadas coming soon, carga base), and verification of wearable provider mappings.

**Architecture:** Database seed script to insert Hiking base load and boots options, followed by updating translations, custom frontend builder interface, session manual log form, and session detail view.

**Tech Stack:** React Native, Expo, Supabase, PostgreSQL.

---

## User Review Required

> [!NOTE]
> Like Football, Tennis, and Padel, Hiking does not have workout step/interval design support. Hence, the Workout Settings card block and the Session Summary panel are hidden in the builder screen.

---

## Open Questions

> [!NOTE]
> None. Modalities, goals, and custom fields have been aligned with the requirements.

---

## Proposed Changes

### Database & Supabase

#### [NEW] [20260528171500_add_hiking_options.sql](file:///Users/josep/Projects/alzan/supabase/migrations/20260528171500_add_hiking_options.sql)
- **Step 1: Create SQL migration file**
  Create the migration file `supabase/migrations/20260528171500_add_hiking_options.sql` containing:
  ```sql
  -- 1. Clean up existing hiking options
  DELETE FROM "public"."sport_catalog_options"
  WHERE "sport_type" = 'hiking';

  -- Modalities: gentle_route (Ruta suave), elevation_route (Ruta con desnivel), trekking (Trekking), high_mountain (Alta montaña), urban_walk (Caminata urbana)
  INSERT INTO "public"."sport_catalog_options"
    ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
  VALUES
    ('hiking', 'modality', 'gentle_route', 'training.sportOptionGentleRoute', 'training.modalityLabel', 10),
    ('hiking', 'modality', 'elevation_route', 'training.sportOptionElevationRoute', 'training.modalityLabel', 20),
    ('hiking', 'modality', 'trekking', 'training.sportOptionTrekking', 'training.modalityLabel', 30),
    ('hiking', 'modality', 'high_mountain', 'training.sportOptionHighMountain', 'training.modalityLabel', 40),
    ('hiking', 'modality', 'urban_walk', 'training.sportOptionUrbanWalk', 'training.modalityLabel', 50);

  -- Goals: route (Ruta), elevation (Desnivel), endurance (Resistencia), recovery (Recuperación), technique (Técnica)
  INSERT INTO "public"."sport_catalog_options"
    ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
  VALUES
    ('hiking', 'goal', 'route', 'training.sportOptionRoute', 'training.mainGoal', 10),
    ('hiking', 'goal', 'elevation', 'training.sportOptionElevation', 'training.mainGoal', 20),
    ('hiking', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 30),
    ('hiking', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 40),
    ('hiking', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 50);

  -- Terrains/Surfaces: urban (Urbano), trail (Sendero), rocky (Rocoso), high_mountain (Alta montaña), mixed (Mixto)
  INSERT INTO "public"."sport_catalog_options"
    ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
  VALUES
    ('hiking', 'terrain', 'urban', 'training.sportOptionUrban', 'training.surfaceLabel', 10),
    ('hiking', 'terrain', 'trail', 'training.sportOptionTrail', 'training.surfaceLabel', 20),
    ('hiking', 'terrain', 'rocky', 'training.sportOptionRocky', 'training.surfaceLabel', 30),
    ('hiking', 'terrain', 'high_mountain', 'training.sportOptionHighMountain', 'training.surfaceLabel', 40),
    ('hiking', 'terrain', 'mixed', 'training.sportOptionMixed', 'training.surfaceLabel', 50);

  -- Base Load: low (Baja), medium (Media), high (Alta), very_high (Muy Alta)
  INSERT INTO "public"."sport_catalog_options"
    ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
  VALUES
    ('hiking', 'base_load', 'low', 'training.loadLow', 'training.loadLabel', 10),
    ('hiking', 'base_load', 'medium', 'training.loadMedium', 'training.loadLabel', 20),
    ('hiking', 'base_load', 'high', 'training.loadHigh', 'training.loadLabel', 30),
    ('hiking', 'base_load', 'very_high', 'training.loadVeryHigh', 'training.loadLabel', 40);

  -- Shoes: coming_soon
  INSERT INTO "public"."sport_catalog_options"
    ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
  VALUES
    ('hiking', 'boots', 'coming_soon', 'training.comingSoon', 'training.shoesLabel', 10);
  ```

- [ ] **Step 2: Reset Supabase database and apply migration**
  Run: `supabase db reset`
  Expected: Migration succeeds.

- [ ] **Step 3: Regenerate types**
  Run: `pnpm run supabase:types`
  Expected: Database types regenerated and copied.

---

### Frontend

#### [MODIFY] [en.ts](file:///Users/josep/Projects/alzan/alzan-fe/src/i18n/locales/en.ts)
#### [MODIFY] [es.ts](file:///Users/josep/Projects/alzan/alzan-fe/src/i18n/locales/es.ts)
- [ ] **Step 1: Add Hiking-specific translation keys**
  Define `shoesLabel` translation key under `training`:
  - `es.ts`:
    ```typescript
    shoesLabel: 'Zapatillas utilizadas',
    ```
  - `en.ts`:
    ```typescript
    shoesLabel: 'Shoes used',
    ```

#### [MODIFY] [EnduranceWorkoutBuilderScreen.tsx](file:///Users/josep/Projects/alzan/alzan-fe/src/screens/training/EnduranceWorkoutBuilderScreen.tsx)
- [ ] **Step 2: Update builder interface layout and state for Hiking**
  - Set `showSummary` to false for hiking:
    `const showSummary = sportType !== 'football' && sportType !== 'tennis' && sportType !== 'padel' && sportType !== 'hiking';`
  - Set `baseLoadOptions` to fetch when `sportType === 'hiking'`:
    `const baseLoadOptions = ['football', 'tennis', 'padel', 'hiking'].includes(sportType || '') ? getOptions(sportType, 'base_load') : [];`
  - Render Block 2: Detalles de la plantilla for `hiking` (Surface, Base Load, and Shoes Used coming soon).
    - Col 1 Icon (terrain): `sportType === 'football' ? 'grass' : sportType === 'tennis' ? 'rhombus-split' : sportType === 'padel' ? 'tennis-ball' : 'image-filter-hdr'`
    - Col 3 Icon (gear): `sportType === 'tennis' ? 'tennis' : sportType === 'padel' ? 'tennis-ball' : sportType === 'hiking' ? 'shoe-sneaker' : 'shoe-cleat'`
    - Col 3 Label: `sportType === 'tennis' ? t('training.racketLabel') : sportType === 'padel' ? t('training.palaLabel') : sportType === 'hiking' ? t('training.shoesLabel') : t('training.bootsLabel')`
  - In `handleSave`, append `boots_used: (sportType === 'football' || sportType === 'hiking') ? bootsUsed : null` and `base_load: (sportType === 'football' || sportType === 'tennis' || sportType === 'padel' || sportType === 'hiking') ? baseLoad : null`.
  - Update compact summary and configuration Settings card checks to hide when `sportType === 'hiking'`.

#### [MODIFY] [EnduranceSessionFormScreen.tsx](file:///Users/josep/Projects/alzan/alzan-fe/src/screens/training/EnduranceSessionFormScreen.tsx)
- [ ] **Step 3: Support Hiking specific block in manual session log form**
  - Render a Hiking configuration block inside the form containing:
    - Modality (Ruta suave / Ruta con desnivel / Trekking / Alta montaña / Caminata urbana).
    - Base Load (Baja / Media / Alta / Muy Alta).
    - Surface (Urbano / Sendero / Rocoso / Alta montaña / Mixto).
    - Zapatillas Utilizadas (Coming Soon - styled with opacity: 0.5, disabled).
  - Map `sport_subtype` for hiking in manual session save payload:
    `sport_subtype: ['swimming', 'football', 'tennis', 'padel', 'hiking'].includes(sportType) ? sportSubtype : null`
  - Save `boots_used: ['football', 'hiking'].includes(sportType) ? 'coming_soon' : null` in manual save payload.
  - Save `base_load` and `surface` when `sportType === 'hiking'`.
  - Validate modality is selected for hiking before saving.

#### [MODIFY] [EnduranceSessionDetailScreen.tsx](file:///Users/josep/Projects/alzan/alzan-fe/src/screens/training/EnduranceSessionDetailScreen.tsx)
- [ ] **Step 4: Display Hiking fields in session details**
  - Push base load and shoes used details to `secondaryMetrics` when `session.sport_type === 'hiking'`:
    ```typescript
    if (session.sport_type === 'hiking') {
      if (session.base_load) {
        secondaryMetrics.push({
          key: 'hiking-base-load',
          label: t('training.loadLabel'),
          value: getOptionLabel(session.sport_type, session.base_load, 'base_load'),
        });
      }
      secondaryMetrics.push({
        key: 'hiking-boots',
        label: t('training.shoesLabel'),
        value: t('training.comingSoon'),
      });
    }
    ```

---

### Backend Verification
- [ ] **Step 1: Verify all 12 provider integrations map Hiking to `hiking` sportType**
  Confirm the mappers correctly map hiking.

---

## Verification Plan

### Automated Tests
- Run `pnpm --prefix alzan-fe run typecheck`
- Run `pnpm --prefix alzan-be run typecheck`
- Run `pnpm run verify:activity-import`
- Run `pnpm format:check` && `pnpm lint:check`

### Manual Verification
- Launch the simulator, navigate to workout builder, select **Senderismo**, and verify the builder layout (Block 1 with Estimated Duration directly under modality selection, Block 2 for Surface, Base load, and Zapatillas coming soon, and no Workout settings card / Session summary).
- Save a template and verify it inserts correctly in database.
- Go to manual session log, register a Senderismo session, save it, and verify that the session details display tags and secondary metrics correctly.
