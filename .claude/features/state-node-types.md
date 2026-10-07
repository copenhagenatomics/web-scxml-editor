# Feature: State Type Rendering (Simple / Compound / Parallel / Final / Initial / History)

## Purpose

Give the user an at-a-glance visual language for the different kinds of SCXML states, matching the spec's semantic categories, without requiring a separate component (and separate bugs) per type.

## User behavior

- Solid border = simple state (leaf, no children).
- Dashed border = compound state (has `<state>`/`<parallel>`/`<final>`/`<history>` children) — hovering reveals a "navigate into" arrow.
- Overlapping-square icon + "⚡" glyph = parallel state.
- Double border, muted slate fill, a small `◉` bullseye next to the name, smallest minimum size = final state (a real `<final>` element only — never inferred from the name, so a `<state id="CompleteSetup">` looks normal). It has **no outgoing connection handles** and no "navigate into" button. If it has `<donedata>`, a muted `done: {param1, param2}` line (or `done: {content}`) appears under the name.
- Green "Initial" badge = this state is the entry point of its container (no arrow is drawn to it — see UI behavior).
- Oversized dashed purple box drawn around a container = a shallow/deep history marker for that container.
- Changing a state's type re-renders it with the new visual treatment immediately. Note there is currently no UI control for it: `visual-diagram.tsx` wires `onStateTypeChange` into node data, but `SCXMLStateNode` never calls it (editing the XML from `<state>` to `<final>` in Monaco is the user-facing path today).

## UI behavior

- **One React component renders every type**: `SCXMLStateNode` (`src/components/diagram/nodes/scxml-state-node.tsx`), discriminated by `data.stateType: 'simple'|'compound'|'parallel'|'final'` plus an orthogonal `data.isInitial: boolean`. There is no `CompoundStateNode`/`ParallelStateNode`/etc. (those types exist in `src/types/hierarchical-node.ts` but are explicitly marked `@deprecated`/unused).
- **History is the one exception**: a separate ReactFlow node type, `scxmlHistory` → `HistoryWrapperNode` (`src/components/diagram/nodes/history-wrapper-node.tsx`) — a purely decorative box with no interactive content, drawn around (not replacing) the container it's associated with.
- A label containing the substring "history" (case-insensitive, anywhere in the id) also adds a small "📜 History" chip to a regular `SCXMLStateNode`, **independent of** whether it's a real `<history>` element — a cosmetic string-match quirk, not the authoritative history indicator.
- A final honors the same `viz:` metadata as other states (`viz:xywh`, `viz:rgb`, legacy fill/stroke/style): `VisualMetadataManager` reads and writes it for `<final>` elements at any depth. A custom `viz:rgb` replaces the muted fill; the double border is kept unless the metadata sets an explicit border style.
- **Default per-type styling has one owner**: `computeVisualStyles` (`src/lib/utils/visual-style-utils.ts`). The diagram always passes its result as `data.visualStyles`; when it's absent (e.g. a bare render), `SCXMLStateNode` falls back to `computeVisualStyles(undefined, 'final')` for final states rather than defining its own final look. The node's remaining label-substring color heuristics (idle/initial → green, error/fail → red) only apply to that no-`visualStyles` fallback path; the old "final"/"complete" substring → purple heuristic was removed.
- **Final states can't be a transition source**, enforced in layers: `SCXMLStateNode` renders only `type='target'` handles for them; because the canvas uses `ConnectionMode.Loose` (a drag can start from a target handle), `isValidConnection`/`onConnect` in `visual-diagram.tsx` also reject a `<final>` source (`isFinalState`); `ReconnectTransitionCommand` refuses to move a transition's source onto a `<final>`, and `UpdateInternalEventsCommand` refuses to add reactions (targetless transitions) to one — and a final state doesn't get the State Actions panel at all: clicking it selects the node (so F, copy/paste and delete still work) but closes the panel instead of opening it (`handleStateClick` in `visual-diagram.tsx`); an effect also closes the panel if the state it shows becomes a `<final>` (e.g. via an XML edit). The panel's own hiding of its "event reactions" tab for finals stays as a backstop. Its onentry/onexit/donedata can still be edited in the XML. Hand-edited XML that puts a `<transition>` inside a `<final>` is reported as an error by the validator (`validateFinalRequiredAttributes` in `w3c-validator.ts`). A `<final>` is also never a drag-to-nest drop target.
- The Initial badge widens the node by a fixed amount (+70px, `node-dimension-calculator.ts`); there is deliberately **no arrow drawn into the initial state** — unlike many statechart tools' "black dot → arrow" convention.

## Internal architecture

- `<final>` elements are registered by `registerAllStates` (`converter-modules/state-registry.ts`) with `elementType: 'final'` as leaves. They come from `getDisplayChildEntries`/`getRegionDisplayEntries` (`src/lib/utils/parallel-structure.ts`), which return `DisplayEntry`s that include `<final>` — so a `<final>` inside a `<parallel>` region is drawn in that region's column like any other region content. The structural `getChildEntries` (used by Parallel State normalization) deliberately still covers only `<state>`/`<parallel>`.
- Type classification happens once, in the converter (`SCXMLToXStateConverter.createHierarchicalNode`, `src/lib/converters/scxml-to-xstate.ts`): `<final>` element (`elementType === 'final'`) → `stateType: 'final'`; `parallel` element → `'parallel'`; has children → `'compound'`; a `<history>` element → a separate `nodeType: 'scxmlHistory'` with `stateType: 'simple'` underneath (the wrapper handles its own visuals).
- `isInitialState()` (`converter-modules/layout-positioning.ts`) is a pure boolean check against the parent's `@initial`/`<initial>` — it does not affect `stateType`, only the `isInitial` flag consumed for the badge and dimension sizing.
- Dimension calculation (`node-dimension-calculator.ts`) is **not based on child count** (only one hierarchy level is ever visible at a time — see `hierarchy-navigation.md`) — it's based on label text width (measured via `measure-label-width.ts`, with a `length*8` fallback), state-type-specific minimum size, +70px if Initial, +20px height per onentry/onexit action.
- History-wrapper sizing/positioning (`positionHistoryStates`, `converter-modules/layout-positioning.ts:22-81`) uses **fixed-margin math**, not ELK — its own doc comment marks it `@deprecated ... kept for fallback only`, but it is in fact the **only implementation ever invoked**; there is no ELK-based alternative currently wired up despite the deprecation note.

## Relevant components

`src/components/diagram/nodes/scxml-state-node.tsx`, `src/components/diagram/nodes/history-wrapper-node.tsx`.

## Relevant state/store

None directly — type/flags flow through the node's `data` object, sourced from the converter's per-render conversion, not a persistent store.

## Relevant utilities

`src/lib/converters/converter-modules/layout-positioning.ts` (`isInitialState`, `positionHistoryStates`), `src/lib/layout/node-dimension-calculator.ts`, `src/lib/layout/measure-label-width.ts`, `src/lib/utils/visual-style-utils.ts` (`computeVisualStyles` — per-type default color/border scheme).

## SCXML behavior

- `stateType` is derived, never itself stored — it's computed fresh from the element's tag (`<parallel>`, `<final>`) and presence of children, on every conversion. SCXML has no `type="final"` attribute; a `<state type="final">` is a plain state.
- Changing a state's type goes through `ChangeStateTypeCommand` (`src/lib/commands/change-state-type-command.ts`). `'final'` ↔ `'simple'`/`'compound'` really swaps the element (`<state id="X">` ↔ `<final id="X">`, same SCXML namespace), keeping attributes and the children valid on the new element and dropping the rest (`ALLOWED_CHILDREN`: a `<final>` keeps only `onentry`/`onexit`/`donedata`; a `<state>` drops `donedata`; the `initial` attribute is dropped going to `<final>`; non-SCXML children such as `viz:note` always stay). Transitions elsewhere that targeted a dropped descendant are removed. It refuses to make a `<parallel>` region final. Conversion to `'parallel'` is still **not implemented** (logs a `console.warn`, changes nothing but waypoints). No UI currently calls `onStateTypeChange`; the command is reachable only programmatically.

## Validation rules

`validateCompoundStates` requires any state with children to declare `@initial` or an `<initial>` element — but **only recurses through `state → state`, not through `<parallel>`**, so a compound state nested inside a parallel region missing this can go unflagged (see `.claude/project/scxml-rules.md`).

## Related features

- `hierarchy-navigation.md` — the "navigate into" affordance on compound states, and why children never render nested inside the parent box.
- `initial-state-groups.md` — the business rules around marking/unmarking the Initial badge.
- `state-actions-panel.md` — where onentry/onexit editing (which affects node height) and the Initial toggle both live.

## Related files

`src/components/diagram/nodes/scxml-state-node.tsx`, `history-wrapper-node.tsx`, `src/lib/converters/scxml-to-xstate.ts`, `src/lib/converters/converter-modules/layout-positioning.ts`, `src/lib/layout/node-dimension-calculator.ts`, `src/lib/commands/change-state-type-command.ts`, `src/types/hierarchical-node.ts` (deprecated type definitions).

## Tests

`src/lib/commands/change-state-type-command.test.ts`, `reconnect-transition-command.test.ts`, `src/components/diagram/nodes/scxml-state-node.test.tsx` (RTL: final handles/icon/border, name-based non-final), `src/lib/utils/visual-style-utils.test.ts`, the `<final>` blocks in `state-registry.test.ts` and `scxml-to-xstate.test.ts`. No render test exists for `history-wrapper-node.tsx`.

## Known limitations

- State→parallel conversion is not implemented in `ChangeStateTypeCommand` (see SCXML behavior above).
- **`ChangeStateTypeCommand`'s state→final cleanup isn't scoped to the state tree.** Both steps use document-wide DOM selectors: collecting the ids of dropped descendants (`querySelectorAll('state[id], parallel[id], …')` inside the dropped children) and rewriting/removing transitions that targeted them (`doc.querySelectorAll('transition[target]')`). SCXML allows arbitrary inline XML in data payloads (`<content>` in `<send>`/`<donedata>`, inline `<data>` content), so a payload that happens to contain `<state id=…>` or `<transition target=…>` elements would be treated as real SCXML and could be edited or removed. Deliberately left unfixed (raised in Copilot review on PR #68) because **no UI calls this command yet** (see User behavior above); fix it before wiring a "change type" control: walk only the real state hierarchy (`state`/`parallel`/`final`/`history`/`initial` children from `<scxml>`) instead of querying every descendant by tag name.
- A `<final>` inside a `<parallel>` region is counted in that region's `memberIds` (`collectParallelGroups` in `parallel-group-normalization.ts` goes through `getRegionDisplayEntries`), but no layout/divider test covers a region containing a `<final>` yet — verify region separation visually if you touch that path.
- The final look is a box, not the UML circular end-state shape — a deliberate choice, see `decisions/visual-diagram.md` #15.
- History-wrapper positioning uses generous fixed margins (`wrapMargin=150`) regardless of actual content — can look oversized relative to a small container, and there's no configurable/ELK-based sizing despite the deprecation comment suggesting one was planned.

## Important edge cases

- A node can be both "compound" (has children) and have its label happen to contain "history" — it will show *both* the dashed border/navigate-in arrow *and* the cosmetic "📜 History" chip, even if it has no actual `<history>` child. This is a real, reachable visual quirk from ordinary naming, not a hypothetical.
- Width is **never allowed to shrink** on a content-only reparse — `Math.max(storedVizWidth, calculatedMinimum)` — so a node can only get narrower via an explicit manual `NodeResizer` drag, never automatically (e.g. after un-marking Initial or shortening a label via rename).

## Things that must NOT be changed

- Do not introduce a per-type node component without first checking every place that currently assumes "there is exactly one state node component, `SCXMLStateNode`" (the enhancement pass in `visual-diagram.tsx`, `nodeTypes` registration, dimension calculation) — this is a structural assumption throughout the diagram code, not a superficial styling choice.
- Do not remove the width-floor-never-shrinks behavior without checking `RenameStateCommand`'s reliance on it (a rename to a longer id must not clip; see `undo-redo-history.md`/`.claude/project/coding-rules.md`'s waypoint-invalidation note, which exists specifically because size-changing commands need this floor to stay correct alongside stale-waypoint clearing).

## Previous design decisions

How final states are detected and drawn: `decisions/visual-diagram.md` #15. The `ChangeStateTypeCommand` undo defect (`decisions/editing.md` #3) is fixed.

`src/types/hierarchical-node.ts` explicitly documents its own supersession: `CompoundStateNodeData`/`ParallelStateNodeData` are marked `@deprecated - removed - use SCXMLStateNode with data.stateType instead` — direct evidence that this codebase used to have per-type node components and was deliberately consolidated into the single-component-plus-discriminator design described above.
