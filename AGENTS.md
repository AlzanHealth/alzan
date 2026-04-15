# Alzan Agent Instructions

This repository is a shared AI workspace for Codex and Antigravity.

## MANDATORY FIRST STEP

**BEFORE taking any action, planning, or writing code, you (Codex/Antigravity) MUST:**

1. **CRITICAL:** If your task involves `alzan-fe/` or `alzan-be/`, you MUST read their respective `AGENTS.md` files BEFORE anything else. The `alzan-fe/AGENTS.md` file in particular contains strict rules of what to do and what not to do.
2. Review **ALL** available skills in `.agents/skills/` equally.
3. Select the correct skill(s) for the current task based on the **Skill Routing** section below.
4. Use the `view_file` tool to read the `SKILL.md` of the selected skill(s).
5. Apply the skill's instructions strictly during execution.
   NEVER skip this step. You must consult the existing skills as heavily as any others.

## Skill Routing

- Frontend work in `alzan-fe/`: use `fe-*` skills first, then `shared-*`.
- Translating FE logic to code: ALWAYS use `fe-react-native-expert-developer` to ensure strict functional components, TypeScript, and FlashList.
- Mobile UI/UX, navigation, or visual refactors in `alzan-fe/`: use `fe-mobile-ui-ux-direction` and pair with `fe-react-native-best-practices` when diagnosing performance drops or memory leaks.
- Backend work in `alzan-be/`: ALWAYS use `shared-nestjs-expert-developer` for coding standards, paired with `shared-nestjs-patterns`, `shared-backend-patterns`, and `shared-api-design`.
- Database & Supabase logic: ALWAYS use `shared-supabase-expert-developer` for strict typings and SDK rules, and use `shared-supabase-postgres-best-practices` for Postgres native features.
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
