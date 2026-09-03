# Feature: Inline Tips Carousel

## Purpose

Teach users keyboard shortcuts and less-discoverable interactions (waypoints, drag-to-nest, autocomplete) passively, in-context, without requiring them to read a separate help document — a rotating, low-friction hint strip embedded directly in the main toolbar.

## User behavior

- A small "💡 Tip:" strip sits in the toolbar, cycling through tips automatically every 10 seconds (the interval passed from `two-tab-layout.tsx`, distinct from the component's own `5000`ms default).
- Tips are relevant to the current context: some show only on the Code tab, some only on the Visual tab, some on both — switching tabs changes which tips are eligible.
- Manual prev/next arrows let a user step through tips on demand; a "N of M" counter shows position.
- Manually navigating resets the auto-advance timer to a full interval from that point (doesn't immediately auto-advance again right after a manual click).

## UI behavior

- If only one tip is eligible for the current tab, the prev/next arrows and counter are hidden entirely (no pointless single-item carousel controls).
- If **zero** tips are eligible, the component renders nothing (`return null`) rather than an empty shell.
- Switching tabs (changing which tips are eligible) resets the carousel back to the first eligible tip, not wherever it happened to be before the filter changed.

## Internal architecture

`src/components/layout/inline-tips-carousel.tsx` (`InlineTipsCarousel`) — a small, self-contained, reusable component:
- Takes a `tips: Tip[]` array where each `Tip = {content: ReactNode, tab?: 'code'|'visual'|'both'}` and an `activeTab` to filter against.
- Filtering (`tips.filter(tip => !tip.tab || tip.tab === 'both' || tip.tab === activeTab)`) happens on every render — not memoized, though the tip list itself is small enough this is inconsequential.
- Auto-advance uses a `setInterval` re-created in a `useEffect` **dependent on `currentIndex` itself** (not just the interval duration) — the component's own comment explains this is deliberate: restarting the timer on every index change (whether from auto-advance or a manual click) means a manual prev/next click always gets a full fresh interval before the next auto-advance, rather than potentially auto-advancing again almost immediately if the manual click happened to land right before the next scheduled tick.
- The actual tip **content and tab-eligibility values are hardcoded inline** in `two-tab-layout.tsx` (an `editorTips` array literal), not sourced from a config file, CMS, or the SCXML document itself — adding/editing a tip means editing that array directly in the layout component.

## Relevant components

`src/components/layout/inline-tips-carousel.tsx`, `src/components/layout/two-tab-layout.tsx` (the sole consumer, and the owner of the actual tip content).

## Relevant state/store

None — purely local component state (`currentIndex`).

## Relevant utilities

None.

## SCXML behavior

None.

## Validation rules

None.

## Related features

None functionally — this is a standalone teaching aid, not integrated with any other feature's data or state. Loosely related to `.claude/project/ui-rules.md`'s keyboard-shortcut documentation, since several tips exist specifically to surface those same shortcuts (Ctrl+Space, Ctrl+Z/Y, Shift+Click for waypoints, Delete) in-product.

## Related files

`src/components/layout/inline-tips-carousel.tsx`, `src/components/layout/two-tab-layout.tsx`.

## Tests

No dedicated test file was found for this component in this pass.

## Known limitations

- Tip content is hardcoded in `two-tab-layout.tsx`, not centralized anywhere else — if a keyboard shortcut or interaction documented in a tip ever changes (e.g. the double-click-to-rename gesture, or the waypoint Shift+Click gesture), the tip text has no automated link to the actual behavior and must be manually kept in sync; a stale tip describing removed/changed behavior would not be caught by any test or type check.
- No persistence of "which tip the user last saw" or "tips the user has dismissed as already-known" — every session starts the carousel from the first eligible tip and cycles through the same fixed list regardless of how experienced the user is.
- No `aria-live` region announcing tip changes for screen-reader users — the auto-advancing content change is silent to assistive technology beyond whatever default behavior the browser provides for DOM text changes.

## Important edge cases

- The auto-advance `useEffect`'s dependency on `currentIndex` (rather than only `autoAdvance`/`autoAdvanceInterval`/`filteredTips.length`) is intentional, not an oversight — removing `currentIndex` from the dependency array would change the timer-restart-on-manual-navigation behavior described above (manual clicks would no longer reliably get a full fresh interval).

## Things that must NOT be changed

- Do not remove `currentIndex` from the auto-advance effect's dependency array without deliberately deciding to change the "manual navigation always gets a full interval" behavior — this is documented, intentional behavior in the component's own comment, not an accidental re-render trigger to be "optimized away."

## Previous design decisions

No dedicated plan/spec document addresses this component — it appears to be a straightforward, self-contained UX addition (onboarding/discoverability aid) rather than part of a larger tracked feature initiative, consistent with its small, self-sufficient implementation.
