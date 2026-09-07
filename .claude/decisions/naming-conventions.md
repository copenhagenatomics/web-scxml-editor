# Naming Convention Decisions

---

## 1. `conf_` / `this_` / `main_` datamodel variable prefixes

### Context
The datamodel needs to distinguish, by convention, between ordinary internal variables, per-deployment config values, physical-channel references, and machine-specific (non-portable) variables.

### Decision
`conf_` marks a per-deployment configurable value (see `configuration.md` #1); `this_` marks an identifier meant to resolve to a physical host channel; `main_` marks a variable explicitly tied to one specific state machine (flagged by validation as a portability anti-pattern, suggesting rename to `this_`).

### Reason
A pure naming-convention approach (no schema/attribute needed) that keeps every affected file fully standard SCXML — only this app's own tooling (Config Panel, Channel Mapping Panel, validator warning) treats the prefixes as meaningful.

### Constraints
These conventions are load-bearing across multiple features (Config Panel, Channel Mapping Panel, the `main_`-prefix validator warning, Monaco autocomplete's "new channel" suggestion) — renaming or changing the meaning of any prefix would require coordinated updates across all of them.

### Alternatives
None found evidenced.

### Evidence
`src/lib/utils/datamodel-extractor.ts`, `src/lib/validators/scxml-validator.ts` (`main_`-prefix warning pass), `.claude/project/terminology.md`.

### Status
Accepted.

---

## 2. A state's display label is its SCXML `id` — no separate display-name field

### Context
Many diagramming tools separate an internal identifier from a human-readable display label.

### Decision
This editor has no such separation — the label a user sees and edits (via double-click) on a state node **is** its SCXML `@_id` attribute value, full stop.

### Reason
Not documented in a dedicated note, but this is a simplifying choice consistent with SCXML's own model (states are identified by id; there's no standard "friendly name" attribute) and avoids the complexity of keeping two representations in sync.

### Constraints
Every feature that identifies a state (autocomplete, validation messages, transition targets, the diagram itself) assumes the displayed label and the SCXML id are the exact same string — introducing a separate display name would be a wide-reaching change, not a small addition.

### Alternatives
None found evidenced (e.g. a `viz:` namespace "friendly name" attribute, parallel to how position/color are stored, was not introduced for this purpose).

### Evidence
`src/components/diagram/nodes/scxml-state-node.tsx` (rename directly sets `id`), `src/lib/commands/rename-state-command.ts`.

### Status
Accepted.

---

## 3. Sticky-note ids are prefixed `note:` specifically because `:` is invalid in SCXML ids

### Context
Sticky notes need an id scheme that can never collide with a real state id, since both live in the same ReactFlow node-id space.

### Decision
Every note's ReactFlow node id is prefixed `note:` (e.g. `note:a1b2c3d4`).

### Reason
Explicitly justified in code: the constant's own comment states "':' is not valid in SCXML state ids, so this cannot collide" — a deliberate exploit of an SCXML syntax restriction to guarantee namespace separation, not an arbitrary prefix choice.

### Constraints
Any code introducing a new id-prefixed pseudo-node type (if one is ever added) should follow this same reasoning — pick a prefix character/pattern provably illegal in real SCXML ids.

### Alternatives
None found evidenced (e.g. a separate `type` field alone, without the id-prefix trick, could have sufficed for disambiguation in most places but wouldn't protect places that only ever see a bare id string).

### Evidence
`src/types/visual-metadata/index.ts` (`VISUAL_METADATA_CONSTANTS.NOTE.ID_PREFIX`, `isNoteId`).

### Status
Accepted.

---

## 4. Synthetic timer-event names follow a fixed, parseable pattern

### Context
The "after X" shorthand needs an internal SCXML event name to actually trigger the timed transition, but this name must be both machine-generated and later recognizable/rewritable (e.g. on state rename).

### Decision
Auto-generated timer event names follow the pattern `{stateId}_t_{N}_timeEvent_{N}`, embedding the owning state's id directly and literally.

### Reason
Not documented in a dedicated note, but embedding the state id directly makes the token both human-inspectable (a developer reading raw XML can tell which state a timer event belongs to) and mechanically identifiable via pattern-matching (`isTimeEventName`) for the rename-cascade and slot-classification features that depend on recognizing it.

### Constraints
Any code that needs to identify or rewrite this token **must** use the dedicated token functions (`findTimeEventToken`, `renameTimeEventTokensInEventList`) — a naive substring replace risks corrupting an unrelated event name that happens to contain the same state-id substring.

### Alternatives
An opaque, non-id-embedding generated name (e.g. a random UUID-based event name) is the implicit alternative not chosen — the chosen approach trades a theoretical id-substring-collision risk for much better debuggability and a simpler rename-cascade implementation.

### Evidence
`src/lib/utils/time-transition.ts` (`generateTimeEventName`, `isTimeEventName`, `findTimeEventToken`).

### Status
Accepted.

---

## 5. "Events" (code) vs. "User Actions" (UI label) naming divergence

### Context
The feature that lets a user define operator-facing buttons is called `Events`/`EventEntry` throughout the type system and store, but labeled "User Actions" everywhere in the UI (`events-panel.tsx`'s panel title, empty-state copy, toast messages all say "User Actions"/"user action").

### Decision (Inferred behavior, not a deliberate naming decision)
No rename was carried through consistently — the internal type/variable names still say `Events`/`EventEntry`/`events-panel.tsx` while every user-facing string says "User Action(s)."

### Reason
No comment or commit explains this divergence. The most plausible explanation is that the feature was originally conceived and named around the SCXML "event" concept it's loosely related to, and was later rebranded in the UI (perhaps to avoid confusing end users with the technical term "event," or in response to product feedback) without a corresponding code-level rename.

### Constraints
Anyone searching the codebase for "User Actions" by filename/symbol will not find it — the relevant files/types are named `events-panel.tsx`/`EventEntry`. This is worth knowing when navigating the code, but not something to "fix" opportunistically without a deliberate, scoped rename effort (renaming `EventEntry` touches the Host API's public type surface — a breaking change for host integrations).

### Alternatives
N/A — not a deliberate decision.

### Evidence
`src/components/ui/events-panel.tsx` (UI strings), `src/types/host-api.ts` (`EventEntry`, `setEvents`/`getEvents` on `ScxmlEditorAPI`).

### Status
Inferred behavior — an unresolved naming inconsistency, not an intended convention.
