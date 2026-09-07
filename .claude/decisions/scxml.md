# SCXML Representation, Parsing & Serialization Decisions

Covers how the app models SCXML in memory, and product-specific rules layered on top of the W3C spec (state/transition/parallel/compound/initial-state behavior at the document-model level — as opposed to their visual rendering, covered in `visual-diagram.md`).

---

## 1. Visual metadata stored in-band via a custom XML namespace, not a sidecar file

### Context
The editor needs to persist layout/style/routing data (position, size, colors, waypoints) that has no meaning to a real SCXML engine, without breaking the file's use as valid, portable SCXML.

### Decision
All such data is stored as `viz:`-prefixed attributes/elements (`viz:xywh`, `viz:rgb`, `viz:sourceHandle`/`viz:targetHandle`, `viz:waypoints`, `<viz:note>`) under the namespace `http://visual-scxml-editor/metadata`, directly inside the `.scxml` file — not in a separate `.json`/`.layout` companion file.

### Reason
Keeps the `.scxml` file a single, self-contained, portable artifact — sharing it, committing it to GitHub, or moving it between machines never requires tracking a companion file that could go stale or get separated. The namespace approach is fully ignorable by any real SCXML engine (including the downstream C# generator), and "Clean SCXML" export can mechanically strip it for that consumer.

### Constraints
- Every consumer of `viz:` data must treat it as fully optional/absent-tolerant — the design assumes graceful degradation (ELK auto-layout, default styling) when it's missing.
- Schema evolution requires a live migration path baked into write-back logic forever, not just a version bump — evidenced by `writeLayoutToSCXML` actively migrating at least two legacy namespace URIs (`http://scxml-viz.github.io/ns`, `urn:x-thingm:viz`) and an `ns1:` prefix to the current canonical form on every write.

### Alternatives
None found evidenced as having been implemented — the presence of two prior legacy namespace URIs strongly implies the namespace URI/prefix itself was iterated on at least twice, but no comment or doc discusses a sidecar-file alternative being considered and rejected.

### Evidence
`src/types/visual-metadata/index.ts` (`VISUAL_METADATA_CONSTANTS`), `src/lib/converters/converter-modules/visual-metadata.ts` (`writeLayoutToSCXML`'s legacy-namespace migration), `src/lib/metadata/visual-metadata-manager.ts`.

### Status
Accepted.

---

## 2. Transitions restricted to same-parent source and target ("cross-hierarchy" rule)

### Context
Plain SCXML allows a transition to target any state in the document regardless of nesting depth.

### Decision
This editor requires a transition's source and target to share the same parent state — validated as an error otherwise. Validator comments explicitly label this "Milestone 5 — 1C requirement."

### Reason
The "Milestone 5" label indicates this was a scoped product requirement (from a numbered milestone plan), not a W3C rule adopted incidentally. It's a load-bearing precondition for Initial-State-groups analysis (`initial-group-utils.ts` only examines direct-sibling edges), and pairs naturally with the drill-down navigation model (a transition jumping between hierarchy levels would be hard to represent when only one level is ever visible at once — see `visual-diagram.md` #1).

### Constraints
Any feature reasoning about transition connectivity (Initial-State groups, cross-hierarchy validation itself) can assume transitions never span hierarchy levels — this must remain true or those analyses become incomplete.

### Alternatives
None found evidenced.

### Evidence
`src/lib/validators/transition-validator.ts` (`validateCrossHierarchyTransitions`, "Milestone 5 - 1C" comment), `src/lib/utils/initial-group-utils.ts` (header comment relying on this rule).

### Status
Accepted.

---

## 3. Multiple independent Initial-State groups per hierarchy level

### Context
A real, documented product requirement: model N disconnected/parallel sub-machines as siblings at one level, each needing its own entry point, rather than the implicit "one Initial state per container" assumption.

### Decision
More than one direct child of a container may be marked Initial, as long as the resulting Initial-marked states are not connected (directly or transitively) by transitions — enforced as an "Initial State group" concept with both live UI blocking and static validation.

### Reason
Explicitly documented in `docs/parallel-states-requirement.md`, a dated requirements memo: "Enable Multiple Initial States... Support for N-Parallel Machines... Connectivity Checks... to ensure that parallel state machines remain entirely disconnected." The same document explicitly scopes this as **visual-editor-only** — "Focus strictly on the visual representation and editor functionality rather than the backend execution code" — meaning the downstream generator/runtime may not have a native "group" concept; this is purely an authoring-time correctness construct.

### Constraints
- Depends on the cross-hierarchy transition rule (#2) already holding.
- Unmarking the sole Initial state in a group is always allowed (even leaving zero Initial states temporarily) — a deliberate deadlock-avoidance choice distinct from the requirement doc's original text, refined during implementation.

### Alternatives
The requirement doc itself frames the *scope* decision (visual-only vs. runtime) as deliberate, but no alternative UI/validation design for the group concept itself is documented as considered and rejected.

### Evidence
`docs/parallel-states-requirement.md`, `docs/superpowers/plans/2026-07-17-multiple-initial-state-groups.md`, `src/lib/utils/initial-group-utils.ts`, `src/lib/commands/toggle-initial-state-command.ts`, commits `edd0d71` ("enhance initial group conflict handling with detailed reason for connection rejection"), `a78faf5`/`727a89e` (`<initial>` child-element form support).

### Status
Accepted.

---

## 4. Legacy `<initial>` child-element form is read, but normalized to the `@initial` attribute on write

### Context
SCXML allows specifying a container's initial child two ways: the `initial` attribute (space-separated, multi-value) or a legacy `<initial><transition target="X"/></initial>` child element (single-value only). Some existing/imported documents use the element form.

### Decision
`ToggleInitialStateCommand` reads and merges ids from **both** forms when determining current Initial markers, but always **writes back using only the attribute form**, deleting any pre-existing `<initial>` element in the process.

### Reason
Not documented in a dedicated note, but the effect is a one-time normalization eliminating "two sources of truth" for a given state's Initial status going forward — the attribute form is strictly more expressive (supports multiple values, needed for Initial-State groups), so the element form has no continuing purpose once a state has been toggled at least once through this app.

### Constraints
A file with `<initial>` elements this app hasn't touched yet will still round-trip correctly (both forms are read for validation/reachability purposes) — normalization only happens as a side effect of the user actually toggling that specific state's Initial flag through the UI.

### Alternatives
None found evidenced — no discussion of preserving the element form going forward.

### Evidence
`src/lib/commands/toggle-initial-state-command.ts`, `src/lib/utils/initial-group-utils.ts` (`getInitialIds` reading both forms), commits `a78faf5 feat: support <initial> child-element form in ToggleInitialStateCommand`, `727a89e feat: enhance isInitialState function to handle <initial> child-element form correctly`.

### Status
Accepted.

---

## 5. Transition "slots" — at most one transition per (event/timer/cond/always) kind between a given source/target/type

### Context
For two transitions between the same source/target/type, having more than one of the same semantic "kind" (e.g. two plain event-triggered transitions to the same target) is ambiguous/unintended in this product's authoring model.

### Decision
Every transition is classified into exactly one "slot" — `'event'`, `'timer'` (auto-generated delay events), `'cond'`, `'always'` (eventless), or `'invalid-both'` (has both event and cond, always an error) — and at most one transition may occupy each slot for a given (source, target, type) triple. Enforced identically by live UI blocking (on connect/edit) and a static validator.

### Reason
Built up incrementally, not as one single design: git history shows the event slot existing first, then eventless transitions added as a distinct `'always'` slot (`537d485 feat(transitions): support eventless transitions as a distinct slot`), then a further distinct timer slot for auto-generated time events (`d96bc2d feat(transitions): add distinct timer slot for auto-generated time events`), and finally formalized with validation rules and tests (`bee979d feat: implement transition slot validation rules and associated tests`). The commit message "Only one event-based transition is allowed between these two states" appearing as a literal user-facing string being fixed for the reconnect/anchor-move gesture (`f654aff`) shows this rule was extended to cover dragging an existing transition's endpoint, not just creating new ones.

### Constraints
Must be implemented once in a shared utility (`transition-slot-rules.ts`) and consumed by both live blocking and the static validator — never duplicated, or the two could silently diverge.

### Alternatives
The incremental build-up itself (event slot → eventless → timer) suggests each addition was a deliberate, separately-shipped extension rather than a single up-front design covering all four slot kinds — this is evolution, not a rejected-alternative situation.

### Evidence
`src/lib/utils/transition-slot-rules.ts`, `src/lib/validators/transition-slot-validator.ts`, `docs/superpowers/plans/2026-07-25-transition-slot-validation.md`, commits `537d485`, `d96bc2d`, `bee979d`, `f654aff`.

### Status
Accepted.

---

## 6. "after X" timer shorthand compiles to native `<send>`/`<cancel>` with ms baked into the stored expression

### Context
The downstream runtime interprets a bare `delayexpr` value as raw milliseconds with no unit conversion, but users think and author in seconds ("after 2s").

### Decision
`after 2s`/`after 714ms`/`after (expr) s` shorthand is translated into a native `<send>` (with `delay`/`delayexpr`) paired with a `<cancel>`, with any seconds-based value multiplied by 1000 and **baked directly into the stored `delayexpr` expression string** — not applied at render/runtime. The UI reverses this transformation for display so the multiplication is invisible to the user.

### Reason
Explicitly a response to a discovered runtime constraint, not an arbitrary choice — the runtime's `delayexpr` unit interpretation is outside this repo's control, so the workaround had to live in the authoring layer.

### Constraints
If the runtime's unit interpretation for `delayexpr` ever changes, every already-authored "after Xs" transition's *stored* expression would need migration, not just this code — the conversion is baked into data, not computed fresh at runtime.

### Alternatives
None found evidenced as considered (e.g. no sign of a "fix the runtime instead" discussion, consistent with the runtime being outside this repo).

### Evidence
`src/lib/utils/time-transition.ts` (`ensureMsConversion`), `docs/superpowers/plans/2026-06-24-time-transition-after-syntax.md`, commit `473dfd1 feat(time-transition): support ms-native delayexpr in "after X" syntax`.

### Status
Accepted.

---

## 7. SCXML type model mirrors `fast-xml-parser`'s object convention directly

### Context
The app needs a typed representation of parsed SCXML for TypeScript-safe access throughout validators, converters, and commands.

### Decision
`src/types/scxml/index.ts` types (`SCXMLElement`, `StateElement`, `TransitionElement`, etc.) use `fast-xml-parser`'s own `@_`-attribute-prefix / `#text` convention directly, rather than defining an abstracted, parser-agnostic object model.

### Reason
Not documented explicitly, but this avoids a translation layer between the parser's actual output shape and the app's types — reads and writes against parsed SCXML objects can use the library's native conventions everywhere.

### Constraints
Tightly couples the type system to `fast-xml-parser`'s specific conventions — replacing that library would require reworking these types, not just the parser call sites. Also causes the confirmed `.executable[]` shape mismatch (see below) since some in-memory editing code constructs a normalized shape the real parser doesn't produce.

### Alternatives
None found evidenced.

### Evidence
`src/types/scxml/index.ts`, `src/lib/parsers/scxml-parser.ts` (`XMLParser` configuration matching the type conventions).

### Status
Accepted (with a confirmed, documented consequence — see next entry).

---

## 8. Executable-content editing shape (`.executable[]`) diverges from what the real parser produces

### Context
`OnEntryElement`/`OnExitElement`/etc. types declare an `executable?: ExecutableElement[]` array as a normalized representation of child actions.

### Decision (Inferred behavior, not a deliberate choice)
`fast-xml-parser` does **not** actually produce this `.executable[]` shape when parsing a real file from disk — it produces raw tag-name properties (`.assign`, `.send`, etc.). The `.executable[]` shape is instead constructed only by the app's own in-memory editing code (`scxml-manipulation-utils.ts`). This mismatch means at least one validator check (unknown-attribute detection for onentry/onexit children) is effectively dead code against real files, while required-attribute checks (which read raw tag-name properties) work correctly.

### Reason
No comment or commit acknowledges this mismatch — it is not something the team appears to have deliberately decided, and is documented here as **Inferred behavior**, per the instruction to label unintentional-seeming implementation details as such rather than presenting them as chosen.

### Constraints
Anyone touching this validator check or the executable-content editing shape should be aware of the mismatch before assuming either "side" reflects real file behavior.

### Alternatives
N/A — not a deliberate decision.

### Evidence
`src/types/scxml/index.ts` (`.executable[]` union), `src/lib/utils/scxml-manipulation-utils.ts:204-211` (constructs the shape), `src/lib/validators/w3c-validator.ts` (`validateStateChildren`/`validateExecutableContent`, the affected dead-against-real-files check).

### Status
Inferred behavior — not an accepted design decision, but current (unaddressed) reality.

---

## 9. Two independent serializers exist as a consequence of decision #2 in `architecture.md`, not a standalone choice

### Context
Content needs to be turned back into an XML string from two different in-memory representations (DOM, for Commands; object tree, for `VisualMetadataManager`/`fast-xml-parser`-based flows).

### Decision (Inferred behavior)
`BaseCommand.serializeXML` uses native `XMLSerializer` + a custom `formatXML` pretty-printer; `VisualMetadataManager.serializeWithVisualMetadata` uses `fast-xml-parser`'s `XMLBuilder` (with a `__PRESERVE__` marker workaround for boolean-looking attribute values the builder would otherwise mangle). These produce non-byte-identical formatting for logically equivalent content.

### Reason
This is a direct, structural consequence of `architecture.md` decision #2 (two mutation strategies) — no evidence exists that serialization duality was itself a considered, standalone design choice; it simply falls out of each mutation strategy needing to serialize back into its own representation's native format.

### Constraints
A document edited via both mutation strategies at different points in its lifecycle can show subtly different whitespace/formatting conventions across those edits — cosmetic, not semantic, but can make diffs look larger than the actual logical change.

### Alternatives
N/A — not an independently-made decision.

### Evidence
`src/lib/commands/base-command.ts` (`serializeXML`), `src/lib/metadata/visual-metadata-manager.ts` (`serializeWithVisualMetadata`, `preserveBooleanAttributes`).

### Status
Inferred behavior.
