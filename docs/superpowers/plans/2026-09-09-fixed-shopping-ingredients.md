# Fixed Shopping Ingredients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users exclude selected catalog ingredients from shopping lists while preserving their nutrition-plan data.

**Architecture:** Store stable catalog ingredient keys in `nutrition_prefs`, expose a focused settings component for searching and managing them, and pass the sorted exclusions through the shopping-list hook/service. Filter the aggregated shopping result with a pure planner helper so all list consumers share the same behavior.

**Tech Stack:** React Native, Expo, TypeScript, React Query, Supabase preferences, i18next, Node assertion specs run with `tsx`.

---

### Task 1: Define and test exclusion semantics

**Files:**
- Modify: `alzan-fe/src/types/requests.types.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListPlanner.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListService.spec.ts`

- [x] **Step 1: Add failing assertions** for empty exclusions, stable `id:<id>` keys, excluded catalog ingredients, retained free-text ingredients, and filtering after duplicate aggregation.
- [x] **Step 2: Run the focused shopping-list spec** and confirm the new assertions fail.
- [x] **Step 3: Add the typed nutrition preference field** `shopping_list_excluded_ingredient_keys?: string[]` and pure planner helpers for stable keys and exclusion filtering.
- [x] **Step 4: Run the focused shopping-list spec** and confirm the planner assertions pass.

### Task 2: Apply exclusions to shopping-list data and caching

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListService.ts`
- Modify: `alzan-fe/src/modules/nutrition/hooks/useShoppingList.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListCache.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListService.spec.ts`

- [x] **Step 1: Extend request/cache tests** to prove sorted exclusion keys participate in the shopping-list request and cache identity.
- [x] **Step 2: Run the focused spec** and confirm the integration assertions fail.
- [x] **Step 3: Pass exclusions from nutrition preferences** into the service and include them in the cache/query identity.
- [x] **Step 4: Filter the service result** with the pure planner helper while leaving meal counts and nutrition data untouched.
- [x] **Step 5: Run focused tests and frontend typecheck.**

### Task 3: Build the Nutrition Settings editor

**Files:**
- Create: `alzan-fe/src/modules/nutrition/components/ShoppingListExcludedIngredientsSettings.tsx`
- Modify: `alzan-fe/src/screens/nutrition/NutritionSettingsScreen.tsx`
- Modify: `alzan-fe/src/services/ingredientsService.ts`
- Modify: `alzan-fe/src/i18n/locales/en.ts`
- Modify: `alzan-fe/src/i18n/locales/es.ts`

- [x] **Step 1: Add catalog lookup support** for selected ingredient IDs using the existing Supabase service pattern.
- [x] **Step 2: Build the settings component** with debounced search, selected rows, add/remove actions, loading state, and empty state.
- [x] **Step 3: Add the new Nutrition Settings section** wired to `nutrition_prefs` and the existing preferences updater.
- [x] **Step 4: Add synchronized English and Spanish translations** for labels, hints, actions, and states.
- [x] **Step 5: Run frontend typecheck and the focused spec.**

### Task 4: Verify the complete flow

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListService.spec.ts`
- Modify: `docs/superpowers/plans/2026-09-09-fixed-shopping-ingredients.md`

- [x] **Step 1: Extend tests** for settings preference parsing/defaults and exclusion reappearance after removal.
- [x] **Step 2: Run `pnpm format`.**
- [x] **Step 3: Run `pnpm run lint:check`.**
- [x] **Step 4: Run `pnpm run verify:import-review`.**
- [x] **Step 5: Run final focused spec, frontend typecheck, `git diff --check`, and direct local app verification.**
- [x] **Step 6: Inspect the final diff and report any skipped checks.**

No commit or push is part of this plan; repository policy requires leaving changes uncommitted unless the user explicitly changes that policy.
