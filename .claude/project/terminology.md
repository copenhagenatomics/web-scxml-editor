# Terminology / Domain Glossary

Terms used pervasively in code, UI text, and commit history that aren't self-explanatory from SCXML alone. Read this before touching Config Panel, Channel Mapping Panel, Events Panel, or validators — they all assume this vocabulary.

## Datamodel naming conventions (prefix-based, not enforced by the SCXML schema itself)

| Prefix | Meaning | Where enforced/read |
|---|---|---|
| `conf_` | A **config value**: a datamodel variable meant to be overridden per physical deployment (e.g. `conf_threshold`). Surfaced in the **Config Panel**, synced against the host's `IO.conf` overrides. Type is inferred from the literal or an explicit `@_confType` attribute (`int`/`double`/`bool`/`string`). | `src/lib/utils/datamodel-extractor.ts` (`extractConfigFields`, `ConfigField`), `src/components/ui/config-panel.tsx` |
| `this_` | A **channel** reference: an identifier expected to map to a physical I/O channel on the host, but not (yet) declared in `<datamodel>`. Typing a new `this_`-prefixed identifier anywhere an expression is expected (Monaco, transition panel, state-actions expression fields) offers a "create new channel" completion, which runs `AddDataCommand` to declare it as a `<data>` element. | `src/lib/utils/datamodel-extractor.ts` (`extractUnresolvedChannelRefs`), `src/lib/monaco/enhanced-scxml-completion.ts`, `src/lib/utils/expression-autocomplete.ts`, `src/lib/commands/add-data-command.ts` |
| `main_` | **Anti-pattern, flagged by validation.** A variable named this way ties it to one specific state machine ("main"); if the state/action is copied into a different machine, `main_x` won't resolve there. The validator suggests renaming to `this_x` instead. Warning severity, not blocking. | `src/lib/validators/scxml-validator.ts` (`main_`-prefix pass), `src/lib/utils/datamodel-extractor.ts` (`extractMainPrefixedExpressionRefs`) |
| (none — plain datamodel var) | An ordinary `<data>` variable, internal to this state machine only. | — |

**"Channel"** (as a noun in the UI/host API, distinct from the `this_` naming convention above) = a `ChannelInfo` object pushed in by the host (`{name, type: 'ch'|'in'|'out'|'st'|'cf'|'th'|'dm'}`) representing one physical I/O point LoopControl exposes. The **Channel Mapping Panel** maps an *unresolved SCXML identifier reference* (any expression-attribute token not found in `<datamodel>`, not `conf_`/`this_`-prefixed) to one of these host-provided channel names.

## SCXML structural concepts specific to this product (not W3C terms)

| Term | Meaning |
|---|---|
| **Initial State group** | A connected component (via sibling transitions) among one container's direct children that has exactly one state marked Initial (`@initial` attribute or legacy `<initial>` child). This product allows **multiple independent Initial State groups** at one hierarchy level — i.e. multiple disconnected sub-machines, each with its own entry point, coexisting as siblings. Drawing a transition (or unioning via any edit) that would connect two differently-Initial-marked groups is blocked live and flagged by validation, because it would illegally merge two groups into one with two conflicting "starts." See `.claude/features/initial-state-groups.md`. |
| **Transition slot** | The bucket a transition falls into, for the purposes of "only one transition of this kind is allowed between the same source/target/type": `'event'` (plain event-triggered), `'timer'` (auto-generated `after X` delay event), `'cond'` (condition-only, eventless), `'always'` (fully eventless/unconditional), `'invalid-both'` (has both `event` and `cond` — always an error). See `.claude/features/transitions-editing.md`. |
| **Cross-hierarchy transition rule** | A transition's source and target must share the same parent state. This is a deliberate product requirement ("Milestone 5 — 1C" per validator comments), not a W3C rule. Everything about Initial State groups assumes this holds (their union-find analysis only looks at direct siblings). |
| **"after X" syntax** | Shorthand UI syntax (`after 2s`, `after 714ms`, `after (expr) s`) for a timed transition, translated under the hood into native SCXML `<send>`/`<cancel>` with `delay`/`delayexpr`. See `.claude/features/time-transition-syntax.md`. |
| **Internal event reaction** | A targetless `<transition event="X" type="internal"\|"external">` containing `<assign>` children — used as a state-scoped event handler that doesn't cause a state change. Shown in the "reactions" tab of the State Actions panel; rendered on the canvas only as a "reaction:N" count badge, never as an edge. |
| **Visual metadata / `viz:` namespace** | Non-runtime layout/style data (position, size, colors, edge waypoints, connection handles) stored as `viz:`-prefixed attributes/elements in the SCXML XML itself, ignorable by any real SCXML engine. See `.claude/project/scxml-rules.md` and `.claude/features/visual-metadata-namespace.md`. |
| **Compound state** | A `<state>` with `<state>`/`<parallel>`/`<final>`/`<history>` children — must declare `@initial` or an `<initial>` child. Rendered with a dashed border; "compound" here is a UI/validation concept, computed from having children, not a distinct SCXML element. |
| **Drill-down / hierarchy navigation** | The UX model for viewing nested states: only one hierarchy level is visible on the canvas at a time. Clicking into a compound state navigates the whole canvas to show just its direct children; a breadcrumb/back button returns to the parent level. Compound states are **not** rendered with children visually nested inside their box. |

## Host / LoopControl integration terms

| Term | Meaning |
|---|---|
| **Host** | The embedding application (LoopControl) when this editor runs inside an iframe, as opposed to standalone browser access. |
| **`window.ScxmlEditorAPI`** | The global bridge object the host uses to push/pull data. See `.claude/features/host-api-embedding.md`. |
| **`_q` queue** | A pre-ready command queue pattern: if the host's script runs before this app's React tree mounts, calls are stashed on `window.ScxmlEditorAPI._q` and flushed once the real API is wired up. |
| **Host Alerts** | Persistent, host-pushed error/warning messages (`showErrors()`/`clearErrors()`), shown in a dedicated tab of the Validation Panel — a completely separate channel from this editor's own SCXML validation errors. |
| **User Actions** (UI label) = **Events** (code/type name) | Operator-facing UI buttons defined via the Events Panel (`EventEntry`), each optionally taking a numeric argument with min/max/unit, and optionally hidden from the operator view. Not the same concept as an SCXML `event` attribute, though the two interact (an Events-panel entry is meant to be raised as a transition event). |
| **IO.conf** | The host-side configuration file/mechanism that stores per-deployment overrides for `conf_`-prefixed values; represented in this app as `ConfigOverride[]` pushed in via `setConfigValues()`. |

## Codebase-internal terms

| Term | Meaning |
|---|---|
| **Command** (capitalized) | An instance of the `Command`/`BaseCommand` pattern in `src/lib/commands/*` — a stateless `execute(content) -> {content, success}` / `undo(content) -> {content, success}` transform over the whole SCXML string, using the browser's native `DOMParser`/`XMLSerializer`. Distinct from the separate "direct object-tree edit" path (`scxml-manipulation-utils.ts`, using `fast-xml-parser`'s object tree) used for connect/paste/reparent. See `.claude/project/coding-rules.md`. |
| **History entry** | A full SCXML string snapshot pushed into `useHistoryStore`, not a diff or a Command object. "Undo" = restoring an earlier full string. |
| **Enhancement pass** | The local post-processing `visual-diagram.tsx` does after calling `SCXMLToXStateConverter.convertToReactFlow()` — re-applying visual-metadata overrides, wiring node callbacks, computing CSS styles, grouping/offsetting parallel edges. |
