# Drift tags

Use these tags for every documented feature/module:

- MATCH: docs and code align
- DOCS_STALE: code changed; docs outdated
- CODE_ONLY: implemented in code but missing docs
- SPEC_ONLY: claimed in docs but missing in code
- UNKNOWN: cannot verify from code/docs signals

Rules:

- Code is the source of truth.
- If conflict: update docs to match code.
- If SPEC_ONLY: deprecate or delete per user policy.
