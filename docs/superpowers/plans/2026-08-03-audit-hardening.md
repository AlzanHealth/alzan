# Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the most actionable audit findings without migrations or production access.

**Architecture:** Keep the existing NestJS controller/filter boundaries, centralize OAuth redirect validation in a small pure utility, and extend the existing GitHub workflow with repository-wide triggers and non-destructive checks.

**Tech Stack:** NestJS, TypeScript, class-validator, GitHub Actions, pnpm.

---

### Task 1: Prevent internal error disclosure

**Files:**
- Modify: `alzan-be/src/core/filters/global-exception.filter.ts`

- [ ] **Step 1:** Preserve detailed exception messages only in server logs and return a generic message for unexpected 5xx errors.
- [ ] **Step 2:** Keep existing client-facing `HttpException` messages and re-run backend typecheck/lint.

### Task 2: Validate OAuth redirect destinations

**Files:**
- Create: `alzan-be/src/components/providers/oauth/oauth-redirect.utils.ts`
- Create: `alzan-be/src/components/providers/oauth/oauth-redirect.utils.spec.ts`
- Modify: `alzan-be/src/components/providers/providers.controller.ts`
- Modify: `alzan-be/package.json`

- [ ] **Step 1:** Allow only the configured frontend origin for web redirects and the `alzan://oauth/{success,error}` deep links for native clients.
- [ ] **Step 2:** Reject invalid custom redirects before persisting OAuth state.
- [ ] **Step 3:** Revalidate stored redirects before callback redirects.
- [ ] **Step 4:** Add a direct verification script covering allowed and rejected destinations.

### Task 3: Strengthen CI coverage

**Files:**
- Modify: `.github/workflows/code-quality.yml`

- [ ] **Step 1:** Trigger CI for root scripts, migrations, seeds, and lockfiles.
- [ ] **Step 2:** Add backend/frontend typechecks and the existing import verification commands.
- [ ] **Step 3:** Add web export verification without touching production.

### Task 4: Verify and hand off

- [ ] **Step 1:** Run formatting, lint, typecheck, builds, targeted verification, and the new OAuth test.
- [ ] **Step 2:** Inspect the final diff and report remaining audit items that require a separate infrastructure/migration change.
