# Feature: Host API / LoopControl Embedding

## Purpose

Let this editor run embedded as an iframe inside Copenhagen Atomics' LoopControl platform, exchanging SCXML content, configuration, and physical I/O metadata with the host application, rather than only functioning as a standalone browser tool.

## User behavior (from the embedding host's perspective, but observable in-app)

- When embedded, the app waits (up to 3 seconds) for the host to push initial SCXML content via `loadScxml()` before falling back to showing the standalone Welcome screen — so an embedded instance normally never shows the upload/create-new flow at all.
- The host can inject custom toolbar command buttons (`registerCommand`), push toast-style feedback messages (`showFeedback`), push persistent "Host Alerts" distinct from this editor's own validation errors (`showErrors`/`clearErrors`), switch the active tab (`setActiveTab`), and push/pull config overrides, physical channel lists, channel mappings, and operator-facing "User Actions"/events.
- A host `showFeedback(message, 'error')` call never renders `message` verbatim in the toast: the toast is replaced with a fixed short string ("Failed generating program. See Error Panel for details.") and the full `message` is pushed into the Host Alerts panel instead — see "Internal architecture" below and `decisions/error-handling.md` #6. Non-error host feedback (`'info'`/`'warning'`) is unaffected. This repo's own internal `showFeedback('error', ...)` toasts (GitHub push/pull, panel saves, etc.) bypass this entirely — they're already short and call the store directly.

## UI behavior

- Standalone (non-embedded) access shows the ordinary Welcome screen immediately (no artificial wait).
- Embedded access shows a loading spinner for up to 3 seconds while waiting for the host, then falls back to the Welcome screen if nothing arrives — meaning a misconfigured or slow-to-initialize host integration is *not* silently broken, it degrades to standalone behavior.

## Internal architecture

- Global bridge object: `window.ScxmlEditorAPI` (typed in `src/types/host-api.ts`), wired up in `src/app/_hooks/use-host-api-bridge.ts`.
- **Pre-ready queue pattern (`_q`)**: if the host's own script runs and calls `window.ScxmlEditorAPI` methods *before* this app's React tree has mounted, those calls are stashed on `window.ScxmlEditorAPI._q` (a plain object with `ready`/`commands`/`feedback`/`channels`/`channelMappings`/`events`/`hostErrors`/`clearErrors` fields). Once the real API is ready, `use-host-api-bridge.ts` **upgrades the stub object in place** (`Object.assign(stub, realApi)`, then `delete stub._q`) — this means any reference the host already captured (e.g. `var api = iframe.contentWindow.ScxmlEditorAPI` grabbed early) automatically gains the real methods without needing to re-read the property, and all queued calls are flushed in order.
  - **The stub itself is confirmed to live in `src/app/layout.tsx`** — a small, self-installing inline `<script>` (via `dangerouslySetInnerHTML`, in the `<body>`, before `{children}`) that runs synchronously on page load, before React hydrates: `if (window.ScxmlEditorAPI) return;` (never overwrites a stub the host may have injected even earlier) then defines `window.ScxmlEditorAPI = {_q, onReady, registerCommand, showFeedback, setChannels, showErrors, clearErrors, loadScxml, getScxml, toggleConfigPanel, setActiveTab}` — note this inline stub only pre-declares a **subset** of the full `ScxmlEditorAPI` surface (e.g. no `setConfigValues`/`getChannelMappings`/`setChannelMappings`/`setEvents`/`getEvents`/`toggleChannelMappingPanel`/`toggleEventsPanel` stubs exist here) — a host calling one of the *unstubbed* methods before React mounts would hit `undefined is not a function`, not a queued no-op. This inline script is a second, independent implementation of the "same idea" as `use-host-api-bridge.ts`'s real API — the two must be kept conceptually in sync by hand; there is no shared type-checked contract between the literal JS string in `layout.tsx` and the real `ScxmlEditorAPI` TypeScript interface.
- **Embedded detection**: `window.self !== window.top`, checked only inside a `useEffect` in `use-initial-load.ts` — **deliberately never checked during render**, because the statically-exported HTML (`output: "export"`, no server, built with no `window` object present) would otherwise bake `isEmbedded = false` into the static markup, causing a Welcome-screen flash before client-side hydration corrects it.
- `markReady()` fires **before** `TwoTabLayout` renders (specifically ordered so the host's `onReady` callback can call `setActiveTab()` in time for `TwoTabLayout`'s `useState` lazy initializer to read the requested tab on its very first render, rather than one render late).
- **Host error-feedback sanitization (`hostShowFeedback`)**: `use-host-api-bridge.ts` defines a `hostShowFeedback(message, level)` wrapper around the store's `showFeedback`, and uses it — not the store's `showFeedback` directly — for both `realApi.showFeedback` (the live, post-mount API) and the `_q.feedback` queue drain (pre-mount calls). Any call with `level === 'error'` is redirected: the full `message` is pushed into `hostErrors` via `showErrors`, and the toast shown is a fixed string, unconditionally (no message-length or content check — see `decisions/error-handling.md` #6 for why a length threshold was tried and rejected). `'info'`/`'warning'` feedback passes through unchanged. The store's own `showFeedback` action has no knowledge of this and remains a plain passthrough — every other caller in this repo (GitHub push/pull, state-actions-panel, transition-panel, `executeCommand`'s own catch block) calls it directly and is unaffected.

## Relevant components

None own this UI directly — it's a cross-cutting bridge consumed by many components/stores (Config Panel, Channel Mapping Panel, Events Panel, Validation Panel's Host Alerts tab, the toolbar's host-command buttons).

## Relevant state/store

`useHostAPIStore` (`stores/host-api-store.ts`) — the landing place for everything pushed in: `commands`, `readyCallbacks`, `feedbackQueue`, `channels`, `channelMappings`, `events`, `configOverrides`/`configOverridesLoaded`, `requestedTab`, `hostErrors`, `requestedValidationTab`.

## Relevant utilities

None dedicated beyond the hook itself; it does call into `annotateLegacyConfTypes` and `extractUnresolvedChannelRefs` (`datamodel-extractor.ts`) as part of `loadScxml`/`getChannelMappings`.

## SCXML behavior

`loadScxml(xml)` applies the same `annotateLegacyConfTypes` normalization as a manual file upload (but notably **not** the transition-merge normalization that upload/GitHub-pull apply — verify this is intentional if you touch `loadScxml`). `getScxml()` returns the current live content string via a ref (`contentRef`) kept in sync via a `useEffect`, to avoid a stale closure inside the imperatively-constructed API object.

## Validation rules

None specific to this bridge — "Host Alerts" (`showErrors`/`clearErrors`) are an entirely separate, unvalidated channel from this editor's own SCXML validation; a host error message is just an opaque string+level, not tied to any SCXML location. Note `hostErrors` is no longer populated *only* by explicit `showErrors()` calls: `hostShowFeedback` (see "Internal architecture") also writes into it whenever the host calls `showFeedback(msg, 'error')`, and `executeCommand`'s catch block (`host-api-store.ts`) writes into it when a registered command throws — both still just opaque string+level, not tied to any SCXML location.

## Related features

- `config-panel.md`, `channel-mapping-panel.md`, `events-user-actions-panel.md` — all three panels are primarily *consumers* of data this bridge receives from the host.
- `scxml-validation.md` — the Validation Panel's separate "Host Alerts" tab, populated via this bridge.
- `file-import-export.md` — `loadScxml` is a third content-load entry point alongside upload and GitHub pull, with a slightly different normalization sequence (see above).

## Related files

`src/types/host-api.ts`, `src/app/_hooks/use-host-api-bridge.ts`, `src/app/_hooks/use-initial-load.ts`, `src/stores/host-api-store.ts`.

## Tests

`use-host-api-bridge.test.ts` covers the `hostShowFeedback` sanitization behavior specifically (both the live `realApi.showFeedback` path and the pre-ready `_q.feedback` drain) — but not the rest of the hook (`loadScxml`, `getScxml`/`getChannelMappings`, the `_q` stub-upgrade mechanism generally, `markReady`/`onReady` ordering). `use-initial-load.ts` still has no dedicated test file. This remains a partial gap given this is the primary production integration surface (per `.claude/project/overview.md`, embedded-in-LoopControl is the primary deployment mode, not standalone).

## Known limitations

- **Confirmed gap**: the inline pre-init stub script in `layout.tsx` only pre-declares `onReady`/`registerCommand`/`showFeedback`/`setChannels`/`showErrors`/`clearErrors`/`loadScxml`/`getScxml`/`toggleConfigPanel`/`setActiveTab`. A host calling `getConfigValues`, `setConfigValues`, `getChannelMappings`, `setChannelMappings`, `toggleChannelMappingPanel`, `setEvents`, `getEvents`, or `toggleEventsPanel` **before** this app's React tree mounts would hit a `TypeError` (method doesn't exist on the stub), not a silently-queued no-op like the other methods get. If a host integration ever needs to call one of these methods immediately on iframe load (rather than inside an `onReady` callback, which is always safe), the stub in `layout.tsx` would need to be extended to match.
- No test coverage for the `_q` pre-ready queue mechanism specifically — this is a non-trivial, order-sensitive piece of logic (stub upgrade + queue flush) that would benefit from a dedicated test simulating a host script racing against React mount.
- `loadScxml`'s normalization sequence differs from the upload/GitHub-pull path (missing the transition-merge passes) — if this is unintentional, a host pushing an older/hand-edited SCXML file could end up with un-merged duplicate transitions that the upload path would have cleaned up.
- The API surface is entirely global-object-based (`window.ScxmlEditorAPI`), not a documented/versioned protocol — there's no runtime check that a given host build's expectations match this editor build's actual API shape; a mismatch would fail silently (calling an undefined method) rather than with a clear error.

## Important edge cases

- `markReady()` firing **before** `TwoTabLayout` mounts (not after) is load-bearing for `requestedTab` to be visible on `TwoTabLayout`'s very first render via its `useState` lazy initializer — if this ordering is ever inverted, the host's `setActiveTab()` call during its own `onReady` handler would arrive one render too late and the initial tab would flash to the wrong value before correcting.
- Standalone (non-embedded) access still creates a real `window.ScxmlEditorAPI` object (just never receives any host calls) — code should not assume `window.ScxmlEditorAPI` being defined implies the app is embedded; use the `window.self !== window.top` check instead.

## Things that must NOT be changed

- Do not check `window.self !== window.top` (or any other embedding-detection logic) during render — must stay inside a `useEffect`, per the static-export hydration-flash reasoning above.
- Do not change the stub-upgrade mechanism from `Object.assign(stub, realApi)` to reassigning `window.ScxmlEditorAPI = realApi` — the former preserves object identity for any reference the host already captured; the latter would silently break a host that grabbed a reference before this app's React tree mounted.
- Do not move `markReady()` to fire after `TwoTabLayout` renders without re-verifying the `requestedTab` initial-render timing described above.
- Do not assign the store's `showFeedback` directly to `realApi.showFeedback` or the `_q.feedback` drain — always route through `hostShowFeedback` (see "Internal architecture"), or host-originated `'error'` toasts will render raw exception text again.
- Do not reintroduce a message-length (or other content-based) threshold for deciding whether to redirect a host error toast to the Host Alerts panel — see `decisions/error-handling.md` #6 for two concrete real-world messages (a 156-char legitimate toast, a 228-char raw exception) that a length threshold cannot correctly separate.

## Previous design decisions

`docs/superpowers/plans/2026-05-21-loopcontrol-init-behavior.md` documents the origin of the embedded-detection-deferred-to-`useEffect` fix and the 3-second host-load timeout — implying an earlier version had the Welcome-screen-flash bug this now avoids. `docs/superpowers/plans/2026-05-27-host-error-panel.md` documents the "Host Alerts" tab as a later, deliberately-separate-from-validation addition (not an extension of the existing Validation Panel's error list) — a decision that speaks to keeping "this editor's own opinion about the file" architecturally distinct from "what the host is telling the user." `decisions/error-handling.md` #6 documents the later addition that bridges the two: a host-originated error-level *toast* is now automatically mirrored into that same Host Alerts channel, sanitized at the `window.ScxmlEditorAPI` boundary rather than by message content.
