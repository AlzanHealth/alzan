---
name: shared-technical-documentation
description: Use when writing, restructuring, or reviewing technical documentation such as READMEs, architecture docs, runbooks, setup guides, API docs, or feature documentation for this project.
source: inspired by Google Developer Style Guide procedures guidance and documentation workflow patterns reviewed from the agent-skills ecosystem
---

# Write strong technical documentation

Use this skill to create documentation that is clear, accurate, scannable, and maintainable.

## Mandatory pairing rule

Use `shared-technical-documentation` by itself only when the task is primarily editorial:

- rewriting wording
- improving structure
- clarifying explanations
- cleaning headings, examples, or readability

You MUST pair this skill with `shared-alzan-local-docs-sync-from-code` when the document makes claims about implemented behavior, including:

- features or user flows
- screens, routes, or navigation
- API endpoints or contracts
- database tables, schema, or migrations
- environment setup, commands, or operational runbooks
- architecture, integrations, or security behavior

If the reader could be misled by stale repo information, use both skills together.

## Core goals

- Optimize for the reader's task, not for completeness theater.
- Prefer short, accurate, high-signal docs over large vague documents.
- Make docs easy to scan first, then easy to trust.
- Tie important claims to real code paths, commands, tables, or files.

## Workflow

1. Identify the document type and audience

- Decide whether the reader needs:
  - overview
  - setup guide
  - task procedure
  - architecture note
  - API reference
  - runbook
- State who the doc is for: teammate, new contributor, operator, or product engineer.

2. Define the reader outcome

- Start from the question the reader needs answered.
- Put the expected outcome near the top:
  - what this is
  - when to use it
  - what the reader can do after reading it

3. Gather evidence before writing

- Read the relevant code, config, docs, and scripts first.
- Prefer local evidence from the repo over assumptions.
- If a command, path, env var, endpoint, table, or workflow is mentioned, verify it exists.

4. Choose the right structure

- Use this default order when it fits:
  - purpose
  - scope
  - prerequisites
  - procedure or system explanation
  - examples
  - failure modes or caveats
  - references
- For procedures, use numbered steps.
- For reference material, group by topic, not chronology.

5. Write for scanning

- Front-load the answer.
- Use short paragraphs and descriptive headings.
- Keep one idea per paragraph or list item.
- Prefer concrete nouns and verbs over abstract wording.
- Avoid filler like "simply", "basically", or "in order to".

6. Make examples executable

- Commands should be realistic and copyable.
- Paths, env vars, and identifiers should match the repo.
- Show the smallest useful example first.
- If an example is partial, say what was omitted.

7. Capture constraints and failure modes

- Document what can go wrong.
- Call out permissions, environment assumptions, data risks, and platform differences.
- If something is future work, mark it clearly instead of implying it already exists.

8. Review for quality

- Check every heading answers a real reader need.
- Remove duplicated information.
- Replace vague claims with verified specifics.
- Ensure terminology stays consistent across FE, BE, and DB docs.

## Writing rules

- Prefer active voice.
- Prefer direct instructions.
- Put conditions before instructions when possible.
- Expand uncommon acronyms on first use.
- Use descriptive link text and meaningful headings.
- Avoid screenshots when text, tables, or code samples communicate better.
- If you use images, they must not be the only source of important information.

## Good patterns

- "Use this when..."
- "This screen reads from..."
- "Run this command from the repo root:"
- "This table is the source of truth for..."
- "If this fails, check..."

## Anti-patterns

- Long intros before the actual answer
- Marketing language inside technical docs
- Unverified architecture claims
- Screenshots of text or terminal output
- Giant sections mixing setup, troubleshooting, and reference together
- Copying old docs forward without checking current code

## Definition of done

- The target reader can complete the intended task or understand the intended system.
- The document reflects the current repo state.
- Commands and references are verified.
- The structure is easy to scan.
- The doc says no more than it can prove.
