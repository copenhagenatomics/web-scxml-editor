# Feature: SCXML Events and Executable Content (raise/assign/send/cancel/log/script/if/foreach)

## Purpose

Support the full W3C SCXML "executable content" model — the actions that can appear inside `<onentry>`, `<onexit>`, `<transition>`, and conditional/loop constructs — both in the type system (for parsing) and in the UI-level editing shape (for the State Actions panel), and reconcile the fact that these two do not currently match.

## User behavior

See `state-actions-panel.md` for the actual editing UX (assign/send/cancel rows, reactions tab). This document covers the underlying SCXML executable-content model those UI rows are a simplified front-end for.

## UI behavior

The State Actions panel UI only exposes **assign**, **send**, and **cancel** as directly editable row types (`ActionRow` union in `state-actions-panel.tsx`) — `raise`, `log`, `script`, `if`/`elseif`/`else`, and `foreach` have **no dedicated row UI** in that panel, even though the type system fully supports them.

## Internal architecture

- **Type model** (`src/types/scxml/index.ts`): `ExecutableElement` is a union of `RaiseElement | IfElement | ElseIfElement | ElseElement | ForEachElement | LogElement | AssignElement | ScriptElement | SendElement | CancelElement`. `OnEntryElement`/`OnExitElement`/`TransitionElement`/`IfElement`/`ElseIfElement`/`ElseElement`/`ForEachElement`/`FinalizeElement` all carry an `executable?: ExecutableElement[]` array.
- **Critical, confirmed mismatch** (also noted in `.claude/features/scxml-validation.md`'s Known limitations, repeated here because it's central to this feature): the `.executable[]` array shape is **not** what `fast-xml-parser` actually produces when parsing a real SCXML file from disk — a real parsed `<onentry>` object has raw tag-name properties (`.assign`, `.send`, `.raise`, etc., each possibly an array if repeated), not a normalized `.executable` array. The `.executable[]` shape is instead what the **app's own in-memory editing code** produces (`src/lib/utils/scxml-manipulation-utils.ts:204-211`) when constructing/editing actions programmatically. This means:
  - Code that reads `.executable[]` (e.g. `w3c-validator.ts`'s unknown-attribute checks for executable content) works against in-memory-constructed objects but is **effectively dead** against files loaded from disk/paste.
  - Code that reads raw tag-name properties directly (e.g. the required-attribute walk in `w3c-validator.ts`, and `UpdateActionsCommand`'s DOM-based parsing) works correctly on real files.
- **UI editing shape** (`state-actions-panel.tsx`'s `ActionRow`): a deliberately narrower, pipe-string-encoded representation (`"assign|location|expr"`, `"send|event|delayType|delayValue"`, `"cancel|sendid"`) — see `.claude/features/state-actions-panel.md` for the full encoding. This is the shape that actually round-trips through `UpdateActionsCommand`.
- `raise`/`log`/`script`/`if`/`foreach` **can exist** in a loaded document's `<onentry>`/`<onexit>` (the parser and required-attribute validator both handle them structurally), but a user cannot **create** one through the State Actions panel UI — only through hand-editing XML in the Monaco editor. If a hand-edited file has one, opening the State Actions panel and applying any change (add/edit/delete/reorder any assign/send/cancel row) will **wipe it**, since `UpdateActionsCommand` replaces the *entire* `<onentry>`/`<onexit>` content with only what the panel's `ActionRow[]` can represent.

## Relevant components

`src/components/ui/state-actions-panel.tsx` (the narrower editing UI — see that feature doc for its own details).

## Relevant state/store

None dedicated.

## Relevant utilities

`src/lib/commands/update-actions-command.ts` (`extractActionsFromElement` — the DOM-based parser that must recognize `assign`/`send`/`cancel` tags specifically, silently dropping anything else on the next save), `src/lib/utils/scxml-manipulation-utils.ts` (`.executable[]`-shape construction), `src/lib/validators/attribute-schemas.ts` + `w3c-validator.ts` (structural validation of all executable element types, including the ones the UI can't edit).

## SCXML behavior

A file containing `<raise event="x"/>`, `<log expr="..."/>`, `<script>...</script>`, or `<if cond="...">...</if>` inside an `<onentry>`/`<onexit>` is fully valid, parseable SCXML, and this app's validators correctly check required attributes on all of them. The gap is purely in the **editing** direction: this editor's structured UI cannot author or safely preserve these element types within onentry/onexit.

## Validation rules

Required-attribute checks apply uniformly to all executable-content element types (`raise` needs `event`, `log` needs `expr`, `if`/`elseif` need `cond`, `foreach` needs `item`+`array`, etc. — see `.claude/project/scxml-rules.md`'s SCXML attribute table). Unknown-attribute checks for the same elements are the ones affected by the `.executable[]` shape mismatch described above.

## Related features

- `state-actions-panel.md` — the actual editing UI, and the destructive-on-save risk this document identifies.
- `scxml-validation.md` — shares the exact same `.executable[]` shape-mismatch gap, documented independently there for the unknown-attribute-check angle.
- `transitions-editing.md` — a `<transition>` itself can carry `executable?: ExecutableElement[]` per the type (executed when the transition fires) — this is **not exposed anywhere in the UI** (the Transition panel edits `event`/`cond`/target/handles only, never transition-level executable content).

## Related files

`src/types/scxml/index.ts`, `src/lib/commands/update-actions-command.ts`, `src/lib/utils/scxml-manipulation-utils.ts`, `src/lib/validators/w3c-validator.ts`, `src/lib/validators/attribute-schemas.ts`.

## Tests

`src/lib/commands/update-actions-command.test.ts` — verify whether it includes a case for "existing raise/log/script content is silently dropped on save" (a realistic, high-value regression test if not already present).

## Known limitations

- **Data-loss risk, confirmed by design, not hypothetical**: opening the State Actions panel for a state whose `<onentry>`/`<onexit>` contains `raise`/`log`/`script`/`if`/`foreach` (hand-authored or from an external tool) and making *any* edit there will silently discard those elements on the next Apply, since `UpdateActionsCommand` rebuilds the entire onentry/onexit content from only what `ActionRow[]` can represent.
- Transition-level executable content (`<transition>...<assign/></transition>` beyond the specific "internal event reaction" pattern already modeled — see `.claude/project/terminology.md`) has no editing UI at all.
- The `.executable[]` shape mismatch (see Internal architecture) means at least one validator check (`w3c-validator.ts`'s unknown-attribute pass for onentry/onexit children) is dead code against real files, independently confirmed in `.claude/features/scxml-validation.md`.

## Important edge cases

- A user who hand-edits XML to add a `<raise>` inside an `<onentry>` that already has `assign`/`send`/`cancel` rows, then opens the State Actions panel and clicks "Apply" on an unrelated row edit, will lose the `<raise>` with **no warning** — the panel has no way to detect or preserve content it doesn't understand.

## Things that must NOT be changed

- Do not extend `UpdateActionsCommand` to "round-trip unknown elements through opaquely" without careful design — silently preserving unrecognized XML alongside a structured editing model is a meaningfully different (and more complex) design than the current "the panel is the sole owner of onentry/onexit content" approach, and would need its own dedicated design work, not a quick patch.

## Previous design decisions

No plan/spec document in `docs/superpowers/` explicitly acknowledges this data-loss risk — the State Actions panel's plans (`2026-06-05-state-actions-side-panel.md`, `2026-06-17-reactions-tab.md`) describe adding assign/send/cancel and internal-event-reaction editing incrementally, with no mention of `raise`/`log`/`script`/`if`/`foreach` support being explicitly deferred or out of scope — suggesting this may be an unrecognized gap rather than a deliberate, documented product decision.
