# SCXML Rules — this product's specific dialect and constraints

This is a real W3C-SCXML-compatible authoring tool, but it enforces additional product-specific rules on top of the spec, and stores extra non-runtime data in the same file. Know both before writing code that reads or writes SCXML.

## Extensions on top of plain SCXML

### The `viz:` visual-metadata namespace

`xmlns:viz="http://visual-scxml-editor/metadata"`. Ignorable by any real SCXML engine. Confirmed attribute/element vocabulary:

| Attribute / Element | Format | Purpose |
|---|---|---|
| `viz:xywh` | `"x,y,width,height"` comma-separated | Position + size of a state/note |
| `viz:rgb` | hex color, e.g. `#e1f5fe` | Fill color override |
| `viz:sourceHandle` / `viz:targetHandle` | `top`\|`bottom`\|`left`\|`right` | Which side of a node a transition connects to |
| `viz:waypoints` | `"x1,y1;x2,y2;..."` semicolon-separated | Manually-routed edge path points |
| `viz:curve-type`, `viz:marker-type`, `viz:label-offset`, `viz:z-index` | — | Legacy/secondary — extracted by `VisualMetadataManager`, not clearly round-tripped by the live editing path |
| `viz:note` (element, not attribute) | child of a state or the document root | Sticky-note annotation; id-prefixed `note:` |

**Known inconsistency**: some `scxml-manipulation-utils.ts` code paths write `viz:xywh` space-separated instead of comma-separated. Every reader expects comma-separated. Treat comma-separated as canonical.

Legacy namespace URIs/prefixes (`http://scxml-viz.github.io/ns`, `urn:x-thingm:viz`, `ns1:`) are actively migrated to the canonical form on write-back (`writeLayoutToSCXML`) — if you encounter one of these while debugging an older file, it's expected, not corruption.

"Clean" export strips everything `viz:`-prefixed (element or attribute) to produce plain W3C-compliant SCXML. Two independent implementations exist (structural, preferred; regex-based string fallback) — see `.claude/features/visual-metadata-namespace.md`.

### Datamodel naming conventions (`conf_`, `this_`, `main_`)

See `.claude/project/terminology.md`. These are pure naming conventions, not schema-enforced — the SCXML is still valid without them, but the Config Panel, Channel Mapping Panel, and one validator warning all depend on this convention being followed.

### "after X" timer shorthand

Authored as `after 2s` / `after 714ms` / `after (expr) s` in the Transition panel UI; stored as native `<send>`/`<cancel>` with `delay`/`delayexpr` plus a synthetic event named `{stateId}_t_{N}_timeEvent_{N}`. **The runtime interprets a bare `delayexpr` as raw milliseconds with no unit conversion** — so an expression authored in seconds gets `* 1000` baked into the stored `delayexpr` value; the UI reverses this for display so the user never sees the injected multiplication. This is a hard runtime constraint, not a display preference — don't remove the multiplication without also changing what the generator/runtime expects.

## Product-specific structural rules (not W3C requirements)

- **Cross-hierarchy transition rule**: a transition's source and target must share the same parent state. Enforced as an error by validation. This is a deliberate product requirement (validator comments cite "Milestone 5 — 1C"), and the Initial-State-group analysis assumes it holds.
- **Initial State groups**: multiple states at the same hierarchy level may each be independently marked Initial, as long as they are not connected (directly or transitively) by transitions to each other. Marking a second, already-connected state Initial is blocked; drawing a transition that would connect two independently-Initial-marked states is blocked. See `.claude/features/initial-state-groups.md`.
- **Transition slots**: at most one transition per (source, target, type) combination may occupy each of `event`/`timer`/`cond`/`always`. A transition may not set both `event` and `cond` (this is actually legal per some SCXML interpretations, but this product treats it as invalid — always flagged). See `.claude/features/transitions-editing.md`.
- **`conf_` field deletion is usage-checked**: deleting a config value is refused (not just warned) if it's still referenced anywhere in the document.

## Validation summary (16 ordered passes — full detail in `.claude/features/scxml-validation.md`)

1. Position/hierarchy index build. 2. State/target reference resolution. 3. Root-level initial-state reference check. 4. Required-attribute walk. 5–6. W3C document-level compliance + structural pass. 7. Semantic checks (unreachable states, duplicate ids, `main_` prefix warning). 8. Transition semantics (type, internal self-target-only, event-name syntax). 9. Transition-slot conflicts. 10. Executable-content sanity. 11. Unknown-attribute/typo detection. 12. Cross-hierarchy rule. 13. Initial-State-group conflicts.

**Known validation coverage gaps** (do not assume these are covered just because a sibling case is):
- Compound states nested inside a `<parallel>` are not checked for a missing `@initial` (the recursive walk only follows `state → state`, not `state → parallel → state`).
- `<onentry>`/`<onexit>` unknown-attribute checks are effectively dead for files loaded from disk (they read a `.executable[]` shape the real parser doesn't produce — only the app's own in-memory editing code produces that shape). Required-attribute checks for the same content work correctly, since they read differently.
- Several of the 7 downstream-C#-generator pitfalls in `docs/invalid-event-identifiers.md` (empty `event=""`, C# reserved words, digit-leading event names, wildcard `assign` locations, event-name sanitization collisions) do not have a corresponding automated validator rule yet.

## Downstream consumer constraints (why some rules exist)

The SCXML produced here is compiled by a **C# code generator** running on **Raspberry Pi** control hardware (see `docs/invalid-event-identifiers.md`, tested against a real file `argon_supply.scxml` controlling pumps/valves/heaters). This means:
- Event names become C# identifiers — they cannot be C# reserved words (`event`, `class`, `return`, ...), cannot start with a digit, and cannot be empty.
- Two event names that differ only by punctuation/operators can collapse to the same generator-sanitized identifier (e.g. `foo <= 0.3` and `foo > 0.3` both become `"foo 0 3"`) — causing a runtime crash in the generated plugin, not a compile error. This is a real failure class already observed in production, worth validating for.
- `<assign location="...">` cannot contain wildcards (`*`) — the generator has no support for pattern-based assignment.
- Every variable referenced in `<assign>` must be declared in `<datamodel>` *and* have a corresponding `IO.conf` entry on the target system — this repo can only validate the datamodel half.
- A typo'd `initial` attribute (referencing a non-existent child id) compiles but produces broken generated code with a runtime state reference to nothing — the current unreachable-state validator does not specifically call this out with the parent context except at root level (see gap above).
