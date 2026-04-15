name: shared-no-commit-without-approval
description: Mandatory git safety rule for this repository. Never run git commit/push/tag/rebase/reset/branch deletion from the agent. If the user asks for commit help, provide only a commit name and description using shared-commit-generator.
---

# No Git Commits Without Explicit Approval

Use this skill for every task in this repository.

## Core rule

- Never run git write/publish commands from the agent in this repository.
- If the user asks for "commit", "haz commit", or similar, provide only:
  - Conventional Commit title
  - Commit description/changelog text
- Use `shared-commit-generator` for that response.

## Forbidden by default

- `git commit`
- `git push`
- `git tag`
- `git commit --amend`
- `git rebase`
- `git reset`
- `git branch -d`
- `git push --delete`

## Required behavior

1. Make code/documentation changes only.
2. Leave changes unstaged unless the user asks to stage.
3. If asked to commit/push, do not execute git publish commands; return commit text only.
4. If a git publish action happens by mistake, disclose it immediately and ask how to revert.
