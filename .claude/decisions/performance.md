# Performance-Related Decisions

---

## 1. Debouncing is the primary strategy for taming continuous-input performance cost, not incremental computation

### Context
Both SCXML validation (re-parse + 16-pass validate) and diagram re-conversion (re-parse + ELK layout) are relatively expensive full-document operations, but need to run in response to every keystroke/drag movement.

### Decision
Rather than making validation or diagram conversion incremental, both are simply **debounced**: validation waits 500ms after the last content change; history-tracking debounces similarly (500ms text, 300ms position/resize) — see `state-management.md` #3. The diagram conversion itself is not separately debounced beyond whatever debouncing happens upstream in the position-commit path (`visual-diagram.tsx`'s 150ms position-commit debounce).

### Reason
Not documented as an explicit "why not incremental," but debouncing is a substantially simpler engineering investment than building incremental/differential versions of parsing, validation, or ELK layout — and evidently was judged sufficient for this app's expected document sizes and interaction patterns.

### Constraints
For a very large document, every debounce-triggered pass still does full work (full re-parse, full 16-pass validation, full ELK re-layout) — this scales with document size regardless of how small the actual edit was.

### Alternatives
None found evidenced — no sign incremental parsing/validation/layout was attempted and abandoned; this appears to be the original and only approach taken.

### Evidence
`src/app/_hooks/use-content-validation.ts` (500ms debounce), `src/lib/history/history-manager.ts` (debounce timers), `src/components/diagram/visual-diagram.tsx` (150ms position-commit debounce).

### Status
Accepted.

---

## 2. Full document re-parse and re-layout on every content change (no incremental diagram updates)

### Context
Every change to `content` — whether from a single keystroke, a drag, or a full file load — triggers `SCXMLToXStateConverter.convertToReactFlow()` to rebuild the **entire** node/edge list from scratch and rerun ELK layout for every hierarchy level.

### Decision (Inferred behavior — a consequence of the architecture, not a documented, deliberate performance tradeoff)
There is no incremental "only recompute what changed" path anywhere in the conversion pipeline.

### Reason
No comment or commit frames this as a considered tradeoff (e.g., "we chose full recompute over incremental diffing because X") — it appears to be simply how the converter was built, consistent with the broader pattern of Commands and validation also always operating on the whole document (see `architecture.md` #5, `editing.md` #1).

### Constraints
This is likely the single largest scalability constraint in the codebase — a very large SCXML document would pay full-recompute cost on every debounced update. No evidence exists of this having caused a real, reported problem yet (no bug-fix commit addresses diagram performance for large documents specifically), but it is a load-bearing assumption about expected document size.

### Alternatives
N/A — not evidenced as a deliberate choice between alternatives; simply the only approach implemented.

### Evidence
`src/lib/converters/scxml-to-xstate.ts` (`convertToReactFlow` rebuilds everything), `src/components/diagram/visual-diagram.tsx` (`scxmlContent`-keyed effect with no partial-update logic).

### Status
Inferred behavior.

---

## 3. ELK layout runs per hierarchy level, which is also a performance boundary, not just a UX one

### Context
See `visual-diagram.md` #4 for the primary (UX/drill-down) rationale.

### Decision
Because only one level's nodes/edges are ever laid out together, the layout computation's cost scales with the size of the *currently visible* level, not the whole document's total state count.

### Reason
This is a beneficial side effect of the drill-down decision, not a separately-motivated performance decision — but it is worth recording as a real, load-bearing performance property: a document with thousands of states spread across many nested levels lays out efficiently precisely because ELK never has to reason about more than one level's worth of nodes at once.

### Constraints
If nested rendering were ever reintroduced (see `visual-diagram.md` #1), this performance property would need to be re-evaluated — a whole-tree hierarchical ELK layout could scale considerably worse for large documents.

### Alternatives
N/A — a consequence of decision #1 in `visual-diagram.md`, not an independently-made choice.

### Evidence
`src/lib/converters/converter-modules/layout-positioning.ts` (`applyDefaultELKLayout`, per-level grouping).

### Status
Accepted (as a beneficial consequence of the drill-down decision).

---

## 4. Handle (connection-side) auto-assignment uses a global, traffic-aware cost model rather than a simple nearest-side heuristic

### Context
When an edge lacks a saved connection-handle side, the converter needs to pick reasonable source/target sides automatically.

### Decision
Rather than a cheap "closest side to the other node" heuristic, the converter scores every candidate (source-side, target-side) pair using: geometric directness, how much other traffic already uses that handle **globally across the whole diagram** (not just locally between this pair of nodes), and how many sibling nodes an approximate route would cross — explicitly described in code comments using a road-traffic metaphor ("a busy handle gets avoided in favor of a quieter one, the way traffic routes around a congested lane").

### Reason
Explicitly reasoned in an extensive inline comment block in `scxml-to-xstate.ts` — this is a deliberate, considered design (not an accident), trading extra computation for meaningfully better default routing quality (avoiding overlapping/crowded edges) without requiring the user to manually fix handle assignments after every auto-layout.

### Constraints
This computation is global across the diagram (each edge's cost calculation considers traffic from all other edges, computed and updated iteratively as edges are processed in sequence) — it is inherently more expensive than a per-edge-independent heuristic would be, an accepted cost for the layout-quality benefit.

### Alternatives
A simple nearest-side/shortest-distance heuristic is the implicit, cheaper alternative not chosen — the code comments make clear this was a deliberate step up in sophistication, not the first or only approach considered.

### Evidence
`src/lib/converters/scxml-to-xstate.ts:292-429` (extensive inline rationale comments, `GEOMETRIC_PENALTY_PERP`/`SAME_PAIR_WEIGHT`/`GENERAL_LOAD_WEIGHT`/`NODE_CROSSING_WEIGHT` cost-model constants).

### Status
Accepted.
