# Architecture Decisions

Cross-cutting decisions about the overall shape of the system — not specific to any one feature. See `.claude/project/architecture.md` for the descriptive (non-decision-record) version of this same material.

---

## 1. Static export deployment (no Node server at runtime)

### Context
The primary deployment target is embedding this editor inside Copenhagen Atomics' "LoopControl" platform, running on physical, per-installation industrial control hardware — each device reachable only at its own local network address, with no shared public origin.

### Decision
`next.config.ts` sets `output: "export"` — the app builds to a fully static `out/` directory with no Next.js server runtime. Webpack fallbacks disable `fs`/`path`/`crypto` for the client bundle.

### Reason
A static export requires no server process alongside LoopControl on each device, works fully offline (Monaco is bundled locally, not loaded from a CDN), and can be served by whatever the host environment already has available.

### Constraints
- No server-side rendering, API routes, or server-side secrets are possible — anything server-like (the GitHub OAuth relay) must be a separate, independently-deployed service.
- `NEXT_PUBLIC_*` env vars are baked in at **build time** — cannot be reconfigured per-deployment without a rebuild.
- Embedding detection (`window.self !== window.top`) must be deferred to a `useEffect`, never checked during render, because the statically-exported HTML is built with no `window` object present.

### Alternatives
None found evidenced in the repository — no discussion of an SSR or Node-server alternative was found in commits, docs, or comments.

### Evidence
`next.config.ts`, `.github/workflows/release.yml`, `RELEASE.md` (release notes explicitly instruct serving the zip with `python3 -m http.server`/`npx serve`), `src/app/_hooks/use-initial-load.ts` (comment explaining the render-vs-effect distinction exists specifically because of this).

### Status
Accepted.

---

## 2. Two coexisting SCXML-mutation strategies (Commands vs. direct object-tree edits)

### Context
The app needs undoable, structured mutations (rename, resize, delete, edit actions) for most interactions, but a few operations (drawing a new connection, copy/paste, drag-to-reparent) were implemented differently.

### Decision
Two separate mutation code paths coexist: (1) the **Command pattern** (`src/lib/commands/*`, 16 classes implementing `execute`/`undo`/`getDescription`), using the browser's native `DOMParser`/`XMLSerializer`; (2) **direct object-tree edits** (`src/lib/utils/scxml-manipulation-utils.ts`), using `fast-xml-parser`'s parsed object representation, invoked only from `visual-diagram.tsx` for `onConnect`, add-root-state, copy/paste, and drag-to-reparent.

### Reason
Not explicitly documented in any single design note. The Command pattern's own header comment (`base-command.ts`) states its purpose is "undo/redo functionality" and "clean separation of business logic from UI" — suggesting the DOM-based approach was chosen for its transactional execute/undo symmetry. The direct-edit path appears to be either an earlier implementation predating the Command pattern's introduction for these four operations, or a deliberate choice that these particular operations didn't need per-operation undo semantics beyond the whole-document history snapshot already covering them (see `state-management.md` #2).

### Constraints
- Never mix the two libraries within one mutation — a Command must always finish via `DOMParser`/`XMLSerializer`, never `fast-xml-parser`'s builder, or vice versa.
- New diagram interactions that mutate SCXML should default to the Command pattern (per `.claude/project/coding-rules.md`) unless following the existing four-operation precedent.

### Alternatives
None found evidenced — no comment or commit indicates the team considered unifying these into one strategy.

### Evidence
`src/lib/commands/base-command.ts`, `src/lib/utils/scxml-manipulation-utils.ts`, `src/components/diagram/visual-diagram.tsx` (`onConnect`, `handleAddRootState`, copy/paste, reparent handlers).

### Status
Accepted (with the caveat that the split appears organic rather than a deliberately documented up-front design — treat the four direct-edit operations as an accepted precedent, not necessarily a pattern to actively extend to new features without reason).

---

## 3. Validation and diagram rendering are fully independent pipelines

### Context
Both the code editor's error list and the visual diagram need to interpret the same SCXML content, but on different schedules and for different purposes.

### Decision
`SCXMLParser`/`SCXMLValidator` (feeding the Validation Panel) and `SCXMLToXStateConverter` (feeding the ReactFlow diagram) are invoked completely independently, each doing its own full parse of the current `content` string on every change. Neither pipeline's output informs the other; a document with active validation errors still renders normally in the diagram.

### Reason
Not explicitly documented, but consistent with each pipeline evolving as its own self-contained subsystem (separate directories `src/lib/validators/` vs `src/lib/converters/`, separate test suites, separate authors' incremental commits over time per `docs/superpowers/plans/`).

### Constraints
- A change to one pipeline's understanding of the document structure (e.g. how `<parallel>` children are traversed) is not automatically reflected in the other — each has its own hierarchy-building logic (see `state-management.md`/`scxml.md` for the specific duplicate-hierarchy-map consequence).
- Validation errors reach the diagram only indirectly, via `useEditorStore().focusTarget` set from a validation-panel click — there's no direct coupling.

### Alternatives
None found evidenced.

### Evidence
`src/app/_hooks/use-content-validation.ts`, `src/components/diagram/visual-diagram.tsx`'s `scxmlContent`-keyed effect, `src/lib/validators/state-validator.ts`'s independent `buildStateHierarchy` vs. `src/lib/converters/converter-modules/state-registry.ts`'s `registerAllStates`.

### Status
Inferred behavior — an architectural consequence of independent development over time rather than a documented up-front design choice, but stable and load-bearing enough that it should be treated as an accepted constraint going forward.

---

## 4. `page.tsx` as a thin orchestrator; logic extracted into `src/app/_hooks/`

### Context
`DEVELOPER_GUIDE.md` (now stale) describes an earlier architecture where `page.tsx` owned inline logic directly (handlers for content-change, history tracking, etc., shown as ~478 lines of code inline in that doc's examples).

### Decision
The current `src/app/page.tsx` (~250 lines) contains almost no logic — it composes ~9 single-purpose hooks (`use-initial-load`, `use-file-operations`, `use-content-validation`, `use-history-restore`, `use-host-api-bridge`, `use-download`, `use-more-menu`, `use-github-connect`, `use-github-pull`) and 3 layout/pane components.

### Reason
Not explicitly documented in a design note, but the shape (one hook per concern, each independently testable) is a standard React refactoring pattern for reducing a growing root component's complexity. The existence of the now-outdated `DEVELOPER_GUIDE.md` describing a monolithic `page.tsx` is itself evidence this extraction happened as a deliberate refactor at some point after that doc was written (and the doc was never updated to match).

### Constraints
New page-level concerns should be added as a new hook in `src/app/_hooks/`, not as inline logic in `page.tsx` — this keeps the established pattern consistent.

### Alternatives
The "before" state (logic inline in `page.tsx`) is directly visible in `DEVELOPER_GUIDE.md`'s code samples — this is the one case in the repository where an alternative is not just inferred but literally documented (as the old approach the code has since moved away from).

### Evidence
`src/app/page.tsx`, `src/app/_hooks/*`, `DEVELOPER_GUIDE.md` §"Two-Way Synchronization" (the outdated inline-logic example).

### Status
Accepted (current state); the monolithic alternative is Superseded.

---

## 5. Commands always re-parse and re-serialize the whole document (no shared live DOM)

### Context
Every SCXML mutation needs to read the current document, make a targeted change, and produce a new document string.

### Decision
Every Command's `execute()`/`undo()` independently calls `DOMParser.parseFromString()` on the full incoming content string and `XMLSerializer.serializeToString()` on the way out — there is no shared, long-lived `Document` object that commands operate on in sequence.

### Reason
Not explicitly documented, but this design directly supports the string-snapshot-based history model (see `state-management.md` #2) — since every mutation is a pure `(string) => string` function, chaining commands through history requires no special handling of a stateful document object surviving across operations.

### Constraints
Performance cost: every single edit (including debounced continuous ones like drag) re-parses the entire document from scratch. Acceptable for this app's expected document sizes; would need reconsideration if documents grew very large. See `performance.md`.

### Alternatives
None found evidenced — no comment discusses maintaining a shared live `Document` instance across commands.

### Evidence
`src/lib/commands/base-command.ts` (`parseXML`/`serializeXML` called fresh in every command), consistent behavior across all 16 command files.

### Status
Accepted.

---

## 6. `SCXMLToXStateConverter` does not use the `xstate` npm package

### Context
The converter class that turns SCXML into ReactFlow nodes/edges is named `SCXMLToXStateConverter`, and `.claude/context/CLAUDE.md` (stale) lists "XState 5.21.0" as a dependency.

### Decision
No `xstate` package is installed (confirmed absent from `package.json`); the converter only borrows XState's conceptual vocabulary for state classification (simple/compound/parallel/final), it does not construct or execute an XState machine at any point.

### Reason
Unknown — no comment or commit explains the naming choice. Most plausibly the class was originally scaffolded with an intent to use XState for validation/simulation, and that dependency was later dropped while the class name was never updated to match, or the name was chosen purely for its descriptive value ("this converts SCXML into an XState-style typed state model") independent of the actual library.

### Constraints
None — this is purely a naming artifact, not a behavioral constraint.

### Alternatives
N/A.

### Evidence
`package.json` (no `xstate` dependency), `src/lib/converters/scxml-to-xstate.ts` (class body has no `xstate` import), `.claude/context/CLAUDE.md` (the stale doc making the incorrect claim).

### Status
Inferred behavior — naming residue, not a deliberate architectural decision with recoverable rationale.

---

## 7. AI development knowledge lives only in `.claude/` — no separate Claude Code Plugin, no MCP server

### Context
Two additional layers were built on top of `.claude/`: a packaged Claude Code Plugin (`plugin/`, 10 namespaced skills + a manifest) intended to make the knowledge base installable/shareable, and a read-only MCP server (`mcp-server/`, 16 tools) intended to give any MCP client sandboxed access to the repository, `.claude/`, and a small set of verification commands. Both were later reviewed against the actual development workflow and found to be unnecessary indirection.

### Decision
Both were removed in full. `.claude/` is the single, sole source of truth for all SCXML-Editor-specific AI development knowledge — architecture, features, decisions, rules, workflows, skills, and terminology. There is no plugin layer and no MCP server in this repository.

### Reason
- **The plugin's skills were already thin pointers to `.claude/skills/`, not a second copy of their content** — by design, they added a namespace (`/scxml-editor:*`) and an installable packaging, but zero additional knowledge. Once the goal shifted to "simplest architecture for this repo's own development workflow" rather than "shareable/installable across projects," that packaging had no remaining purpose: a namespace prefix and a marketplace-installable format are only valuable if the plugin is meant to travel to other projects or be distributed to teammates as a versioned unit, which was never actually needed here — every developer working on this repo already has `.claude/` simply by cloning it.
- **Every one of the MCP server's 16 tools duplicated a capability Claude Code's native tools already provide directly** when working in this repo's own trusted, single-session context: `search_code`/`read_file`/`find_references`/`inspect_directory` duplicated Grep/Read/Glob; `search_project_knowledge`/`get_feature_documentation`/`get_project_rules`/`get_decision`/`search_decisions` duplicated a Read/Grep pass over `.claude/` guided by `index.md`'s own lookup tables (which is the intended mechanism regardless); `get_git_status`/`get_git_diff`/`inspect_recent_changes` duplicated plain `git` commands via Bash; `run_tests`/`run_typecheck`/`run_lint` duplicated `npm test`/`npx tsc --noEmit`/`npm run lint` via Bash. The server's hardened path-jail and command-allowlist were real, correctly-implemented security properties — but they matter for an **untrusted or external** MCP client, which was never the actual consumer; the actual consumer is this same trusted Claude Code session, which already has full repository access by design.
- No capability was found, on review, that Claude Code genuinely cannot provide otherwise for this repository's own development workflow.

### Constraints
- All future project-specific AI knowledge must be added to `.claude/` — see `.claude/index.md`'s "single source of truth" statement.
- If a future need for a *different* consumer genuinely arises (e.g. an external, non-Claude-Code MCP client that cannot read `.claude/` directly, or a decision to distribute this knowledge base to other Copenhagen Atomics repositories as a shared, versioned package), rebuilding either layer is a deliberate, from-scratch architectural decision requiring its own review — not a default to fall back on because the code once existed.

### Alternatives
**Directly evidenced, not hypothetical**: both the plugin (`plugin/`) and the MCP server (`mcp-server/`) were fully built, tested, and validated (the plugin passed `claude plugin validate --strict`; the MCP server passed a 22-test smoke suite and a real end-to-end stdio connectivity check) before being removed. This is the rare case in this decision log where the "alternative" is not inferred from residue — it was the immediately prior, working state of the repository.

### Evidence
Prior conversation history building `plugin/` and `mcp-server/`; `.claude/index.md`'s "single source of truth" note; `mcp-server/README.md` and `plugin/README.md` (removed) documented each layer's original, individually-reasonable rationale — neither was a mistake in isolation, the combined system was simply more than this repository's actual workflow needed.

### Status
Accepted (current — `.claude/`-only). The plugin and MCP layers are Superseded.
