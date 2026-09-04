# Project Knowledge Index & Feature Registry

*This file is a map, not a memory dump. Load the specific file(s) relevant to your task; don't read everything.*

This knowledge base documents the **SCXML Visual Editor** (industrial statechart authoring tool for Copenhagen Atomics' "LoopControl" platform) as it actually exists in code today — not as aspirationally described in `DEVELOPER_GUIDE.md` or `.claude/context/CLAUDE.md`, both of which are stale. See `PROJECT_ANALYSIS.md` at the repo root for the exhaustive, file:line-referenced research this knowledge base was distilled from.

**Start here if you're new to this repo**: `project/overview.md` → `project/architecture.md` → `project/terminology.md`.

**`.claude/` is the single source of truth for all SCXML-Editor-specific AI development knowledge.** Architecture, features, decisions, project rules, workflows, skills, and terminology all live here, and nowhere else in the repository. There is no separate plugin, no separate MCP server, and no second knowledge base to keep in sync — a prior iteration of this system packaged the skills as an installable Claude Code Plugin with a companion MCP server; both were removed as unnecessary indirection once it was clear every capability they added was either (a) already available through Claude Code's native Read/Grep/Glob/Bash tools, or (b) better served by this `.claude/` tree directly. See `decisions/architecture.md` if that removal's reasoning is ever relevant again.

### The knowledge map

```
Project
 ├── Architecture   → project/architecture.md, project/scxml-rules.md, project/ui-rules.md, project/coding-rules.md
 ├── Rules          → project/project-rules.md   (the 23-section constitution)
 ├── Features       → features/*.md               (37 docs, one per feature, equal depth)
 ├── Decisions      → decisions/*.md               (14 topical files, ~80 numbered records)
 ├── Skills         → skills/*/SKILL.md            (10 skills — how to approach a kind of task)
 └── Workflows      → workflows/*.md               (step-by-step processes the skills specialize)
```

### How Claude finds the right context without being told

A developer should never need to say "use the debugging skill" or "read the transition documentation." The routing is automatic, in three steps:

1. **Skill matching** — Claude Code matches the task's description against every skill's frontmatter `description` (the 10 files under `skills/`) and loads the one that fits — `bug-investigation` for "fix the transition editing bug," `ui-changes` for a visual tweak, `scxml-representation` for a parsing/serialization change, and so on. This happens automatically; no skill needs to be named explicitly.
2. **Knowledge lookup** — the matched skill's own "Relevant knowledge files / project rules / decision records" sections point to specific `features/*.md`, `project-rules.md` section(s), and `decisions/*.md` entries. When the exact file isn't obvious from the skill alone, the keyword/symptom table and searchable decision index further down this page resolve it.
3. **Source inspection** — only now does Claude read the actual source files the identified documentation names, verifying the docs still match current code before acting on them (some historical docs — `DEVELOPER_GUIDE.md`, `.claude/context/CLAUDE.md` — are confirmed stale; `.claude/` itself is kept current specifically so this verification step is normally a formality, not a correction).

Because the 10 skills are organized by **activity shape** (what kind of work is this) rather than by **feature** (which part of the app), a task about a genuinely new area the knowledge base doesn't yet cover still routes correctly — it matches `feature-development` or `codebase-exploration`, which instruct searching this index and the codebase directly rather than assuming a pre-existing doc exists.

This same routing also runs in reverse after the work is done: `.claude/skills/knowledge-maintenance/SKILL.md` and `.claude/workflows/knowledge-maintenance.md` define exactly when a completed change requires a `.claude/*.md` update (and, just as importantly, when it doesn't) — see `workflows/development.md` steps 17–18 for where this fits in the overall task sequence, and `workflows/knowledge-maintenance.md` for the full decision procedure.

All 37 feature documents in `features/` follow the identical template and are treated at equal depth — no feature was prioritized over another: **Purpose, User behavior, UI behavior, Architecture, Relevant components, State/store relationships, Data flow, SCXML behavior, Validation, Related features, Related files, Tests, Edge cases, Known limitations, Important invariants, Design decisions, Things that must not be broken** (the two earlier research passes used a slightly different section order/naming for the same content — treat section names as equivalent, e.g. "Internal architecture" ≈ "Architecture", "Relevant utilities" folds into "Data flow").

## `project/` — always-relevant reference (read these first, every session)

| File | Read this when you need to know... |
|---|---|
| [project-rules.md](project/project-rules.md) | **The development constitution** — 23 categories of MUST/MUST NOT rules and invariants that apply across the whole project, each tagged `[EXPLICIT]` (stated/enforced by the project) or `[INFERRED]` (implementation reality, not a documented choice). Read this before making any non-trivial change. |
| [overview.md](project/overview.md) | What this product is, who it's for, why it exists, which existing docs are stale |
| [architecture.md](project/architecture.md) | High-level system shape: two-way sync loop, the two mutation strategies, rendering pipeline, state stores, directory map |
| [coding-rules.md](project/coding-rules.md) | Which mutation pattern to use for a new feature, Command implementation conventions, validator conventions, `viz:` namespace conventions, testing conventions, things NOT to do |
| [ui-rules.md](project/ui-rules.md) | Exact interaction behavior: selection model, panel system, keyboard shortcuts, state-type visuals, GitHub panel state machine |
| [scxml-rules.md](project/scxml-rules.md) | The `viz:` namespace vocabulary, `conf_`/`this_`/`main_` conventions, cross-hierarchy rule, transition slots, Initial State groups, validation pass order, downstream-C#-generator constraints |
| [terminology.md](project/terminology.md) | Domain glossary — Initial State group, transition slot, channel, config value, user action/event, host, `_q` queue, Host Alerts |

## `skills/` — how to approach a recurring kind of task (10 skills)

Skills encode **how** to work; everything else in `.claude/` encodes **what** the project contains. Each skill specializes `workflows/development.md`'s 19-step process for one recurring task shape, and points into the knowledge base rather than restating it. See [skills/README.md](skills/README.md) for the full design rationale, including which categories (code review, performance, per-feature skills) were deliberately *not* given a dedicated skill and why.

| Skill | Use for |
|---|---|
| [feature-development](skills/feature-development/SKILL.md) | Adding new capability — the default for "add X" requests |
| [bug-investigation](skills/bug-investigation/SKILL.md) | Diagnosing and fixing a reported defect (includes debugging) |
| [codebase-exploration](skills/codebase-exploration/SKILL.md) | "How does X work" questions, no code change |
| [ui-changes](skills/ui-changes/SKILL.md) | Canvas, Monaco, panels, theme, interaction |
| [scxml-representation](skills/scxml-representation/SKILL.md) | Parsing, serialization, the `viz:` namespace |
| [state-machine-semantics](skills/state-machine-semantics/SKILL.md) | Initial/compound/parallel/transition rules |
| [validation-rules](skills/validation-rules/SKILL.md) | Adding/editing `SCXMLValidator` checks |
| [test-writing](skills/test-writing/SKILL.md) | Adding/running tests (the `__tests__/` trap) |
| [refactoring](skills/refactoring/SKILL.md) | Behavior-preserving structural change |
| [knowledge-maintenance](skills/knowledge-maintenance/SKILL.md) | Keeping `.claude/` itself accurate |

---

## How to find the right feature doc — keyword/symptom registry

Use this table to route a task to the correct doc(s) **before** reading source code. Match on the words in the user's request, not just the exact feature name — many real requests describe symptoms or UI elements, not architecture terms.

| If the request mentions... | Read |
|---|---|
| syncing, "code doesn't match diagram", content flow, debounce | [two-way-sync.md](features/two-way-sync.md) |
| drilling into a state, breadcrumb, "can't see nested states", navigate up/into, State Path popover | [hierarchy-navigation.md](features/hierarchy-navigation.md), [state-hierarchy-tree.md](features/state-hierarchy-tree.md) |
| Ctrl+Z, Ctrl+Y, undo, redo, history, "my change wasn't undoable" | [undo-redo-history.md](features/undo-redo-history.md) |
| upload, "load a file", drag a file in, create new document, Welcome screen | [file-import-export.md](features/file-import-export.md), [drag-and-drop.md](features/drag-and-drop.md) |
| download, export, "clean SCXML", strip metadata | [file-import-export.md](features/file-import-export.md), [visual-metadata-namespace.md](features/visual-metadata-namespace.md) |
| serialize, XMLBuilder, XMLSerializer, formatXML, "output looks malformed" | [scxml-serialization.md](features/scxml-serialization.md) |
| parse, fast-xml-parser, "XML syntax error", malformed tag, unclosed tag | [scxml-parsing.md](features/scxml-parsing.md) |
| validation error, validator, "why is this flagged", W3C compliance, unreachable state, duplicate id | [scxml-validation.md](features/scxml-validation.md) |
| dragging a state, moving a node, resize, NodeResizer, multi-select drag | [diagram-interaction.md](features/diagram-interaction.md), [node-positioning.md](features/node-positioning.md) |
| click, select, Ctrl+click, marquee, box-select, "selection doesn't work right" | [selection.md](features/selection.md) |
| zoom, pan, minimap, fitView, Controls widget, pinch-zoom, trackpad | [zoom-pan-controls.md](features/zoom-pan-controls.md) |
| right-click, context menu | [context-menus.md](features/context-menus.md) *(verified: does not exist)* |
| rename a state, double-click to edit, label editing | [labels.md](features/labels.md) |
| new state, delete state, change state type, state CRUD | [state-editing.md](features/state-editing.md) |
| compound state, parallel state, final state, simple state, dashed border, state icon | [state-node-types.md](features/state-node-types.md) |
| initial state, Initial badge, "can't mark this initial" | [state-node-types.md](features/state-node-types.md), [initial-state-groups.md](features/initial-state-groups.md) |
| multiple initial states, disconnected sub-machines, Initial State group conflict | [initial-state-groups.md](features/initial-state-groups.md) |
| history state, shallow/deep history | [state-node-types.md](features/state-node-types.md) |
| "work tree", state tree, parent/child registry, ancestor chain | [state-hierarchy-tree.md](features/state-hierarchy-tree.md) *("work tree" is not a real term in this codebase — see this doc's verification note* |
| connection point, handle, dragging a new transition, `onConnect`, anchor point, `viz:anchors`, shift-click add anchor | [state-connections-handles.md](features/state-connections-handles.md) |
| transition editing, event/cond fields, Transition panel, edge label, waypoints, reconnect | [transitions-editing.md](features/transitions-editing.md) |
| transition slot, "only one transition allowed", duplicate transition | [transitions-editing.md](features/transitions-editing.md) |
| `cond`, condition expression, ConditionEvaluator | [conditions-and-expressions.md](features/conditions-and-expressions.md) |
| `after 2s`, `after Xms`, timer transition, delay, delayexpr | [time-transition-syntax.md](features/time-transition-syntax.md) |
| onentry, onexit, action editing, State Actions panel, assign/send/cancel rows | [state-actions-panel.md](features/state-actions-panel.md) |
| raise, log, script, if/elseif/else, foreach, executable content | [events-and-executable-actions.md](features/events-and-executable-actions.md) |
| internal event reaction, targetless transition, "reactions" tab | [state-actions-panel.md](features/state-actions-panel.md), [events-and-executable-actions.md](features/events-and-executable-actions.md) |
| layout, auto-layout, ELK, spacing, nodes overlapping, chain wrapping, hub | [auto-layout-elk.md](features/auto-layout-elk.md) |
| sticky note, post-it, annotation | [sticky-notes.md](features/sticky-notes.md) |
| `viz:` namespace, visual metadata, `viz:xywh`, `viz:rgb`, VisualMetadataManager | [visual-metadata-namespace.md](features/visual-metadata-namespace.md) |
| Monaco, code editor, syntax highlighting, autocomplete in the XML editor, hover docs | [monaco-code-editor.md](features/monaco-code-editor.md) |
| light mode, dark mode, theme toggle, appearance | [theme-and-appearance.md](features/theme-and-appearance.md) |
| crash, blank screen, "something went wrong", ErrorBoundary | [error-handling-and-resilience.md](features/error-handling-and-resilience.md) |
| tips, toolbar hints, carousel | [inline-tips-carousel.md](features/inline-tips-carousel.md) |
| embedding, iframe, LoopControl, `window.ScxmlEditorAPI`, host integration | [host-api-embedding.md](features/host-api-embedding.md) |
| config value, `conf_`, IO.Conf, per-deployment setting | [config-panel.md](features/config-panel.md) |
| channel, channel mapping, unresolved reference, `this_` | [channel-mapping-panel.md](features/channel-mapping-panel.md) |
| user action, operator button, Events panel, hidden action, EventEntry | [events-user-actions-panel.md](features/events-user-actions-panel.md), [hidden-actions.md](features/hidden-actions.md) |
| GitHub, push, pull, OAuth, Device Flow, device code, relay server | [github-integration.md](features/github-integration.md) |
| `main_` prefix, portability warning | [scxml-validation.md](features/scxml-validation.md), [project/terminology.md](project/terminology.md) |
| copy/paste, clipboard, subtree clone | [diagram-interaction.md](features/diagram-interaction.md), [state-actions-panel.md](features/state-actions-panel.md) |
| drag-to-reorder, action row order, dnd-kit | [state-actions-panel.md](features/state-actions-panel.md), [drag-and-drop.md](features/drag-and-drop.md) |
| reparent, nest a state, drag onto another state | [diagram-interaction.md](features/diagram-interaction.md) |

If a request doesn't match any row above, check the full alphabetical table below, or `PROJECT_ANALYSIS.md` for anything at a lower level of detail than a "feature" (e.g. a specific utility function).

---

## `features/` — full alphabetical registry (37 docs, equal depth)

| File | Feature |
|---|---|
| [auto-layout-elk.md](features/auto-layout-elk.md) | ELK auto-layout engine and its layout-quality helper modules |
| [channel-mapping-panel.md](features/channel-mapping-panel.md) | Mapping unresolved SCXML refs to host-provided physical channels |
| [conditions-and-expressions.md](features/conditions-and-expressions.md) | `cond`/expression authoring; the mostly-dead `ConditionEvaluator` utility |
| [config-panel.md](features/config-panel.md) | `conf_`-prefixed per-deployment config values ↔ host `IO.conf` |
| [context-menus.md](features/context-menus.md) | Verified non-existent — what substitutes for a context menu instead |
| [diagram-interaction.md](features/diagram-interaction.md) | Select/drag/resize/multi-select/marquee/copy-paste/drag-to-reparent/delete/create on the canvas |
| [drag-and-drop.md](features/drag-and-drop.md) | Cross-reference map of the three distinct DnD mechanisms in this app |
| [error-handling-and-resilience.md](features/error-handling-and-resilience.md) | The app-wide `ErrorBoundary` and its real coverage limits |
| [events-and-executable-actions.md](features/events-and-executable-actions.md) | The SCXML executable-content model vs. the narrower UI editing shape |
| [events-user-actions-panel.md](features/events-user-actions-panel.md) | Operator-facing "User Actions" button definitions |
| [file-import-export.md](features/file-import-export.md) | Upload, create-new, clean vs. metadata-preserving export |
| [github-integration.md](features/github-integration.md) | OAuth Device Flow, repo linking, push/pull, the relay server |
| [hidden-actions.md](features/hidden-actions.md) | The `EventEntry.hidden` operator-visibility toggle |
| [hierarchy-navigation.md](features/hierarchy-navigation.md) | Drill-down navigation into compound states |
| [host-api-embedding.md](features/host-api-embedding.md) | `window.ScxmlEditorAPI`, embedded-vs-standalone detection, the `_q` queue and its stub script |
| [initial-state-groups.md](features/initial-state-groups.md) | Multiple independent Initial States per hierarchy level |
| [inline-tips-carousel.md](features/inline-tips-carousel.md) | The auto-advancing toolbar tips strip |
| [labels.md](features/labels.md) | State id/rename (double-click), edge label display, note text editing |
| [monaco-code-editor.md](features/monaco-code-editor.md) | XML syntax highlighting, hover docs, autocomplete, paste normalization |
| [node-positioning.md](features/node-positioning.md) | Manual placement, `viz:xywh` storage, the auto-layout priority rule |
| [scxml-parsing.md](features/scxml-parsing.md) | Hand-rolled syntax checker + fast-xml-parser, distinct from validation |
| [scxml-serialization.md](features/scxml-serialization.md) | The two independent object-tree/DOM → XML string serializers |
| [scxml-validation.md](features/scxml-validation.md) | The 16-pass validator pipeline, error surfacing, known gaps |
| [selection.md](features/selection.md) | Single/multi-select, marquee, click/double-click disambiguation |
| [state-actions-panel.md](features/state-actions-panel.md) | onentry/onexit action editing + internal-event reactions tab |
| [state-connections-handles.md](features/state-connections-handles.md) | The ReactFlow Handle model (4+ per node, multi-anchor sides via `viz:anchors`) and the connect gesture |
| [state-editing.md](features/state-editing.md) | Create/rename/retype/delete lifecycle for a state |
| [state-hierarchy-tree.md](features/state-hierarchy-tree.md) | The parent/child state registry ("work trees" investigation result) |
| [state-node-types.md](features/state-node-types.md) | Simple/compound/parallel/final/initial/history rendering rules |
| [sticky-notes.md](features/sticky-notes.md) | Post-it note annotations |
| [theme-and-appearance.md](features/theme-and-appearance.md) | Light/dark mode, flash-of-wrong-theme prevention |
| [time-transition-syntax.md](features/time-transition-syntax.md) | The `after X` delay shorthand |
| [transitions-editing.md](features/transitions-editing.md) | Transition panel, edge rendering, waypoints, transition slots |
| [two-way-sync.md](features/two-way-sync.md) | Code ↔ Visual synchronization |
| [undo-redo-history.md](features/undo-redo-history.md) | History, undo/redo, debouncing |
| [visual-metadata-namespace.md](features/visual-metadata-namespace.md) | The `viz:` namespace read/write/clean-export system |
| [zoom-pan-controls.md](features/zoom-pan-controls.md) | Canvas zoom/pan, MiniMap, fitView, two browser-bug workarounds |

### Grouped by theme (alternative view)

- **Core editing loop / data pipeline**: two-way-sync, scxml-parsing, scxml-serialization, scxml-validation, undo-redo-history, file-import-export, error-handling-and-resilience.
- **States**: state-node-types, state-editing, state-hierarchy-tree, initial-state-groups, labels.
- **Transitions & connections**: transitions-editing, state-connections-handles, conditions-and-expressions, time-transition-syntax, events-and-executable-actions.
- **Canvas mechanics**: diagram-interaction, selection, zoom-pan-controls, node-positioning, auto-layout-elk, sticky-notes, drag-and-drop, context-menus (verified absence).
- **Behavioral editing**: state-actions-panel, events-and-executable-actions.
- **Code editor**: monaco-code-editor.
- **App shell / chrome**: theme-and-appearance, inline-tips-carousel, error-handling-and-resilience.
- **Host/LoopControl integration**: host-api-embedding, config-panel, channel-mapping-panel, events-user-actions-panel, hidden-actions.
- **External integration**: github-integration.

### Verified-absent features (investigated, confirmed not to exist — do not build on an assumption these are present)

- **Context menus** (right-click) — see [context-menus.md](features/context-menus.md).
- **"Work trees"** as a literal concept — see [state-hierarchy-tree.md](features/state-hierarchy-tree.md).
- **Persisted viewport/zoom state across reloads** — see [zoom-pan-controls.md](features/zoom-pan-controls.md) Known limitations.
- **A live "test/evaluate this condition" feature** — `ConditionEvaluator`'s evaluation/formatting/test-context methods exist but have no confirmed call site — see [conditions-and-expressions.md](features/conditions-and-expressions.md).

---

## `decisions/` — organized by topic, not by feature (14 files, ~60 individual decision records)

Each file contains multiple numbered decision records, each following the same template: **Context, Decision, Reason, Constraints, Alternatives (only where evidenced), Evidence, Status**. `Status` is one of `Accepted` / `Deprecated` / `Superseded` / `Inferred behavior` — the last meaning "this is what the code does, but no evidence was found that it was a deliberate choice; do not treat it as an intentional constraint." Mined from source code, code comments, existing docs (`docs/superpowers/plans/*`, `docs/*.md`), and **git commit history** — several entries are traceable to verbatim user-feedback commit messages or to features that were implemented, reverted, and replaced (marked `Superseded`).

| File | Covers |
|---|---|
| [architecture.md](decisions/architecture.md) | Static export deployment; the two SCXML-mutation strategies; independent validation/rendering pipelines; thin `page.tsx` + extracted hooks; whole-document re-parse per command; the `SCXMLToXStateConverter` naming residue; why `.claude/` is the sole knowledge layer (no plugin, no MCP server) |
| [state-management.md](decisions/state-management.md) | Seven independent Zustand stores; linear full-snapshot history (not a command stack); debounced history tracking; `queueMicrotask`-deferred panel updates; GitHub store's selective persistence |
| [scxml.md](decisions/scxml.md) | The `viz:` namespace; the cross-hierarchy transition rule; multiple Initial-State groups; `<initial>` element vs. attribute; transition slots; the `after X` ms-conversion; the SCXML type model; the `.executable[]` shape mismatch (Inferred) |
| [visual-diagram.md](decisions/visual-diagram.md) | Drill-down vs. nested rendering; single `SCXMLStateNode` component; history-state wrapper node; per-level ELK; the edge-bundling-reverted-for-centroid-nudge history; non-native selection model; edge path priority chain; sticky-note behavior; the Windows zoom fix, amber transition color, and no-animation decisions (all traced to specific user-feedback commits) |
| [editing.md](decisions/editing.md) | The Command pattern; the two undo strategies; the `ChangeStateTypeCommand` undo defect (Inferred); rename cascades; waypoint invalidation; the reverted "inferred event/condition mode" → explicit switch; transition-merge-on-load; the State Actions panel's narrower-than-spec action model (Inferred) |
| [validation.md](decisions/validation.md) | The 16-pass ordered pipeline; parser/validator separation; validation rules motivated by the downstream C# generator postmortem; shared-utility enforcement for slot/group rules; Levenshtein suggestions; the unused `ValidationError.code` field (Inferred) |
| [error-handling.md](decisions/error-handling.md) | The single app-wide `ErrorBoundary` and its real (narrow) coverage; dual XML syntax checking; the clean-export fallback chain and its risky final tier; Commands' return-value-not-throw contract; the GitHub 409 conflict message |
| [testing.md](decisions/testing.md) | Vitest/jsdom, no e2e; RTL reserved for interactive components only; the `__tests__/` exclusion bug (Inferred, not a decision); the manual testing checklist; why Claude runs automated checks only and the developer owns browser verification |
| [backward-compatibility.md](decisions/backward-compatibility.md) | Legacy `viz:` namespace migration; `annotateLegacyConfTypes` backfill; transition-merge-on-load for old files; dual `<initial>` support |
| [configuration.md](decisions/configuration.md) | The `conf_` convention; local-edits-win merge precedence; usage-checked config deletion; build-time `NEXT_PUBLIC_*` GitHub endpoint config |
| [naming-conventions.md](decisions/naming-conventions.md) | `conf_`/`this_`/`main_`; state label = SCXML id; the `note:` id prefix; synthetic timer-event names; the "Events" vs. "User Actions" divergence (Inferred) |
| [ui-ux.md](decisions/ui-ux.md) | Single-panel-at-a-time; standard keyboard shortcuts; the theme flash-prevention script; double-click-to-rename; separate Host Alerts tab; teaching-moment empty states; the absent context menu (Inferred) |
| [integrations.md](decisions/integrations.md) | GitHub Device Flow; the `_q` pre-ready queue and stub-upgrade-in-place pattern; deferred embedding detection (with its traced flash-bug fix); host-side-only vs. SCXML-persisted data ownership |
| [performance.md](decisions/performance.md) | Debouncing as the primary performance strategy; full re-parse/re-layout per change (Inferred tradeoff); per-level ELK as a performance boundary; the traffic-aware handle-assignment cost model |

### Searchable decision index — find a decision by keyword

| If you're wondering why... | See |
|---|---|
| ...the app has no server / ships as a zip of static files | [architecture.md](decisions/architecture.md) #1 |
| ...some diagram actions (connect, paste, reparent) aren't Commands | [architecture.md](decisions/architecture.md) #2 |
| ...validation errors don't affect what renders in the diagram | [architecture.md](decisions/architecture.md) #3 |
| ...`page.tsx` is so small | [architecture.md](decisions/architecture.md) #4 |
| ...there's no `xstate` dependency despite the converter's name | [architecture.md](decisions/architecture.md) #6 |
| ...there's no `plugin/` or `mcp-server/` directory anymore | [architecture.md](decisions/architecture.md) #7 |
| ...state is split across 7 separate stores | [state-management.md](decisions/state-management.md) #1 |
| ...undo/redo stores whole document strings, not diffs | [state-management.md](decisions/state-management.md) #2 |
| ...typing groups into one undo step but dragging doesn't (or vice versa) | [state-management.md](decisions/state-management.md) #3 |
| ...panel-store updates use `queueMicrotask` | [state-management.md](decisions/state-management.md) #4 |
| ...GitHub "syncing" never gets stuck after a reload | [state-management.md](decisions/state-management.md) #5 |
| ...layout data lives inside the `.scxml` file itself | [scxml.md](decisions/scxml.md) #1 |
| ...a transition can't target a state in a different branch | [scxml.md](decisions/scxml.md) #2 |
| ...you can mark more than one state Initial | [scxml.md](decisions/scxml.md) #3 |
| ...an old `<initial>` element got rewritten to an attribute | [scxml.md](decisions/scxml.md) #4 |
| ...only one event/timer/cond transition is allowed per target | [scxml.md](decisions/scxml.md) #5 |
| ...`after 2s` gets stored with a `* 1000` in the expression | [scxml.md](decisions/scxml.md) #6 |
| ...onentry/onexit unknown-attribute checks don't fire on real files | [scxml.md](decisions/scxml.md) #8 (Inferred) |
| ...compound states don't render nested inside their parent | [visual-diagram.md](decisions/visual-diagram.md) #1 |
| ...there's no separate node component per state type | [visual-diagram.md](decisions/visual-diagram.md) #2 |
| ...history states look like an oversized dashed box | [visual-diagram.md](decisions/visual-diagram.md) #3 |
| ...ELK never lays out more than one level at once | [visual-diagram.md](decisions/visual-diagram.md) #4 |
| ...moving a node never gets undone by auto-layout | [visual-diagram.md](decisions/visual-diagram.md) #5 |
| ...there's a `hub-centroid-nudge.ts` instead of edge bundling | [visual-diagram.md](decisions/visual-diagram.md) #6 (Superseded: edge bundling) |
| ...Ctrl-click and marquee-select don't use React Flow's defaults | [visual-diagram.md](decisions/visual-diagram.md) #7 |
| ...an edge sometimes routes around a node and sometimes doesn't | [visual-diagram.md](decisions/visual-diagram.md) #8 |
| ...notes don't push other nodes and aren't resizable | [visual-diagram.md](decisions/visual-diagram.md) #9 |
| ...pinch-zoom feels different / was tuned | [visual-diagram.md](decisions/visual-diagram.md) #10 |
| ...conditional transitions are amber, not red | [visual-diagram.md](decisions/visual-diagram.md) #11 (Superseded: red) |
| ...transitions don't animate | [visual-diagram.md](decisions/visual-diagram.md) #12 (Superseded: animated) |
| ...every Command re-parses the whole document | [editing.md](decisions/editing.md) #1, [architecture.md](decisions/architecture.md) #5 |
| ...delete's undo works differently from rename's undo | [editing.md](decisions/editing.md) #2 |
| ...undoing a state→final conversion doesn't restore its children | [editing.md](decisions/editing.md) #3 (Inferred defect) |
| ...renaming a state updates transitions/initial attrs/timers everywhere | [editing.md](decisions/editing.md) #4 |
| ...a resized/renamed state's edges sometimes lose their custom path | [editing.md](decisions/editing.md) #5 |
| ...the Transition panel has an explicit Event/Condition switch | [editing.md](decisions/editing.md) #6 (Superseded: auto-inferred mode) |
| ...opening an old file doesn't show duplicate-transition errors | [editing.md](decisions/editing.md) #7 |
| ...editing actions can silently delete a `<raise>`/`<script>`/`<if>` | [editing.md](decisions/editing.md) #8 (Inferred gap) |
| ...validation passes must run in a specific order | [validation.md](decisions/validation.md) #1 |
| ...there are two "parser" classes (`SCXMLParser` vs `SCXMLValidator`) | [validation.md](decisions/validation.md) #2 |
| ...validation checks for C# reserved words / digit-leading event names | [validation.md](decisions/validation.md) #3 |
| ...the same rule is checked both live and by a static validator | [validation.md](decisions/validation.md) #4 |
| ...an unknown-attribute error suggests "did you mean X?" | [validation.md](decisions/validation.md) #5 |
| ...`ValidationError.code` is always undefined | [validation.md](decisions/validation.md) #6 (Inferred) |
| ...a crash shows a generic "Something went wrong" screen | [error-handling.md](decisions/error-handling.md) #1 |
| ...malformed XML gets a friendlier error than the library gives | [error-handling.md](decisions/error-handling.md) #2 |
| ..."Clean SCXML" export can (rarely) still contain `viz:` data | [error-handling.md](decisions/error-handling.md) #3 (flagged risk) |
| ...Commands never throw | [error-handling.md](decisions/error-handling.md) #4 |
| ...a GitHub push failure says "pull first" specifically | [error-handling.md](decisions/error-handling.md) #5 |
| ...there's no Playwright/Cypress in this repo | [testing.md](decisions/testing.md) #1 |
| ...only 7 components have `@testing-library/react` tests | [testing.md](decisions/testing.md) #2 |
| ...`npm test` passes but a layout test still seems untested | [testing.md](decisions/testing.md) #3 (Inferred bug) |
| ...Claude doesn't start `npm run dev` / doesn't claim a UI change is "verified" | [testing.md](decisions/testing.md) #5 |
| ...older `.scxml` files still open fine after a namespace change | [backward-compatibility.md](decisions/backward-compatibility.md) #1 |
| ...an old `conf_` field suddenly has a `confType` attribute | [backward-compatibility.md](decisions/backward-compatibility.md) #2 |
| ...deleting a config value can be refused | [configuration.md](decisions/configuration.md) #3 |
| ...GitHub endpoints differ between dev and production builds | [configuration.md](decisions/configuration.md) #4 |
| ...variables are prefixed `conf_`/`this_`/`main_` | [naming-conventions.md](decisions/naming-conventions.md) #1 |
| ...renaming a state's label also changes its id | [naming-conventions.md](decisions/naming-conventions.md) #2 |
| ...a note's id looks like `note:xxxxx` | [naming-conventions.md](decisions/naming-conventions.md) #3 |
| ...the "Events" panel is titled "User Actions" | [naming-conventions.md](decisions/naming-conventions.md) #5 (Inferred inconsistency) |
| ...only one side panel can be open at a time | [ui-ux.md](decisions/ui-ux.md) #1 |
| ...Delete doesn't delete a canvas node while a panel is open | [ui-ux.md](decisions/ui-ux.md) #2 |
| ...the theme never flashes the wrong mode on load | [ui-ux.md](decisions/ui-ux.md) #3 |
| ...Host Alerts is a separate tab from Validation | [ui-ux.md](decisions/ui-ux.md) #5 |
| ...there's no right-click menu anywhere | [ui-ux.md](decisions/ui-ux.md) #7 (Inferred absence) |
| ...GitHub uses a device code instead of a login redirect | [integrations.md](decisions/integrations.md) #1 |
| ...a host script calling the API too early doesn't crash (mostly) | [integrations.md](decisions/integrations.md) #2 |
| ...embedding detection runs after mount, not during render | [integrations.md](decisions/integrations.md) #3 |
| ...Channel Mappings aren't saved into the `.scxml` file | [integrations.md](decisions/integrations.md) #4 |
| ...typing feels smooth despite full re-validation running | [performance.md](decisions/performance.md) #1 |
| ...a huge SCXML file might feel slow | [performance.md](decisions/performance.md) #2 (Inferred tradeoff) |
| ...edges auto-route to avoid a "busy" side of a node | [performance.md](decisions/performance.md) #4 |



## `workflows/` — task-oriented how-tos

| File | Use when you need to... |
|---|---|
| [knowledge-maintenance.md](workflows/knowledge-maintenance.md) | **The detailed, mechanical process for deciding whether and how to update `.claude/` after a change** — the materiality test, 10 trigger questions, per-category (overview/architecture/features/rules/decisions/workflows/skills/terminology) update guidance, a step-by-step procedure, and the copy-paste decision-record template. Run this at the close of any non-trivial task; invoked by the `knowledge-maintenance` skill. |
| [development.md](workflows/development.md) | **The standard process for any task in this repo** — bug fix, feature, UI change, refactor, perf, SCXML/state-machine change, validation change, test change, config change, integration change, or doc change. The 19-step workflow (understand → investigate → plan → implement → verify → update knowledge → summarize), with a task-type adaptation table and a quick-reference checklist. Start here for anything non-trivial. |
| [adding-a-command.md](workflows/adding-a-command.md) | Add a new undoable SCXML mutation |
| [adding-a-validation-rule.md](workflows/adding-a-validation-rule.md) | Add or extend a validator check |
| [adding-a-side-panel.md](workflows/adding-a-side-panel.md) | Add a new panel to the single-panel-slot system |
| [running-and-writing-tests.md](workflows/running-and-writing-tests.md) | Run `npm test`, know what's actually covered, add a new test correctly |
| [release-process.md](workflows/release-process.md) | Cut a new version and understand what CI does |
| [local-github-integration-setup.md](workflows/local-github-integration-setup.md) | Run the local OAuth relay server for GitHub integration during development |

## Known issues worth checking before you touch adjacent code

Confirmed, specific defects (not style opinions) found during source analysis. Full detail in `PROJECT_ANALYSIS.md` §14; the relevant feature doc for each also calls it out under "Known limitations."

- `ChangeStateTypeCommand.undo()` doesn't restore transitions/substates stripped by a state→final conversion, and state→parallel conversion is not fully implemented ([state-node-types.md](features/state-node-types.md), [state-editing.md](features/state-editing.md)).
- Leftover `debugger;` statements execute on every layout pass (`adaptive-spacing.ts:36`, `hub-centroid-nudge.ts:51,120`) and on every connection attempt (`initial-group-utils.ts`) ([auto-layout-elk.md](features/auto-layout-elk.md), [initial-state-groups.md](features/initial-state-groups.md)).
- `viz:xywh` is written space-separated by a couple of `scxml-manipulation-utils.ts` code paths but read as comma-separated everywhere ([visual-metadata-namespace.md](features/visual-metadata-namespace.md)).
- `visual-style-utils.ts:22` likely double-prepends `#` to `viz:rgb` colors ([visual-metadata-namespace.md](features/visual-metadata-namespace.md)).
- `vitest.config.ts` excludes `**/__tests__/**`, silently skipping 5 real test files in `npm test` ([running-and-writing-tests.md](workflows/running-and-writing-tests.md)).
- `ContainerLayoutManager` (~700 lines) and `transition-edit-bar.tsx`/`state-actions-edit-bar.tsx` are dead code, imported/present but never actually invoked/rendered ([auto-layout-elk.md](features/auto-layout-elk.md), [transitions-editing.md](features/transitions-editing.md)).
- "Clean SCXML" export silently falls back to downloading the **original, un-stripped** content if both its stripping strategies throw, while still calling it "clean" ([file-import-export.md](features/file-import-export.md)).
- The State Actions panel **silently discards** any `<raise>`/`<log>`/`<script>`/`<if>`/`<foreach>` content in onentry/onexit the moment a user edits any assign/send/cancel row there — a real, confirmed data-loss risk for hand-authored files ([events-and-executable-actions.md](features/events-and-executable-actions.md)).
- `ConditionEvaluator`'s `evaluateCondition`/`formatCondition`/`getConditionSummary`/`usesVariable`/`createTestContext` methods have no confirmed call site anywhere in the live app — evidence of a partially-built or removed "test this condition" feature ([conditions-and-expressions.md](features/conditions-and-expressions.md)).
- Viewport position (zoom/pan) does not appear to persist across reloads despite a `ViewStateMetadata` type existing for it ([zoom-pan-controls.md](features/zoom-pan-controls.md)).
- `src/components/file-operations/visual-metadata-export.tsx` is dead code duplicating the real download logic in `use-download.ts` ([file-import-export.md](features/file-import-export.md)).
- The Monaco code editor hardcodes `'vs-dark'` regardless of the app-wide light/dark theme setting ([theme-and-appearance.md](features/theme-and-appearance.md), [monaco-code-editor.md](features/monaco-code-editor.md)).
- The app's single `ErrorBoundary` cannot catch errors thrown from event handlers (e.g. a Command execution failure) — only render-phase errors — meaning most runtime errors in this app's actual mutation code path are **not** covered by it ([error-handling-and-resilience.md](features/error-handling-and-resilience.md)).
- The host-embedding pre-init stub script in `layout.tsx` only pre-declares a subset of the full `ScxmlEditorAPI` surface; calling an unstubbed method before React mounts throws rather than queuing ([host-api-embedding.md](features/host-api-embedding.md)).
