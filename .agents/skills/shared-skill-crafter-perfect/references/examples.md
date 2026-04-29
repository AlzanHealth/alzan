# Trigger tests (examples)

## Should trigger

- "Create a skill to update docs from code and recent commits"
- "Refactor this skill to reduce context bloat and move details into references"
- "Improve the description so the skill triggers for Spanish prompts too"
- "Add a deterministic script to avoid rewriting the same code every time"
- "Validate my skill folder and fix frontmatter issues"

## Should NOT trigger

- "What is Supabase?"
- "Explain what RLS means"
- "Make a landing page copy"
- "Help me with an Expo build"
- "Summarize this PDF"

## Collision notes

If multiple skills match:

- Prefer the most specific domain skill (e.g., expo-build-release) over this meta-skill.
- Use this skill mainly to CREATE/UPDATE skills, not to execute project tasks.
