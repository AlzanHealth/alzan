---
name: shared-cleanup-temporary-artifacts
description: Use when a task leaves behind temporary Playwright/browser snapshots, logs, reports, generated plans, or other workspace artifacts that should be removed before handoff.
---

# Clean up temporary task artifacts

1. Identify only artifacts created by the current task. Inspect `git status`, `git ls-files`, and the artifact directory before removing anything.
2. Classify each candidate:
   - Remove tool output such as `.playwright-cli` snapshots, console logs, traces, videos, and temporary reports when they are not part of a requested test suite.
   - Remove task-specific implementation plans only when the user says they are obsolete. Keep design specifications, functional documentation, and reusable templates.
   - Keep source code, tests, migrations, configuration, and shared documentation.
3. Prefer moving untracked artifacts to a task-specific directory under `/tmp` during the task. At handoff, remove them from the workspace if no later step needs them.
4. Never delete tracked files merely because they look generated. If the user explicitly asks to remove them, list the exact paths first, remove only those paths, and report the deletion.
5. After cleanup, run `git status --short`, `git diff --check`, and the relevant project quality checks. Confirm that no required artifact was removed.

Do not use broad recursive deletion, `git clean`, or commands that infer targets from an unresolved glob. Do not retain browser artifacts or one-off plans just because they were convenient during the task.
