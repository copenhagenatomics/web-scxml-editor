# Feature: Labels (state id / rename, edge labels, note text)

## Purpose

Give every diagram element a human-readable label, and — for states specifically — let that label be edited in place on the canvas via a familiar double-click-to-rename gesture, rather than requiring a side panel for the single most common editing action.

## User behavior

- **State label** = the state's SCXML `id` itself (this app has no separate "display name" distinct from the id — renaming the label *is* renaming the id).
- Double-click a state → its label becomes an inline editable text field → type a new value → **Enter commits, Escape cancels, blur also commits** (matching `README.md`'s documented "Press Enter to save (or Esc to cancel)").
- Committing a rename updates **every reference** to that id throughout the document automatically (transition targets, `initial` attributes, time-event tokens) — see `.claude/features/state-node-types.md` and the `RenameStateCommand` details below.
- **Edge (transition) labels** are not directly text-editable by clicking them — they're a computed display string (event name + `[condition]` + action count) driven by the Transition panel's structured fields, not free text (see `.claude/features/transitions-editing.md`).
- **Sticky notes** have no separate "label" — the note's entire body is its content (see `.claude/features/sticky-notes.md`); double-clicking a note also enters the same `isEditing` inline-edit mode as a state label, but edits the free-text body rather than an id.

## UI behavior

- Committing a state rename to an unchanged value (`tempLabel.trim() === label`) is a no-op — no command executes, no history entry, no redundant re-render churn.
- Renaming to an empty/whitespace-only string: verify current guard behavior in `scxml-state-node.tsx`/`RenameStateCommand` before assuming it's blocked — the trim-and-compare check only skips a *no-op* (unchanged) commit, it does not by itself confirm empty-string renames are specifically rejected.

## Internal architecture

- Shared `isEditing: boolean` flag on node `data`, set by `visual-diagram.tsx`'s `onNodeDoubleClick` handler (checks `nodeElement?.data?.onLabelChange || nodeElement?.type === 'scxmlNote'` before entering edit mode — i.e. only nodes that actually have a rename/edit callback wired up respond to double-click; the `HistoryWrapperNode`, being purely decorative, presumably has neither).
- `scxml-state-node.tsx` responds to `isEditing` by rendering an inline `<input>` seeded from `tempLabel` local state; on commit it calls the node's `onLabelChange(newLabel)` prop (wired by `visual-diagram.tsx`'s per-node callback construction during its "enhancement pass" — see `.claude/project/architecture.md`) and then clears the parent's `isEditing` flag back to `false` via a `setNodes` update.
- `onLabelChange` → (lazily required) `RenameStateCommand(nodeId, newLabel)` → `.execute(scxmlContent)` → `onSCXMLChange(result.newContent, 'property')`.
- `RenameStateCommand` (see `.claude/features/state-node-types.md`, `.claude/project/coding-rules.md`) is the single most cascading command in the codebase: rewrites the state's own `id`, every `transition[target]` referencing the old id anywhere in the document, every `initial` attribute (token-aware, preserving multi-value lists), and any embedded time-event tokens (`{oldId}_t_N_timeEvent_N` — see `.claude/features/time-transition-syntax.md`) — then clears stale waypoints on any transition touching this state, since a label-length change alters the node's rendered width.

## Relevant components

`src/components/diagram/nodes/scxml-state-node.tsx` (the inline rename input), `src/components/diagram/nodes/sticky-note-node.tsx` (the equivalent inline-edit for note body text), `src/components/diagram/visual-diagram.tsx` (`onNodeDoubleClick`, the `onLabelChange` wiring).

## Relevant state/store

None dedicated — `isEditing`/`tempLabel` are local/node-data state, not a store.

## Relevant utilities

`src/lib/commands/rename-state-command.ts`, `src/lib/utils/time-transition.ts` (`renameTimeEventTokensInEventList`), `src/lib/commands/waypoint-invalidation.ts`.

## SCXML behavior

Renaming a state literally changes its `@_id` attribute value — there is no separate "friendly name" attribute anywhere in this app's SCXML model; the id **is** the display label everywhere (diagram, autocomplete, error messages).

## Validation rules

State id uniqueness is enforced by `SCXMLValidator`'s duplicate-id check (`.claude/features/scxml-validation.md`), not by the rename UI itself — check whether `RenameStateCommand` proactively refuses a rename that would collide with an existing id, or whether it allows the rename and relies on validation to catch the resulting duplicate after the fact, before assuming either behavior.

## Related features

- `state-node-types.md`, `state-editing.md` — renaming is one facet of the broader "editing a state" feature.
- `selection.md` — double-click is a variant of the same click-disambiguation timing logic that also handles single-click (select) and Ctrl-click (multi-select toggle).
- `time-transition-syntax.md` — the token-rewrite coupling on rename.
- `sticky-notes.md` — shares the same `isEditing` inline-edit mechanism for free-text body editing.

## Related files

`src/components/diagram/nodes/scxml-state-node.tsx`, `src/components/diagram/nodes/sticky-note-node.tsx`, `src/components/diagram/visual-diagram.tsx`, `src/lib/commands/rename-state-command.ts`.

## Tests

`src/lib/commands/rename-state-command.test.ts` covers the cascading-rewrite logic thoroughly. No RTL test directly exercises the double-click → inline-input → commit UI flow in `scxml-state-node.tsx` itself.

## Known limitations

- No inline validation feedback *while typing* a rename (e.g. a red border if the in-progress value would collide with an existing id) — any such conflict is only surfaced after commit, via the normal debounced validation pipeline, not synchronously in the rename input itself.
- Edge labels are not directly editable by clicking/double-clicking the label text on the canvas — a user must open the Transition panel (via clicking the edge, not the label specifically) to change what an edge's label displays.

## Important edge cases

- Double-clicking a node with **no** `onLabelChange` wired (if such a node type exists/is reachable) and that isn't a `scxmlNote` does nothing — the double-click handler's own guard condition (`nodeElement?.data?.onLabelChange || nodeElement?.type === 'scxmlNote'`) silently no-ops rather than erroring, so a missing-callback bug elsewhere would manifest as "double-click does nothing" with no console error to point at the cause.
- A rename commit that doesn't actually change the trimmed value still resets `isEditing` back to `false` (exits edit mode) even though nothing else happens — a user who opens rename mode, doesn't change anything, and presses Enter/blurs sees the input simply close, not an error or a no-op message.

## Things that must NOT be changed

- Do not decouple the "label" from the SCXML `id` (e.g. adding a separate display-name attribute) without a deliberate, wide-reaching design change — essentially every feature in this codebase (autocomplete, validation messages, transition targets, the diagram's own node identification) currently assumes a state's displayed label and its SCXML id are the exact same string.

## Previous design decisions

`README.md`'s "Renaming a State" section documents this exact double-click/Enter/Esc UX as the intended, user-facing design (not an implementation detail that happens to work this way) — "All transitions that reference this state update automatically!" is called out there as a headline feature, confirming the cascading-rewrite behavior in `RenameStateCommand` is a deliberate promise to the user, not an incidental side effect.
