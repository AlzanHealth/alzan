# Document-to-JSON Import Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the nutrition and training import clipboard text explicitly convert the attached DOCX documents into Alzan JSON without changing source workouts or ingredients, while using the attached CSV only as a canonical lookup catalogue.

**Architecture:** Keep parsing and persistence unchanged. Update the two prompt/template sources and their focused tests, and simplify the web training copy action so it copies only the prompt and JSON template instead of downloading and embedding every exercise. The app will still resolve and validate exercises against the database during analysis.

**Tech Stack:** React Native/Expo web UI, TypeScript, i18next, tsx focused specs, Prettier.

---

### Task 1: Make the nutrition prompt a literal DOCX-to-JSON conversion contract

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/services/menuImportTemplate.ts`
- Test: `alzan-fe/src/modules/nutrition/services/menuImportTemplate.spec.ts`

- [ ] **Step 1: Add source-preservation rules**

Replace generative language with explicit instructions to read the attached nutrition DOCX, preserve every requested date, meal, ingredient name and quantity, use the CSV only for exact catalogue matching, and stop with a missing-reference report instead of inventing or substituting data.

- [ ] **Step 2: Assert the contract in the focused spec**

Add assertions that the copied text mentions DOCX, CSV, literal preservation, no substitutions, and that it does not contain the old advice to adapt protein or carbohydrate targets.

- [ ] **Step 3: Run the nutrition template spec**

Run `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/menuImportTemplate.spec.ts` and expect all assertions to pass.

### Task 2: Make the training prompt immutable with respect to the Word document

**Files:**
- Modify: `alzan-fe/src/modules/training/services/trainingPlanImportTemplate.ts`
- Modify: `docs/templates/alzan-training-plan-v1.template.json`
- Modify: `docs/templates/alzan-training-plan-v1.example.json`
- Test: `alzan-fe/src/modules/training/services/trainingPlanImportTemplate.spec.ts`

- [ ] **Step 1: Replace generative training instructions**

Tell the model to convert `Plan_Entrenamiento.docx` exactly: preserve all dates, weekdays, session order, running intervals/recoveries/targets, strength exercises/sets/reps/loads/RPE/rest and notes; forbid optimization, correction, substitution, merging, omission, addition, rescheduling, or recalculation. Require a blocking report when the CSV has no exact canonical exercise.

- [ ] **Step 2: Align examples with catalogue values**

Use the supported running goal `speed` instead of the invalid `intervals` value, and keep exercise names/IDs resolvable from the attached CSV.

- [ ] **Step 3: Assert immutable-source behavior**

Test for DOCX/CSV/source-preservation wording, forbidden modification wording, and absence of the embedded catalogue section.

- [ ] **Step 4: Run the training template spec**

Run `pnpm --prefix alzan-fe exec tsx src/modules/training/services/trainingPlanImportTemplate.spec.ts` and expect all assertions to pass.

### Task 3: Copy only prompt plus template on web

**Files:**
- Modify: `alzan-fe/src/screens/training/TrainingPlanImportScreen.tsx`
- Modify: `alzan-fe/src/modules/training/services/trainingPlanImportTemplate.ts`
- Modify: `alzan-fe/src/modules/training/services/trainingPlanImportTemplate.spec.ts`

- [ ] **Step 1: Remove catalogue fetching from the copy action**

Copy `TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT` directly. Keep `fetchTrainingExerciseCatalog` in the analysis service because the importer still validates the CSV-resolved exercise against the app catalogue after the JSON is pasted.

- [ ] **Step 2: Remove stale catalogue-specific tests and code paths**

Ensure no copied text contains `CATÁLOGO DE EJERCICIOS DE ALZAN` or database exercise rows.

- [ ] **Step 3: Run focused import checks**

Run both import template specs and `pnpm --prefix alzan-fe run verify:menu-import` plus `pnpm --prefix alzan-fe run verify:training-plan-import`.

### Task 4: Format and verify the changed surface

**Files:**
- Verify: all files changed by Tasks 1–3

- [ ] **Step 1: Format and lint**

Run `pnpm format`, `pnpm run format:check`, and `pnpm run lint:check`.

- [ ] **Step 2: Typecheck**

Run `pnpm run typecheck`.

- [ ] **Step 3: Inspect the diff**

Run `git diff --check` and search the changed prompts for personal names, AI wording, catalogue dumps, and any instruction that permits modifying source training.
