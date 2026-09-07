# Feature: Node Positioning (manual placement, storage, sizing floor)

## Purpose

Let a user manually place and size states/notes on the canvas, with that placement durably surviving reloads and taking absolute priority over anything the auto-layout engine would otherwise compute. This document covers the **positioning mechanism** itself (storage, commands, the manual-vs-auto priority rule); see `.claude/features/auto-layout-elk.md` for the algorithm that computes a position when none is stored yet.

## User behavior

- Drag a state (or multi-selection) anywhere on the canvas; release to commit the new position.
- Resize a selected state via its corner/edge handles (`NodeResizer`).
- A manually-placed/sized state **never** gets silently repositioned by auto-layout on a later reload/edit — its position is permanent until the user (or a size-affecting edit like rename) changes it again.

## UI behavior

- Position commits are debounced 150ms after drag stops (distinct from the 300ms history-tracking debounce — see `.claude/features/undo-redo-history.md`) before writing into content.
- A multi-node drag commits as **one** batched operation, not one per node.
- Live resize preview updates the node visually before the final commit on `onResizeEnd`.

## Internal architecture

- **Storage**: `viz:xywh="x,y,width,height"` (comma-separated) on the state/note's XML element — see `.claude/features/visual-metadata-namespace.md` for the full attribute contract and its known space-vs-comma inconsistency bug.
- **Commands**: `UpdatePositionCommand` (move only, preserves existing width/height), `UpdatePositionAndDimensionsCommand` (full resize), `BatchUpdatePositionCommand` (multi-node move, one command for the whole batch — constructed from a `Map<nodeId, oldPosition>` captured at drag start so `undo()` can restore every node's prior position in one step).
- **The absolute-priority rule**: on every conversion, `SCXMLToXStateConverter` reads `viz:xywh` (if present) and **skips ELK positioning for that node entirely** — ELK only ever computes positions for nodes lacking this attribute. `visual-diagram.tsx`'s later "enhancement pass" re-applies the stored position from `VisualMetadataManager` with priority over whatever the converter/ELK produced, as a second enforcement layer.
- **Width floor, not ceiling**: stored width is only ever a *minimum* — `Math.max(storedVizWidth, nodeDimensionCalculator.calculateWidth(...))` means a rename to a longer label, or the Initial badge appearing, can grow a node's effective width past what's stored, but nothing ever shrinks a node automatically. Only an explicit `NodeResizer` drag can make a node narrower.
- **Notes are handled specially**: `BatchUpdatePositionCommand` and `UpdatePositionCommand` both detect note ids (`isNoteId`) and force their dimensions to the fixed `NOTE.WIDTH`/`NOTE.HEIGHT` constants regardless of what's currently stored — including migrating a legacy custom-sized note back to the fixed size on its next move (notes cannot be manually resized — see `.claude/features/sticky-notes.md`).
- Extent constraint: nested nodes get `extent: 'parent'` + `expandParent: true` set by the converter — though this has no visible effect under the current flat drill-down rendering model (see `.claude/decisions/visual-diagram.md` #1), since parented nodes never actually render nested.

## Relevant components

`src/components/diagram/visual-diagram.tsx` (`handleNodesChange`, `handleNodeResize`), `src/components/diagram/nodes/scxml-state-node.tsx` (renders `NodeResizer` when selected).

## Relevant state/store

None dedicated — position data lives only in the SCXML string (`viz:xywh`), re-extracted fresh on every parse; no separate positions store.

## Relevant utilities

`src/lib/layout/node-dimension-calculator.ts` (the width/height floor calculation), `src/lib/converters/converter-modules/visual-metadata.ts` (`extractVisualMetadata`, `writeLayoutToSCXML`).

## SCXML behavior

`viz:xywh` is purely visual metadata (see `.claude/project/scxml-rules.md`) — never affects runtime SCXML semantics.

## Validation rules

`VisualMetadataManager.validateMetadata` does shallow numeric sanity checks (finite x/y, positive width/height) — not part of the main `SCXMLValidator` pipeline, and not surfaced in the Validation Panel; a malformed `viz:xywh` value would likely just fail to parse silently (fall back to a default) rather than producing a user-visible error.

## Related features

- `auto-layout-elk.md` — what computes a position when none exists yet, and the layout-quality helpers that only apply to auto-positioned nodes.
- `visual-metadata-namespace.md` — the storage format this feature reads/writes.
- `state-node-types.md` — the width/height floor's dependency on state type and Initial-badge status.
- `diagram-interaction.md` — drag/resize as user gestures; this document is about the storage/priority mechanics those gestures ultimately invoke.
- `sticky-notes.md` — the fixed-size special case.

## Related files

`src/lib/commands/update-position-command.ts`, `update-position-and-dimensions-command.ts`, `batch-update-position-command.ts`, `src/lib/layout/node-dimension-calculator.ts`, `src/lib/converters/converter-modules/visual-metadata.ts`.

## Tests

`src/lib/commands/*.test.ts` for the position commands (verify exact filenames exist per module — `waypoint-invalidation.test.ts`, `update-transition-command.test.ts`, etc. are confirmed; check for direct position-command test coverage specifically when modifying these commands). `src/lib/layout/__tests__/node-dimension-calculator.test.ts` exists but **does not run** under `npm test` (see `.claude/workflows/running-and-writing-tests.md`).

## Known limitations

- The width-never-shrinks-automatically rule means a state renamed from a long id to a short one keeps its old (now oversized) width until manually resized — this is a deliberate tradeoff (never clip content) but can leave visibly oversized nodes after a rename-to-shorter-name edit.
- `node-dimension-calculator.test.ts`'s exclusion from the actual test run (via the `__tests__/` bug) means the width-floor calculation — a genuinely load-bearing, non-trivial piece of logic — currently has no verified-passing automated test in CI.

## Important edge cases

- Moving/resizing a note and a state through the *same* `BatchUpdatePositionCommand` (a mixed multi-selection) works because the command branches on `isNoteId` per-node inside the batch, not because notes and states share identical positioning rules — don't assume a single, uniform code path handles both; it's one command with per-item special-casing.

## Things that must NOT be changed

- Do not let ELK auto-layout override a node's position when `viz:xywh` is already present — see `.claude/features/auto-layout-elk.md`'s "Things that must NOT be changed" for the same rule stated from the layout-engine side; this is one contract enforced from two directions (the converter skips ELK for positioned nodes; the enhancement pass re-applies stored position regardless).

## Previous design decisions

See `.claude/decisions/scxml.md` #1 for why position is stored in-band in the SCXML file rather than a sidecar file — this feature is the primary consumer/producer of that decision's core data (`viz:xywh`).
