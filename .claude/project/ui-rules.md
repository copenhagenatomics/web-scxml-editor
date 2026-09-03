# UI Rules — actual interaction behavior, not generic UX advice

Concrete, verified UI/UX rules implemented in this codebase. If you change interaction behavior, check whether it contradicts one of these documented rules first.

## Layout shell

- Exactly **one primary view is visible at a time**: Code tab or Visual tab (`TwoTabLayout`, `src/components/layout/two-tab-layout.tsx`). There is no split view.
- Exactly **one side panel can be open at a time** — `usePanelStore.activePanel` is a single value, not a set. Opening a new panel implicitly closes any other (Config / Channel Mapping / Events / Validation / Transition / State Actions / GitHub all share this one slot).
- The breadcrumb + "State Path" popover only appears once you've navigated into at least one compound state (`currentPath.length > 0`); at root level, no breadcrumb is shown.
- Host-registered custom command buttons (via `registerCommand()`) render in the toolbar next to the tab switcher, before the breadcrumb.

## Hierarchy navigation is drill-down, not nested rendering

Only one hierarchy level is shown on the canvas at any time — clicking into a compound state replaces the whole canvas view with just its direct children; there is no zoomed-out view showing nested boxes inside boxes. Getting back out uses either the breadcrumb, the "State Path" popover, or a dedicated "navigate up" action. **This is intentional, confirmed by the converter computing real nested ReactFlow parent/child wiring that `useHierarchyNavigation` then deliberately discards** (`use-hierarchy-navigation.ts:70`) — do not "fix" this by re-enabling nested rendering without a deliberate product decision to do so.

## Selection model on the canvas

- Selection state is **not** ReactFlow's native selection except during an actual marquee (box) drag. Click / Ctrl+Click / double-click on a node go through hand-rolled disambiguation (`handleStateClick`, a 250ms timer) — do not wire a new interaction through `node.onClick` assuming native RF selection semantics apply.
- Ctrl/Cmd+Click toggles a node's membership in the multi-select set; a plain click replaces the whole selection and opens the State Actions panel for that one state.
- The Multi-Select Toolbar appears once **2 or more** nodes are selected, offering bulk copy and bulk delete.
- Marquee (drag-a-box) selection requires holding Ctrl or Meta while dragging on empty canvas (`selectionKeyCode`).

## State type visuals — the rules a user relies on

- **Solid border** = simple state. **Dashed border** = compound (has children). **Overlapping-square icon + ⚡** = parallel. **Target icon, smallest size** = final.
- **"Initial" green badge** = this state is the entry point of its container. There is **no arrow drawn into the initial state** — this app does not use the classic "black dot with an arrow" convention. Do not add one without checking whether other assumptions (dimension calculations that budget +70px for the badge) also need updating.
- **History states** render as a separate oversized dashed purple box drawn *around* the container they wrap (not replacing it) — this is decorative positioning only, not a real nesting relationship.
- A label containing the word "history" (case-insensitive, anywhere in the id) also gets a small "📜 History" chip on the regular state node — independent of the actual `<history>` element check. Renaming a state to include "history" in its name will trigger this even if it isn't a real history state; this is a known cosmetic quirk, not a bug to silently "fix" by removing the chip logic without checking for reliance elsewhere.
- Compound-state "navigate into" affordance (arrow-down icon) only appears on hover.

## Transition / edge visuals

- Transition labels are colored pills: gray = eventless, blue = plain event, amber = conditional. (A code comment mislabels the amber color "purple" — `src/lib/consts/transition-colors.ts:3` — the actual rendered color is amber; don't "fix" the color to match the comment.)
- Only **one transition per "slot"** (event / timer / cond / always) is allowed between the same source+target+type — attempting to create a second is blocked live with a dismissible banner (`initial-group-conflict-banner.tsx` is reused for this message type too — despite the filename, it's the general "connection blocked" banner, not exclusively for Initial-group conflicts). Auto-dismisses after 4 seconds.
- Internal-event reactions (targetless transitions) never render as edges — only as a "reaction:N" badge on the source state.
- Waypoint handles (small draggable circles on an edge) only appear when the edge is selected **and** already has at least one waypoint. Shift+Click on a selected edge inserts a new waypoint at the nearest point on its path. Double-click on a waypoint deletes it.

## Sticky notes

- Fixed 500px width, always. Height grows automatically (font shrinks first, then height expands, then an "note is full" banner blocks further growth) — notes cannot be manually resized via drag-handle, unlike states.
- Notes never count as "children" for compound-state/hierarchy-navigation purposes, are excluded from edge obstacle-avoidance routing, and can't be selected via the state-actions single-click flow.

## Config / Channel Mapping / Events panels

- Config Panel only lists `conf_`-prefixed datamodel fields; empty state explicitly instructs the user to add the `conf_` prefix, not "add a config value" via a generic button first.
- Channel Mapping Panel's "unresolved refs" section is derived automatically from expression scanning; it also supports manually adding an arbitrary ref → channel mapping via "Add mapping" for the case where nothing in the SCXML currently references it yet.
- Deleting a config field checks usage first (`getConfigFieldUsage`) and **refuses** the delete with an explanatory toast if the field is still referenced anywhere — this is enforced, not just a warning.
- Events ("User Actions") panel: "hidden" toggles between an eye/eye-off icon and controls whether the resulting operator button appears in LoopControl's separate operate page — hiding an event does not remove it from the SCXML, only from operator visibility.

## Keyboard shortcuts (confirmed, not aspirational)

| Shortcut | Action | Scope |
|---|---|---|
| Ctrl/Cmd+Z | Undo | Defers to Monaco's native undo while the code editor has focus |
| Ctrl/Cmd+Y | Redo | Same caveat |
| Delete / Backspace | Delete selected state(s)/transition(s) | Diagram only; disabled while the Validation panel is open |
| Ctrl/Cmd+C / V | Copy/paste selected state subtree(s) | Diagram; guarded against firing while a text input has focus |
| Ctrl/Cmd+Click | Toggle multi-select membership | Diagram nodes |
| Ctrl/Meta+drag on empty canvas | Marquee select | Diagram |
| Shift+Click on selected edge | Insert waypoint | Diagram |
| Ctrl+Space | Trigger autocomplete manually | Monaco code editor |

## GitHub panel state machine

The panel is strictly phase-gated: **not connected** → **connected, not linked** → **linked**. You cannot push/pull without first linking a repo/branch/path, and linking is blocked until an existence check for the chosen path completes (`canLink` requires `pathNote !== null`, not just non-empty fields) — this prevents linking with a stale/unknown `lastKnownSha`. Pulling always requires an explicit confirmation step warning that local changes will be discarded.
