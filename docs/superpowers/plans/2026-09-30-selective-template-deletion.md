# Selective template deletion Implementation Plan

> **For agentic workers:** Execute this plan inline in the current Alzan branch. Keep all changes unstaged and do not commit.

**Goal:** Add multi-selection deletion to the saved gym routine and sport template lists without removing individual deletion or delete-all.

**Architecture:** Keep Supabase persistence and the existing per-item deletion mutations unchanged. Add a tested pure helper for toggling and resolving selected IDs, then reuse that behavior in both screens with a shared bottom toolbar and accessible selected-state controls.

**Tech Stack:** React Native, TypeScript, React Query mutations, i18next, node:assert specs.

---

### Task 1: Selection helper and regression tests

**Files:**
- Modify: `alzan-fe/src/screens/training/helpers/templateList.helper.ts`
- Test: `alzan-fe/src/screens/training/helpers/templateList.helper.spec.ts`

- [ ] Add tests for selecting/deselecting an ID immutably, filtering selected IDs to the displayed list, and empty selections.
- [ ] Run `pnpm --prefix alzan-fe exec tsx src/screens/training/helpers/templateList.helper.spec.ts` and verify it fails because the new helper exports are absent.
- [ ] Implement the smallest pure helpers to pass those tests and rerun the same command.

### Task 2: Selection UI on saved template lists

**Files:**
- Create: `alzan-fe/src/screens/training/components/TemplateSelectionToolbar.tsx`
- Modify: `alzan-fe/src/screens/training/GymRoutinesListScreen.tsx`
- Modify: `alzan-fe/src/screens/training/SportTemplatesListScreen.tsx`
- Modify: `alzan-fe/src/i18n/locales/en.ts`
- Modify: `alzan-fe/src/i18n/locales/es.ts`

- [ ] Add an accessible selection-mode action to each saved-list header; hide it when assigning a template to a date and in the predefined gym catalog.
- [ ] In selection mode, show accessible checkboxes, hide per-card actions, and render a bottom toolbar with selected count, cancel, and disabled-until-selected delete action.
- [ ] Confirm the selected count before invoking existing single-template mutations sequentially; clear selection after success, and retain only not-yet-deleted IDs if a deletion fails.
- [ ] Preserve the existing single-delete and delete-all paths.
- [ ] Add matching English and Spanish labels for selection, count, delete confirmation, and failure feedback.

### Task 3: Verification and requested cleanup

**Files:**
- Delete after implementation: `docs/superpowers/specs/2026-09-30-selective-template-deletion-design.md`

- [ ] Run helper tests, FE typecheck, formatter, and lint.
- [ ] Run the repository local quality gate including `verify:import-review` with local Supabase if available.
- [ ] Run `git diff --check` and verify the pre-existing worktree changes were preserved.
- [ ] Delete only the design specification explicitly requested for removal; keep the implementation plan and code changes.
