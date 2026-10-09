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

---

## 10. Multiple Initial-State groups (#3) are live-restructured into a real `<parallel>` element, not just displayed as if they were

### Context
Decision #3 lets multiple disconnected Initial-State work trees exist at one hierarchy level, but treats this purely as flat, unrelated siblings at the document level — it establishes the *connectivity* rule, not the *concurrency* semantics real SCXML `<parallel>` implies. A prior attempt to give this real `<parallel>`/region structure (commit `801145d`) was implemented and then reverted (`bf0ab49`).

### Decision
The moment a container has 2+ distinct Initial-marked work trees, the editor restructures the actual document (not a display-only or export-only view) into a real `<parallel>` element — one region per work tree, each wrapped in its own synthetic region `<state id="{initialId}_region">` (see #11 — a single-member tree was originally left bare; that was superseded). The synthetic `<parallel>`/region elements are marked `viz:auto-parallel="true"`/`viz:auto-region="true"` so this is distinguishable from a hand-authored `<parallel>`, which is never touched. If the container later drops back below 2 groups, it is symmetrically unwrapped back to flat siblings — there is no one-way "once parallel, always parallel" ratchet.

### Reason
`docs/parallel-states-requirement.md`'s "Support for N-Parallel Machines" phase calls for genuine parallel-machine semantics, not just a visual arrangement of disconnected trees — decision #3 alone (connectivity-only) does not satisfy that on its own. The prior `801145d` attempt shows this was tried once already; per the user's explicit direction this reintroduction is deliberately scoped **narrower** than that attempt — automatic-grouping-triggered only, with the diagram kept flattened/non-drillable and no visible wrapper box, rather than a general manual "convert to parallel" feature with its own visible state box.

### Constraints
- Depends on decision #3's union-find connectivity analysis (`initial-group-utils.ts`) as its grouping input — a change to that analysis changes what triggers wrapping here too.
- `collectEffectiveStateChildren` (`state-registry.ts`) must keep flattening an auto-wrapped `<parallel>`'s members into its container's effective child list, or the "no visible wrapper, no drill-down needed" UI requirement breaks.
- A hand-authored `<parallel>` (no marker) must never be touched by this normalization, flattening, or wrapper-synthesis logic.
- See `.claude/features/parallel-state-auto-grouping.md` for the full implementation (normalization algorithm, layout pipeline ordering, wrapper node, divider overlay, group-drag, region-crossing connection guard).

### Alternatives
**Directly evidenced, not inferred**: commit `801145d` implemented `<parallel>`/region structure with the group shown as its own labeled box; it was reverted in `bf0ab49`. There is also a separate, unrelated, not-yet-merged sibling branch `new-parrallel-state-design` implementing a different, *manual* region-drilldown editing view for existing `<parallel>` states — designed to coexist with this feature via the `viz:auto-parallel` marker, but not integrated as of this writing.

### Evidence
`src/lib/utils/parallel-group-normalization.ts`, `src/lib/utils/parallel-group-markers.ts`, `src/stores/editor-store.ts` (`normalizeContent`, the single choke point), `docs/parallel-states-requirement.md`, commits `801145d`/`bf0ab49`.

### Status
Accepted, amended twice: by #11 (the "single-member tree used bare" clause no longer holds) and by #12 (superseding the marker-based mechanism — no `viz:auto-*` markers, the compound state itself becomes the `<parallel>`, hand-authored `<parallel>` is no longer exempt, and regions are drawn as columns rather than flattened by marker). The core decision — live restructuring into a real `<parallel>` — still holds.

---

## 11. Every auto-wrapped `<parallel>` region — including a single-member one — gets its own `*_region` wrapper state; a `<parallel>`'s direct children are never bare leaf states

### Context
Decision #10's original implementation gave a 2+-member work tree its own synthetic `viz:auto-region="true"` wrapper `<state>` (since flat, mutually-exclusive siblings can't sit directly inside `<parallel>` without changing their meaning to "concurrently active"), but left a single-member work tree bare — that member's own `<state>` element was used directly as the region, with no wrapper. The user explicitly requested a single, uniform structure instead: every region, regardless of member count, wrapped in its own `<state id="{initialId}_region" initial="{initialId}">` containing the actual member(s).

### Decision
`applyWrapDecision` (`src/lib/utils/parallel-group-normalization.ts`) now always synthesizes a `viz:auto-region="true"` wrapper for every region of an auto-wrapped `<parallel>`, whether the underlying work tree has one member or several — `<parallel>`'s direct children are never bare leaf states. Scope is deliberately narrow: this applies only to the app's own auto-generated `<parallel>`/region structure (decision #10's normalization). A hand-authored `<parallel>` (no `viz:auto-parallel` marker) is unaffected — per #10's existing constraint, it is never touched by this logic, so a user-typed/pasted `<parallel>` with a bare leaf child is left exactly as written, with no live-blocking or static-validator enforcement added for that case.

### Reason
Explicit user request, stated with a concrete example (`<parallel><state id="state_1_region" initial="state_1"><state id="state_1"/></state>...</parallel>`) and an explicit enforcement instruction ("do not generate direct leaf children of `<parallel>`"). Scoping it to auto-generated structure only (rather than also policing hand-authored `<parallel>` content) was a deliberate choice confirmed with the user, preserving #10's existing "never touch hand-authored `<parallel>`" constraint rather than reversing it.

### Constraints
- Reading (not writing) still tolerates the old bare-single-member shape: `buildLogicalView`'s `isAutoRegion()` check, and the equivalent checks in `state-registry.ts`'s `collectEffectiveStateChildren`, `initial-group-utils.ts`, and `layout-positioning.ts`'s `isInitialViaAutoParallel`, all still have an `else` branch treating an unwrapped region as a single-member region. This is a deliberate one-time-migration path, not dead code: a document saved before this decision (or one whose `viz:auto-parallel` marker was hand-added without a per-region wrapper) round-trips correctly and gets re-wrapped into the current shape the next time `normalizeParallelGroups` runs — normalization always runs on load (`setFileInfo`) and on every content mutation (`setContent`), so this transient state is never user-visible for long.
- `wouldCrossParallelRegions` (`parallel-region-connection-validation.ts`) already handled both bare and wrapped regions generically (it derives the region id from the ancestor chain rather than assuming a fixed depth), specifically because a hand-authored `<parallel>` can still have a bare region — no change was needed there.
- Does not extend to hand-authored `<parallel>` elements — do not add a validator or live-editing guard that flags a bare leaf child under a hand-authored `<parallel>` without a fresh, explicit decision to do so; that would reverse #10's "never touch hand-authored content" constraint, which this decision was deliberately scoped to preserve.

### Evidence
`src/lib/utils/parallel-group-normalization.ts` (`applyWrapDecision`), `src/lib/utils/parallel-group-normalization.test.ts`, conversation request citing the exact example above.

### Status
Accepted (the "every region is a `*_region` state" rule still holds, now via `buildRegions`). Its marker-related constraints — `viz:auto-region`, the bare-region read path, and exempting hand-authored `<parallel>` — are superseded by #12.

---

## 12. A compound `<state>` with 2+ Initial work trees becomes the `<parallel>` itself; no marker attributes; the editor only inserts `__root_parallel`

### Context
Under #10, a compound state with 2+ Initial work trees kept its `<state>` element and got a synthetic `<parallel id="{id}_parallel">` nested inside it, all tagged with `viz:auto-parallel` / `viz:auto-region` markers. With the default new-document template (`src/lib/consts/default_scxml_template.ts`), every document starts with `<state id="main_region">`, so in practice every auto `<parallel>` sat under a `<state>` wrapper. The user asked (1) that there be no state wrapper above the `<parallel>` tag, (2) that the editor never make a `<parallel>` of its own — the user's own state converts — and (3) that all marker attributes be removed.

### Decision
`normalizeParallelGroups` (`src/lib/utils/parallel-group-normalization.ts`):
- A compound `<state>` with 2+ Initial work trees becomes a `<parallel>` in place (same object, moved from its parent's `.state` to `.parallel`): it keeps its id, transitions, onentry/onexit and `viz:` attributes, loses `@initial`/`<initial>`, and each work tree goes into its own `<state id="{initialId}_region" initial="{initialId}">` (#11). Children outside every work tree go into **one extra region** of their own (the user chose "convert anyway" over a nested fallback or blocking).
- **Any** `<parallel>` (converted or hand-written; nothing tells them apart) with fewer than 2 regions turns back into a `<state>`. Its sole region is unwrapped into it, the region's `initial` becoming the state's (`liftSoleRegion`, superseding the original "regions are kept as they are" — the user found the leftover `X_region` wrapper node confusing). The region is kept, and becomes `initial`, when it's a state in its own right: no child states, content of its own (transitions, actions, history, notes), or targeted by a transition.
- The `<scxml>` root can't be a `<parallel>`, so 2+ root-level work trees go into one inserted `<parallel id="__root_parallel">` — the only element the editor ever inserts, recognized by its reserved id (`parallel-structure.ts`'s `isRootParallel`, allowing a `_2`… clash suffix). New root-level work trees join it as regions; it's removed once fewer than 2 regions are left.
- No `viz:auto-*` markers are written. Older documents are migrated on the next pass: markers are stripped, and an old `<state id="X" initial="X_parallel"><parallel id="X_parallel" viz:auto-parallel="true">…` is collapsed so X itself is the `<parallel>`.

### Constraints
- Regions are drawn as **columns, not nodes**, for every `<parallel>` (`parallel-structure.ts`'s `getDisplayChildEntries` / `getRegionDisplayEntries`, used by `state-registry.ts`): a region's contents show directly inside the parallel, separated by the divider lines, with no region name shown (the user asked for the column labels to be removed). An empty region, or a region that is itself a `<parallel>`, is shown as a node. The rule is positional ("direct child of a `<parallel>`"), not name- or marker-based — chosen by the user over hiding by `*_region` naming or bringing back a region marker. Cost: a region state itself can't be selected in the diagram (e.g. to edit its own actions or transitions; transitions on a region element have no node to start from). `__root_parallel` is invisible; its regions' contents show at root level. Badges: a column member's Initial badge comes from its region's `initial` (`isInitialInRegionOf` in `layout-positioning.ts`).
- A region of a `<parallel>` is always active, so it has no Initial designation: `ToggleInitialStateCommand` refuses it, `isMarkedInitial` is false, the State Actions panel hides the checkbox (`isParallelRegion`), and it gets no Initial badge. Copying regions carries them over as Initial, so pasting 2+ into an empty state makes it a `<parallel>`.
- Moving or copying keeps the tag: `scxml-manipulation-utils.ts`'s `findElementById` / `detachElementFromParent` return `{ element, tag }`, `addStateToDocument` takes the tag, the state clipboard records `copiedParallelIds`, and every tree walk there (detach, `isDescendantOf`, clone, `rewriteOrDropTransitions`) visits `.parallel` as well as `.state`. A `<parallel>` drop/paste target never gets an `initial`.
- A state with `<final>` children is never converted (`<parallel>` can't hold `<final>`); `initial-group-validator.ts` reports it.
- Because markers are gone, a hand-written `<parallel>` with only one region (e.g. in an opened file) is also turned into a `<state>` — accepted explicitly by the user.
- Adding a new state inside a `<parallel>` makes it a new, always-active region immediately.
- Supersedes #10's "never touch hand-authored `<parallel>`" constraint and the marker-based reading described in #10/#11.

### Evidence
`src/lib/utils/parallel-structure.ts`, `src/lib/utils/parallel-group-normalization.ts`, `src/lib/utils/initial-group-utils.ts` (`findParentEntry`, `isParallelRegion`), `parallel-group-normalization.test.ts`, `initial-group-utils.test.ts`, `toggle-initial-state-command.test.ts`, `state-registry.test.ts`, `initial-group-validator.test.ts`.

### Status
Accepted, except two points superseded by #13: children outside every work tree no longer get an extra region, and adding a state inside a `<parallel>` no longer makes a new region.

---

## 13. Children outside every work tree stay loose beside an inner `{id}__parallel`; connecting one to a region member moves it into that region

### Context
Under #12, a compound state's unassigned children went into one extra region of their own, which made them look Initial and moved them into a new column. Once there, connecting a work-tree state to them was blocked as a cross-region transition, so they could never join a tree. Adding a state inside a `<parallel>` likewise always created a new region. The user asked for unassigned states to be "left loose" so they can be connected later.

### Decision
`normalizeParallelGroups` (`src/lib/utils/parallel-group-normalization.ts`, `normalizeHost`):
- A compound `<state>` with 2+ work trees and **no** loose children still becomes the `<parallel>` itself (#12).
- With loose children, it stays a `<state>`: its regions go into an inserted, transparent `<parallel id="{id}__parallel">` (`parallel-structure.ts`'s `innerParallelIdFor` / `isInnerParallel`, `_2`… clash suffix allowed), its `initial` points at it, and the loose children stay beside it, unmarked. This is the same shape the root already used with `__root_parallel`.
- `absorbLooseIntoRegions`: a loose child connected by a transition (either direction, directly or through other loose children) to a direct member of exactly **one** region moves into that region. A loose component touching 2+ regions stays loose. This applies at the root too, where such a transition used to exit `__root_parallel` instead.
- Once no loose child is left, the inner parallel is dropped and the state becomes the `<parallel>` again. With fewer than 2 regions left, the inner parallel is unwrapped like `__root_parallel`.
- Canvas "Add State" while viewing inside a `<parallel>` adds a loose state (`addLooseStateToParallel` in `scxml-manipulation-utils.ts`): the `<parallel>` becomes a `<state>` holding its regions in `{id}__parallel`, with the new state beside it.

### Constraints
- Transparency is positional and kind-based: `isTransparentParallel(el, kind)` — `__root_parallel` only directly under `<scxml>` (`'root'`), `{id}__parallel` only directly under a `<state>` (`'state'`). `getChildEntries` / `getDisplayChildEntries` / `getInitialIds` / `isParallelRegion` / `collectParallelGroups` / `isInitialState` see through it. Initial-group analysis must not: `groupAnalysisKind` now maps both `'root'` and `'state'` to the new `'opaque'` kind, which counts the transparent parallel as one child.
- A state with `<final>` children is still never converted (no inner parallel is created for it).
- Not done: a region member that loses its last transition to the work tree is **not** moved back out to loose; it stays in its region.
- Unmarking the last Initial State of a region (`ToggleInitialStateCommand`'s `dissolveRegion`) dissolves the region: its states go back out as loose children beside the `<parallel>` (a converted `<parallel>` becomes a `<state>` holding its remaining regions in `{id}__parallel`), so with fewer than 2 regions left the normal unwrap reverts it to a compound state. Done on the gesture, not in `normalizeParallelGroups`, so a hand-written region with no `initial` isn't dissolved on load; removing a region's `initial` by typing in the XML editor therefore doesn't dissolve it. A region with its own transitions/actions is left alone.

### Evidence
`parallel-group-normalization.test.ts` ("loose states" block), `scxml-manipulation-utils.test.ts` (`addLooseStateToParallel`), `state-registry.test.ts` (inner parallel registration).

### Status
Accepted.

---

## 14. Parallel states can't be nested

### Context
Under #10–#13 a container with 2+ Initial work trees becomes a `<parallel>`. If that container is inside a parallel's region, or one of its work trees already holds a parallel, the result is a `<parallel>` inside another `<parallel>`. Connecting a loose state that holds a parallel into a region (#13) did the same. The user asked to stop nested parallels.

### Decision
No `<parallel>` (including a transparent `__root_parallel` / `{id}__parallel`) may have a `<parallel>` ancestor. `src/lib/utils/parallel-nesting-rules.ts` holds the rule:
- `findNestedParallels` lists every nested `<parallel>`.
- `introducesNestedParallel(before, after)` normalizes copies of both documents and blocks if `after` has a nested parallel that `before` didn't. Nesting a document already had is left to the validator so it doesn't block unrelated edits.
- `wouldNestParallelIfMarkedInitial` and `wouldNestParallelIfConnected` apply the edit to a copy and run that check, so the rule always matches what `normalizeParallelGroups` would actually do.

Live gates: `ToggleInitialStateCommand` (the Initial checkbox stays clickable on purpose, so clicking it shows the refusal in the canvas warning banner — the user asked for a visible warning instead of a disabled box with a tooltip), `onConnect` / `isValidConnection`, paste and drag-to-nest (warning toast). Static: `validateParallelNesting` (`src/lib/validators/parallel-nesting-validator.ts`) reports hand-written nesting as an error.

### Reason
The user asked for it directly ("We need to restrict having nested parallel"). They gave no further reason. Checking a normalized copy, instead of restating the normalizer's conditions, keeps the gates from drifting when the normalizer changes.

### Constraints
- `normalizeParallelGroups` itself isn't guarded. Typing 2+ Initial ids inside a region in the XML editor still produces a nested parallel, which the validator then reports.
- Unmarking Initial is never blocked.

### Alternatives
The first version disabled the Initial checkbox, with the reason as its tooltip. The user rejected it ("instead of this can we give user a warning, so they can know"). The checkbox now stays clickable for this case, and only the "would merge two Initial State groups" case still disables it.

### Evidence
`parallel-nesting-rules.test.ts`, `parallel-nesting-validator.test.ts`, `toggle-initial-state-command.test.ts` ("refuses a second Initial State inside a region").

### Status
Accepted.
