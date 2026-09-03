# SCXML Editor — Development Constitution

This document is the single set of rules and invariants that apply **across the entire project**, regardless of which feature you're touching. It is written as imperative rules ("MUST"/"MUST NOT"/"SHOULD"), not as descriptive architecture — for the descriptive version, see `project/architecture.md`; for the reasoning/history behind a rule, see the cross-referenced file in `decisions/`.

**How to read a rule:**
- **[EXPLICIT]** — stated or clearly implied by a code comment, test, commit message, or existing doc. Breaking it contradicts something the project has said about itself.
- **[INFERRED]** — not stated anywhere, but the codebase behaves this way consistently and other code depends on it holding true. Treat as binding unless you have a specific reason to change it deliberately (and then update this document).

Every rule below is grounded in this repository. Nothing here is a generic best practice imported from outside — if a rule looks like generic advice, it's because this specific codebase visibly enforces or depends on it.

---

## 1. Overall Architecture

**1.1 — This app is a fully static export. Never introduce a dependency on a Node server, API route, or server-only environment variable at runtime.** [EXPLICIT]
`next.config.ts` sets `output: "export"`. The build produces static files with no server. `NEXT_PUBLIC_*` env vars are baked in at build time. See `decisions/architecture.md` #1, `decisions/configuration.md` #4.

**1.2 — SCXML mutation must go through one of exactly two mechanisms: the Command pattern (`src/lib/commands/*`) or the direct object-tree edit path (`src/lib/utils/scxml-manipulation-utils.ts`). Never invent a third.** [EXPLICIT]
Default to writing a Command for any new mutation with undo requirements. Only follow the direct-edit precedent for the four operations that already use it (connect, add-root-state, copy/paste, drag-to-reparent). See `project/coding-rules.md` §1, `decisions/architecture.md` #2.

**1.3 — Never mix `DOMParser`/`XMLSerializer` (used by Commands) with `fast-xml-parser`'s object-tree API (used by the direct-edit path and `VisualMetadataManager`) inside one function or mutation.** [EXPLICIT]
Every Command must finish via `BaseCommand.serializeXML`. Mixing the two produces inconsistent formatting and risks parsing the wrong representation. See `decisions/scxml.md` #9.

**1.4 — Validation (`SCXMLValidator`) and diagram rendering (`SCXMLToXStateConverter`) are independent pipelines. Do not make one depend on the other's output.** [INFERRED]
Both re-parse `content` independently; validation errors reach the diagram only indirectly via `useEditorStore().focusTarget`. A document with active errors must still render normally. See `decisions/architecture.md` #3.

**1.5 — New page-level logic belongs in a new hook under `src/app/_hooks/`, not inline in `src/app/page.tsx`.** [INFERRED, but load-bearing]
`page.tsx` is ~250 lines and contains almost no logic by design — it composes ~9 single-purpose hooks. Adding inline logic there reverses a deliberate extraction (evidenced by `DEVELOPER_GUIDE.md`'s stale description of the pre-extraction state). See `decisions/architecture.md` #4.

**1.6 — Every Command re-parses and re-serializes the *entire* document on every call. Do not attempt to optimize a single command to mutate a shared/cached document instance.** [EXPLICIT — by consistent design across all 16 commands]
This is what allows the flat, full-string history model to work uniformly regardless of mutation strategy. See `decisions/architecture.md` #5.

---

## 2. React Architecture

**2.1 — Use functional components with hooks. The only class component in the entire codebase is `ErrorBoundary`, and it must stay a class because React's error-boundary API requires it (`getDerivedStateFromError`/`componentDidCatch` have no hook equivalent).** [EXPLICIT — verified: exactly one `extends React.Component` in `src/`]
Do not convert `ErrorBoundary` to a function component — it would silently stop catching errors. Evidence: `src/components/ui/error-boundary.tsx`.

**2.2 — `src/lib/**` must not import React (with one narrow, justified exception).** [INFERRED, strongly held]
A repo-wide check confirms `src/lib/` is React-free except `src/lib/theme/use-is-dark.ts`, which is itself a hook and is arguably mis-located (it pairs with `src/lib/theme/theme.ts`'s framework-agnostic logic but needs `useState`/`useEffect` to observe the DOM). Keep new framework-agnostic logic (validators, converters, commands, utils) free of React imports — this is what makes them independently unit-testable without rendering.

**2.3 — Mark client components with `'use client'` only where the component actually needs client-side interactivity (state, effects, event handlers, browser APIs).** [INFERRED — Next.js App Router convention, applied selectively: 45 of 154 files use it]
Since this is a static export with no server components doing meaningful SSR work, this directive functions more as a documentation signal than a hard technical boundary in this specific app — but follow the existing pattern rather than adding it reflexively to every file.

**2.4 — Use `useXStore.getState()` (imperative) only from non-component code (Monaco providers, class methods, plain utility functions) that cannot use hooks — never as a shortcut to avoid a hook inside a component.** [EXPLICIT]
Established pattern in `src/lib/monaco/enhanced-scxml-completion.ts` (a Monaco provider, not a component) and `HistoryManager` (a singleton class). See `project/coding-rules.md` §5.

**2.5 — Select individual store fields (`useXStore(s => s.field)`); do not destructure an entire store in a component that re-renders frequently.** [EXPLICIT]
Documented convention in `project/coding-rules.md` §5, applied consistently across panels and `visual-diagram.tsx` (a performance-sensitive component).

**2.6 — Use refs to give stable, non-stale access to current values inside long-lived callbacks (event handlers, imperative API objects) — do not rely on closures over props/state that can go stale.** [EXPLICIT]
`use-host-api-bridge.ts` keeps `contentRef`/`configValuesRef`/`channelMappingsRef`/`eventsRef` in sync via effects specifically to avoid stale closures inside the imperatively-constructed `ScxmlEditorAPI` object. `visual-diagram.tsx` follows the same pattern extensively (`nodesRef`, `edgesRef`, `parsedDataRef`, etc.).

**2.7 — Follow the file's own existing pattern for module-level singletons/guards (e.g. Monaco's completion-provider registration guard) rather than introducing a different mechanism for the same problem.** [EXPLICIT]
`scxmlCompletionRegistered` in `xml-editor.tsx` prevents duplicate Monaco completion-provider registration across remounts — a deliberate, chosen-for-a-reason pattern (Monaco's registry is page-level, not component-scoped).

---

## 3. Component Boundaries

**3.1 — `src/components/diagram/`, `src/components/ui/`, `src/components/editor/`, `src/components/layout/`, `src/components/file-operations/` each own one concern. Do not add a Monaco-specific component under `diagram/`, or a ReactFlow-specific component under `ui/`.** [INFERRED — consistent directory organization]

**3.2 — `src/app/_components/` and `src/app/_hooks/` are page-local. Components/hooks placed there are not intended for reuse outside `src/app/page.tsx`'s composition.** [EXPLICIT — Next.js underscore-prefix convention, deliberately used here]
The underscore prefix is a Next.js App Router convention (excludes the folder from routing) that this project also uses as a "private to this page" signal. If a hook/component needs to be reused by e.g. a diagram component, promote it to `src/hooks/` or `src/components/`, don't reach into `_hooks`/`_components` from outside `app/`.

**3.3 — Every state type (simple/compound/parallel/final) renders through the single `SCXMLStateNode` component, discriminated by `data.stateType`. Do not create a new per-type node component.** [EXPLICIT — a prior per-type design was deliberately deprecated]
`src/types/hierarchical-node.ts` explicitly marks `CompoundStateNodeData`/`ParallelStateNodeData` `@deprecated - removed - use SCXMLStateNode with data.stateType instead`. History is the one sanctioned exception (`HistoryWrapperNode`, purely decorative). See `decisions/visual-diagram.md` #2.

**3.4 — Side panels (Config, Channel Mapping, Events, Validation, Transition, State Actions, GitHub) must use the shared `Panel`/`FormActions`/`FooterAddButton`/`PanelEmptyState`/`inputClass` primitives from `src/components/ui/primitives/`, not custom chrome.** [EXPLICIT — consistent across all 7 panels]
See `.claude/workflows/adding-a-side-panel.md`.

**3.5 — Only one side panel may be visible at a time (`usePanelStore.activePanel` is a single value, not a set). A new panel must fit into this single-slot model.** [EXPLICIT]
See `decisions/ui-ux.md` #1.

**3.6 — Commands are invoked from `visual-diagram.tsx` via lazy `require('@/lib/commands/...')` inside handlers, not top-level imports. Follow this existing pattern in that file specifically rather than mixing styles.** [EXPLICIT — consistent, deliberate pattern in that file]
Likely to avoid a circular import or bundle-splitting concern. See `project/coding-rules.md` §7.

---

## 4. State Management

**4.1 — There are 7 independent Zustand stores (`editor`, `history`, `hostAPI`, `panel`, `github`, `stateClipboard`, `actionClipboard`). Do not combine them into one root store, and do not add a new global concern to an existing store if it's a genuinely separate lifecycle/concern — give it its own store.** [EXPLICIT]
See `decisions/state-management.md` #1.

**4.2 — `useHistoryStore` holds a linear array of full-document string snapshots plus a cursor — never a diff, patch, or reference to a Command object.** [EXPLICIT]
Every `HistoryEntry.content` is a complete SCXML string. Do not "optimize" this into a diff-based system without re-architecting the two-mutation-strategy split it depends on (`decisions/architecture.md` #2). See `decisions/state-management.md` #2.

**4.3 — Any new content-mutating entry point must check `isUpdatingFromHistory` before calling `historyManager.track*()`.** [EXPLICIT]
Skipping this check during an undo/redo restoration re-tracks the restoration as a new history entry — a real regression risk. See `features/undo-redo-history.md`.

**4.4 — `usePanelStore`'s `setActivePanel`/`togglePanel` must remain wrapped in `queueMicrotask`. Do not revert to a synchronous `set()`.** [EXPLICIT — fixes a real, previously-encountered React warning]
See `decisions/state-management.md` #4, commit `f8594e2`.

**4.5 — `useGithubStore` must only persist `accessToken`/`user`/`linkedRepo`. Transient operation state (`isConnecting`, `isSyncing`, `error`, `deviceCode`) must never be persisted.** [EXPLICIT]
A persisted `isSyncing: true` would survive a reload and appear permanently stuck. Any new field added to this store must be deliberately categorized. See `decisions/state-management.md` #5.

**4.6 — History debouncing durations (500ms text, 300ms position/resize) are tuned to the product's stated UX goal ("type quickly = one undo step"). Do not change them without re-validating against real interaction.** [EXPLICIT — matches `README.md`'s documented promise]

---

## 5. Data Flow

**5.1 — `useEditorStore.content` is the single source of truth for the document. Both the code editor and the diagram read from it and write back to it via the same `setContent()` — never maintain a separate local copy of "the document" that could drift.** [EXPLICIT]
See `features/two-way-sync.md`.

**5.2 — A content change always triggers a full re-parse on both the validation side and the diagram side — there is no incremental/differential update path. Do not assume partial recomputation is safe without re-checking every dependent computation (e.g. the converter's global, cross-edge handle-traffic scoring).** [INFERRED — architectural consequence, not a deliberate performance decision]
See `decisions/performance.md` #2.

**5.3 — Cross-component "navigate to and highlight this" requests go through `useEditorStore.focusTarget`, resolved via `resolve-focus-target.ts` — do not build a second, parallel navigation-request mechanism.** [EXPLICIT]

**5.4 — Data flows into three different "ownership" categories, and a new host-bridge feature must pick the correct one deliberately: (a) SCXML-persisted (Config `conf_` values — travels with the file), (b) host-store-only (Channel Mappings, Events/User Actions — travels with the deployment, never written to SCXML), (c) transient UI/session state (selection, panel visibility — never persisted anywhere).** [EXPLICIT]
See `decisions/integrations.md` #4.

---

## 6. SCXML Semantics

**6.1 — A transition's source and target must share the same parent state ("cross-hierarchy transition rule"). This is a product rule, not a W3C requirement — do not relax it without auditing every feature that assumes it (Initial-State-group analysis, in particular).** [EXPLICIT — validator comment cites "Milestone 5 — 1C requirement"]
See `decisions/scxml.md` #2, `src/lib/validators/transition-validator.ts`.

**6.2 — More than one state at the same hierarchy level may be marked Initial, as long as the resulting Initial-marked states are not connected (directly or transitively) by transitions ("Initial-State groups"). This rule must be enforced identically by live UI blocking and the static validator — never duplicate the logic.** [EXPLICIT — dedicated requirement doc exists]
Both consume `src/lib/utils/initial-group-utils.ts`. See `decisions/scxml.md` #3, `docs/parallel-states-requirement.md`.

**6.3 — Unmarking a state's Initial flag is always allowed, even if it's the sole Initial marker in its group. Marking a state Initial can be blocked (would merge two groups); unmarking cannot.** [EXPLICIT — deliberate deadlock-avoidance]
See `features/initial-state-groups.md`.

**6.4 — At most one transition may occupy each "slot" (`event`/`timer`/`cond`/`always`) between a given (source, target, type) triple. A transition with both `event` and `cond` is always invalid.** [EXPLICIT]
Enforced by `src/lib/utils/transition-slot-rules.ts`, consumed by both live blocking and `transition-slot-validator.ts`. See `decisions/scxml.md` #5.

**6.5 — A state with any `<state>`/`<parallel>`/`<final>`/`<history>` children must declare `@initial` or an `<initial>` child.** [EXPLICIT — W3C-adjacent, enforced by `validateCompoundStates`]
Known gap: this check does not currently recurse through `<parallel>` children — do not assume parity between `<state>`-nested and `<parallel>`-nested compound states until this is fixed. See `features/scxml-validation.md`.

**6.6 — `type="internal"` transitions may only target themselves (self-loop). A targetless `type="internal"|"external"` transition with `<assign>` children is a distinct concept ("internal event reaction") — not the same as an ordinary transition and never rendered as an edge.** [EXPLICIT]

**6.7 — Event names use comma (not space) as the multi-event separator; a space-containing string is one event name.** [EXPLICIT — a deliberate, tested behavior change, per `transition-validator.test.ts`]
Also true for state ids: `parseStateIdList` treats a space-containing known id as one token, greedily matching the longest known id, only falling back to naive space-splitting if no id in the document contains a space.

**6.8 — Several validation rules exist specifically to prevent failures in the downstream C# code generator, not just W3C non-compliance: no C# reserved words or digit-leading characters as event names, no wildcard `*` in `assign/@location`, every `<assign>` target must be declared in `<datamodel>`, and two event names must not collapse to the same generator-sanitized identifier.** [EXPLICIT — traced to a real production postmortem]
Not all of these have an automated rule yet — see `docs/invalid-event-identifiers.md` and `decisions/validation.md` #3 before assuming full coverage exists.

**6.9 — The datamodel naming conventions `conf_` (per-deployment config value), `this_` (physical channel reference), and `main_` (portability anti-pattern, flagged by validation) are load-bearing across multiple features. Do not repurpose these prefixes for anything else.** [EXPLICIT]
See `project/terminology.md`, `decisions/naming-conventions.md` #1.

---

## 7. SCXML Parsing

**7.1 — `SCXMLParser` (structural/syntax) and `SCXMLValidator` (semantic) are separate classes with separate responsibilities. A new correctness check belongs in whichever one matches its nature — do not add semantic checks to the parser or syntax checks to the validator.** [EXPLICIT — stated directly in `scxml-parser.ts`'s own comment]
See `decisions/validation.md` #2.

**7.2 — The parser runs a hand-rolled XML syntax checker (`validateXMLSyntax`) *before* `fast-xml-parser`'s own validator, deduplicated by line/column. Do not remove the custom checker without confirming (via a comparison across malformed-input test cases) that the library's validator alone provides equivalent line/column precision and mid-typing tolerance.** [EXPLICIT — deliberate, substantial custom investment]
See `decisions/error-handling.md` #2.

**7.3 — The parsed object shape follows `fast-xml-parser`'s own convention (`@_`-prefixed attributes, `#text` for text content) — do not introduce a parallel, abstracted object model for parsed SCXML.** [EXPLICIT]
See `decisions/scxml.md` #7.

**7.4 — Be aware: the app's own in-memory action-editing code constructs a `.executable[]` array shape that the real parser does **not** produce when loading a file from disk. Any new validator/feature reading action content must read the raw tag-name properties (the real parse shape), not assume `.executable[]` is populated for a freshly-loaded file.** [INFERRED — confirmed shape mismatch, a real gap not a deliberate design]
See `decisions/scxml.md` #8.

---

## 8. SCXML Serialization

**8.1 — Two independent serializers exist and must not be cross-contaminated: `BaseCommand.serializeXML` (native `XMLSerializer` + custom `formatXML`) for the Command path, and `VisualMetadataManager`'s `fast-xml-parser` `XMLBuilder` for parse/clean-export boundaries. A Command must never call the `XMLBuilder` path, and vice versa.** [EXPLICIT]
See `decisions/scxml.md` #9, `features/scxml-serialization.md`.

**8.2 — Do not remove the `__PRESERVE__` marker workaround in `VisualMetadataManager` without confirming `fast-xml-parser`'s `XMLBuilder` no longer coerces `"true"`/`"false"` string attribute values into bare XML booleans.** [EXPLICIT — a currently-necessary library-behavior workaround]

**8.3 — "Clean" (metadata-stripped) export must attempt structural stripping first, then regex-based stripping as a fallback. Do not let the final fallback (returning original, un-stripped content) fail silently without at least being aware it's a known risk — do not add a fourth silent fallback tier without addressing this one first.** [EXPLICIT tiers 1–2; the final silent fallback is a flagged risk, not an endorsed design]
See `decisions/error-handling.md` #3.

**8.4 — `viz:xywh` must be written comma-separated (`"x,y,w,h"`). Do not introduce a space-separated write path — this is a known, unresolved bug in a couple of `scxml-manipulation-utils.ts` call sites, not a second valid format.** [EXPLICIT rule; the bug is INFERRED/unintentional]
See `project/scxml-rules.md`.

**8.5 — Legacy `viz:` namespace URIs/prefixes must be migrated to the canonical form (`http://visual-scxml-editor/metadata` / `viz:`) on write-back, following the existing pattern in `writeLayoutToSCXML`. If the canonical namespace is ever changed again, add a third migration case rather than breaking old files.** [EXPLICIT]
See `decisions/backward-compatibility.md` #1.

---

## 9. Visual Diagram Behavior

**9.1 — Only one hierarchy level is ever rendered on the canvas at a time. Compound states never show their children nested inside their box. Do not re-enable the converter's nested `parentId`/`extent`/`expandParent` wiring for actual rendering without a deliberate, wide-reaching decision to abandon drill-down navigation.** [EXPLICIT — stated as a headline product feature in `README.md`]
See `decisions/visual-diagram.md` #1.

**9.2 — ELK auto-layout must run per hierarchy level (`hierarchical: false`), never as a whole-tree hierarchical layout, consistent with 9.1. `ContainerLayoutManager` and the `hierarchical: true` ELK path are dead code — do not build on them without first verifying they're actually reachable.** [EXPLICIT]
See `decisions/visual-diagram.md` #4.

**9.3 — A node's stored `viz:xywh` position always wins over anything ELK computes. Width is a floor (can grow to fit content, e.g. after rename, but never auto-shrinks). Only an explicit `NodeResizer` drag may make a node narrower.** [EXPLICIT — enforced twice, in the converter and again in `visual-diagram.tsx`'s enhancement pass]
See `decisions/visual-diagram.md` #5.

**9.4 — Any command that changes a state's rendered width/height (rename, type change, actions edit, initial toggle) must call `clearWaypointsForTouchingTransitions` before returning.** [EXPLICIT]
Otherwise a stale persisted waypoint path can visually cut through the resized node, since the edge renderer always prefers a persisted path over dynamic routing. See `decisions/editing.md` #5.

**9.5 — Selection is not ReactFlow's native selection model, except during an actual marquee (box) drag, gated by `marqueeStartedRef`. Do not wire a new interaction assuming native RF click/selection semantics apply to states.** [EXPLICIT — extensively documented via inline comments explaining a real, previously-encountered conflict]
See `decisions/visual-diagram.md` #7.

**9.6 — Edge path rendering follows a strict, mutually-exclusive priority chain: waypoints → self-loop → parallel-offset → obstacle-avoiding A* → plain smoothstep. Do not blend branches (e.g. a self-loop never gets obstacle avoidance).** [EXPLICIT]
See `decisions/visual-diagram.md` #8.

**9.7 — Sticky notes are always 500px wide, cannot be manually resized, render behind all other elements, and must never push/affect other nodes when moved.** [EXPLICIT — directly traced to explicit user feedback commits]
See `decisions/visual-diagram.md` #9.

**9.8 — Conditional transitions render amber, not red (red was explicitly rejected for reading as an error state). Transitions do not animate (explicitly requested removal).** [EXPLICIT — both traced to specific feedback commits]
Do not revert either without confirming the underlying preference has changed. See `decisions/visual-diagram.md` #11, #12.

**9.9 — Do not remove the Windows trackpad pinch-zoom fix (`d3Zoom.wheelDelta` override) or the post-`ControlButton`-click scroll-drift correction without verifying (on real Windows hardware, and by testing marquee-select) that the underlying bugs they patch are actually fixed upstream in ReactFlow.** [EXPLICIT — both are responses to specific, real, previously-reported bugs]

---

## 10. State/Node Relationships

**10.1 — A state's parent/child relationship comes from ordinary SCXML nesting. Two independent hierarchy-building implementations exist (`src/lib/converters/converter-modules/state-registry.ts` for the diagram, `src/lib/validators/state-validator.ts`'s `buildStateHierarchy` for validation) — a fix to how nesting is interpreted in one must be checked against the other; they are not shared.** [INFERRED — a real architectural risk, not a deliberate split]
See `features/state-hierarchy-tree.md`.

**10.2 — A state's hierarchy registry is rebuilt from scratch on every conversion — never assume it persists or can be incrementally updated across renders.** [EXPLICIT]

**10.3 — "Compound" (dashed border, has children) is computed dynamically from whether any other node has this node's id as `parentId` — it is not a persisted or user-set flag on the state itself.** [EXPLICIT]

**10.4 — Deleting a state must remove transitions *originating* from it (implicit, as children of the removed element) and separately scan the *entire document* for transitions *targeting* it from anywhere else — these are two different removal mechanisms in one command, not one uniform pass.** [EXPLICIT]
See `src/lib/commands/delete-node-command.ts`, `features/state-editing.md`.

**10.5 — Renaming a state must cascade to rewrite every reference: transition targets anywhere in the document, `initial` attributes (token-aware, preserving multi-value lists), and embedded timer-event tokens. This is a stated product promise, not an implementation nicety — do not scope a rename operation more narrowly.** [EXPLICIT — "All transitions that reference this state update automatically!" in `README.md`]
See `decisions/editing.md` #4.

---

## 11. Transition/Edge Relationships

**11.1 — Every state node has 8 connection handles (4 sides × source + target), with ids `'top'|'bottom'|'left'|'right'` shared between the source/target pair on each side. This exact 4-string vocabulary is used throughout `viz:sourceHandle`/`viz:targetHandle` values, the layout handle-assignment cost model, and `getHandleAnchor`. Do not introduce a 5th side or rename a side string without updating all consumers together.** [EXPLICIT]
See `features/state-connections-handles.md`.

**11.2 — Multiple transitions landing on the same physical handle pair between two nodes must be visually fanned out (distinct offset/curvature), and creating a second transition in the same "slot" must be blocked before it's created — not merely flagged afterward.** [EXPLICIT]
See rule 6.4 and `decisions/scxml.md` #5.

**11.3 — A self-loop (source === target) is explicitly allowed for reconnection — do not reintroduce a same-node block without checking why it was removed.** [EXPLICIT — code comment notes this was previously blocked and deliberately un-blocked]

---

## 12. Layout and Positioning

**12.1 — Node dimension calculation must never factor in child count/content — sizing is based only on label text, state type, Initial-badge presence, and onentry/onexit action count, consistent with only one hierarchy level ever being visible (rule 9.1).** [EXPLICIT — stated directly in `node-dimension-calculator.ts`'s own comment]

**12.2 — Layout defects should be fixed with narrow, single-purpose helper modules layered on top of ELK's stock algorithm (following `adaptive-spacing.ts`/`chain-wrapping.ts`/`hub-centroid-nudge.ts`), not by replacing ELK or writing a bespoke layout engine from scratch.** [EXPLICIT — and specifically, edge bundling was tried and reverted in favor of this pattern]
See `decisions/visual-diagram.md` #6.

**12.3 — Handle-side auto-assignment for new/unrouted edges must use the traffic-aware, whole-diagram cost model (geometric directness + global handle-load + sibling-crossing penalty) — do not replace it with a simpler nearest-side heuristic without re-validating overall routing quality across a real diagram.** [EXPLICIT — extensively reasoned in inline comments]
See `decisions/performance.md` #4.

**12.4 — History-wrapper node sizing uses fixed-margin math, not ELK, despite its own doc comment calling this a "fallback" — it is the only implementation that exists and runs in production. Do not treat it as safe to remove.** [EXPLICIT, despite the stale comment]

---

## 13. User Interaction

**13.1 — Click / double-click / Ctrl-click on a state must go through the existing 250ms-timer disambiguation logic in `handleStateClick`, not native browser/ReactFlow click semantics.** [EXPLICIT]

**13.2 — Double-click enters inline rename mode directly on the canvas. This is the *only* discoverable way to rename a state on the canvas (no context menu exists — see rule 21). Do not remove it without providing an equivalent affordance.** [EXPLICIT — headline `README.md` feature]

**13.3 — Delete/Backspace must be suppressed whenever *any* side panel is open, not just the Validation panel.** [EXPLICIT — fixed in commit `385612c`]

**13.4 — A drag is distinguished from a click or an arrow-key nudge by `dragging === true` OR a ≥1px position delta — arrow-key nudges never set `dragging: true` in ReactFlow. Preserve this distinction in any new drag-related logic.** [EXPLICIT]

**13.5 — Marquee (box) selection requires holding Ctrl or Meta while dragging on empty canvas, and native ReactFlow `'select'` node-change events must only be honored while `marqueeStartedRef` is true.** [EXPLICIT]

**13.6 — Keyboard shortcuts must follow familiar OS/editor conventions (Ctrl/Cmd+Z/Y, Delete, Ctrl/Cmd+C/V) rather than inventing new bindings.** [EXPLICIT — documented for end users in `README.md`]

---

## 14. Validation

**14.1 — `SCXMLValidator.validate()`'s 16 passes run in a fixed, dependency-sensitive order. Do not reorder them or assume a pass is self-contained — later passes rely on the id set and hierarchy maps built in pass 1.** [EXPLICIT]
See `decisions/validation.md` #1, `.claude/workflows/adding-a-validation-rule.md`.

**14.2 — A rule needing both live UI blocking and static (post-hoc) validation must live in one shared utility (`transition-slot-rules.ts`, `initial-group-utils.ts` are the existing examples) consumed by both — never duplicated independently in the validator and in `visual-diagram.tsx`.** [EXPLICIT]
See `decisions/validation.md` #4.

**14.3 — Unknown-attribute errors should include a Levenshtein-based "Did you mean 'X'?" suggestion (threshold 2) against the element's attribute whitelist in `attribute-schemas.ts`, matching the existing convention.** [EXPLICIT]

**14.4 — Do not assume `ValidationError.code` is populated — no validator currently sets it. Do not add logic that branches on `code` without deciding to populate it consistently everywhere first.** [INFERRED — an unfinished provision]

**14.5 — New validation rules motivated by real downstream-generator failures should cite `docs/invalid-event-identifiers.md` and close one of its still-unaddressed pitfalls where relevant, rather than inventing an unrelated new check.** [EXPLICIT rationale, though the specific remaining gaps are INFERRED from a code audit]

---

## 15. Error Handling

**15.1 — Commands must report failure via `{success: false, error}`, never by throwing. A thrown exception from inside a command's execution would not be caught by the app's `ErrorBoundary` (which only catches render-phase errors, not event-handler errors).** [EXPLICIT]
See `decisions/error-handling.md` #1, #4.

**15.2 — Do not assume `ErrorBoundary` provides safety-net coverage for Command execution, async code, or timers — it structurally cannot. New resilience work for those paths needs its own try/catch at the call site.** [EXPLICIT constraint of React's error-boundary API, applied here]

**15.3 — Specific, anticipated failure modes (e.g. a GitHub push 409 conflict) should get a specific, actionable message ("pull first") rather than falling through to a generic error toast.** [EXPLICIT]
See `decisions/error-handling.md` #5.

**15.4 — The hand-rolled XML syntax checker (`validateXMLSyntax`) must not be removed in favor of relying solely on `fast-xml-parser`'s validator without confirming equivalent error precision and mid-typing tolerance.** [EXPLICIT — see rule 7.2]

---

## 16. Performance

**16.1 — Debouncing (500ms text, 300ms position/resize, 150ms position-commit) is the primary and currently *only* strategy for taming continuous-input cost. Do not assume incremental/differential computation exists anywhere in the parse/validate/layout pipeline — it doesn't.** [EXPLICIT strategy; the lack of incremental computation is INFERRED, an unaddressed scalability limit rather than a considered tradeoff]
See `decisions/performance.md` #1, #2.

**16.2 — Per-level ELK layout (rule 9.2) is also a performance boundary — layout cost scales with the visible level's size, not the whole document. Do not reintroduce whole-tree layout without re-evaluating this.** [INFERRED — a beneficial side effect, not an independently-made performance decision]

**16.3 — Do not add new global, cross-diagram computation (like the handle-traffic cost model) without being deliberate about its cost — it is already an accepted, reasoned tradeoff, not something to casually extend further without re-measuring.** [EXPLICIT rationale for the existing case; a general caution for new ones]

---

## 17. Testing

**17.1 — New test files must be placed as siblings of the module they test (`foo.ts` + `foo.test.ts`), never inside a `__tests__/` subdirectory.** [EXPLICIT — `vitest.config.ts` excludes `**/__tests__/**`, and 5 existing test files are already silently never run because of this]
See `decisions/testing.md` #3, `.claude/workflows/running-and-writing-tests.md`.

**17.2 — Pure logic (validators, commands, layout math, utils) gets plain Vitest unit tests with no rendering. Only genuinely interactive components get `@testing-library/react` tests — do not add RTL tests to purely presentational components "for completeness."** [EXPLICIT — consistent pattern across all 47 test files]
See `decisions/testing.md` #2.

**17.3 — There is no e2e/browser-automation framework. UI/interaction changes (drag gestures, canvas behavior, Monaco autocomplete, zoom/pan) must be manually verified in a real running browser — `npm test` passing does not confirm these work.** [EXPLICIT]
See `README.md` §"Testing Checklist", `decisions/testing.md` #1, #4.

**17.4 — Before trusting `npm test`'s output for layout code (`adaptive-spacing.ts`, `edge-obstacle-utils.ts`, `hub-centroid-nudge.ts`, `node-dimension-calculator.ts`) or `config-overrides.ts`, run their specific test files directly — their tests currently do not run under the default command.** [EXPLICIT, a known gap]

**17.5 — For any task changing UI, visual behavior, interaction, layout, or a user-facing workflow: Claude runs every check that doesn't require a browser (typecheck, lint, unit tests, build) and stops there. Claude must NOT start `npm run dev` in order to attempt browser verification itself, and must NOT state or imply that UI behavior has been "verified"/"tested"/"confirmed working" unless the developer has explicitly said so in the conversation. Instead, Claude ends the task with a concrete, concise manual verification checklist (specific page, specific interaction, specific expected outcome) for the developer to run themselves.** [EXPLICIT — Claude has no browser-automation or screenshot tool in this environment, so a self-asserted "browser-verified" claim would be unfalsifiable]
See `decisions/testing.md` #5, `.claude/skills/ui-changes/SKILL.md`. This refines rule 17.3: the manual-verification *requirement* is unchanged, but responsibility for actually performing it is explicitly the developer's, not Claude's, whenever Claude is the one implementing the change.

---

## 18. Backward Compatibility

**18.1 — Legacy `viz:` namespace URIs/prefixes must continue to be migrated to canonical form on write-back — never let an older file's metadata silently become unrecognized.** [EXPLICIT — see rule 8.5]

**18.2 — `conf_` fields lacking a `confType` attribute (pre-dating that attribute) must continue to be backfilled via `annotateLegacyConfTypes` on every load path.** [EXPLICIT]

**18.3 — The `<initial>` child-element form must continue to be read (for reachability/group analysis) even though only the `@initial` attribute form is ever written going forward. Do not stop reading the legacy form — this would silently break older files' Initial-state detection.** [EXPLICIT]
See `decisions/backward-compatibility.md` #4.

**18.4 — Duplicate/legacy transition patterns from older files are normalized (merged) on load, not flagged as validation errors. Preserve the exact order (event-merge before cond-merge) or event names can be silently dropped, per the modules' own documented warning.** [EXPLICIT]

---

## 19. Configuration

**19.1 — Only `<data>` elements with a `conf_`-prefixed id are treated as per-deployment configurable values. This is a pure naming convention — do not require any additional schema/attribute to "activate" it beyond the prefix.** [EXPLICIT]

**19.2 — When reconciling a config field's SCXML default, host-pushed override, and in-progress local edit, local edits must win over a possibly-stale host push.** [EXPLICIT — `mergeConfigEntries`'s explicit precedence]
See `decisions/configuration.md` #2.

**19.3 — Deleting a `conf_` field must be refused (not merely warned) if it's still referenced anywhere in the document's expressions.** [EXPLICIT]

**19.4 — GitHub OAuth endpoint configuration (`NEXT_PUBLIC_GITHUB_*`) is resolved at build time per deployment target (local dev vs. LoopControl-embedded release) — never assume it can be changed at runtime.** [EXPLICIT — a direct consequence of rule 1.1]

---

## 20. External Integrations

**20.1 — GitHub authentication must use OAuth Device Flow, never a redirect-based Authorization Code Flow.** [EXPLICIT — extensively reasoned inline: no fixed redirect URI works across independently-addressed physical devices]
See `decisions/integrations.md` #1.

**20.2 — GitHub's device-flow endpoints must be called through a same-origin relay (local `server/` in development, LoopControl's equivalent endpoint in production) — never called directly from the browser (they send no CORS headers).** [EXPLICIT]

**20.3 — The `window.ScxmlEditorAPI` pre-ready stub in `layout.tsx` must be upgraded **in place** (`Object.assign`), never replaced by reassignment — a host may have captured an early reference to the stub object itself.** [EXPLICIT]
See `decisions/integrations.md` #2.

**20.4 — Embedding detection (`window.self !== window.top`) must remain inside a `useEffect`, never checked during render — checking during render bakes a wrong value into the static export's HTML and causes a Welcome-screen flash (a previously-fixed real bug).** [EXPLICIT]
See `decisions/integrations.md` #3.

**20.5 — Extending the real `ScxmlEditorAPI` surface with a new method should also extend the pre-ready stub in `layout.tsx` if a host might reasonably call it before `onReady` fires — otherwise calling it early throws instead of queuing.** [EXPLICIT — a confirmed, currently-real gap for several existing methods]

**20.6 — Channel Mappings and Events/User Actions must remain host-store-only data, never written into the SCXML document; Config (`conf_`) values must remain SCXML-persisted. Any new host-bridge data type must pick one of these ownership models deliberately.** [EXPLICIT]
See rule 5.4, `decisions/integrations.md` #4.

---

## 21. UI/UX Conventions

**21.1 — There is no right-click context menu anywhere in this app. Do not add one to a single feature in isolation — if context menus are introduced, they should be introduced as a considered, app-wide pattern (there is no existing infrastructure/styling convention to extend).** [INFERRED absence, not a confirmed rejection — but currently, zero precedent exists]
See `features/context-menus.md`.

**21.2 — Empty states in host-bridge panels (Config, Channel Mapping) must explain the activation convention with a worked example, not show a generic "no items" message.** [EXPLICIT — consistent pattern]

**21.3 — Host-pushed "Host Alerts" must remain a separate tab from this editor's own SCXML validation errors — never merge them into one list.** [EXPLICIT]

**21.4 — Theme must never flash the wrong mode on load — any change to theme detection/application logic must keep the pre-hydration blocking script in `layout.tsx` and `src/lib/theme/theme.ts`'s logic in sync by hand (there is no shared, type-checked contract between the two).** [EXPLICIT]

**21.5 — The Monaco code editor currently always renders `vs-dark` regardless of the app's light/dark theme — a known, confirmed inconsistency, not an intentional design. Do not treat this as "how it's supposed to work" if asked to fix theme consistency.** [INFERRED bug — flagged, not endorsed]

---

## 22. Naming Conventions

**22.1 — A state's displayed label *is* its SCXML `id` — there is no separate display-name field. Do not introduce one without a deliberate, wide-reaching design change (every feature identifying a state assumes label === id).** [EXPLICIT]

**22.2 — Sticky-note ReactFlow node ids must be prefixed `note:` (exploiting the fact that `:` is invalid in real SCXML ids to guarantee no collision). Any future pseudo-node type should follow the same reasoning for its own prefix.** [EXPLICIT]

**22.3 — Auto-generated timer-event names must follow the `{stateId}_t_{N}_timeEvent_{N}` pattern and must only ever be read/rewritten via the dedicated token functions (`findTimeEventToken`, `renameTimeEventTokensInEventList`) — never via a naive substring replace.** [EXPLICIT]

**22.4 — Be aware that the "Events" feature (code: `EventEntry`, `events-panel.tsx`, `useHostAPIStore.events`) is labeled "User Actions" everywhere in the UI. This is a known, unresolved naming divergence — don't "fix" it opportunistically (renaming `EventEntry` is a breaking change to the Host API's public surface) without a deliberate, scoped rename effort.** [INFERRED inconsistency]

**22.5 — Datamodel prefixes `conf_`/`this_`/`main_` must not be repurposed (see rule 6.9) — they are load-bearing across Config Panel, Channel Mapping Panel, Monaco autocomplete, and a validator warning.**

---

## 23. File / Module Boundaries

**23.1 — `src/lib/` must stay framework-agnostic (no React, minimal external UI dependencies) so its contents remain independently unit-testable. `src/components/` is where React-specific code lives.** [INFERRED — verified nearly 100% true today; keep it that way]

**23.2 — Each `src/lib/` subdirectory (`commands/`, `validators/`, `parsers/`, `converters/`, `layout/`, `utils/`, `monaco/`, `github/`, `history/`, `metadata/`) owns one concern and exports through its own `index.ts` barrel. A new Command belongs in `commands/`, a new validation rule in `validators/`, etc. — do not scatter related logic across directories.** [EXPLICIT — consistent barrel-export pattern throughout]

**23.3 — `src/types/` mirrors real data shapes (`scxml/`, `visual-metadata/`, `history/`, `common/`, `host-api.ts`) — a new data shape should get a corresponding type definition here, following the existing per-domain file split.**

**23.4 — Deprecated types (e.g. `CompoundStateNodeData`/`ParallelStateNodeData` in `src/types/hierarchical-node.ts`) are marked `@deprecated` in place rather than deleted immediately — follow this convention when superseding a type, so the historical reason for the change remains visible in the codebase itself.** [EXPLICIT — observed convention]

**23.5 — `server/` is a separate package (its own `package.json`, its own test suite, excluded from the root `vitest.config.ts` and from the Next.js build) — do not import from it into `src/`, and do not fold its dependencies into the root `package.json`.** [EXPLICIT]

**23.6 — Do not treat `DEVELOPER_GUIDE.md` or `.claude/context/CLAUDE.md` as accurate architecture references — both are confirmed stale (they describe a design that doesn't match current code). Prefer `.claude/project/*.md`, `.claude/features/*.md`, and `.claude/decisions/*.md`, all verified against the actual repository.** [EXPLICIT finding of this knowledge base]

---

## How to use this document

- Before modifying code in an area covered above, read the relevant numbered rule(s) and follow the cross-referenced `decisions/` or `features/` file for full context.
- If you find yourself about to violate a rule marked **[EXPLICIT]**, stop and reconsider — these reflect either a stated project intention or a real bug that was already fixed once (don't reintroduce it).
- If you find yourself about to violate a rule marked **[INFERRED]**, it's more negotiable — but changing it is a deliberate architectural decision, not an incidental refactor. If you do change it, update the corresponding entry in `decisions/` to reflect the new reality and its status (`Superseded`).
- If you discover a new invariant this document doesn't cover, add it here rather than letting it live only in your own working memory for this session.
