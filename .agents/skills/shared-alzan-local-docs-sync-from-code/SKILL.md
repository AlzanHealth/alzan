---
name: shared-alzan-local-docs-sync-from-code
description: Update and synchronize the project's local Markdown documentation with the current codebase by ALWAYS scanning code and recent git commits first. Use when the user asks to "update/sync/review docs", "check recent commits", "remove outdated docs", "apply missing docs", or "audit documentation drift". Produce a doc pack (repo-ready Markdown), a drift map, a commit summary, and a cleanup plan.
---

# Do a code-first documentation sync (always)

## Follow this workflow (never skip steps)

1. Inspect recent commits

- Read git log for the requested range or default to the last 20 commits.
- List changed files grouped by area (frontend/backend/db/docs).
- Summarize the user-visible and architecture-impacting changes.

2. Build the inventory from code (source of truth)

- Scan code roots (default: `src/`, `supabase/`, `packages/` if present).
- Identify implemented modules, screens/routes, data access patterns, and business rules.
- Capture evidence as file paths and symbol names.

3. Build the inventory from docs (baseline)

- Scan the docs root (default: `docs/`) plus top-level README(s).
- Extract each doc’s claims (features/flows/tables/rules) and where they live (file + section).

4. Detect drift (code vs docs)

- Tag every item using drift tags (see `references/drift-tags.md`).
- Produce a drift map table: feature → docs refs → code refs → status → action.

5. Update docs incrementally

- Update existing files before creating new ones.
- Prefer small edits over rewrites unless structure is broken.
- For every non-trivial claim, include at least one local reference:
  - Docs reference: `docs/...`
  - Code reference: `src/...` / `supabase/...`

6. Handle removals safely

- Default to DEPRECATE instead of delete unless the user explicitly requests deletion.
- For deprecated content, add a banner stating it no longer exists in code and note the verified commit range.

7. Deliver outputs (always)

- Produce:
  - doc_pack (repo-ready Markdown)
  - drift_map
  - commit_summary
  - cleanup_plan

## Default assumptions (use unless user overrides)

- Commit range: last 20 commits
- Docs root: `docs/`
- Code roots: `src/`, `supabase/`, `packages/` if present
- Removal policy: deprecate, not delete
- Output: full file contents (not diffs)

## Use the standard doc structure

- Follow `references/doc-structure.md` for file layout and required sections.

## If the request is “sync everything”

- Prioritize:
  1. architecture + security
  2. data model references
  3. modules changed in recent commits
  4. remaining modules
