# Feature: Canvas Zoom / Pan / Viewport Controls

## Purpose

Let a user navigate a potentially large state-machine diagram — zooming in for detail, panning to explore, and having the camera automatically frame relevant content after structural actions (hierarchy navigation, node creation) rather than requiring manual re-centering every time.

## User behavior

- Scroll wheel zooms; scroll (without Ctrl) does not pan by default (`panOnScroll={false}`) — panning is drag-based (click-drag on empty canvas).
- Pinch-to-zoom works on trackpads (with a Windows-specific fix — see below).
- Double-click on empty canvas does **not** zoom (`zoomOnDoubleClick={false}`) — deliberately disabled, presumably because double-click is already meaningful elsewhere (state label rename — see `labels.md`) and a canvas-level double-click-to-zoom would be an unexpected surprise alongside that.
- Bottom-left `Controls` widget: zoom in/out buttons, fit-view button (both explicitly enabled — `showZoom`/`showFitView`).
- A `MiniMap` shows an overview of the whole current level with a viewport indicator.
- Navigating hierarchy levels (into/up/root), loading a new file, and adding certain content all trigger an **automatic `fitView`** so the relevant nodes are framed without the user needing to manually zoom/pan afterward.

## UI behavior

Zoom is bounded: `minZoom={0.2}` / `maxZoom={4}` globally; `fitView` calls specifically clamp to a narrower `minZoom: 0.5, maxZoom: 2` range (so an auto-fit never zooms in absurdly close on a single tiny node, nor zooms out so far a large diagram becomes illegible) — this is a **different, intentionally tighter** bound than the user's own manual zoom range. `defaultViewport={{x:0, y:0, zoom:0.8}}` is the very first render's camera position before any content-driven fit occurs.

## Internal architecture

- Configured directly on the `<ReactFlow>` element in `visual-diagram.tsx`: `zoomOnScroll={true}`, `zoomOnPinch={true}`, `panOnScroll={false}`, `zoomOnDoubleClick={false}`, `minZoom={0.2}`, `maxZoom={4}`, `defaultViewport`.
- `useReactFlow()`'s `fitView` is called from **multiple distinct trigger points**, each with its own `{duration, padding, minZoom: 0.5, maxZoom: 2}` options object (not a single shared helper for all of them, though `navigateWithFitView` wraps the hierarchy-navigation-triggered case specifically): after hierarchy navigation (up/root/into-state), after loading new content, and after certain node-count changes.
- **Windows trackpad pinch-zoom fix**: ReactFlow's own default `wheelDelta` handling only boosts pinch-zoom (Ctrl-key wheel events) on macOS; on Windows the same gesture produces a much smaller raw delta, making pinch-zoom feel unresponsive. A `useEffect` reads the internal `d3Zoom` instance via `useStore((s) => s.d3Zoom)` and directly overrides its `wheelDelta` function to detect Windows (`navigator.platform`/similar check) and apply the same boost macOS gets natively — a **direct patch onto a ReactFlow-internal (not officially public) API surface**, not a documented ReactFlow configuration option.
- **Scroll-drift workaround**: clicking a `ControlButton` (e.g. the "Add State" toolbar button, which happens to be rendered as a `ControlButton` inside the `Controls` widget) can leave native browser focus-scroll drift on the `.react-flow` root element (which is `overflow: hidden` but can still be scrolled programmatically/via focus) — this silently offsets every absolutely-positioned descendant, including the invisible hit-testing plane the marquee-select box relies on. A `scroll` event listener on that root forces `scrollTop`/`scrollLeft` back to `0` and dispatches a synthetic `resize` event to make ReactFlow recompute its internal viewport math.

## Relevant components

`src/components/diagram/visual-diagram.tsx` (all of the above — no separate component for zoom/pan, it's all `<ReactFlow>` props + `useReactFlow()` calls + the two workaround `useEffect`s).

## Relevant state/store

None — viewport state is owned internally by ReactFlow (`react-flow` library state), not mirrored into this app's own stores. (Contrast: `ViewStateMetadata` exists as a *type* in `src/types/visual-metadata/index.ts` for persisting zoom/pan/collapsed/selected state, but there is no confirmed live code path that actually writes/reads it — verify before assuming viewport position is ever persisted across sessions; based on this pass, it appears **not** to be.)

## Relevant utilities

None dedicated — inline in `visual-diagram.tsx`.

## SCXML behavior

None — zoom/pan state is never written into the SCXML document.

## Validation rules

None.

## Related features

- `hierarchy-navigation.md` — the primary trigger for programmatic `fitView` calls.
- `selection.md` — the scroll-drift workaround exists specifically because it was observed to break marquee-select hit-testing, tying these two features together via a shared bug history.
- `visual-metadata-namespace.md` — `ViewStateMetadata`'s `zoom`/`pan`/`viewport` fields exist in the type system but appear unused by any live persistence path (see Known limitations).

## Related files

`src/components/diagram/visual-diagram.tsx`, `src/types/visual-metadata/index.ts` (`ViewStateMetadata` — likely-unused type).

## Tests

No dedicated test file for zoom/pan/viewport behavior was found — this is inherently hard to unit test (real browser layout/scroll behavior) and this repo has no e2e framework, so this functionality is effectively only manually verified.

## Known limitations

- Viewport position (zoom level, pan offset) is **not persisted** across sessions/reloads as far as this pass could confirm — `ViewStateMetadata`'s `zoom`/`pan` fields exist in the type but no confirmed write/read path was found; reopening a file always starts from `defaultViewport` (0.8 zoom, origin) followed by an auto-`fitView`, not wherever the user last left the camera.
- The Windows pinch-zoom fix patches a ReactFlow-internal (`d3Zoom`) API directly rather than using a public configuration option — a ReactFlow version upgrade could silently break this if the internal `d3Zoom` store shape changes, with no compile-time warning (it's accessed via `useStore` with a loosely-typed selector).

## Important edge cases

- `fitView`'s bounds (`minZoom: 0.5, maxZoom: 2`) are tighter than the user's own manual zoom bounds (`0.2`–`4`) — a user who has manually zoomed out further than 0.5 and then triggers any auto-fit action (e.g. navigating into a compound state) will have their zoom level snapped back into the tighter auto-fit range, which is a deliberate design choice (keeps auto-framing sane) but could feel surprising if a user was intentionally viewing at an extreme zoom level.

## Things that must NOT be changed

- Do not remove the Windows pinch-zoom `d3Zoom.wheelDelta` override or the scroll-drift `scroll`-listener workaround without confirming (on real Windows hardware with a trackpad, and by testing marquee-select after clicking a Controls button) that the underlying ReactFlow/browser issues they patch have actually been fixed upstream — both are responses to real, previously-observed bugs, not speculative hardening.

## Previous design decisions

Both workarounds are accompanied by explanatory inline comments in `visual-diagram.tsx` describing the exact underlying bug (macOS-only native pinch-zoom boost; scroll-drift silently misaligning absolute-positioned hit-testing) — direct evidence both were added reactively, in response to specific observed defects, rather than pre-emptively.
