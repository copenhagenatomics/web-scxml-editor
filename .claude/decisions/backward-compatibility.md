# Backward Compatibility Decisions

Covers how the project handles older/foreign SCXML documents that predate a current convention.

---

## 1. Legacy visual-metadata namespace URIs/prefixes are actively migrated on write-back

### Context
The `viz:` namespace URI/prefix has apparently changed at least twice over the project's history.

### Decision
`writeLayoutToSCXML` actively detects and rewrites at least two legacy namespace URIs (`http://scxml-viz.github.io/ns`, `urn:x-thingm:viz`) and an `ns1:` prefix to the current canonical `http://visual-scxml-editor/metadata` / `viz:` form, every time layout data is written back to a document.

### Reason
Not documented in a dedicated note, but this is the only way older files created under a prior namespace scheme continue to have their visual metadata recognized and preserved rather than silently orphaned/ignored after a namespace change.

### Constraints
If the canonical namespace/prefix is ever changed again, a third migration case must be added here, following the same pattern — this list is expected to grow, not be replaced.

### Alternatives
None found evidenced (e.g., requiring users to manually re-save old files in a new format was not the chosen approach).

### Evidence
`src/lib/converters/converter-modules/visual-metadata.ts` (`writeLayoutToSCXML`, legacy-URI/prefix detection and rewrite logic).

### Status
Accepted.

---

## 2. Older `conf_` fields lacking a `confType` attribute are backfilled on load

### Context
The `confType` attribute (recording a config field's intended type: int/double/bool/string) was added to the `conf_` convention after some files using `conf_`-prefixed fields already existed without it.

### Decision
`annotateLegacyConfTypes` runs on every load path (upload, create-new, GitHub pull, host `loadScxml`) to infer and backfill a `confType` attribute onto `conf_`-prefixed `<data>` elements that predate it.

### Reason
Not documented in a dedicated note, but this ensures the Config Panel's type dropdown and type-aware editing behave consistently for files created before `confType` existed, without requiring the user to manually re-specify types for every pre-existing config value.

### Constraints
The inference heuristic (`inferType`, based on the literal `expr` value) is a best-effort guess for older files — it may not always match what the original author intended, since that information wasn't captured at the time.

### Alternatives
None found evidenced (e.g., leaving old fields typeless and requiring the user to explicitly set a type before the Config Panel would accept them was not the chosen approach).

### Evidence
`src/lib/utils/datamodel-extractor.ts` (`annotateLegacyConfTypes`, `inferType`), called from `use-file-operations.ts`, `use-github-pull.ts`, `use-host-api-bridge.ts`.

### Status
Accepted.

---

## 3. Duplicate/legacy transition patterns are normalized on load, not flagged as errors

### Context
Older or hand-edited SCXML documents can contain multiple transitions that later conventions (transition slots) would treat as conflicting duplicates.

### Decision
Rather than flagging pre-existing duplicate transitions as validation errors on open, the load pipeline silently merges them into the current canonical form (comma-combined events, OR-combined conditions) — see `editing.md` #7 for the full mechanism.

### Reason
This is explicitly why the static `transition-slot-validator` only needs to catch violations introduced *after* load, per that validator's own docstring — treating pre-existing legacy patterns as silently-fixable rather than error-worthy avoids surfacing a wall of validation errors on every older file the moment it's opened.

### Constraints
This merge is destructive of the original XML formatting/structure for affected transitions (they're rewritten into the canonical merged form) — this is accepted as a tradeoff for a clean validation experience on load.

### Alternatives
Flagging these as validation errors requiring manual fixing (rather than silently merging) is the implicit alternative not chosen.

### Evidence
`src/lib/utils/transition-merge-utils.ts`, `src/lib/validators/transition-slot-validator.ts` (docstring referencing merge-on-load as a precondition).

### Status
Accepted.

---

## 4. Both the `<initial>` element form and the `@initial` attribute form are read; only the attribute form is ever written

### Context
See `scxml.md` #4 for the full mechanism — covered here specifically as a backward-compatibility decision.

### Decision
Reachability analysis, Initial-group analysis, and the Initial-toggle command all read both forms when determining a document's current Initial markers. Nothing in the app writes the `<initial>` element form going forward — any state toggled through the UI is normalized to the attribute form, and the legacy element (if present) is removed at that point.

### Reason
This is the standard "read old and new, write only new" backward-compatibility pattern — it ensures existing documents using the legacy element form continue to work correctly (are read correctly for validation/rendering purposes) while nudging the document toward the newer, more expressive attribute form (which supports multiple values, needed for Initial-State groups) over time, one edit at a time, without requiring a one-time bulk migration step.

### Constraints
A document with `<initial>` elements the user has never touched through this app's Initial-toggle UI will continue to use that form indefinitely — there is no proactive, whole-document migration; normalization is purely a side effect of individual edits.

### Alternatives
A one-time bulk migration (rewriting every `<initial>` element to the attribute form on file load, regardless of whether the user touches that specific state) is the implicit alternative not chosen — the incremental, edit-triggered approach was used instead.

### Evidence
`src/lib/commands/toggle-initial-state-command.ts`, `src/lib/utils/initial-group-utils.ts` (`getInitialIds`), `src/lib/validators/state-validator.ts` (`findReachableStates` reading both forms).

### Status
Accepted.
