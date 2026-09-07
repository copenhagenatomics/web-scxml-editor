# UI/UX Convention Decisions

---

## 1. Exactly one side panel can be open at a time

### Context
The app has 7 distinct side panels (Config, Channel Mapping, Events, Validation, Transition, State Actions, GitHub).

### Decision
`usePanelStore.activePanel` is a single value, not a set — opening any panel implicitly closes whichever other panel was open.

### Reason
Not documented in a dedicated note, but this keeps the UI simple (no panel-stacking/z-order concerns, no ambiguity about which panel has focus) at the cost of not being able to reference two panels' content side by side.

### Constraints
A new panel added to the system must fit into this single-slot model (see `.claude/workflows/adding-a-side-panel.md`) — introducing a second simultaneously-open panel would be a significant UX change, not a small addition.

### Alternatives
None found evidenced (e.g. a docked multi-panel layout was not implemented).

### Evidence
`src/stores/panel-store.ts` (`PanelId` union, single `activePanel` field).

### Status
Accepted.

---

## 2. Keyboard shortcuts follow common code-editor/OS conventions rather than inventing new bindings

### Context
Users need to undo, redo, delete, copy, and paste on the canvas.

### Decision
Ctrl/Cmd+Z (undo), Ctrl/Cmd+Y (redo), Delete/Backspace (delete selection), Ctrl/Cmd+C/V (copy/paste) — all standard, widely-recognized bindings, explicitly documented for end users.

### Reason
Not documented as a deliberate "why these and not others," but choosing familiar, ubiquitous bindings is a sensible default that avoids requiring users to learn a bespoke shortcut scheme — explicitly promoted in `README.md`'s "Keyboard Shortcuts" section as a first-class feature.

### Constraints
Delete/Backspace is explicitly suppressed while any side panel is open (per commit `385612c fix(visual-diagram): suppress Delete-key shortcut whenever any side panel is open`) — a deliberate scoping fix, since a panel might itself contain a text input where Backspace should edit text, not delete a canvas selection.

### Alternatives
None found evidenced as alternative bindings considered.

### Evidence
`README.md` §"Keyboard Shortcuts", commit `385612c`, `src/components/diagram/visual-diagram.tsx` (`deleteKeyCode` gating).

### Status
Accepted.

---

## 3. Theme-flash prevention via a synchronous inline script, not a post-hydration effect

### Context
Reading `localStorage`/`matchMedia` for the user's theme preference only in a `useEffect` would cause a visible flash of the wrong theme on every load, before React mounts and the effect runs.

### Decision
`src/app/layout.tsx` inlines a blocking `<script>` (via `dangerouslySetInnerHTML`) that runs before hydration and applies the `dark` class to `<html>` immediately if needed, paired with `<html suppressHydrationWarning>` to prevent React from flagging the resulting pre-hydration DOM mutation as a mismatch.

### Reason
This is the standard, well-known technique for avoiding flash-of-wrong-theme in React apps that can't rely on server-rendered theme state (this app is a static export with no server-side rendering at request time) — not something the project needed to invent, but a deliberate application of a known pattern.

### Constraints
The inline script's fallback logic (localStorage → matchMedia) must be kept manually in sync with the equivalent logic in `src/lib/theme/theme.ts`'s `getInitialTheme()` — they are two independent implementations of the same idea (one as a literal JS string, one as real TypeScript) with no shared, type-checked contract between them.

### Alternatives
A post-hydration `useEffect`-only approach (simpler, but with a visible flash) is the implicit, rejected default.

### Evidence
`src/app/layout.tsx` (inline script + `suppressHydrationWarning`), `src/lib/theme/theme.ts`.

### Status
Accepted.

---

## 4. Double-click-to-rename is the primary state-label editing gesture

### Context
Renaming a state is one of the most common editing operations.

### Decision
Double-clicking a state node enters inline rename mode directly on the canvas (an `<input>` replaces the label), rather than requiring a side panel or a separate "rename" button/menu item.

### Reason
Explicitly promoted as a headline UX feature in `README.md` ("Double-click any state... Press Enter to save"), consistent with keeping the most common editing action as low-friction as possible (no panel-opening required).

### Constraints
Because there is no context menu (see `.claude/features/context-menus.md` — verified absent), double-click is the *only* discoverable way to initiate a rename directly on the canvas; there's no fallback affordance for a user who doesn't know the gesture beyond reading the docs/tips carousel.

### Alternatives
None found evidenced (e.g. a visible "rename" icon/button on hover was not added as an alternative/backup affordance).

### Evidence
`README.md` §"Renaming a State", `src/components/diagram/nodes/scxml-state-node.tsx` (`isEditing` inline input), `src/components/diagram/visual-diagram.tsx` (`onNodeDoubleClick`).

### Status
Accepted.

---

## 5. Host-pushed "Host Alerts" are kept in a separate tab from this editor's own SCXML validation errors

### Context
The embedding host (LoopControl) can push its own error/warning messages via `showErrors()`, unrelated to this editor's own SCXML validation.

### Decision
The Validation Panel shows two distinct tabs — "Validation" (this editor's `ValidationError[]`) and "Host Alerts" (`HostErrorItem[]`) — rather than merging both into one combined error list, and the Host Alerts tab is only shown at all when at least one host alert exists.

### Reason
Not documented as an explicit rationale, but keeping these separate preserves a clear distinction between "this document has an SCXML correctness problem" (this editor's own opinion) and "the host is telling you something" (an entirely different, opaque-to-this-editor channel) — conflating them could make it unclear which system is responsible for a given message, or unclear how a message should be resolved (e.g., a host alert can't be "fixed" by editing the SCXML the way a validation error usually can).

### Constraints
Any future host-pushed messaging should go through the `showErrors`/`hostErrors` channel, not be shoehorned into `ValidationError[]`, to preserve this separation.

### Alternatives
A single merged error list (with some kind of source tag per entry) is the implicit alternative not chosen.

### Evidence
`src/components/ui/validation-panel.tsx` (two-tab structure, `showTabs = hostCount > 0`), `src/stores/host-api-store.ts` (`hostErrors` as a distinct field from `useEditorStore.errors`), `docs/superpowers/plans/2026-05-27-host-error-panel.md`.

### Status
Accepted.

---

## 6. Empty states in host-bridge panels teach the activation convention, not just say "nothing here"

### Context
Config Panel and Channel Mapping Panel both rely on a naming convention (`conf_` prefix, or "not `this_`/`conf_`-prefixed") to determine what appears in them, which isn't obvious to a first-time user.

### Decision
Each panel's empty state explicitly explains the exact rule and gives a worked example (e.g. Config Panel: "Add a `conf_` prefix to any `<data>` field... Example: `<data expr="0.5" id="conf_threshold"/>`") rather than a generic "No items yet."

### Reason
Not documented as an explicit rationale, but this is a consistent, deliberate pattern across both panels — treating the empty state as a teaching moment for a convention that has no other in-product documentation (there's no separate help/docs panel for these conventions).

### Constraints
A new host-bridge panel relying on a similar naming convention should follow this same pattern (see `.claude/workflows/adding-a-side-panel.md`).

### Alternatives
A generic empty-state message, deferring explanation to external documentation (like `README.md`), is the implicit alternative not chosen.

### Evidence
`src/components/ui/config-panel.tsx` (`PanelEmptyState` content), `src/components/ui/channel-mapping-panel.tsx` (`PanelEmptyState` content).

### Status
Accepted.

---

## 7. No context menu (right-click menu) exists anywhere in the app

### Context
Diagram/list editors commonly offer a right-click context menu for per-item actions.

### Decision (Notable absence, not confirmed as a deliberate rejection)
Every action a context menu might typically expose is instead reachable through the toolbar's "more" menu, click/double-click/Ctrl-click gestures, a persistent Multi-Select Toolbar, dedicated side panels with their own inline icons, or keyboard shortcuts.

### Reason
No comment, commit, or plan document discusses context menus being considered and rejected — this reads as a feature that was simply never built, using instead whatever interaction pattern was already established for other panels (toolbar buttons, inline icons), rather than a documented UX philosophy against context menus specifically.

### Constraints
None currently — but see `.claude/features/context-menus.md` for guidance if one is ever added (no existing context-menu infrastructure/styling convention to build on).

### Alternatives
N/A — no evidence of a considered-and-rejected alternative; simply absent.

### Evidence
Repo-wide search confirms zero `onContextMenu`/`ContextMenu` usage anywhere in `src/`.

### Status
Inferred behavior — a notable absence, not a confirmed deliberate decision either way.
