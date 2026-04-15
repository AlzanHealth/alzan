---
name: shared-skill-crafter-perfect
description: Create or update an Agent Skill folder (SKILL.md + optional references/scripts/assets) following best practices: concise metadata triggers, progressive disclosure, minimal context bloat, deterministic validation, and reusable resources. Use when the user asks to "create a skill", "update a skill", "improve skill triggering", "refactor skill structure", "add scripts/references/assets", "validate skills", or "design a reliable workflow for an AI agent".
---

# Create or update skills correctly (best-practice workflow)

## Always follow this process (in order)

1. Clarify the job-to-be-done (with concrete examples)

- Extract 3–8 real user prompts that should trigger the skill.
- Extract 3–8 anti-examples that should NOT trigger the skill.
- Identify fragile steps that need guardrails (low freedom) vs flexible steps (high freedom).

2. Decide the minimum viable skill surface

- Keep SKILL.md lean: only what the agent must do procedurally.
- Put bulky material (schemas, long patterns, big examples) into `references/`.
- Put repetitive/deterministic actions into `scripts/`.
- Put templates/boilerplate into `assets/`.

3. Write frontmatter that triggers well

- Use ONLY:
  - `name`
  - `description`
- Make `description` explicitly mention:
  - what the skill does
  - when to use it (phrases + contexts)
  - what artifacts it outputs (if applicable)

4. Author SKILL.md body as imperative workflow

- Use short, step-by-step instructions.
- Add explicit “hard rules” inside the body only if they are crucial to execution.
- Use progressive disclosure:
  - Point to reference files when details are needed.
  - Avoid duplicating reference content in SKILL.md.

5. Add bundled resources only if they pay off repeatedly

- `references/`: docs the agent should read only when needed.
- `scripts/`: deterministic helpers (must be runnable + tested).
- `assets/`: output templates and boilerplate (not meant to be read into context).

6. Validate and iterate

- Run the skill validator (your repo’s validator or the standard quick_validate).
- Use the skill on real prompts.
- Improve triggers, tighten steps, and move bloat into references.

## Non-negotiable conventions

- Skill name: lowercase letters/digits/hyphens, <64 chars.
- No extra docs like README/CHANGELOG. Keep only what supports execution.
- Prefer “update existing docs” over creating new files unless necessary.
- If updating an existing skill:
  - ensure `agents/openai.yaml` matches SKILL.md intent (regenerate if stale).

## Use the included references

- Use `references/checklist.md` as the acceptance checklist.
- Use `references/templates.md` to draft SKILL.md and openai.yaml quickly.
- Use `references/examples.md` to test triggering and avoid collisions.
