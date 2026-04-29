---
name: shared-pnpm-quality-gate
description: Use when code changes are made in this monorepo and you must run the required local quality gate, or run the GitHub-aligned format, OpenAPI, and lint checks before handoff while treating Expo prebuild as an exceptional check only when strictly necessary.
---

# Shared pnpm Quality Gate

This repo has two valid verification levels. Always say which one you ran.

## Level 1: Mandatory local gate

Run this after any FE or BE code change unless the user explicitly asks for a different verification scope.

- `pnpm format`
- `pnpm run lint:check`

Why this is the default:

- The root scripts already cover both packages.
- They are the fastest reliable baseline for day-to-day work.
- They avoid running slow or side-effectful FE CI steps on every small change.

## Level 2: GitHub CI parity

Run this when any of these are true:

- the user asks to align with `.github/workflows/code-quality.yml`
- the task is publish-sensitive or branch handoff-sensitive
- the change touches Expo config, native dependencies, OpenAPI generation, or other FE build-sensitive areas
- you want to know whether the branch is likely to pass the current GitHub quality workflow

Use package-level commands that mirror CI as closely as local execution safely allows.

### BE parity steps

- `pnpm --prefix alzan-be run format:check`
- `pnpm --prefix alzan-be run lint:check`

### FE parity steps

- `pnpm --prefix alzan-fe run format:check`
- `pnpm --prefix alzan-fe run generate-openapi`
- `pnpm --prefix alzan-fe run lint:check`

### FE optional build verification

- `pnpm --prefix alzan-fe run build`
- Only run this when it is strictly necessary for the task.

## Repo-specific rules

1. Never change git history

- Do not run `git commit`, `git push`, `git tag`, `gh pr create`, or branch rewrites.

2. Prefer root scripts for the mandatory local gate

- Confirm `pnpm-lock.yaml` exists at repository root.
- Confirm root `package.json` exposes:
  - `scripts.format`
  - `scripts["lint:check"]`
- In this monorepo:
  - `pnpm format` runs `alzan-be` + `alzan-fe`
  - `pnpm run lint:check` runs `alzan-be` + `alzan-fe`

3. Do not blindly reinstall dependencies

- GitHub Actions installs with `pnpm install --frozen-lockfile` in each package.
- Locally, do not rerun installs by default.
- Only install when:
  - dependencies or lockfiles changed
  - commands fail because modules are missing
  - the user explicitly asks for a fresh install-style verification

4. Treat FE OpenAPI generation as CI parity, not the baseline gate

- `alzan-fe` CI runs `pnpm run generate-openapi`.
- This command writes generated output and formats FE code.
- It is useful for parity checks and API-client-sensitive work.
- It is not required for every local code edit.

5. Treat Expo prebuild as exceptional, not default

- In `alzan-fe`, `pnpm run build` currently runs `expo prebuild`.
- Do not run `pnpm --prefix alzan-fe run build` by default.
- Only run it when it is strictly necessary, for example:
  - Expo config or config plugin changes
  - native dependency or build-properties changes
  - issues that depend on generated native projects
  - the user explicitly wants build-level verification
- If you run it, say clearly that it triggers `expo prebuild` and may generate ignored native folders.
- If it is not necessary, stop at FE format, OpenAPI generation, and lint.

6. Lint and format fix loop

- Warnings do not fail the task unless the command exits non-zero.
- If `format:check` fails, run the corresponding formatter, then re-check.
- If lint exits non-zero, fix reported errors and re-run until exit code `0` or a real blocker remains.

7. Always report outcome

- Which level you ran: `local gate`, `CI parity`, or both
- Files changed by verification commands, if any
- Commands run
- Commands skipped and why
- Final status:
  - `PASS`
  - `FAIL`
  - `BLOCKED`
