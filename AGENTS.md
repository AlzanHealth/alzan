# Alzan Agent Instructions

This repository is a shared AI workspace for Codex and Antigravity.

## Skill Routing

- Frontend work in `alzan-fe/`: use `fe-*` skills first, then `shared-*`.
- Mobile UI/UX, navigation, or visual refactors in `alzan-fe/`: use `fe-mobile-ui-ux-direction` and pair with `fe-react-native-best-practices` when implementation quality or performance matters.
- Backend work in `alzan-be/`: use `shared-*` skills, especially `shared-nestjs-patterns`, `shared-backend-patterns`, and `shared-api-design`.
- Database work in `supabase/`: use `shared-supabase-postgres-best-practices` and `shared-database-schema`.
- Security-sensitive changes (auth, input validation, secrets, permissions): use `shared-security-review`.
- User-flow and regression scenarios: use `shared-e2e-testing`.
- Docs creation or rewrites: use `shared-technical-documentation`.
- Docs sync requests: use `shared-alzan-local-docs-sync-from-code`.
- If docs describe real implemented behavior, APIs, schema, commands, or architecture, use `shared-technical-documentation` together with `shared-alzan-local-docs-sync-from-code`.
- Any code change must run `shared-pnpm-quality-gate` before closing the task. Default local gate: root `pnpm format` + `pnpm run lint:check`. If the user asks to match GitHub `code-quality.yml` or branch-readiness matters, also run the skill's CI parity checks.
- Always apply `shared-no-commit-without-approval` for all tasks.
- Commit requests: use `shared-commit-generator` and return only commit text (no git commit/push).

## Skill Locations

- Shared skills: `.agents/skills/shared-*`
- Frontend skills: `.agents/skills/fe-*`
- Superpowers pack: `.agents/skills/superpowers/*`

## Notes

- Keep all team skills versioned in Git.
- Do not rely on personal machine symlinks for project-critical skills.
- Never commit/push/tag from the agent in this repo. Provide commit text only.
