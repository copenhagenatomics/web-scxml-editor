---
name: refactoring
description: Restructure existing code without changing its observable behavior — extracting a function, consolidating duplication, cleaning up dead code, improving naming, reorganizing files. Use when the request is explicitly about structure/quality, not new capability or a bug fix. Enforces extra regression diligence since a refactor that silently changes behavior is a bug wearing a refactor's clothes.
---

# Refactoring

Specializes `.claude/workflows/development.md` with an emphasis on step 0's "preserve existing behavior" rule and steps 15–16 (diff review, regression check) — refactoring is the task type where accidentally changing behavior is both easiest to do and hardest to notice, because nothing about the request signals "this should behave differently."

## When to use

Extracting shared logic, renaming for clarity, splitting a large file, removing confirmed dead code, consolidating two near-duplicate implementations, reorganizing directory structure. Not for adding capability (`feature-development`) or fixing a defect (`bug-investigation`), even if the fix happens to involve restructuring — if behavior is meant to change, name the task accordingly instead of calling it a refactor.

## Required investigation steps

1. Before touching anything, write down what currently happens (inputs → outputs, for the specific code being refactored) so you have a concrete baseline to diff your refactored version against.
2. Check `.claude/index.md`'s "Known issues" list — several entries are **confirmed dead code** you might be tempted to "clean up" as part of an unrelated refactor (`ContainerLayoutManager`, `transition-edit-bar.tsx`, `state-actions-edit-bar.tsx`, `visual-metadata-export.tsx`). Removing genuinely dead code is good; just confirm via the doc (or a fresh repo-wide reference search) that it's actually dead, not merely rarely used.
3. Grep for **every** call site of what you're refactoring — this repo has several deliberately-shared utilities (`transition-slot-rules.ts`, `initial-group-utils.ts`, `waypoint-invalidation.ts`) consumed from more than one place; a refactor that only updates the call site you started from will silently break the others.
4. Check whether the code you're refactoring is one half of a deliberately-duplicated pair (e.g. the two SCXML serializers, or the two clean-export fallback implementations) — refactoring one without the other, or accidentally merging them without realizing they're allowed to differ, are both live risks in this specific codebase.
5. Identify existing tests for the code being refactored — they're your primary before/after behavior check.

## Relevant knowledge files

`.claude/index.md`'s Known issues list (dead code candidates), whichever `.claude/features/*.md` covers the code being touched (read "Things that must NOT be changed" specifically).

## Relevant project rules

`.claude/project/project-rules.md` §23 (File/module boundaries) for reorganization; whichever domain section covers the code otherwise.

## Relevant decision records

Check `.claude/decisions/*.md` for whether the code being refactored embodies a specific past decision (e.g. the two-mutation-strategy split, the two-serializer split) — a refactor that "simplifies" by merging two things back together may be silently re-undoing a deliberate separation; if you believe the separation is no longer warranted, that's a decision to make and record explicitly, not a side effect of a cleanup pass.

## Implementation expectations

- Behavior must be identical before and after, unless the user explicitly asked for a behavior change too (in which case, treat that part as a separate feature-development/bug-fix concern within the same task, and call it out).
- Follow the established patterns this repo already uses (barrel exports, Command pattern, selector-based store access) — a refactor should make code look *more* consistent with the rest of the codebase, not introduce a new pattern.
- When deleting confirmed dead code, remove it entirely (including now-unused imports) rather than commenting it out.

## Testing expectations

- Run the full existing test suite before and after — a refactor should produce **zero** test behavior changes. Any test that starts failing means the refactor changed behavior, not just structure — stop and reconcile before proceeding.
- If no test exists for the refactored code, consider adding one first (characterization test) so you have a safety net — especially before touching a shared utility.
- For anything UI-facing, manually re-verify in a browser even though nothing was "supposed" to change visually.

## Common mistakes to avoid

- Updating one call site of a shared utility and missing the others.
- Merging two deliberately-separate implementations (the two serializers, the two mutation strategies) without recognizing that as an architectural decision reversal, not a cleanup.
- Deleting code that looked dead but wasn't (verify against `.claude/index.md`'s Known issues list and/or a fresh grep, not assumption).
- Letting a refactor grow into a feature change without renaming the task and re-applying `feature-development`'s or `bug-investigation`'s expectations.
- Not updating a `.claude/decisions/*.md` entry's `Status` to `Superseded` if the refactor deliberately reverses a recorded decision (see `knowledge-maintenance`).
