# Alzan Shared Skills

This folder is versioned so all contributors (Codex + Antigravity) use the same team-wide skill set.

Team guide: [docs/team-skills-guide.md](/Users/josep/Projects/alzan/docs/team-skills-guide.md)

## Recommended Skills

### Shared (FE + BE + DB)
- `shared-pnpm-quality-gate`
- `shared-database-schema`
- `shared-supabase-postgres-best-practices`
- `shared-api-design`
- `shared-backend-patterns`
- `shared-nestjs-patterns`
- `shared-security-review`
- `shared-e2e-testing`
- `shared-coding-standards`
- `shared-technical-documentation`
- `shared-alzan-local-docs-sync-from-code`
- `shared-skill-crafter-perfect`
- `shared-no-commit-without-approval`
- `shared-commit-generator`

### Frontend
- `fe-mobile-ui-ux-direction`
- `fe-react-native-best-practices`
- `fe-react-component-performance`
- `fe-manage-translations`
- `fe-upgrading-expo`
- `fe-expo-cicd-workflows`

## Current vs Future Map

### Current Product (today)
- FE-heavy app (training, nutrition, health): prioritize `fe-mobile-ui-ux-direction`, `fe-react-native-best-practices`, `fe-react-component-performance`, `fe-manage-translations`.
- BE currently thin NestJS layer + Supabase-first data model: prioritize `shared-nestjs-patterns`, `shared-backend-patterns`, `shared-api-design`, `shared-database-schema`.
- DB evolution and performance: prioritize `shared-supabase-postgres-best-practices`.

### Future Roadmap (social + wearables)
- Social features (feeds, messaging, profile APIs): add `shared-api-design`, `shared-security-review`, `shared-e2e-testing` early.
- Social and wearable-facing mobile UX: add `fe-mobile-ui-ux-direction` early for feeds, sync states, charts, profile surfaces, and data-dense screens.
- Wearables + external providers (sync, mapping, raw payloads): enforce `shared-supabase-postgres-best-practices` + `shared-database-schema` + `shared-backend-patterns`.
- Release maturity for mobile: use `fe-upgrading-expo` and `fe-expo-cicd-workflows` for safe upgrades and EAS pipelines.

### Documentation workflow
- Use `shared-technical-documentation` when creating or rewriting docs.
- Use `shared-alzan-local-docs-sync-from-code` when validating docs against the real repo state and recent code changes.
- If a doc explains current product behavior, APIs, schema, setup, or architecture, use both together.

## Maintenance

- Keep names prefixed (`fe-`, `shared-`) to make routing explicit.
- Keep all team skills in git (no local-only symlink dependency for critical flows).
