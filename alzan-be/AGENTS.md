# Alzan Backend Agent Instructions

This file is intentionally short and acts as the backend routing map for `alzan-be/`.

## Start Here

- Use `shared-nestjs-expert-developer` first for backend implementation and refactors.
- Pair it with `shared-nestjs-patterns`, `shared-backend-patterns`, and `shared-api-design` for most backend work.
- Add `shared-supabase-expert-developer`, `shared-database-schema`, and `shared-supabase-postgres-best-practices` for data model, query, migration, RLS, or performance work.
- Add `shared-security-review` for auth, secrets, permissions, validation, or any untrusted input.
- Add `shared-technical-documentation` and `shared-alzan-local-docs-sync-from-code` for backend or API docs.
- Any code change must finish with `shared-pnpm-quality-gate`.

## Key Commands

- `pnpm --prefix alzan-be run typecheck`
- `pnpm --prefix alzan-be run format:check`
- `pnpm --prefix alzan-be run lint:check`
- `pnpm --prefix alzan-be run build`

## Key Paths

- `alzan-be/src/core/`: domain and module-level backend logic
- `alzan-be/src/common/`: shared backend utilities and cross-cutting concerns
- `alzan-be/src/config/`: backend configuration
- `alzan-be/src/components/`: backend-side components/helpers in current codebase layout

## High-Signal Rules

- Keep controllers thin and move business logic into services or use-case layers.
- Use DTO validation and explicit API contracts at request boundaries.
- Validate data-model assumptions against `shared-database-schema` instead of guessing.
- Prefer explicit status codes, error envelopes, and predictable contracts.
- Use `shared-systematic-debugging` for backend bugs or failing checks before patching.
