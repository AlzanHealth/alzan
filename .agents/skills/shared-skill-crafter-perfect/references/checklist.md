# Skill quality checklist (pass/fail)

## Metadata (frontmatter)

- [ ] Only `name` and `description`
- [ ] `name` uses lowercase/digits/hyphens, <64 chars
- [ ] `description` states:
  - [ ] what it does
  - [ ] when to use (explicit contexts)
  - [ ] typical outputs/artifacts (if any)

## SKILL.md body

- [ ] Imperative workflow, ordered steps
- [ ] No large walls of text (prefer bullets)
- [ ] Progressive disclosure used (links to references)
- [ ] Clear defaults and safe fallbacks
- [ ] Hard rules only where needed

## References/scripts/assets

- [ ] References are not duplicated in SKILL.md
- [ ] Scripts exist only when deterministic or repeated code is needed
- [ ] Assets contain templates/boilerplate to copy, not docs
- [ ] No extra docs like README/CHANGELOG/installation guides

## Triggering behavior

- [ ] 3–8 “should trigger” examples exist
- [ ] 3–8 “should NOT trigger” examples exist
- [ ] No obvious collisions with other skills

## Validation + iteration

- [ ] Validation step documented (quick_validate or repo validator)
- [ ] Test plan on real prompts included
- [ ] Clear iteration guidance (what to tweak first)
