# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Claude Code

- Follow the imported project instructions.
- Also follow matching subtree `CLAUDE.md` files and matching `.claude/rules/*.md` files.
- Project skills are available under `.claude/skills/` and mirror the team-owned skills in `.agents/skills/`.
- Project skill ids should use the same `fe-*` and `shared-*` naming seen in `.agents/skills/`.
- For frontend visual exploration or premium polish, follow `.claude/rules/frontend-skill-routing.md`, which includes `fe-ui-ux-pro-max` and keeps final implementation grounded in the mobile-first frontend skills.

## Commands

All commands run from the repo root with pnpm. Per-package variants use `pnpm --prefix alzan-be ...` / `pnpm --prefix alzan-fe ...`.

- `pnpm start` — run backend (NestJS watch) and frontend (Expo) together; `pnpm start:web` for the web FE. Both run `env:sync` first.
- `pnpm env:sync` — regenerate `alzan-be/.env` and `alzan-fe/.env` from the single root `.env` (see `scripts/sync-env.js`). Never edit per-package `.env` files directly.
- Quality gate (required after any code change): `pnpm format` then `pnpm run lint:check`. Only a non-zero exit code from lint is a failure; warnings are OK.
- `pnpm typecheck` — `tsc --noEmit` for both packages.
- `pnpm --prefix alzan-fe build` triggers `expo prebuild`; avoid unless strictly necessary.

### Tests

There is no jest/vitest. Backend `*.spec.ts` files are plain ts-node scripts using `node:assert`.

- Full activity-import suite: `pnpm verify:activity-import` (fixture-manifest runner; see `docs/activity-import-verification.md`).
- Single spec: `cd alzan-be && node -r ts-node/register -r tsconfig-paths/register src/components/activity-import/parsers/<name>.spec.ts`

### Generated code (never hand-edit)

- DB types: `pnpm supabase:types` — generates `supabase/database.types.ts` from the local Supabase instance and copies it (plus `requests.types.ts`) into `alzan-be/src/types/` and `alzan-fe/src/types/`.
- API client: `pnpm openapi` — fetches the OpenAPI schema from the running backend into `alzan-fe/src/openapi/alzan-be.json`, then `@hey-api/openapi-ts` generates the typed client + TanStack Query hooks in `alzan-fe/src/openapi/generated/`. After changing BE controllers/DTOs, regenerate so the FE client stays in sync.

## Architecture

Monorepo (pnpm, no workspaces — two independent packages plus shared assets):

- `alzan-be/` — NestJS 11 REST API. Feature modules live in `src/components/` (activity-import, wearables, providers/oauth, notification, user); `src/core/` and `src/common/` hold domain and cross-cutting logic. Swagger decorators on controllers/DTOs are the source of the FE client contract.
- `alzan-fe/` — Expo SDK 54 / React Native 0.81 app (iOS, Android, Web). Screens in `src/screens/`, feature modules in `src/modules/`, shared UI in `src/components/`. Data access goes through generated OpenAPI query hooks or custom hooks — never raw fetch/Supabase calls inside components. i18n via i18next (`src/i18n/locales/en.ts`, `es.ts`); all user-facing strings use translation keys.
- `supabase/` — Postgres migrations, seeds, and the generated types that both packages consume. Supabase is the database and auth provider; the NestJS API sits in front of it for business logic.

Type safety flows one way: Supabase schema → generated DB types → BE DTOs/Swagger → generated FE client. When touching the data model or API surface, follow that chain and regenerate at each step.

The largest subsystem is activity import (`alzan-be/src/components/activity-import/`): provider-specific mappers in `parsers/` (Garmin, Suunto, Polar, Coros, Whoop, Oura, Fitbit, etc.) normalize wearable files/payloads into canonical activity and health models, with sport-specific mappers (e.g. `climbing-sport.mapper.ts`) layered on top. Adding or changing any sport-dependent behavior must follow the `shared-add-sport-integration` skill.
