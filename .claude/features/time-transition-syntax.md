# Feature: "after X" Time-Transition Shorthand

## Purpose

Let a user author a timed/delayed transition (`after 2s`, `after 714ms`, `after (someExpr) s`) using a compact, readable shorthand instead of manually writing the native SCXML `<send>`/`<cancel>`/`delay` pattern needed to implement a timeout on this platform's runtime.

## User behavior

- In the Transition panel, typing `after 2s` (or `after 714ms`, or `after (expr) s` for a dynamic/expression-based delay) sets up a transition that fires after that delay.
- The displayed text always shows the human-authored form (`after 2s`) — the underlying millisecond-conversion math is invisible to the user.
- Renaming the source state automatically updates the auto-generated timer event name baked into the transition — the user does not need to manually fix up a timer transition after a rename.

## UI behavior

- Timer transitions render with the same transition-edge/label UI as any other transition, but the label shows the resolved "after X" text (reverse-computed from the underlying event/send data) rather than the raw synthetic event name.
- The Transition panel treats "after X" as roughly a third mode alongside Event and Condition, using the same input field with dedicated parsing.

## Internal architecture

- **Authoring → storage**: `parseAfterSyntax()` (`src/lib/utils/time-transition.ts`) converts `after 2s`/`after 714ms`/`after (expr) s` into native SCXML: a `<send>` action (in the source state's `onentry`, or similar) with `delay`/`delayexpr`, paired with a `<cancel>` to clear it if the state is exited before it fires, and a synthetic event name following the pattern **`{stateId}_t_{N}_timeEvent_{N}`** (`generateTimeEventName`) used as the actual transition's `event`.
- **Critical runtime constraint**: the LoopControl runtime interprets a bare `delayexpr` value as **raw milliseconds with no unit conversion**. So any delay authored in seconds gets a `* 1000` baked directly into the stored `delayexpr` expression string by `ensureMsConversion()` — this is not a display artifact, it's what actually gets compiled/run. `formatAfterSyntax()` reverses this for display so the round-trip is invisible to the user.
- **Storage → display**: `resolveTimeEventDisplay()`/`findTimeEventToken()` scan the source state's entry actions for a `send|...` action matching the synthetic-event naming pattern and reconstruct the human-readable "after X" string per-token — this must work even when the transition's `event` attribute is a **comma-merged multi-event list** (from `transition-merge-utils.ts`), resolving only the matching token and leaving other event names in the list untouched.
- **Rename coupling**: because the synthetic event name literally embeds the state id (`{oldId}_t_N_timeEvent_N`), `RenameStateCommand` must specifically rewrite this token (via `renameTimeEventTokensInEventList`) inside the renamed state's own `transition/@event`, `onentry > send/@event`, and `onexit > cancel/@sendid` — a plain string-replace-everywhere would be wrong since it needs to only touch the *token* inside a possibly comma-merged list, not any other part of an event name that happens to contain the old id as a substring.
- **Slot classification coupling**: `transition-slot-rules.ts`'s `classifyTransitionSlot` uses `isTimeEventName()` (the same pattern-matcher) specifically to distinguish the `'timer'` slot from a plain `'event'` slot — a transition-slot conflict message like "Only one timer-based transition is allowed from 'A' to 'B'" depends on this classification being correct.

## Relevant components

`src/components/diagram/transition-panel.tsx` (authoring UI), `src/components/diagram/edges/scxml-transition-edge.tsx` (display resolution via `resolveTimeEventDisplay`).

## Relevant state/store

None dedicated — this is pure parse/format logic invoked from the Transition panel and the edge renderer.

## Relevant utilities

`src/lib/utils/time-transition.ts` — `parseAfterSyntax`, `formatAfterSyntax`, `ensureMsConversion`, `isTimeEventName`, `generateTimeEventName`, `resolveTimeEventDisplay`, `findTimeEventToken`, `renameTimeEventTokensInEventList`.

## SCXML behavior

Produces entirely standard SCXML (`<send>`/`<cancel>` with `delay`/`delayexpr`, a plain `<transition event="...">`) — "after X" is a pure authoring-time convenience with no non-standard element or attribute involved (unlike the `viz:` namespace features). A file with a synthetic `_t_N_timeEvent_N` event name is fully valid, portable SCXML even outside this editor; only the friendly display resolution is editor-specific.

## Validation rules

No dedicated validator rule exists solely for "after X" syntax — timer transitions are validated exactly like any other transition (event-name syntax, slot conflicts via the `'timer'` slot classification, target existence).

## Related features

- `transitions-editing.md` — the Transition panel is the shared home for Event/Condition/"after X" authoring, and slot classification treats timer transitions specially.
- `state-actions-panel.md` — the underlying `send`/`cancel` rows this feature manages are also visible/editable as raw rows in the onentry/onexit tabs (a user could hand-edit a timer's `send` row there and break the "after X" display resolution if not careful — the two UIs operate on the same underlying data without cross-validation).

## Related files

`src/lib/utils/time-transition.ts`, `src/lib/commands/rename-state-command.ts` (the token-rewrite coupling), `src/lib/utils/transition-slot-rules.ts` (the `'timer'` slot), `src/components/diagram/transition-panel.tsx`.

## Tests

`src/lib/utils/time-transition.test.ts`.

## Known limitations

- The synthetic event-name pattern (`{stateId}_t_{N}_timeEvent_{N}`) embeds the state id as a literal substring — any code that needs to identify/rewrite it must use the dedicated token functions (`findTimeEventToken`, `renameTimeEventTokensInEventList`), never a naive substring replace, or it risks corrupting an unrelated event name that happens to contain the same substring.
- Editing the underlying `send`/`cancel` rows directly via the State Actions panel (rather than through the Transition panel's "after X" field) bypasses this feature's parsing/formatting entirely — nothing prevents a user from hand-breaking the pairing between the `send` delay and its matching `cancel`/transition event.

## Important edge cases

- A comma-merged event list containing one timer token and other plain event names must resolve/rename **only** the timer token, leaving the rest of the list untouched — verified by the token-aware (not whole-string) implementation of both the rename coupling and the display resolution.
- The ms-conversion (`* 1000`) is baked into the **stored expression itself**, not applied at render/runtime — if the runtime's interpretation of `delayexpr` units ever changes, every already-authored "after Xs" transition's stored expression would need migration, not just this code.

## Things that must NOT be changed

- Do not remove the `* 1000` conversion in `ensureMsConversion()` without confirming the runtime's `delayexpr` unit interpretation has actually changed — this is a hard external-system constraint, not an arbitrary implementation choice.
- Do not naive-string-replace the synthetic event-name token anywhere — always go through the dedicated token functions, per the Known limitations note above.

## Previous design decisions

`docs/superpowers/plans/2026-06-24-time-transition-after-syntax.md` and its paired design spec document this feature's introduction as a deliberate authoring-ergonomics improvement over hand-writing `<send>`/`<cancel>`/`delay` — the ms-conversion behavior specifically reflects a discovered runtime constraint (the generator/runtime reads `delayexpr` as raw ms) that had to be worked around in the UI layer rather than fixed at the runtime, since the runtime is outside this repo's control.
