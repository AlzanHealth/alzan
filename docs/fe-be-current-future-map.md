# Alzan FE/BE Map (Current vs Future)

Date: 2026-04-15

## 1) Current State

### Frontend (`alzan-fe`)
- Primary product surface and core execution layer.
- Main active domains: training, nutrition, health, onboarding, settings, i18n.
- Uses Supabase directly for most data access.
- Includes route/import capabilities and activity analytics.

### Backend (`alzan-be`)
- Thin NestJS API layer.
- Current endpoints are minimal (health and basic authenticated user flow).
- Most domain behavior still lives in FE + Supabase.

### Database (`supabase`)
- Rich schema and migrations are the true backend center.
- Includes entities for sessions, nutrition, health logs, preferences, templates, and external account integration groundwork.

## 2) Future Roadmap Fit

### Social Network Direction
- Needs stronger API contract discipline and endpoint consistency.
- Needs security review for auth boundaries, privacy, and moderation-sensitive flows.
- Needs E2E regression gates for feed/profile/messaging journeys.

### Wearables and External Providers
- Needs robust sync architecture (external accounts, mappings, raw payload normalization).
- Needs schema/index/perf rigor for ingestion and replay jobs.
- Needs backend service patterns for idempotency, retry logic, and observability.

## 3) Skill Matrix (What to Use)

### FE now
- `fe-react-native-best-practices`
- `fe-react-component-performance`
- `fe-manage-translations`

### FE future (release maturity)
- `fe-upgrading-expo`
- `fe-expo-cicd-workflows`

### BE now
- `shared-nestjs-patterns`
- `shared-backend-patterns`
- `shared-api-design`

### BE + DB for social/wearables future
- `shared-security-review`
- `shared-e2e-testing`
- `shared-supabase-postgres-best-practices`
- `shared-database-schema`

### Always-on governance
- `shared-pnpm-quality-gate` (root `pnpm format` + `pnpm run lint:check`, FE+BE)
- `shared-no-commit-without-approval`
- `shared-commit-generator`

## 4) Recommended Execution Order Per Task

1. Pick domain skill (`fe-*` or `shared-*`).
2. Add data-model skill if tables/migrations are touched.
3. Add security skill for auth/input/secrets.
4. Add E2E skill for user-facing behavior changes.
5. Run `shared-pnpm-quality-gate` before closing.
