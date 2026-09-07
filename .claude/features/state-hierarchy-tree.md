# Feature: State Hierarchy Tree (parent/child registry)

> **Verification note**: the requesting task asked to investigate "Work trees." There is **no** literal "work tree" or "worktree" concept anywhere in this codebase (confirmed by repo-wide search — zero matches for `work.?tree`/`worktree` in `src/`, and no git-worktree usage either). The closest real, verified concept is the **state hierarchy tree** — the parent/child nesting structure of `<state>`/`<parallel>`/`<final>`/`<history>` elements that every other feature (navigation, layout, validation) is built on. This document covers that actual concept rather than inventing a "work tree" feature that doesn't exist.

## Purpose

Give every other subsystem (layout, navigation, validation, rendering) a single, consistent in-memory representation of "which state contains which," built once per parse rather than re-derived independently by each consumer.

## User behavior

Not directly user-facing — this is the internal data structure the drill-down navigation (`hierarchy-navigation.md`), compound-state rendering (`state-node-types.md`), and cross-hierarchy validation (`scxml-validation.md`) are all built on top of.

## UI behavior

N/A (architectural feature).

## Internal architecture

- Built fresh on every SCXML conversion by `registerAllStates()` (`src/lib/converters/converter-modules/state-registry.ts`), which recursively walks the parsed object tree and populates three parallel structures on the converter instance:
  - `stateRegistry: Map<string, StateRegistryEntry>` — one entry per state/parallel/final/history, carrying `{state, elementType, isContainer, children, parentPath, depth}`.
  - `hierarchyMap: Map<parentId, childId[]>` — parent → children.
  - `parentMap: Map<childId, parentId>` — child → parent (the inverse, used far more often since most lookups go "what's my parent" rather than "what are my children").
- `claimedStates: Set<string>` tracks states already registered under one parent, preventing a state from being double-counted if the traversal logic were ever to visit it via more than one path.
- `getAncestorChain(stateId, stateRegistry)` (also in `state-registry.ts`) walks `parentPath`/`parentMap` up to the root, producing the full ancestor chain — used by `resolve-focus-target.ts` to compute how many hierarchy levels to drill through to reach a state referenced by a validation error.
- This registry is **rebuilt from scratch on every conversion** (i.e. on every content change — see `two-way-sync.md`), not incrementally maintained; there is a `if (this.stateRegistry.size === 0)` guard in `SCXMLToXStateConverter.convertToReactFlow()` that skips rebuilding *within a single converter instance* if already populated, but a fresh `SCXMLToXStateConverter` (and thus fresh registry) is constructed on every render pass in practice.

## Relevant components

None directly — purely a `src/lib/converters/` internal data structure, not rendered.

## Relevant state/store

None — lives only as instance fields on a transient `SCXMLToXStateConverter`, never persisted to a Zustand store.

## Relevant utilities

`src/lib/converters/converter-modules/state-registry.ts` (`registerAllStates`, `getAncestorChain`, `StateRegistryEntry` type).

## SCXML behavior

Derived purely from ordinary SCXML nesting (`<state>` containing `<state>`/`<parallel>`/`<final>`/`<history>`) — no custom attributes involved. `isContainer` (whether a state is "compound" for rendering purposes) is computed here from whether the state has any of those child element types.

## Validation rules

`state-validator.ts`'s own hierarchy-building (`buildStateHierarchy`) is a **separate, parallel implementation** of essentially the same parent-map concept, built independently for validation purposes rather than reusing `state-registry.ts` — the validator operates on the raw parsed tree directly rather than sharing the converter's registry (the two pipelines are fully independent, see `.claude/project/architecture.md`).

## Related features

- `hierarchy-navigation.md` — the drill-down UX consumes `parentId` derived from this registry (before `useHierarchyNavigation` strips it again for flat rendering).
- `state-node-types.md` — `isContainer`/compound classification originates here.
- `auto-layout-elk.md` — ELK is run per level, grouped by `parentId` from this same structure.
- `scxml-validation.md` — has its own independent hierarchy-map construction (`state-validator.ts`'s `buildStateHierarchy`), not shared with this one.

## Related files

`src/lib/converters/converter-modules/state-registry.ts`, `src/lib/converters/scxml-to-xstate.ts`, `src/lib/utils/resolve-focus-target.ts`, `src/lib/validators/state-validator.ts` (the independent validator-side equivalent).

## Tests

No dedicated test file for `state-registry.ts` was found in isolation; its behavior is exercised indirectly through `src/lib/converters/scxml-to-xstate.test.ts`.

## Known limitations

- Two independent hierarchy-building implementations exist (converter-side `state-registry.ts` vs. validator-side `state-validator.ts`'s `buildStateHierarchy`) for conceptually the same data — a bug fix to one (e.g. handling of `<parallel>` children) is not guaranteed to be mirrored in the other. This is the same "two independent pipelines" pattern noted throughout `.claude/project/architecture.md`, applied here specifically to hierarchy construction.
- Full rebuild on every parse means hierarchy-dependent computations (ELK grouping, ancestor-chain resolution) all pay the cost of a fresh tree walk on every keystroke-driven content change (after debounce) — no incremental update path exists.

## Important edge cases

- `claimedStates` exists specifically to prevent double-registration — if you ever see a state's data appearing twice in a hierarchy-dependent computation, check whether a traversal path change caused it to be visited via two different parent routes before this guard could prevent it.

## Things that must NOT be changed

- Do not assume `stateRegistry`/`hierarchyMap`/`parentMap` persist across renders/conversions — they are rebuilt fresh every time; code holding a reference to a converter instance's registry across an `await` boundary (e.g. around the async ELK layout call) should be aware a *new* conversion could theoretically start before the old one finishes, though in practice the app does not appear to run overlapping conversions concurrently.

## Previous design decisions

No dedicated plan/spec document addresses this data structure directly — it appears to be foundational infrastructure that predates the dated `docs/superpowers/` planning practice, or was never treated as a "feature" in its own right by prior planning (consistent with it being a purely internal, non-user-facing concern).
