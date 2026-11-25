# Feature: "after X" Time-Transition Shorthand

## Purpose

Let a user author a timed/delayed transition (`after 2s`, `after 714ms`, `after this.x s`, `after (someExpr) ms`) using a compact, readable shorthand instead of manually writing the native SCXML `<send>`/`<cancel>`/`delay` pattern needed to implement a timeout on this platform's runtime.

## User behavior

- In the Transition panel (Event mode), typing an `after …` value sets up a transition that fires after that delay. Accepted forms (`parseAfterSyntax`, checked in this order):

  | Input | Stored on the `<send>` |
  |---|---|
  | `after 714ms` / `after 714 ms` | `delay="714ms"` |
  | `after 2s` / `after 2 s` (decimals OK) | `delay="2s"` — numeric delays are **not** ms-converted |
  | `after (expr) ms` / `after expr ms` | `delayexpr="expr"` — already ms, stored verbatim |
  | `after (expr) s` / `after expr s` | `delayexpr="expr * 1000"`, or `"(expr) * 1000"` when `expr` has a looser-than-`*` operator at top level (`a + b`, `c ? 5 : 0`) — seconds, converted |
  | `after x * 5s` / `after x * 5ms` (unit glued to a trailing number) | `delayexpr="x * 5 * 1000"` / `delayexpr="x * 5"` |

  The `(expr)` forms strip the outer parentheses only when they enclose the whole expression. `after (a) * (b) s` is treated as the bare expression `(a) * (b)`, not cut down to `a) * (b`.

  Bare (unparenthesised) expressions need a space before the unit, so `after conf_hats` is rejected rather than read as `conf_hat` + `s`. The one exception is a unit glued to the expression's **trailing number**, which is allowed only when that number is its own token (preceded by a space, operator or paren). So `after x * 5s` parses, but `after conf_hat5s` is still rejected. On display, a glued-unit transition is shown normalised as `after x * 5 s`.
- Text that starts with `after` + whitespace but doesn't parse (in any segment of a merged list) is **refused with an error** listing the accepted formats, instead of being saved as a plain event. Such text is never a valid event name, because SCXML splits `event` on spaces. Before this, `after x * 5s` was silently saved as `event="after x * 5s"` with no `<send>`/`<cancel>`. An event that merely starts with the letters `after` (`afterSave`) is unaffected. The parenthesised `s` form is kept for backward compatibility; the `ms` expression forms were added in commit `473dfd1`.
- With the caret inside the delay expression of an `after` segment (either mode, including the `after` segment of a merged list), the dropdown suggests existing channels, mapped channels and datamodel variables by substring for the token under the caret, the same matching as Condition mode (`getAfterExpressionSuggestions`). It deliberately offers **no operators**. An unknown `this_` name gets the usual **"(new channel)" row**, and saving declares it, as for a condition. The transition apply handler passes the delay expression's `this_` refs to `syncThisChannels`, and channel inference reads `<send delayexpr>`: a direct arithmetic operand is declared as a double (`0.0`), a ternary test as a bool (`false`). The Validation panel also reports an undeclared or mistyped channel in a delay. Until Nov 2026 none of this covered delays: `after this_x * 6 s` saved without declaring `this_x`. It also suggests nothing at the **unit position**: a word typed after a completed operand and a space (`after this_x s`, `after (x) ms`) is the unit. That keeps the list empty there, so Enter saves. While the text isn't a valid `after` form yet, the dropdown also shows a format hint listing the four forms.
- A merged event list may contain at most one `after X` segment (e.g. `after 2s, foo`); two or more is rejected with an error in the panel.
- The displayed text always shows the human-authored form (`after 2s`) — the underlying millisecond-conversion math is invisible to the user.
- Renaming the source state automatically updates the auto-generated timer event name baked into the transition — the user does not need to manually fix up a timer transition after a rename.
- Dragging a timer transition's source end onto another state moves the timer with it (issue #79): the `<send>`/`<cancel>` pair relocates to the new source and the token is re-issued as `{newSourceId}_t_N_timeEvent_N` (next free N). Dragging only the target end leaves the timer where it is.

## UI behavior

- Timer transitions render with the same transition-edge/label UI as any other transition, but the label shows the resolved "after X" text (reverse-computed from the underlying event/send data) rather than the raw synthetic event name.
- The Transition panel treats "after X" as roughly a third mode alongside Event and Condition, using the same input field with dedicated parsing.

## Internal architecture

- **Authoring → storage**: `parseAfterSyntax()` (`src/lib/utils/time-transition.ts`) converts the forms above into native SCXML: a `<send>` action in the source state's `onentry` with `delay`/`delayexpr`, paired with a `<cancel sendid="{token}">` in its `onexit` to clear it if the state is exited before it fires, and a synthetic event name following the pattern **`{stateId}_t_{N}_timeEvent_{N}`** (`generateTimeEventName`) used as the actual transition's `event`.
- **Critical runtime constraint**: the LoopControl runtime interprets a bare `delayexpr` value as **raw milliseconds with no unit conversion**. So an *expression* delay authored in seconds gets a `* 1000` baked directly into the stored `delayexpr` expression string by `ensureMsConversion()` (idempotent — an expression already ending in `* 1000` is left alone, so re-applying never multiplies twice). The expression is parenthesized first when needed (`needsParensForMsConversion`): only operands joined by `*`/`/`/`%`, with an optional leading unary, are left bare. Before this fix, `after (a + b) s` was stored as `a + b * 1000` (only `b` converted) and `after (c ? 5 : 0) s` as `c ? 5 : 0 * 1000` (5 **ms** when true). Such legacy values are **not** auto-rewritten. `formatAfterSyntax` shows them verbatim as `after a + b * 1000 ms`, so the label matches what actually runs, and re-saving keeps them unchanged. Re-typing as `after (a + b) s` fixes one. This is not a display artifact, it's what actually gets compiled/run. Numeric `delay="2s"` values keep their unit suffix and are not converted; `ms` expressions are stored verbatim. `formatAfterSyntax()` reverses this for display: a `delayexpr` ending in `* 1000` shows as `after expr s` (suffix stripped), any other `delayexpr` shows as `after expr ms`, and a `delay` shows as-is.
- **Storage → display**: `resolveTimeEventDisplay()`/`findTimeEventToken()` scan the source state's entry actions for a `send|...` action matching the synthetic-event naming pattern and reconstruct the human-readable "after X" string per-token — this must work even when the transition's `event` attribute is a **comma-merged multi-event list** (from `transition-merge-utils.ts`), resolving only the matching token and leaving other event names in the list untouched.
- **Rename coupling**: because the synthetic event name literally embeds the state id (`{oldId}_t_N_timeEvent_N`), `RenameStateCommand` must specifically rewrite this token (via `renameTimeEventTokensInEventList`) inside the renamed state's own `transition/@event`, `onentry > send/@event`, and `onexit > cancel/@sendid` — a plain string-replace-everywhere would be wrong since it needs to only touch the *token* inside a possibly comma-merged list, not any other part of an event name that happens to contain the old id as a substring.
- **Reconnect coupling**: `ReconnectTransitionCommand.moveTimeEvent()` handles a source change — it moves the old source's matching `onentry > send[event]` / `onexit > cancel[sendid]` (removing a now-empty block, appending to the new source's last existing block or a new one), and rewrites only the token inside the transition's event list. It does nothing if the old source has no matching `<send>` (a hand-written timer sent elsewhere), and copies rather than moves if another transition left on the old source still uses the token. `undo()` passes the original token back as `preferredTimeEventName` so the round-trip restores the exact original name.
- **Slot classification coupling**: `transition-slot-rules.ts`'s `classifyTransitionSlot` uses `isTimeEventName()` (the same pattern-matcher) specifically to distinguish the `'timer'` slot from a plain `'event'` slot — a transition-slot conflict message like "Only one timer-based transition is allowed from 'A' to 'B'" depends on this classification being correct.

## Relevant components

`src/components/diagram/transition-panel.tsx` (authoring UI), `src/components/diagram/edges/scxml-transition-edge.tsx` (display resolution via `resolveTimeEventDisplay`).

## Relevant state/store

None dedicated — this is pure parse/format logic invoked from the Transition panel and the edge renderer.

## Relevant utilities

`src/lib/utils/time-transition.ts` — `parseAfterSyntax`, `formatAfterSyntax`, `getAfterExpressionSuggestions` (delay-expression autocomplete; wraps `getExpressionSuggestions` from `expression-autocomplete.ts` on just the expression region and returns absolute token bounds), `ensureMsConversion`, `isTimeEventName`, `generateTimeEventName`, `resolveTimeEventDisplay`, `findTimeEventToken`, `renameTimeEventTokensInEventList`, `isTimerGeneratedActionString`, `mergeHiddenActions` (the latter two back the State Actions panel's hide/merge-back — see `state-actions-panel.md` and `decisions/editing.md` #9).

## SCXML behavior

Produces entirely standard SCXML (`<send>`/`<cancel>` with `delay`/`delayexpr`, a plain `<transition event="...">`) — "after X" is a pure authoring-time convenience with no non-standard element or attribute involved (unlike the `viz:` namespace features). A file with a synthetic `_t_N_timeEvent_N` event name is fully valid, portable SCXML even outside this editor; only the friendly display resolution is editor-specific.

## Validation rules

No dedicated validator rule exists solely for "after X" syntax — timer transitions are validated exactly like any other transition (event-name syntax, slot conflicts via the `'timer'` slot classification, target existence).

## Related features

- `transitions-editing.md` — the Transition panel is the shared home for Event/Condition/"after X" authoring, and slot classification treats timer transitions specially.
- `state-actions-panel.md` — the underlying `send`/`cancel` rows this feature manages are deliberately hidden from that panel's onentry/onexit tabs and from the state node's action-count indicator on the canvas (`isTimerGeneratedActionString` in `time-transition.ts`), so a user can no longer hand-edit them as raw rows there. They still exist in the SCXML and remain visible/editable in the Monaco code editor — see `decisions/editing.md` #9.

## Related files

`src/lib/utils/time-transition.ts`, `src/lib/commands/rename-state-command.ts` (the token-rewrite coupling), `src/lib/commands/reconnect-transition-command.ts` (the source-change move), `src/lib/utils/transition-slot-rules.ts` (the `'timer'` slot), `src/components/diagram/transition-panel.tsx`.

## Tests

`src/lib/utils/time-transition.test.ts`, `src/lib/commands/reconnect-transition-command.test.ts`, `src/components/diagram/transition-panel.test.tsx` (the "after X" expression-suggestion RTL tests). Gotcha in that RTL file: a test that ends on a bare `fireEvent.mouseDown` (accepting a suggestion) leaves React's onSelect plugin thinking the mouse is still down, and it then ignores `fireEvent.select` in **later** tests. A later test that moves the caret must `fireEvent.mouseUp` first.

## Known limitations

- The synthetic event-name pattern (`{stateId}_t_{N}_timeEvent_{N}`) embeds the state id as a literal substring — any code that needs to identify/rewrite it must use the dedicated token functions (`findTimeEventToken`, `renameTimeEventTokensInEventList`), never a naive substring replace, or it risks corrupting an unrelated event name that happens to contain the same substring.
- Editing the underlying `send`/`cancel` rows directly via the Monaco code editor (the only place they're still visible/editable — see `decisions/editing.md` #9) bypasses this feature's parsing/formatting entirely — nothing prevents a user from hand-breaking the pairing between the `send` delay and its matching `cancel`/transition event.

## Important edge cases

- A comma-merged event list containing one timer token and other plain event names must resolve/rename **only** the timer token, leaving the rest of the list untouched — verified by the token-aware (not whole-string) implementation of both the rename coupling and the display resolution.
- The ms-conversion (`* 1000`) is baked into the **stored expression itself**, not applied at render/runtime — if the runtime's interpretation of `delayexpr` units ever changes, every already-authored "after Xs" transition's stored expression would need migration, not just this code.

## Things that must NOT be changed

- Do not remove the `* 1000` conversion in `ensureMsConversion()` without confirming the runtime's `delayexpr` unit interpretation has actually changed — this is a hard external-system constraint, not an arbitrary implementation choice.
- Do not naive-string-replace the synthetic event-name token anywhere — always go through the dedicated token functions, per the Known limitations note above.

## Previous design decisions

`docs/superpowers/plans/2026-06-24-time-transition-after-syntax.md` and its paired design spec document this feature's introduction as a deliberate authoring-ergonomics improvement over hand-writing `<send>`/`<cancel>`/`delay` — the ms-conversion behavior specifically reflects a discovered runtime constraint (the generator/runtime reads `delayexpr` as raw ms) that had to be worked around in the UI layer rather than fixed at the runtime, since the runtime is outside this repo's control.
