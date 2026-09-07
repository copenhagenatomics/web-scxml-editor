# Feature: Hidden Actions (operator-visibility toggle on User Actions)

## Verification note

Searched broadly for any "hidden" concept across the codebase beyond generic CSS (`.hidden` utility classes, hidden `<input type="file">` elements, etc.). **The only structured, data-model "hidden" flag found is `EventEntry.hidden`** (`src/types/host-api.ts:59`) on the Events ("User Actions") panel. There is no "hidden state," "hidden transition," or "hidden validation rule" concept anywhere else in this codebase — this document covers the one real "hidden actions" feature that exists, and confirms no broader interpretation applies.

## Purpose

Let a user define a "User Action" (an operator-facing button raising an event into the running state machine — see `.claude/features/events-user-actions-panel.md`) that exists and functions normally, but is **not shown** to the operator in LoopControl's separate "operate" page — useful for actions meant for engineering/commissioning use (e.g. diagnostic overrides) rather than routine operator interaction.

## User behavior

- Every User Action row has an eye/eye-off toggle button.
- Eye (visible, default) = shown to operators in the operate page.
- Eye-off (hidden) = the action definition still exists in this editor and is still pushed to the host via `setEvents`, but LoopControl's operate page is expected to not render a button for it.
- Toggling hidden state shows no confirmation toast (unlike renaming/default-value/min/max/unit changes, which do) — it's treated as an immediate, low-stakes toggle.

## UI behavior

`hidden: !event.hidden || undefined` — the toggle **normalizes `false` back to `undefined`** rather than storing an explicit `false`, keeping the data shape minimal (an action is either explicitly `hidden: true` or has no `hidden` key at all — never a stored `hidden: false`).

## Internal architecture

- Pure client-side/host-store state (`useHostAPIStore.events`, `EventEntry.hidden?: boolean`) — **not part of the SCXML document at all** (consistent with the rest of `events-user-actions-panel.md`'s data model).
- This app itself does **not** enforce or use the `hidden` flag for anything — it has no "operate page" of its own. The flag is purely metadata this editor lets the user set and passes through (`getEvents()`/`setEvents()` on the Host API) for a **different application** (LoopControl's operate page) to actually respect.

## Relevant components

`src/components/ui/events-panel.tsx` (the toggle UI itself — `Eye`/`EyeOff` icons from `lucide-react`).

## Relevant state/store

`useHostAPIStore.events`.

## Relevant utilities

None dedicated.

## SCXML behavior

None — this flag never touches the SCXML document.

## Validation rules

None.

## Related features

- `events-user-actions-panel.md` — the parent feature this is one facet of; full detail on the rest of the `EventEntry` model lives there.
- `host-api-embedding.md` — the mechanism by which this flag actually reaches the host application that's expected to respect it.

## Related files

`src/components/ui/events-panel.tsx`, `src/types/host-api.ts`.

## Tests

Covered incidentally by `src/components/ui/events-panel.test.tsx` if that test exercises the hide/show toggle — verify specific assertion coverage for this flag before assuming it's tested in isolation.

## Known limitations

- **This editor has no way to verify the flag actually has any effect** — since the operate page is a separate application outside this repo, a bug in that other application's handling of `hidden` (or a version mismatch where an older LoopControl build doesn't respect the field at all) would be entirely invisible from within this editor; a "hidden" action would appear to work correctly here with no way to confirm operator-facing behavior.
- No bulk toggle ("hide all," "show all") exists — each action's visibility must be toggled individually.

## Important edge cases

- A newly-created User Action can be created already-hidden (the "add" form has its own `newHidden` toggle, independent of any existing row's state) — hiding isn't only a post-creation edit.

## Things that must NOT be changed

- Do not start writing `hidden` (or any `EventEntry` field) into the SCXML document — this would break the deliberate separation between "what the state machine does" (SCXML) and "how LoopControl's operate page presents controls for it" (host-side metadata), which is consistent with how Channel Mapping also keeps its data host-side rather than in the SCXML file (see `.claude/features/channel-mapping-panel.md`).

## Previous design decisions

No dedicated plan/spec document names this toggle specifically — it appears to be a small, incremental addition to the Events panel's data model (`EventEntry.hidden`) rather than a separately-planned feature, consistent with its minimal footprint (one field, one icon toggle, no dedicated UI beyond that).
