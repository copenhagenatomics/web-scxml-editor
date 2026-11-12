# Feature: Tips Popover

## Purpose

Teach keyboard shortcuts and less-discoverable interactions (waypoints, drag-to-nest, autocomplete, `this_` channels) in-product, without taking permanent toolbar space.

## User behavior

- A 💡 button sits in the toolbar, left of the theme toggle. Clicking it opens a small popover showing one tip, titled "Tip N of M".
- ‹ › buttons step through the tips, wrapping around. Tips never change on their own.
- Only tips for the current tab (Code or Visual) are shown, plus tips for both. Switching tabs starts from that tab's first tip.
- The popover closes on Esc, its ✕, a click outside it, or clicking 💡 again.

## UI behavior

- With a single eligible tip, the counter and arrows are hidden (title is just "Tip").
- With zero eligible tips, the 💡 button isn't rendered at all.
- The popover uses the shared `Panel` primitive (`w-72`), anchored under the button (`absolute right-0 top-full`), like the breadcrumb's "State Path" popover.

## Internal architecture

- `src/components/layout/tips-popover.tsx` (`TipsPopover`, `filterTipsForTab`, `Tip`). It holds only local state (`isOpen`, `index`).
- Outside-click detection listens to `mousedown` in the **capture** phase. ReactFlow stops propagation of its own mousedown handling, so a bubble-phase listener would miss clicks on the canvas. This is the same reason as the State Path popover in `two-tab-layout.tsx`.
- The tip **content** is still hardcoded in `two-tab-layout.tsx` (`editorTips: Tip[]`).

## History

Issue #93 replaced the old `InlineTipsCarousel`: an always-visible "💡 Tip: …" strip that auto-advanced every 10 s. It took most of the toolbar's free space, which is needed for a labelled validation badge (issue #82), and the rotating text was distracting. Auto-rotation was dropped deliberately; don't reintroduce it in the popover.

## Relevant files

`src/components/layout/tips-popover.tsx`, `src/components/layout/two-tab-layout.tsx` (sole consumer and owner of the tip content), `src/components/ui/primitives/panel.tsx`.

## Tests

`src/components/layout/tips-popover.test.tsx`: closed by default; open on the active tab's first tip; next/previous wrap; no auto-advance; close on Esc / ✕ / outside click (not inside); toggle; tab switch resets; single-tip and no-tip cases; `filterTipsForTab`.

## Known limitations

- Tip text has no automated link to the behavior it describes. If a shortcut or gesture changes, the tip must be updated by hand.
- No memory of which tips a user has already seen; every session starts at the first tip.
