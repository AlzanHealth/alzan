# Alzan Agent Instructions

This repository is a shared AI workspace for Codex and Antigravity.

Use this root file to choose the correct area-specific instructions and the right skills. Keep detailed implementation rules in subtree instruction files and in `.agents/skills/`.

## Start Here

1. Identify the task scope first.
   - If the task touches `alzan-fe/`, read `alzan-fe/agents.md` before taking action.
   - If the task touches `alzan-be/`, read `alzan-be/AGENTS.md` before taking action.
   - If the task spans FE and BE, read both files before taking action.
2. Review the skill catalog in `.agents/skills/README.md`.
3. Select only the skills that actually match the task.
4. Read the `SKILL.md` for the selected skills.
5. Apply those skill instructions during execution.

## Skill Routing

- Frontend work in `alzan-fe/`: use `fe-react-native-expert-developer` first, then the relevant `fe-*` skills, then `shared-*`.
- Mobile UI/UX, navigation, or visual refactors in `alzan-fe/`: use `fe-mobile-ui-ux-direction`; pair with `fe-react-native-best-practices` when lists, charts, blur, animation, scrolling, or memory/performance risks are involved.
- FE translation work: use `fe-manage-translations`.
- Expo SDK or dependency upgrades: use `fe-upgrading-expo`.
- Expo/EAS CI-CD workflow changes: use `fe-expo-cicd-workflows`.
- Backend work in `alzan-be/`: use `shared-nestjs-expert-developer` together with `shared-nestjs-patterns`, `shared-backend-patterns`, and `shared-api-design`.
- Database and Supabase work: use `shared-supabase-expert-developer`, `shared-database-schema`, and `shared-supabase-postgres-best-practices`.
- Security-sensitive changes such as auth, permissions, secrets, or untrusted input: use `shared-security-review`.
- User-flow and regression scenarios: use `shared-e2e-testing`.
- Documentation creation or rewrites: use `shared-technical-documentation`.
- Documentation sync, drift review, or “make docs match the repo”: use `shared-alzan-local-docs-sync-from-code`.
- If docs describe real implemented behavior, APIs, schema, setup, commands, or architecture: use `shared-technical-documentation` together with `shared-alzan-local-docs-sync-from-code`.

## Verification

- Any code change must run `shared-pnpm-quality-gate` before closing the task.
- Default local gate:
  - `pnpm format`
  - `pnpm run lint:check`
- If the user asks to match GitHub `code-quality.yml`, follow the higher-parity checks defined inside `shared-pnpm-quality-gate`.

## Git Safety

- Always apply `shared-no-commit-without-approval`.
- Never commit, push, tag, rebase, reset, or delete branches from the agent unless the user explicitly changes that policy.
- If the user asks for commit help, use `shared-commit-generator` and return commit text only.

## Skill Locations

- Shared skills: `.agents/skills/shared-*`
- Frontend skills: `.agents/skills/fe-*`
- Superpowers pack: `.agents/skills/superpowers/*`

## Maintenance Notes

- Keep this root file short and high-signal.
- Put FE-specific detail in `alzan-fe/agents.md`.
- Put BE-specific detail in `alzan-be/AGENTS.md`.
- Put reusable multi-step workflows in skills instead of expanding this file endlessly.
- Keep all team skills versioned in Git.
- Do not rely on personal-machine-only symlinks for project-critical instructions.
