# Alzan Frontend Agent Instructions

This file is intentionally short and acts as the frontend routing map for `alzan-fe/`.

Detailed frontend implementation reference: `./docs/ai-frontend-reference.md`

## Start Here

- Use `fe-react-native-expert-developer` first for frontend implementation and refactors.
- Add only the relevant FE skills:
  - `fe-mobile-ui-ux-direction` for UI/UX, navigation, restyling, mobile ergonomics, theming, or motion.
  - `fe-react-native-best-practices` for lists, charts, blur, animation, scrolling, startup, memory, or broader RN/Expo performance work.
  - `fe-react-component-performance` for specific render bottlenecks or re-render issues.
  - `fe-manage-translations` for user-facing strings and i18n changes.
  - `fe-upgrading-expo` for SDK or dependency upgrades.
  - `fe-expo-cicd-workflows` for Expo/EAS workflow changes.
- For visual ideation or premium polish, you may also use `fe-design-taste-frontend`, `fe-emil-design-eng`, `fe-gpt-taste`, `fe-high-end-visual-design`, `fe-minimalist-ui`, or `fe-ui-ux-pro-max`, but final implementation must still follow the RN/Expo skills above.
- Pull in shared skills only when the task really needs them: docs, DB/schema, security, e2e, quality gate, or commit-generation help.
- For planning, debugging, or verification discipline, use the shared workflow skills such as `shared-writing-plans`, `shared-systematic-debugging`, and `shared-verification-before-completion`.
- Any code change must finish with `shared-pnpm-quality-gate`.

## Key Commands

- `pnpm --prefix alzan-fe run typecheck`
- `pnpm --prefix alzan-fe run format:check`
- `pnpm --prefix alzan-fe run generate-openapi`
- `pnpm --prefix alzan-fe run lint:check`
- `pnpm --prefix alzan-fe run build` only when strictly necessary, because it triggers `expo prebuild`

## High-Signal Rules

- Never use `any` unless the value is truly unknown and then narrowed safely.
- Avoid `as` assertions unless there is no cleaner typed alternative.
- Search existing types, components, hooks, and services before creating new ones.
- Do not make direct Supabase or raw fetch calls inside React components; use custom hooks or generated OpenAPI query hooks.
- Keep navigation fully typed.
- Use theme-driven colors instead of hardcoded values.
- Use translation keys for all user-facing strings.
- Keep iOS, Android, and Web compatibility in mind.
- Delete dead code, commented code, debug logs, and unused imports before closing a task.

## Key Paths

- `alzan-fe/src/components/`: shared UI primitives and reusable components
- `alzan-fe/src/modules/`: feature modules and feature-local components/hooks/services
- `alzan-fe/src/hooks/`: shared hooks
- `alzan-fe/src/services/`: shared services
- `alzan-fe/src/i18n/`: translations
- `alzan-fe/src/types/`: TypeScript types and navigation definitions
- `alzan-fe/src/openapi/`: generated OpenAPI client

## Reference

- Detailed frontend implementation reference: `alzan-fe/docs/ai-frontend-reference.md`
- Use that reference when you need concrete examples for hooks, typing, navigation, theming, translations, module layout, or Supabase patterns.
