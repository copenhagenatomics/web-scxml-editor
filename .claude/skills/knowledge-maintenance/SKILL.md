---
name: knowledge-maintenance
description: Keep the .claude/ knowledge base (onboarding/, project/, features/, decisions/, workflows/, skills/, index.md) accurate after a change, or when explicitly asked to document/update project knowledge. Use as the closing step of any task that meaningfully changed behavior, or standalone for "update the docs" / "record this decision" requests. Prevents the knowledge base from drifting the way DEVELOPER_GUIDE.md and .claude/context/CLAUDE.md already have.
---

# Knowledge Maintenance

The detailed, mechanical process this skill wraps lives in **`.claude/workflows/knowledge-maintenance.md`** — read that file in full before doing this work; it is the authoritative reference (the materiality test, the 11 trigger questions, per-category update guidance, how to detect/resolve doc-vs-code conflicts, how to avoid duplicating knowledge, the practical step-by-step procedure, and the decision-record template). This skill file only covers the parts specific to invoking it as a skill.

This is the mechanism that keeps `.claude/` synchronized with the actual implementation, project-wide — it is not scoped to any one feature or subsystem, and it runs as an automatic closing phase of every meaningful task (`.claude/workflows/development.md` steps 17–20), not something the developer needs to ask for separately.

## When to use

At the end of any task that meaningfully changed behavior. Also standalone, whenever a user asks to document a feature, record a decision, or update the knowledge base directly. See `.claude/workflows/knowledge-maintenance.md`'s "materiality test" for exactly where the threshold sits — do not update knowledge simply because code changed.

## Required investigation steps

Run the 11 trigger questions in `.claude/workflows/knowledge-maintenance.md` against the change (this now includes an onboarding-impact question — check `.claude/onboarding/README.md` when it fires). For any "yes," follow that same document's category-by-category guidance and the practical workflow section to identify and make the specific edit. Then review the documentation diff itself and verify it's consistent with the final code — these are the two dedicated checks in `development.md` steps 19–20, not implicit parts of "make the edit."

## Relevant knowledge files

All of `.claude/` is potentially in scope; `.claude/index.md` is the map for finding the specific files to touch. `.claude/workflows/knowledge-maintenance.md` is the map for deciding *whether* and *how*.

## Relevant project rules

`.claude/project/project-rules.md`'s own closing section describes the `[EXPLICIT]`/`[INFERRED]` tagging discipline — apply it consistently to anything you add or edit.

## Relevant decision records

N/A as input — this skill is usually about *producing* decision records (using the template in `.claude/workflows/knowledge-maintenance.md`), not consuming them.

## Implementation expectations

Follow `.claude/workflows/knowledge-maintenance.md` exactly — its template/structure requirements for feature docs and decision records, its cross-reference discipline, and its `index.md` update requirements are not optional shortcuts. Do not improvise a different structure for a new file.

## Testing expectations

N/A — but verify any file:line or file-path claim against the actual current source before writing it down, per this knowledge base's own established discipline.

## Common mistakes to avoid

See `.claude/workflows/knowledge-maintenance.md`'s "Proportionality" section and the `knowledge-maintenance` (workflow) common failure modes it documents — most importantly: don't delete a `Superseded` decision, don't skip fixing cross-references, and don't treat this as optional busywork. An inaccurate `.claude/` is worse than no `.claude/` at all, because it's trusted by default.
