# Feature: Events Panel ("User Actions")

## Purpose

Let a user define operator-facing UI buttons — surfaced in a separate LoopControl "operate" page outside this repo — that raise events into the running state machine, optionally carrying a numeric argument with physical engineering units.

## User behavior

- "Add user action" creates a simple named button; "Add user action with argument" additionally exposes default value, min, max, and unit fields next to the button in the operate page.
- Renaming, changing default/min/max/unit, or toggling visibility all show a confirmation toast ("User action renamed.", "Default value updated.", etc.) on blur, but only if the value actually changed (tracked via `onFocus` snapshot vs. `onBlur` comparison).
- The eye/eye-off icon toggles whether the resulting button is **hidden from operators** — this does not remove the event definition, only its visibility in the separate operate UI.
- Units are chosen from a fixed physical-unit list: V, A, l/min, % rh, g/m3, Hz, rpm, Vdc, Vac, ppm, Ohm, bar, mbar, °C, s, g/day, on/off, state.

## UI behavior

- Empty state: "No user actions defined. Add a user action to create a web UI button in the operate page." — explicit about the cross-application effect (this panel's data drives a *different* page in the host, not anything rendered by this editor itself).
- Deleting shows a confirmation toast but has no undo affordance specific to this panel (relies on the general app history/undo only insofar as `EventEntry[]` changes flow through the normal store update — see Known limitations, since this is host-store state, not SCXML content).

## Internal architecture

- Data model: `EventEntry { name, type, hasArgument, defaultValue?, min?, max?, unit?, hidden? }` (`src/types/host-api.ts`). **`type` is currently always set to `EVENT_FALLBACK_VALUE`** (`common-utils.ts`) when created via this panel — the field exists in the type but this panel provides no UI to actually set a meaningful type value.
- Stored entirely in `useHostAPIStore.events`, **not in the SCXML document** — same host-side-metadata pattern as Channel Mapping (see that feature doc), distinct from Config Panel's SCXML-persisted `conf_` fields.
- Every field edit calls `setEvents(events.map(...))` directly (full-array replace via `.map`) — there's no per-field Command or SCXML mutation involved anywhere in this panel.
- `getEvents()`/`setEvents()` on the Host API bridge are the host-facing read/write surface; `setEvents` (both from the host push path and internally) backfills `type ?? EVENT_FALLBACK_VALUE` defensively for any incoming entry missing it.

## Relevant components

`src/components/ui/events-panel.tsx`, `src/components/ui/searchable-select.tsx` (unit picker).

## Relevant state/store

`useHostAPIStore.events`, `setEvents`, `showFeedback` (confirmation toasts).

## Relevant utilities

`src/lib/utils/common-utils.ts` (`EVENT_FALLBACK_VALUE`).

## SCXML behavior

**None** — this feature does not read or write the SCXML document at all; it is purely host-side UI-button metadata that happens to live alongside this editor. The naming loosely implies a relationship to SCXML `event`s (a "User Action" is presumably meant to be raised as a transition event by the host when the operator clicks the button), but this editor does not itself wire an `EventEntry.name` to any `<transition event="...">` — that association exists only by convention (the user is expected to name the action the same as the event they handle in their state machine).

## Validation rules

None — `SCXMLValidator` never touches this data, and this panel has no cross-check against actual SCXML event names (e.g. no warning if a defined "user action" name doesn't match any `<transition event="...">` anywhere in the document).

## Related features

- `host-api-embedding.md` — source/destination of `events`.
- `config-panel.md`, `channel-mapping-panel.md` — sibling host-bridge panels; Events is the only one of the three with **no SCXML persistence at all** (Config writes to SCXML, Channel Mapping doesn't but at least reads from it for auto-detection; Events neither reads nor writes SCXML).

## Related files

`src/components/ui/events-panel.tsx`, `src/types/host-api.ts`, `src/stores/host-api-store.ts`, `src/lib/utils/common-utils.ts`.

## Tests

`src/components/ui/events-panel.test.tsx` (RTL component test).

## Known limitations

- No SCXML-awareness at all: nothing checks that an event name defined here actually corresponds to a transition event handled anywhere in the state machine, or warns if a transition expects an event that was never defined as a User Action. This is a plausible, currently-unfilled validation gap given how central this connection is to the feature's stated purpose.
- The `type` field is effectively unused/always-fallback from this panel's own UI — if `type` is meant to carry real semantic meaning (e.g. for host-side dispatch), this panel does not currently let a user set it meaningfully.
- No undo/redo integration specific to deleting an event — since this is host-store state (not SCXML `content`), it does not participate in this app's `HistoryManager`/`useHistoryStore` at all; deleting an event has no "Ctrl+Z" recovery path within this editor.

## Important edge cases

- Renaming an event does not check for a duplicate name against other existing events — nothing in this panel prevents two `EventEntry`s from sharing the same `name`.
- The confirmation-toast dirty-check (`fieldOriginalRef`) is captured on `onFocus`, so rapidly tabbing through fields without ever blurring away from an unchanged one won't spuriously toast, but the ref is a single shared value reused across all fields — verify this doesn't misfire if two different fields could focus in quick succession without an intervening blur (not currently a known bug, but a fragile pattern worth being careful with if extending).

## Things that must NOT be changed

- Do not start writing `EventEntry` data into the SCXML document without a deliberate design decision — the current host-side-only storage is consistent with this being genuinely separate-from-SCXML operate-page configuration, not an oversight.

## Previous design decisions

No dedicated plan/spec document in `docs/superpowers/` covers this panel by name (it may predate that documentation practice, or be covered implicitly within the broader host-bridge plans). The panel's UI label "User Actions" vs. the code's `Events`/`EventEntry` naming is a real, confirmed naming divergence between user-facing and developer-facing vocabulary — see `.claude/project/terminology.md`.
