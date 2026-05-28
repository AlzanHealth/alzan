# Swimming (Natación) Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full Swimming (Natación) support including goals, modalities (Pool & Open Water), pool sizes, stroke styles, and a custom disabled material field, with dynamic options loaded from the database.

**Architecture:** Database schema update to allow new option types (`pool_type`, `stroke`) and swimming configuration columns (`pool_type`, `stroke` on templates/sessions), followed by updating translations, useSportCatalog hook, and adding dynamic configuration rows in the EnduranceWorkoutBuilderScreen.

**Tech Stack:** React Native, Expo, Supabase, PostgreSQL.

---

### Task 1: Database Migration & Type Generation

**Files:**
- Create: `supabase/migrations/20260528103000_add_swimming_columns_and_options.sql`
- Modify: `supabase/database.types.ts`
- Modify: `supabase/requests.types.ts`
- Modify: `alzan-fe/src/types/database.types.ts`
- Modify: `alzan-fe/src/types/requests.types.ts`
- Modify: `alzan-be/src/types/database.types.ts`
- Modify: `alzan-be/src/types/requests.types.ts`

- [ ] **Step 1: Create SQL migration file**
  Create the migration file `supabase/migrations/20260528103000_add_swimming_columns_and_options.sql` containing:
  ```sql
  -- 1. Alter the CHECK constraint on option_type in sport_catalog_options to allow 'pool_type' and 'stroke'
  ALTER TABLE "public"."sport_catalog_options"
    DROP CONSTRAINT IF EXISTS "sport_catalog_options_option_type_check",
    ADD CONSTRAINT "sport_catalog_options_option_type_check"
      CHECK ("option_type" = ANY (ARRAY['goal'::text, 'modality'::text, 'terrain'::text, 'pool_type'::text, 'stroke'::text]));

  -- 2. Add pool_type and stroke columns to endurance_workout_templates
  ALTER TABLE "public"."endurance_workout_templates"
    ADD COLUMN "pool_type" TEXT,
    ADD COLUMN "stroke" TEXT;

  -- 3. Add pool_type and stroke columns to activity_sessions
  ALTER TABLE "public"."activity_sessions"
    ADD COLUMN "pool_type" TEXT,
    ADD COLUMN "stroke" TEXT;

  -- 4. Clean up existing swimming goals and insert the correct ones requested by the user
  DELETE FROM "public"."sport_catalog_options"
  WHERE "sport_type" = 'swimming' AND "option_type" = 'goal';

  INSERT INTO "public"."sport_catalog_options"
    ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
  VALUES
    ('swimming', 'goal', 'endurance', 'training.sportOptionEndurance', 'training.mainGoal', 10),
    ('swimming', 'goal', 'power', 'training.sportOptionPower', 'training.mainGoal', 20),
    ('swimming', 'goal', 'speed', 'training.sportOptionSpeed', 'training.mainGoal', 30),
    ('swimming', 'goal', 'long_route', 'training.sportOptionLongRoute', 'training.mainGoal', 40),
    ('swimming', 'goal', 'recovery', 'training.sportOptionRecovery', 'training.mainGoal', 50),
    ('swimming', 'goal', 'technique', 'training.sportOptionTechnique', 'training.mainGoal', 60);

  -- 5. Insert pool_type options for swimming
  INSERT INTO "public"."sport_catalog_options"
    ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
  VALUES
    ('swimming', 'pool_type', '25m', 'training.poolType25m', 'training.poolTypeLabel', 10),
    ('swimming', 'pool_type', '50m', 'training.poolType50m', 'training.poolTypeLabel', 20),
    ('swimming', 'pool_type', '25yd', 'training.poolType25yd', 'training.poolTypeLabel', 30),
    ('swimming', 'pool_type', 'custom', 'training.poolTypeCustom', 'training.poolTypeLabel', 40);

  -- 6. Insert stroke options for swimming
  INSERT INTO "public"."sport_catalog_options"
    ("sport_type", "option_type", "option_key", "translation_key", "group_translation_key", "sort_order")
  VALUES
    ('swimming', 'stroke', 'freestyle', 'training.strokeFreestyle', 'training.strokeLabel', 10),
    ('swimming', 'stroke', 'backstroke', 'training.strokeBackstroke', 'training.strokeLabel', 20),
    ('swimming', 'stroke', 'breaststroke', 'training.strokeBreaststroke', 'training.strokeLabel', 30),
    ('swimming', 'stroke', 'butterfly', 'training.strokeButterfly', 'training.strokeLabel', 40),
    ('swimming', 'stroke', 'medley', 'training.strokeMedley', 'training.strokeLabel', 50);
  ```

- [ ] **Step 2: Reset Supabase database and apply migration**
  Run command: `supabase db reset`
  Expected: Database reset successfully and migration applied.

- [ ] **Step 3: Regenerate database types**
  Run command: `pnpm run supabase:types`
  Expected: Types regenerated and copied across frontend and backend.

- [ ] **Step 4: Commit DB migration**
  Run command: `git add supabase/migrations/20260528103000_add_swimming_columns_and_options.sql supabase/database.types.ts supabase/requests.types.ts alzan-fe/src/types/database.types.ts alzan-fe/src/types/requests.types.ts alzan-be/src/types/database.types.ts alzan-be/src/types/requests.types.ts` and commit.

---

### Task 2: Update Hook, Translations, and Builder Interface Types

**Files:**
- Modify: `alzan-fe/src/hooks/useSportCatalog.ts`
- Modify: `alzan-fe/src/i18n/locales/en.ts`
- Modify: `alzan-fe/src/i18n/locales/es.ts`
- Modify: `alzan-fe/src/hooks/useEnduranceWorkoutBuilder.ts`

- [ ] **Step 1: Update useSportCatalog hook options type check**
  In `alzan-fe/src/hooks/useSportCatalog.ts`, add `'pool_type'` and `'stroke'` to `SportCatalogOptionType` and `OPTION_TYPES`:
  ```typescript
  export type SportCatalogOptionType = 'goal' | 'modality' | 'terrain' | 'pool_type' | 'stroke';
  const OPTION_TYPES: SportCatalogOptionType[] = ['goal', 'modality', 'terrain', 'pool_type', 'stroke'];
  ```

- [ ] **Step 2: Add translation keys in es.ts**
  In `alzan-fe/src/i18n/locales/es.ts`, add:
  ```typescript
  poolTypeLabel: 'Piscina',
  strokeLabel: 'Estilo',
  materialLabel: 'Material',
  poolType25m: '25 metros (Sola corta)',
  poolType50m: '50 metros (Olímpica)',
  poolType25yd: '25 yardas',
  poolTypeCustom: 'Personalizado',
  strokeFreestyle: 'Libre / Crol',
  strokeBackstroke: 'Espalda',
  strokeBreaststroke: 'Braza',
  strokeButterfly: 'Mariposa',
  strokeMedley: 'Estilos',
  ```

- [ ] **Step 3: Add translation keys in en.ts**
  In `alzan-fe/src/i18n/locales/en.ts`, add:
  ```typescript
  poolTypeLabel: 'Pool',
  strokeLabel: 'Stroke',
  materialLabel: 'Equipment',
  poolType25m: '25 meters (Short course)',
  poolType50m: '50 meters (Olympic)',
  poolType25yd: '25 yards',
  poolTypeCustom: 'Custom',
  strokeFreestyle: 'Freestyle / Crawl',
  strokeBackstroke: 'Backstroke',
  strokeBreaststroke: 'Breaststroke',
  strokeButterfly: 'Butterfly',
  strokeMedley: 'Individual Medley',
  ```

- [ ] **Step 4: Update useEnduranceWorkoutBuilder types**
  In `alzan-fe/src/hooks/useEnduranceWorkoutBuilder.ts`, add `pool_type` and `stroke` to `BuilderTemplateData` interface, update payload in `insert` and `update` calls:
  ```typescript
  export interface BuilderTemplateData {
    // ... existing
    pool_type?: string | null;
    stroke?: string | null;
  }
  ```

- [ ] **Step 5: Run format and verify lint**
  Run: `pnpm format`
  Expected: PASS

---

### Task 3: Update EnduranceWorkoutBuilderScreen Selectors and UI

**Files:**
- Modify: `alzan-fe/src/screens/training/EnduranceWorkoutBuilderScreen.tsx`

- [ ] **Step 1: Add state variables and modals visibility**
  Add state variables in `EnduranceWorkoutBuilderScreen.tsx`:
  ```typescript
  const [poolType, setPoolType] = useState<string | null>(null);
  const [stroke, setStroke] = useState<string | null>(null);

  const [poolTypeModalVisible, setPoolTypeModalVisible] = useState(false);
  const [strokeModalVisible, setStrokeModalVisible] = useState(false);
  ```

- [ ] **Step 2: Hydrate poolType and stroke on existing template load**
  Inside `useEffect` loading `existingTemplate`, set the state variables:
  ```typescript
  setPoolType(existingTemplate.pool_type || null);
  setStroke(existingTemplate.stroke || null);
  ```

- [ ] **Step 3: Update handleSave fields validation and execution**
  In `handleSave`, add validation for `type` when sportType is swimming:
  ```typescript
  if ((sportType === 'running' || sportType === 'cycling' || sportType === 'swimming') && !environmentType) {
    missingFields.push('type');
  }
  ```
  Pass `pool_type: poolType` and `stroke: stroke` to `saveWorkout.mutateAsync` in `executeSave`.

- [ ] **Step 4: Enable workout steps design for swimming**
  Allow swimming to design structured workout templates by updating the display condition for Block 4:
  ```typescript
  {['running', 'cycling', 'swimming'].includes(sportType || '') && (
    // Diseñar entreno section
  )}
  ```

- [ ] **Step 5: Render configuration rows dynamically for swimming**
  In the configuration block, if `sportType === 'swimming'`:
  - If modality is `pool`, show "Piscina" row (opens poolType selector modal).
  - Show "Estilo" row (opens stroke selector modal).
  - Show "Material" row (Coming soon, opacity 0.5, disabled).
  Add the modal sheets at the bottom of the screen to select the options.

---

### Task 4: Update EnduranceSessionDetailScreen and EnduranceSessionFormScreen

**Files:**
- Modify: `alzan-fe/src/screens/training/EnduranceSessionDetailScreen.tsx`
- Modify: `alzan-fe/src/screens/training/EnduranceSessionFormScreen.tsx`

- [ ] **Step 1: Display Pool Type and Stroke in details screen**
  In `EnduranceSessionDetailScreen.tsx`, render the selected pool type and stroke details if the session is swimming.

- [ ] **Step 2: Map and save Pool Type and Stroke in session form**
  Update `EnduranceSessionFormScreen.tsx` to display pool type and stroke options when logging a manual swimming session and submit them inside the `ActivitySessionInsert` payload.

---

### Task 5: Quality Gate & Validation

- [ ] **Step 1: Run typechecks**
  Run: `pnpm typecheck`
  Expected: PASS

- [ ] **Step 2: Run lint check**
  Run: `pnpm run lint:check`
  Expected: PASS
