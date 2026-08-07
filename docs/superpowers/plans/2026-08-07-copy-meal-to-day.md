# Copy Meal to Another Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the repository's frontend and verification skills while executing each task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-step, cross-platform flow that copies a registered or planned meal to any enabled meal type on any date within Nutrition's existing visible calendar range, without overwriting existing meals.

**Architecture:** Extract the Nutrition calendar bounds into a pure helper shared by `DaySwitcher` and the copy flow. Keep copy-domain construction and rollback-capable persistence in nutrition services, expose it through a React Query mutation, and keep the UI state in a focused `CopyMealModal` mounted by `NutritionHomeScreen`.

**Tech Stack:** React Native, Expo, TypeScript, React Query, Supabase client, `date-fns`, `@react-native-community/datetimepicker`, browser date input, `react-i18next`, `lucide-react-native`.

---

### Task 1: Share and test the Nutrition calendar bounds

**Files:**
- Create: `alzan-fe/src/modules/nutrition/services/nutritionCalendarRange.ts`
- Test: `alzan-fe/src/modules/nutrition/services/nutritionCalendarRange.spec.ts`
- Modify: `alzan-fe/src/components/common/DaySwitcher.tsx`

- [ ] **Step 1: Write the failing tests**

Add tests with a fixed Wednesday reference date. Assert that the helper returns nine Monday-to-Sunday week windows: offsets `-4` through `+4`, that the minimum is the start of the first week, the maximum is the end of the last week, and that the reference date is inside the range.

```ts
import assert from 'node:assert/strict';
import { addWeeks, endOfWeek, startOfWeek } from 'date-fns';
import { getNutritionCalendarRange } from './nutritionCalendarRange';

const referenceDate = new Date(2026, 7, 5, 12);
const range = getNutritionCalendarRange(referenceDate);
const currentWeek = startOfWeek(referenceDate, { weekStartsOn: 1 });

assert.equal(range.weeks.length, 9);
assert.equal(range.weeks[0].getTime(), addWeeks(currentWeek, -4).getTime());
assert.equal(range.weeks[8].getTime(), addWeeks(currentWeek, 4).getTime());
assert.equal(range.minimumDate.getTime(), range.weeks[0].getTime());
assert.equal(range.maximumDate.getTime(), endOfWeek(range.weeks[8], { weekStartsOn: 1 }).getTime());
assert.ok(referenceDate >= range.minimumDate && referenceDate <= range.maximumDate);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/nutritionCalendarRange.spec.ts`

Expected: FAIL because `nutritionCalendarRange.ts` and `getNutritionCalendarRange` do not exist.

- [ ] **Step 3: Implement the pure range helper**

Export `NutritionCalendarRange` with `weeks`, `minimumDate`, `maximumDate`, and `currentWeekIndex`. Generate weeks from `-4` through `+4` using `startOfWeek(referenceDate, { weekStartsOn: 1 })`; calculate the bounds with `startOfDay` and `endOfWeek`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/nutritionCalendarRange.spec.ts`

Expected: PASS with all assertions passing.

- [ ] **Step 5: Replace the duplicated DaySwitcher constants**

Import `getNutritionCalendarRange` in `DaySwitcher`, derive `weeks` and `currentWeekIndex` from the helper using its existing `currentWeekStart` reference, and preserve the current horizontal FlatList behavior and `getItemLayout`.

- [ ] **Step 6: Re-run the focused test**

Run: `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/nutritionCalendarRange.spec.ts`

Expected: PASS; no behavior change to the existing nine-week strip.

### Task 2: Build and test copy drafts and rollback persistence

**Files:**
- Create: `alzan-fe/src/modules/nutrition/services/mealCopyPlanner.ts`
- Test: `alzan-fe/src/modules/nutrition/services/mealCopyPlanner.spec.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/dietCopyService.ts`

- [ ] **Step 1: Write failing domain tests**

Cover these behaviors with plain `node:assert` tests:

1. A logged source produces a new `MealLogInsert` with target `date`, target `meal_type`, `adherence_status: 'extra_meal'`, no `id`, and no `diet_template_meal_id`; it produces cloned ingredient inserts with no source ids.
2. A planned-only source produces the template base name and target macros, no ingredients, and no template association.
3. A persistence failure while inserting ingredients calls `deleteMealLog` for the newly-created log and rethrows.
4. An existing destination does not affect the draft and no delete operation is requested before insertion.

Use injected persistence functions so the tests never contact Supabase:

```ts
const persistence: MealCopyPersistence = {
  insertLog: async log => ({ id: 'new-log', ...log }),
  insertItems: async () => {
    throw new Error('items failed');
  },
  deleteLog: async id => deleted.push(id),
};
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/mealCopyPlanner.spec.ts`

Expected: FAIL because the planner types and functions do not exist.

- [ ] **Step 3: Implement the pure copy planner**

Define typed source/destination inputs and export:

```ts
export type MealCopySource = {
  log?: MealLog;
  templateMeal?: DietTemplateMeal;
  items?: MealItem[];
};

export type MealCopyDestination = { date: string; mealType: MealType };

export type MealCopyDraft = {
  log: MealLogInsert;
  items: Omit<MealItemInsert, 'meal_log_id'>[];
};

export type MealCopyPersistence = {
  insertLog: (log: MealLogInsert) => Promise<MealLog>;
  insertItems: (logId: string, items: MealItemInsert[]) => Promise<void>;
  deleteLog: (logId: string) => Promise<void>;
};

export function buildMealCopyDraft(
  source: MealCopySource,
  destination: MealCopyDestination,
): MealCopyDraft;
export function persistMealCopy(
  draft: MealCopyDraft,
  persistence: MealCopyPersistence,
): Promise<MealLog>;
```

The planner must copy only insert-safe fields, force a new log, remove the template link, use `extra_meal`, and map each source item to the new log id. If item insertion fails, delete the created log before rethrowing.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/mealCopyPlanner.spec.ts`

Expected: PASS for registered, planned-only, no-overwrite, and rollback cases.

- [ ] **Step 5: Add the Supabase adapter in `dietCopyService.ts`**

Implement `copyMealToDate(userId: string, source: MealCopySource, destination: MealCopyDestination)` by fetching the source log and raw `meal_items` when `source.log?.id` exists, building the draft, and passing Supabase-backed `insertLog`, `insertItems`, and `deleteLog` functions to `persistMealCopy`. Use `.insert(...).select().single()` for the new log and `.insert(...)` for items; never use `.upsert` or delete destination rows.

- [ ] **Step 6: Run the planner tests again**

Run: `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/mealCopyPlanner.spec.ts`

Expected: PASS, including the rollback contract used by the adapter.

### Task 3: Add the mutation and translations

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/hooks/useNutritionData.ts`
- Modify: `alzan-fe/src/i18n/locales/en.ts`
- Modify: `alzan-fe/src/i18n/locales/es.ts`

- [ ] **Step 1: Add translation keys in `en.ts` and `es.ts`**

Add keys for the copy title, date step, type step, continue, copy action, cancel/back, loading, success, error, and accessibility label. Keep the same camelCase key set and interpolation placeholders in both locales; use `dateLocale.ts` for all formatted dates in code.

- [ ] **Step 2: Implement `useCopyMeal`**

Use `useMutation`, authenticated user context, and `copyMealToDate`. Convert the selected `DailyMealItem` into `MealCopySource`, pass `source.log` or `source.templateMeal`, and invalidate the three existing query families after success.

- [ ] **Step 3: Run TypeScript and focused nutrition tests**

Run: `pnpm --prefix alzan-fe run typecheck`

Expected: PASS with matching English/Spanish translation object shapes and a typed mutation.

### Task 4: Build the two-step cross-platform modal

**Files:**
- Create: `alzan-fe/src/modules/nutrition/components/CopyMealModal.tsx`
- Test: no component test file; this package has no React Native test runner, so component behavior is covered by strict props/typecheck plus the pure range and persistence tests.

- [ ] **Step 1: Define the modal contract before implementation**

Use props `{ visible, sourceName, initialDate, minimumDate, maximumDate, mealTypes, onCancel, onCopy }`, where `onCopy` receives `{ date, mealType }` and returns a promise. Keep the step as `'date' | 'mealType'`, reset to date step and today whenever the modal opens, and ignore duplicate submits while loading.

- [ ] **Step 2: Implement native date selection**

On iOS/Android, render `DateTimePicker` with the selected date, `minimumDate`, `maximumDate`, and locale-aware display. On web, create a hidden browser `<input type="date">` on demand, set its `min` and `max` to the shared bounds, and update the same React Native date display after `change`. Use `Platform.OS` only at the boundary so the rest of the flow is shared.

- [ ] **Step 3: Implement type selection and states**

Render enabled meal types as accessible pressable choices. The second step shows Back and Copy buttons. During submission disable all choices and the copy button; on error keep the current step open and show the translated error; on success let the parent close the modal and show confirmation.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --prefix alzan-fe run typecheck`

Expected: PASS for native and web branches without `any` assertions.

### Task 5: Wire the meal name and screen state

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/components/MealRow.tsx`
- Modify: `alzan-fe/src/modules/nutrition/components/MealSection.tsx`
- Modify: `alzan-fe/src/screens/nutrition/NutritionHomeScreen.tsx`

- [ ] **Step 1: Add the failing interaction contract**

Add a focused test where available, or a typed callback assertion in the component spec, proving that pressing the meal name calls `onCopy(item)` while edit/delete remain separate actions.

- [ ] **Step 2: Make the meal name an accessible press target**

Add `onCopy` to `MealRowProps`, wrap only the name in a `TouchableOpacity`/`Pressable`, set `accessibilityRole="button"`, and label it with the translated copy action plus the meal name. Preserve the existing text styles and keep edit/delete callbacks unchanged.

- [ ] **Step 3: Thread `onCopy` through `MealSection`**

Add `onCopyMeal` to the section props and pass the current `DailyMealItem` into each row.

- [ ] **Step 4: Mount and configure `CopyMealModal` in `NutritionHomeScreen`**

Track the selected source item, initialize the destination date with `getNutritionDayDate(new Date(), nutritionDayRolloverTime)`, derive the same `displayMealTypes` list already used by the screen, and calculate calendar bounds with `getNutritionCalendarRange(new Date())`. Call `useCopyMeal` on submit, close on success, and show a translated success alert containing the localized date and meal type.

- [ ] **Step 5: Re-run typecheck and focused tests**

Run:

```bash
pnpm --prefix alzan-fe run typecheck
pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/nutritionCalendarRange.spec.ts
pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/mealCopyPlanner.spec.ts
```

Expected: all commands exit 0.

### Task 6: Format, lint, and verify the branch

**Files:**
- Modify only files required by formatting or lint fixes.

- [ ] **Step 1: Run the mandatory local quality gate**

Run:

```bash
pnpm format
pnpm run lint:check
pnpm run verify:import-review
```

Expected: format and lint exit 0; `verify:import-review` either passes or reports its documented safe skip when local Supabase is unavailable.

- [ ] **Step 2: Run FE parity checks because this adds native/web UI behavior**

Run:

```bash
pnpm --prefix alzan-fe run format:check
pnpm --prefix alzan-fe run lint:check
pnpm --prefix alzan-fe run typecheck
```

Expected: all exit 0.

- [ ] **Step 3: Inspect the final diff and status**

Run: `git status --short --branch && git diff --check && git diff --stat`

Expected: only the approved spec, plan, and feature implementation files are present; no `.superpowers` artifacts remain and no commit/push is performed.
