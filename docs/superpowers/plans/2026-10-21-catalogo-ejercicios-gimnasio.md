# Catálogo de ejercicios de gimnasio

> **For agentic workers:** Implement inline on the already isolated `codex/nuevas-funcionalidades` branch. Keep each change within the existing Expo/Supabase architecture; do not commit or push.

**Goal:** Add a mobile-first exercise catalog under Training Settings where users can browse existing gym exercises, inspect their own logged loads, manage personal exercises, and create private exercises with duplicate protection.

**Architecture:** Reuse the existing `exercises` catalog, RLS, localized exercise mapping, muscle/equipment lookups, `ExercisePrValues` history, and React Query. Add a training catalog screen and a focused private-exercise form. Enforce exact custom-name duplicates in both the UI and database; use a small RLS-protected favorites table if the current schema has no exercise favorites.

**Tech Stack:** Expo/React Native, TypeScript, React Navigation, Supabase/Postgres RLS, React Query, i18next.

---

### Task 1: Add secure catalog persistence rules

**Files:**
- Create: `supabase/migrations/<timestamp>_exercise_catalog_management.sql`
- Generate, do not hand-edit: `supabase/database.types.ts` and `alzan-fe/src/types/database.types.ts` if the local schema/type command is available.

- [x] Add owner-scoped exercise favorites with select/insert/delete RLS policies.
- [x] Add a database trigger that rejects normalized exact duplicate custom exercise names against the global catalog and the same user's custom exercises. Allow different users to reuse private names.
- [x] Keep custom-exercise delete governed by the existing owner-only RLS and existing foreign keys; hard-delete unused exercises, and archive referenced ones so history and routines remain intact.
- [x] Generate schema types only with the repository's supported command if local Supabase is available.

### Task 2: Build catalog data hooks and operations

**Files:**
- Create: `alzan-fe/src/modules/training/services/exerciseCatalogService.ts`
- Create: `alzan-fe/src/modules/training/hooks/useExerciseCatalog.ts`

- [x] Reuse `useExercises`, `useMuscleGroups`, and `useEquipment` for visible catalog data, search, and filters.
- [x] Query logged sets scoped to the authenticated user and aggregate recent use/loads without exposing other users' records.
- [x] Persist favorites through the owner-scoped table and invalidate the related React Query keys.
- [x] Create private exercises with `is_custom=true` and `owner_user_id=auth.uid()`; handle the database duplicate response without hiding it.
- [x] Delete only owner-created custom exercises; archive referenced exercises when a foreign key rejects deletion, preserve history, and surface the outcome.
- [x] Keep archived personal exercises discoverable in “Mine” and allow restoring them, with duplicate protection.

### Task 3: Add the gym exercise catalog screens

**Files:**
- Create: `alzan-fe/src/screens/training/ExerciseCatalogScreen.tsx`
- Create: `alzan-fe/src/screens/training/ExerciseCatalogCreateScreen.tsx`
- Modify: `alzan-fe/src/navigation/TrainingStack.tsx`
- Modify: `alzan-fe/src/types/navigation.types.ts`
- Modify: `alzan-fe/src/screens/training/TrainingSettingsScreen.tsx`

- [x] Add a catalog entry to Training Settings and register typed routes.
- [x] Show `Catálogo`, `Usados`, and `Mis ejercicios`, accent-insensitive search, muscle/equipment filters, personal loads/history entry, favorites, and private exercise management.
- [x] Show exact matches as a blocked duplicate and similar matches as selectable suggestions before save.
- [x] Let the user add name, primary/secondary muscle, equipment, load type, and optional description; visibly mark the exercise as private.
- [x] Use list virtualization, theme colors, accessible 44px actions, loading/empty/error states, and a clear destructive confirmation.

### Task 4: Add translations and verify repository checks

**Files:**
- Modify: `alzan-fe/src/i18n/locales/en.ts`
- Modify: `alzan-fe/src/i18n/locales/es.ts`

- [x] Add paired English/Spanish strings for catalog, filters, private form, duplicate/similarity states, favorites, and delete errors.
- [x] Run the mandatory local format/lint checks and the FE typecheck; do not run Expo prebuild unless this feature requires native config changes.
- [x] Review the final diff and report any database migration that could not be applied in the authorized environment.
