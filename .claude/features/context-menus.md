# Feature: Context Menus — **verified not implemented**

## Purpose

N/A — this document exists to record a deliberate verification result, not to describe a real feature, per the requesting task's explicit instruction not to assume a listed investigation area exists without checking source.

## Verification performed

Searched the entire `src/` tree for any right-click/context-menu implementation:
- `ContextMenu` / `contextmenu` / `onContextMenu` / "right-click" — **zero matches** anywhere in `src/`.
- No `oncontextmenu` handler, no custom right-click menu component, no `radix-ui`/similar context-menu primitive dependency in `package.json`.

**Conclusion: this application has no right-click context menu anywhere** — not on canvas nodes, not on edges, not on the code editor (Monaco supplies its own default browser/OS-agnostic right-click menu there, which this app does not customize), not in any panel or list.

## What stands in for it instead

Every action a context menu might typically expose in a diagram editor is instead reachable through:
- **The toolbar's "more" (⋮) menu** (`src/app/page.tsx`'s `renderActions`) — Upload, Clean SCXML export, Download-with-metadata.
- **Click/double-click/Ctrl-click on canvas elements** (see `.claude/features/selection.md`, `.claude/features/labels.md`) — selection, rename.
- **The Multi-Select Toolbar** (`.claude/features/diagram-interaction.md`) — copy/delete for a multi-selection, appearing as a persistent small toolbar rather than a menu triggered by any specific gesture.
- **Dedicated side panels** (Config, Channel Mapping, Events, GitHub, Transition, State Actions) toggled via toolbar buttons — each panel's own inline "+"/trash/copy icons handle per-item actions (add/delete/copy a row) rather than a right-click menu on that row.
- **Keyboard shortcuts** (Delete, Ctrl+C/V, Ctrl+Z/Y — see `.claude/project/ui-rules.md`).

## Related features

`.claude/project/ui-rules.md` (keyboard shortcuts and panel system that substitute for context menus), `.claude/features/selection.md`, `.claude/features/diagram-interaction.md`.

## If you're asked to add a context menu

This would be a genuinely new UI pattern for this codebase, not an extension of an existing (hidden/underused) one — there is no existing context-menu infrastructure, styling convention, or component to build on. You would need to: pick/add a positioning strategy (this codebase already has one precedent for a manually-positioned floating menu: `config-panel.tsx`'s `TypeSelect` dropdown, which uses `createPortal` to `document.body` with a manually computed `position: fixed` style based on the trigger's `getBoundingClientRect()` — a reasonable pattern to follow), decide keyboard-accessibility behavior (Escape to close, arrow-key navigation), and audit for conflicts with the existing click/double-click/Ctrl-click disambiguation logic in `visual-diagram.tsx`'s `handleStateClick` (a right-click handler added carelessly could interfere with that 250ms click-timing logic if not scoped to a genuinely separate event type).
