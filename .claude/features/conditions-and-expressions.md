# Feature: Conditions and Expressions (`cond`, and expression attributes generally)

## Purpose

Let a user author boolean guard conditions on transitions (`cond="..."`) and value expressions elsewhere (`expr`, `location` targets, etc.), with variable-name extraction feeding autocomplete and reference-tracking features across the app.

## User behavior

- Typing a condition in the Transition panel (Condition mode) gets autocomplete over datamodel variables/channels (see `transitions-editing.md`, `monaco-code-editor.md`).
- Conditions are rendered on edge labels in brackets, e.g. `[x > 5]`.
- A condition referencing an undeclared identifier feeds into the Channel Mapping Panel's "unresolved reference" detection (see `channel-mapping-panel.md`).

## UI behavior

No dedicated "conditions" UI beyond what's described in `transitions-editing.md` — conditions are edited through the same field as events, switched via an Event/Condition mode toggle.

## Internal architecture

`src/lib/scxml/condition-evaluator.ts` — a `ConditionEvaluator` class with these static methods, **verified against actual call sites, not assumed live just because they exist**:

| Method | Actually used in production? | Where |
|---|---|---|
| `decodeHtmlEntities` | Yes (internally, called by other methods below) | — |
| `extractVariables` | **Yes** | `src/lib/utils/datamodel-extractor.ts` (scanning `cond` expressions for referenced identifiers — feeds unresolved-channel-ref detection and `main_`-prefix warnings) |
| `parseCondition` | **Yes** | `src/lib/converters/converter-modules/edge-conversion.ts` (presumably to extract/inspect condition structure while building edge data) |
| `evaluateCondition` | **No confirmed call site found** — this is a real `Function`-constructor-based sandboxed evaluator (`new Function(...contextKeys, 'return ' + decoded)`) but nothing in `src/` outside the class file itself and its test invokes it |
| `formatCondition` | No confirmed call site |
| `getConditionSummary` | No confirmed call site |
| `usesVariable` | No confirmed call site |
| `createTestContext` | No confirmed call site — notably contains **domain-specific default-value heuristics** keyed on substring matches (`Pressure`/`_bar` → 0.0, `_onoff`/`Present` → false, `Time`/`timeout` → 0, `conf_` → 1.0, `alert`/`error` → false) that strongly suggest this was built for a simulation/testing feature that either was never finished or has since been removed from the UI |

This is strong evidence of a **partially-built or since-removed "test/simulate this condition" feature** — the evaluator, formatter, and summary/test-context generation methods form a coherent toolset for interactively testing conditions against sample values, but no UI in the current codebase exposes it.

## Relevant components

None directly render condition-evaluation UI; the Transition panel (`transition-panel.tsx`) is the authoring surface for condition text itself (see `transitions-editing.md`).

## Relevant state/store

None dedicated.

## Relevant utilities

`src/lib/scxml/condition-evaluator.ts`, `src/lib/utils/datamodel-extractor.ts`, `src/lib/converters/converter-modules/edge-conversion.ts`.

## SCXML behavior

A `cond` attribute is a plain ECMAScript boolean expression per the W3C spec (`datamodel="ecmascript"` in this app's default template — see `src/lib/consts/default_scxml_template.ts`). This app does not restrict condition syntax beyond what the runtime/generator itself would accept; `ConditionEvaluator.decodeHtmlEntities` exists because conditions can arrive HTML-entity-encoded (e.g. `&lt;`/`&gt;`/`&amp;&amp;`) from certain XML round-trips, and downstream consumers need the decoded form to extract variable names correctly.

## Validation rules

No dedicated "condition syntax" validator exists — `SCXMLValidator` does not parse/type-check `cond` expressions; a condition with a syntax error would only surface as a runtime failure in the downstream C# generator, not as an editor-time error. This is a real, confirmed validation gap.

## Related features

- `transitions-editing.md` — the primary authoring UI for condition text.
- `channel-mapping-panel.md`, `config-panel.md` — both rely on `datamodel-extractor.ts`'s expression scanning, which in turn calls `ConditionEvaluator.extractVariables`.
- `scxml-validation.md` — the `main_`-prefix warning pass also scans expression attributes including `cond`.

## Related files

`src/lib/scxml/condition-evaluator.ts`, `src/lib/utils/datamodel-extractor.ts`, `src/lib/converters/converter-modules/edge-conversion.ts`.

## Tests

No dedicated test file for `condition-evaluator.ts` was found in this pass — notably, even the seemingly-important `evaluateCondition` sandboxed-execution method has no test coverage, consistent with it not being wired into any live feature.

## Known limitations

- **No condition syntax validation** — malformed `cond` expressions are not caught until they fail at runtime on the actual hardware/generator.
- Roughly two-thirds of `ConditionEvaluator`'s public API (`evaluateCondition`, `formatCondition`, `getConditionSummary`, `usesVariable`, `createTestContext`) is dead code from the current UI's perspective — a real "test this condition against sample values" feature appears to have been planned or removed, and this evaluator is its only remaining trace.
- `extractVariables`'s regex-based identifier extraction (`\b([a-zA-Z_][a-zA-Z0-9_]*)\b`) does not understand string literals — a string literal containing what looks like an identifier (e.g. `cond="status === 'Pressure'"`) would incorrectly extract `Pressure` as a variable reference.

## Important edge cases

- `evaluateCondition`'s use of the `Function` constructor is documented in its own comment as "better security than eval" — this is true in the narrow sense that `Function`-constructed code doesn't have closure access to the surrounding scope the way `eval` would, but it is still full arbitrary-code execution over whatever `context` values are passed in; if this method is ever wired into a live feature (e.g. a future "test condition" UI), treat it as executing untrusted-ish user input and scope its `context` carefully.

## Things that must NOT be changed

- Do not assume `evaluateCondition`/`createTestContext`/etc. are safe to delete as "obviously dead code" without first confirming with whoever owns this codebase whether a condition-testing feature is planned — the domain-specific default-value heuristics in `createTestContext` (Pressure/onoff/Time/conf_/alert patterns) represent non-trivial, intentional domain knowledge that would be costly to reconstruct if deleted and later needed.

## Previous design decisions

No plan/spec document in `docs/superpowers/` mentions a condition-testing or condition-evaluation feature by name — the existence of a fully-built-but-unused evaluator/formatter/summary/test-context toolset, with no corresponding UI or test coverage, is itself the strongest available evidence that such a feature was scoped and partially built (likely for an in-editor "simulate this transition" capability) but never completed or was later stripped from the UI while the underlying utility class was left in place.
