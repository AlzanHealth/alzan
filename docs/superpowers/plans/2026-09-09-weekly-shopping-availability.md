# Weekly Shopping Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add range-scoped household ingredient availability and derive the remaining shopping weight without changing it when an item is marked bought.

**Architecture:** Keep the shopping-list state keyed by user and date range. Replace the old purchase-quantity display semantics with a new persisted availability field, then calculate the amount to buy as a pure planner value at render/export time. Keep completion state as an independent boolean.

**Tech Stack:** React Native, Expo, TypeScript, i18next, Supabase/Postgres migrations, Node assertion specs run with `tsx`.

---

### Task 1: Add the range-scoped availability model and calculation helpers

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListPlanner.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListService.spec.ts`

- [x] **Step 1: Write failing assertions** for default availability, zero, below/equal/above-required calculations, and non-negative input parsing.
- [x] **Step 2: Run the shopping-list spec** and confirm the new helper assertions fail because the helpers do not exist.
- [x] **Step 3: Implement minimal pure helpers** named `getShoppingAvailableQuantity`, `getShoppingQuantityToBuy`, `setShoppingAvailableQuantity`, and update formatting/export to use the derived amount to buy.
- [x] **Step 4: Replace the old purchase quantity type/functions** and update the assertions for the new semantics.
- [x] **Step 5: Run the shopping-list spec** and confirm all assertions pass.

### Task 2: Persist availability locally and in Supabase

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListState.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListStateSync.ts`
- Create: `alzan-fe/src/modules/nutrition/services/shoppingListStateSyncSerializer.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListService.spec.ts`
- Create: `supabase/migrations/20260909120000_add_shopping_list_availability.sql`
- Regenerate: `supabase/database.types.ts`, `alzan-fe/src/types/database.types.ts`, `alzan-be/src/types/database.types.ts` via `pnpm run supabase:types` when local Supabase is available

- [x] **Step 1: Add failing state assertions** for parsing, serialization, equality, and server-row parsing of `availableQuantityGrams`, including `0`.
- [x] **Step 2: Run the spec** and confirm the new persistence assertions fail.
- [x] **Step 3: Add the migration** with nullable `available_quantity_g` and a `>= 0` check, preserving the old purchase column without reading it.
- [x] **Step 4: Version local state storage** and replace `purchaseQuantityGrams` with `availableQuantityGrams` in local parsing, equality, and reset behavior.
- [x] **Step 5: Update Supabase synchronization** to select, validate, parse, and upsert `available_quantity_g`.
- [x] **Step 6: Run the state and sync specs** and confirm all assertions pass.

### Task 3: Update the availability editor and ingredient rows

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/components/ShoppingListQuantityModal.tsx`
- Modify: `alzan-fe/src/modules/nutrition/components/ShoppingListIngredientRow.tsx`
- Modify: `alzan-fe/src/modules/nutrition/hooks/useShoppingListState.ts`
- Modify: `alzan-fe/src/screens/nutrition/ShoppingListScreen.tsx`

- [x] **Step 1: Add failing planner/UI-facing assertions** that saving `0` is accepted and that completion state does not participate in the amount-to-buy calculation.
- [x] **Step 2: Run the focused spec** and confirm it fails on zero input or old purchase semantics.
- [x] **Step 3: Change the hook** to expose `availableQuantities` and `setAvailableQuantity`, accepting finite values greater than or equal to zero and preserving `completed` untouched.
- [x] **Step 4: Change the screen and row** to merge availability by ingredient key and display required, available, and to-buy quantities. Keep checkbox handlers independent.
- [x] **Step 5: Change the modal** to edit availability in grams, remove purchase-rounding shortcuts, accept `0`, and use translated labels.
- [x] **Step 6: Run focused tests** and confirm the full shopping-list spec passes.

### Task 4: Localize and verify the complete flow

**Files:**
- Modify: `alzan-fe/src/i18n/locales/en.ts`
- Modify: `alzan-fe/src/i18n/locales/es.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/shoppingListService.spec.ts`

- [x] **Step 1: Add synchronized English and Spanish keys** for availability, amount to buy, editor title/message/action, validation, and reset copy.
- [x] **Step 2: Extend tests** for exports and the independent weekly state cases from the approved design.
- [x] **Step 3: Run the focused shopping-list verification command** and typecheck.
- [ ] **Step 4: Run the repository local quality gate:** `pnpm format`, `pnpm run lint:check`, and `pnpm run verify:import-review`.
- [ ] **Step 5: Inspect the final diff and report any checks skipped or blocked.**

No commit or push is part of this plan; repository policy requires leaving changes uncommitted unless the user explicitly changes that policy.
