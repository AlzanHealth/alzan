# Alzan Shared Skills

This folder is versioned so all contributors (Codex + Antigravity) use the same team-wide skill set.

Team guide: [docs/team-skills-guide.md](/Users/josep/Projects/alzan/docs/team-skills-guide.md)

Claude Code compatibility: the repo root `.claude/skills/` directory mirrors these skills so Claude can load them as project skills. Treat `.agents/skills/` as the source of truth.
Gemini CLI compatibility: `GEMINI.md` files route Gemini back to this same skill catalog and the matching `SKILL.md` files.
Logical skill ids and visible layout must match 1:1 between `.agents/skills/` and `.claude/skills/`.

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
- `shared-cleanup-temporary-artifacts`
- `shared-no-commit-without-approval`
- `shared-commit-generator`

### Frontend
- `fe-mobile-ui-ux-direction`
- `fe-react-native-best-practices`
- `fe-react-component-performance`
- `fe-manage-translations`
- `fe-upgrading-expo`
- `fe-expo-cicd-workflows`

### Frontend Design / Taste
- `fe-design-taste-frontend`
- `fe-emil-design-eng`
- `fe-gpt-taste`
- `fe-high-end-visual-design`
- `fe-minimalist-ui`
- `fe-ui-ux-pro-max`

### Workflow
- `shared-brainstorming`
- `shared-writing-plans`
- `shared-systematic-debugging`
- `shared-verification-before-completion`
- `shared-requesting-code-review`
- `shared-receiving-code-review`

## Current vs Future Map

### Current Product (today)
- FE-heavy app (training, nutrition, health): prioritize `fe-mobile-ui-ux-direction`, `fe-react-native-best-practices`, `fe-react-component-performance`, `fe-manage-translations`.
- BE currently thin NestJS layer + Supabase-first data model: prioritize `shared-nestjs-patterns`, `shared-backend-patterns`, `shared-api-design`, `shared-database-schema`.
- DB evolution and performance: prioritize `shared-supabase-postgres-best-practices`.

### Future Roadmap (social + wearables)
- Social features (feeds, messaging, profile APIs): add `shared-api-design`, `shared-security-review`, `shared-e2e-testing` early.
- Social and wearable-facing mobile UX: add `fe-mobile-ui-ux-direction` early for feeds, sync states, charts, profile surfaces, and data-dense screens.
- Premium visual direction and design ideation: use `fe-design-taste-frontend`, `fe-emil-design-eng`, `fe-gpt-taste`, `fe-high-end-visual-design`, `fe-minimalist-ui`, or `fe-ui-ux-pro-max` to explore stronger visual taste, then land the final mobile implementation with `fe-mobile-ui-ux-direction`.
- Wearables + external providers (sync, mapping, raw payloads): enforce `shared-supabase-postgres-best-practices` + `shared-database-schema` + `shared-backend-patterns`.
- Release maturity for mobile: use `fe-upgrading-expo` and `fe-expo-cicd-workflows` for safe upgrades and EAS pipelines.

### Documentation workflow
- Use `shared-technical-documentation` when creating or rewriting docs.
- Use `shared-alzan-local-docs-sync-from-code` when validating docs against the real repo state and recent code changes.
- If a doc explains current product behavior, APIs, schema, setup, or architecture, use both together.

## Maintenance

- Use explicit prefixes (`fe-`, `shared-`) for team-owned project skills and keep the same logical ids in `.claude/skills/`.
- Keep all team skills in git (no local-only symlink dependency for critical flows).
- Edit team skills in `.agents/skills/`; do not hand-edit the Claude mirror in `.claude/skills/`.
