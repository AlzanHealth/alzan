# shared-pnpm-quality-gate Rules

## Scope

- Repository: monorepo with `alzan-be` and `alzan-fe`.
- There are two supported verification levels:
  - mandatory local gate
  - GitHub CI parity
- Prefer root scripts for the mandatory local gate because they already aggregate both packages.

## Mandatory Local Gate

1. Verify `pnpm-lock.yaml` in repository root.
2. Verify root `package.json` contains:
   - `scripts.format`
   - `scripts["lint:check"]`

If present, run root commands:

- `pnpm format`
- `pnpm run lint:check`

If root scripts are missing, fallback to package-level local gate commands:

- `pnpm --prefix alzan-be format`
- `pnpm --prefix alzan-fe format`
- `pnpm --prefix alzan-be lint:check`
- `pnpm --prefix alzan-fe lint:check`

## GitHub CI Parity

Use parity checks when the user asks to match `.github/workflows/code-quality.yml`, or when branch-readiness matters.

### BE parity

- `pnpm --prefix alzan-be run format:check`
- `pnpm --prefix alzan-be run lint:check`

### FE parity

- `pnpm --prefix alzan-fe run format:check`
- `pnpm --prefix alzan-fe run generate-openapi`
- `pnpm --prefix alzan-fe run lint:check`

### FE optional build verification

- `pnpm --prefix alzan-fe run build`
- Only when strictly necessary for the task or explicitly requested.

## Install policy

- In CI, each package runs `pnpm install --frozen-lockfile`.
- Locally, do not install by default.
- Install only if:
  - lockfiles or dependencies changed
  - commands fail because dependencies are missing
  - the user explicitly asks for install-level parity

## FE parity caveats

- `pnpm --prefix alzan-fe run generate-openapi` writes generated output and formats FE files.
- `pnpm --prefix alzan-fe run build` runs `expo prebuild`.
- Do not run it by default from this skill.
- Only run it when strictly necessary, such as Expo config changes, config plugins, native dependency wiring, or explicit build-level verification requests.
- If you run it, report that `expo prebuild` may generate ignored native folders under `alzan-fe/ios/` and `alzan-fe/android/`.

## Error Handling

- Warnings do not fail the task.
- Non-zero exit on lint means errors and must be fixed.
- If `format:check` fails, run the matching formatter and then re-check.
- Use fix loop:
  1. Run lint.
  2. Parse errors.
  3. Apply fixes.
  4. Re-run lint.
  5. Repeat until clean or blocked.

## Reporting

- State whether you ran:
  - local gate
  - CI parity
  - both
- Report skipped commands and the reason.
- Use final status:
  - `PASS`
  - `FAIL`
  - `BLOCKED`

## Git Safety

- Never run `git commit`, `git push`, `git tag`, or PR creation commands.
- Provide status and command evidence only.
