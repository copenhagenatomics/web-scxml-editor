---
name: feature-development
description: Add new capability to the SCXML Editor (a new panel, command, editing gesture, autocomplete, export option, etc.). Use for any "add X" / "support Y" request that doesn't specifically match ui-changes, scxml-representation, state-machine-semantics, or validation-rules. Encodes this repo's extension points and conventions so a new feature fits the existing patterns instead of inventing a new one.
---

# Feature Development

This is the default skill for adding new capability to the SCXML Editor. It specializes `.claude/workflows/development.md`'s 19-step process — follow that process; this skill adds the feature-development-specific investigation steps, extension-point knowledge, and pitfalls for *this* codebase.

## When to use

Any request to add something that doesn't exist yet: a new panel, a new toolbar action, a new autocomplete suggestion type, a new export format, a new Command, a new keyboard shortcut, a new Host API method. If the new capability is specifically about SCXML representation, state-machine semantics, or validation, prefer the more specific skill instead — this one is the catch-all for everything else, and for features that span multiple domains.

## Required investigation steps

1. Search `.claude/index.md`'s keyword table for anything resembling the requested capability — confirm it doesn't already exist under a different name before building it (this repo has real cases of near-duplicate implementations, e.g. two independent "clean export" code paths).
2. Check `.claude/decisions/*.md` for whether a similar feature was tried and reverted (e.g. edge bundling → hub-centroid-nudge, inferred event/condition mode → explicit switch). Don't re-attempt an approach that's already recorded as `Superseded` without understanding why it failed.
3. Identify which existing extension point the new feature fits: a new **Command** (undoable SCXML mutation), a new **side panel** (host-bridge or diagram-selection-scoped), a new **validator pass**, or something else entirely. If it's genuinely something new, say so explicitly rather than forcing it into the wrong pattern.
4. Identify every store, component, and utility the feature will touch, and read each one's current state before planning changes (per `development.md` step 7 — do not paraphrase from docs alone).

## Relevant knowledge files

- `.claude/project/architecture.md` — the two-way sync loop, the two mutation strategies, the 7-store model.
- `.claude/project/coding-rules.md` — which mutation pattern to choose, testing conventions.
- `.claude/features/*.md` — whichever existing features are adjacent to what you're adding (check "Related features" in the closest match).
- `.claude/workflows/adding-a-command.md`, `adding-a-side-panel.md` — the concrete extension-point recipes.

## Relevant project rules

`.claude/project/project-rules.md` §1 (Overall Architecture), §2–3 (React architecture / component boundaries), §4 (State management), §23 (File/module boundaries) — almost every new feature touches at least one of these. Also check the category-specific sections (§9–14, §19–20) if the feature brushes against the diagram, validation, configuration, or integrations even tangentially.

## Relevant decision records

`.claude/decisions/architecture.md` #2 (which mutation strategy to use) and #4 (where new page-level logic belongs) are the two most commonly relevant. Check `.claude/decisions/naming-conventions.md` before inventing a new prefix/naming scheme — this repo has established, load-bearing conventions (`conf_`/`this_`/`main_`, `note:` id prefix, timer-event token pattern) that a new feature should follow rather than duplicate with a new scheme.

## Implementation expectations

- New undoable SCXML mutations are `Command` classes (`src/lib/commands/`), not inline manipulation — see `adding-a-command.md`.
- New side panels fit the single-active-panel model (`usePanelStore`) and use the shared primitives (`Panel`, `FormActions`, `FooterAddButton`, `PanelEmptyState`) — see `adding-a-side-panel.md`.
- New Zustand state goes in whichever of the 7 existing stores matches its concern, or a new store if it's a genuinely separate lifecycle — never bolt unrelated state onto an existing store for convenience.
- Follow the established barrel-export (`index.ts`) convention for any new file in `src/lib/*`.
- Do not add a feature-specific node/edge component if the existing single-`SCXMLStateNode`/single-`SCXMLTransitionEdge` model can represent it via a data field instead (§project-rules 3.3).

## Testing expectations

- Pure logic → a plain Vitest unit test, sibling file (never under `__tests__/` — see `test-writing` skill).
- A genuinely interactive new component → a `@testing-library/react` test, following the pattern in one of the 7 existing RTL test files, not a blanket policy of testing every component.
- If the feature is diagram/canvas/Monaco-facing (or otherwise user-facing UI), there is no e2e safety net and Claude does not run `npm run dev` or verify it in a browser itself (rule 17.5, `.claude/decisions/testing.md` #5) — report automated-check results as such and hand the developer a concrete manual verification checklist; see the `ui-changes` skill for the full protocol.

## Common mistakes to avoid

- Building a new mutation path that bypasses both established strategies (Commands and the direct object-tree edit path) — see `.claude/decisions/architecture.md` #2.
- Adding a new host-bridge data type without deciding its ownership model (SCXML-persisted vs. host-store-only vs. transient) — see `.claude/decisions/integrations.md` #4.
- Forgetting `clearWaypointsForTouchingTransitions` when the new feature can change a state's rendered size.
- Skipping the "does this already exist under a different name" check and re-implementing something (this repo already has one confirmed instance of a duplicated, drifted implementation: `visual-metadata-export.tsx` vs. `use-download.ts`).
- Not adding a `.claude/features/*.md` doc (and an `index.md` registry entry) for a feature substantial enough to need one — see the `knowledge-maintenance` skill.
