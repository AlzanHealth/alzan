# Alzan Agent Instructions

This repository is a shared AI workspace for Codex, Antigravity, Claude Code, and Gemini CLI.

This root `AGENTS.md` is intentionally short and acts as a table of contents. Keep long examples and step-by-step implementation detail in subtree `AGENTS.md` files, project skills, or reference docs.

Compatibility layers:
- Codex and Antigravity read the `AGENTS.md` hierarchy.
- Claude Code reads `CLAUDE.md` files plus `.claude/rules/`, both routing back to this instruction system.
- Gemini CLI reads `GEMINI.md` files, which import the same repo instructions.
- The source of truth for project skills is `.agents/skills/`. The Claude mirror in `.claude/skills/` must keep the same logical ids and visible layout.

## Start Here

1. Determine the task scope first.
   - If the task touches `alzan-fe/`, read `alzan-fe/AGENTS.md` before taking action.
   - If the task touches `alzan-be/`, read `alzan-be/AGENTS.md` before taking action.
   - If the task spans FE and BE, read both files before taking action.
2. Review `.agents/skills/README.md` and select only the skills that actually match the task.
3. Read the selected `SKILL.md` files before implementation, debugging, review, or documentation work.
4. Prefer the smallest matching skill set instead of loading everything.
5. More specific subtree instructions win over broader ones.

## Local Demo Access

- Use only against local Supabase: `info@alzan.com` / `FakePassword1`.
- The seeded account and password source of truth are [`supabase/seeds/0_user.sql`](supabase/seeds/0_user.sql); never use these credentials against a remote environment.

## Skill Routing

- Frontend work in `alzan-fe/`: use `fe-react-native-expert-developer` first, then the relevant `fe-*` skills, then `shared-*`.
- Mobile UI/UX, navigation, or visual refactors in `alzan-fe/`: use `fe-mobile-ui-ux-direction`; pair with `fe-react-native-best-practices` when lists, charts, blur, animation, scrolling, or memory/performance risks are involved.
- Frontend visual exploration, premium polish, motion taste, or art direction: use `fe-design-taste-frontend`, `fe-emil-design-eng`, `fe-gpt-taste`, `fe-high-end-visual-design`, `fe-minimalist-ui`, or `fe-ui-ux-pro-max`; pair them with `fe-mobile-ui-ux-direction` before implementation so final decisions stay mobile-first.
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
- Planning non-trivial work: use `shared-writing-plans`.
- Debugging bugs, broken tests, or unexpected behavior: use `shared-systematic-debugging`.
- Before claiming a fix is complete: use `shared-verification-before-completion`.

## Verification

- Any code change must run `shared-pnpm-quality-gate` before closing the task.
- Default local gate:
  - `pnpm format`
  - `pnpm run lint:check`
- If the user asks to match GitHub `code-quality.yml`, follow the higher-parity checks defined inside `shared-pnpm-quality-gate`.
- Documentation-only changes do not need pnpm verification unless code also changed or the user explicitly asks for repo-parity verification.

## Git Safety

- Always apply `shared-no-commit-without-approval`.
- Never commit, push, tag, rebase, reset, or delete branches from the agent unless the user explicitly changes that policy.
- If the user asks for commit help, use `shared-commit-generator` and return commit text only.

## Skill Locations

- Shared skills: `.agents/skills/shared-*`
- Frontend skills: `.agents/skills/fe-*`
- Workflow skills: `.agents/skills/shared-brainstorming`, `.agents/skills/shared-writing-plans`, `.agents/skills/shared-systematic-debugging`, and related `shared-*` workflow skills
- Claude Code project skills: `.claude/skills/*` (compatibility mirror of `.agents/skills/*`)

## Maintenance Notes

- Keep this root file short and high-signal.
- Put FE-specific detail in `alzan-fe/AGENTS.md` and reference docs under `alzan-fe/docs/`.
- Put BE-specific detail in `alzan-be/AGENTS.md`.
- Use skills for multi-step workflows instead of bloating `AGENTS.md` or `CLAUDE.md` files.
- Use `.claude/rules/` for Claude-specific path routing and skill discipline.
- Keep all team skills versioned in Git.
