# Feature: Config Panel (`conf_`-prefixed values)

## Purpose

Let a user expose specific datamodel values as per-deployment configurable settings — values that stay the same across code changes but differ per physical installation (e.g. a threshold, a target setpoint) — and see/edit both the SCXML-authored default and the host's live `IO.conf` override side by side.

## User behavior

- Adding `conf_` as a prefix to any `<data>` field's id makes it appear in this panel automatically — no separate registration step.
- Each row shows the field name, an inline type selector (`int`/`double`/`bool`/`string`), the "Data Model" default value (editable, committed on blur or Enter), and the "IO.Conf" override value (host-provided, also editable in this UI, which optimistically merges local edits over host state).
- Deleting a config field is **refused** (not just warned) if it's still referenced anywhere in the SCXML — the user gets an explanatory toast instead ("Cannot delete 'conf_x': still referenced in ...").
- Adding a new config value here writes a real `<data id="conf_name" expr="..." confType="...">` into the document's `<datamodel>` (creating `<datamodel>` if absent).

## UI behavior

- Empty state explicitly instructs: "Add a `conf_` prefix to any `<data>` field in the datamodel to make it configurable per deployment," with a worked example — there's no generic "add config value" affordance that works before that convention is followed.
- The type dropdown is a custom-positioned floating menu (`createPortal` to `document.body`, manually positioned against the trigger button's bounding rect) rather than a native `<select>`.

## Internal architecture

- `extractConfigFields(scxmlContent)` (`datamodel-extractor.ts`) scans `<datamodel><data>` for `conf_`-prefixed ids, inferring type from `@_confType` if present or from the literal `expr` value via a heuristic (`inferType`) otherwise.
- `mergeConfigEntries(fields, configOverrides, previousEntries)` (`config-overrides.ts`) reconciles three sources on every re-render: the freshly-extracted SCXML fields, the host-pushed `ConfigOverride[]` (`useHostAPIStore.configOverrides`), and the panel's own in-progress local edits (`previousEntries`) — **local edits win over stale host state** until the user's edit is itself committed back out.
- Field edits are **not applied immediately to the SCXML** for the default-value input — they update local component state on every keystroke, and only call `onFieldChange` (→ `updateConfigFieldExpr`, a Command-adjacent direct XML mutation via `datamodel-extractor.ts`) on blur or Enter. The override-value input is host-facing state only (not written into the SCXML at all — it's a separate override list, not part of the document).
- `onEntriesChange` callback (parent-supplied, ultimately from `use-host-api-bridge.ts`) reports the current merged entry list back out — this is how `getConfigValues()` in the Host API bridge stays current without a store round-trip.

## Relevant components

`src/components/ui/config-panel.tsx`.

## Relevant state/store

`useHostAPIStore.configOverrides`/`configOverridesLoaded` — the host-pushed override list; `configOverridesLoaded` gates the merge effect so it doesn't run against a not-yet-populated overrides array on first mount.

## Relevant utilities

`src/lib/utils/datamodel-extractor.ts` (`extractConfigFields`, `updateConfigFieldExpr`, `updateConfigFieldType`, `deleteConfigField`, `annotateLegacyConfTypes`, `getConfigFieldUsage`), `src/lib/utils/config-overrides.ts` (`mergeConfigEntries`).

## SCXML behavior

`<data id="conf_name" expr="defaultValue" confType="int|double|bool|string"/>` inside `<datamodel>`. `confType` is this editor's own extension attribute (not part of the W3C `<data>` element) — used purely to remember the intended type across sessions since a literal `expr` alone can be ambiguous (e.g. `"0"` could be int or bool-as-0/1). `annotateLegacyConfTypes` backfills this attribute onto older files that predate it, on every load.

## Validation rules

No dedicated SCXML validator rule exists for `conf_` fields specifically — type mismatches between `confType` and the actual `expr` literal are not flagged by `SCXMLValidator`. The only enforced rule is the **usage-check-before-delete**, implemented in the panel itself (`getConfigFieldUsage`), not in the validation pipeline.

## Related features

- `channel-mapping-panel.md` — reads the *complementary* set of identifiers (everything unresolved that is **not** `conf_`-prefixed) from the same underlying expression-scanning utilities.
- `host-api-embedding.md` — the source of `configOverrides` and the destination of `onEntriesChange`.
- `monaco-code-editor.md` — `this_`/datamodel-variable autocomplete shares the same underlying scan, though `conf_` values aren't specifically surfaced there beyond being ordinary datamodel variables.

## Related files

`src/components/ui/config-panel.tsx`, `src/lib/utils/datamodel-extractor.ts`, `src/lib/utils/config-overrides.ts`, `src/app/_hooks/use-host-api-bridge.ts`, `src/app/_components/side-panels.tsx`.

## Tests

`src/lib/utils/datamodel-extractor.test.ts`, `src/lib/utils/__tests__/config-overrides.test.ts` — **note this second file sits in a `__tests__/` directory and is currently excluded from `npm test`** by `vitest.config.ts` (see `.claude/workflows/running-and-writing-tests.md`). No RTL component test exists for `config-panel.tsx` itself.

## Known limitations

- The `config-overrides.test.ts` test file for the merge-precedence logic (the most subtle part of this feature — local edits vs. host overrides vs. fresh SCXML extraction) currently never runs in CI due to the `__tests__/` exclusion bug.
- No SCXML-level validation catches a `confType` that doesn't match the actual `expr` literal's apparent type.

## Important edge cases

- Adding a config value with a **pre-filled override value** in the "add" form optimistically seeds that override into local `entries` state *before* the underlying `onAddField` SCXML mutation completes and the panel re-derives entries from the fresh document + `mergeConfigEntries` — this is deliberate (per the component's own comment) so the override isn't lost/flickered during the round-trip, relying on `mergeConfigEntries`'s "previous entries" parameter to preserve it.
- Blurring the default-value input with an unchanged value still calls `onFieldChange` — there's no dirty-check short-circuit, so every blur is a potential (no-op) SCXML mutation/history entry.

## Things that must NOT be changed

- Do not make the override-value input write into the SCXML document — by design, `IO.Conf` overrides are host-side state, not part of the authored SCXML; conflating the two would break the entire config-value-vs-override distinction this feature exists to represent.
- Do not remove the usage-check before delete — it's an explicit safety measure (a toast, not silent failure) preventing a user from breaking a still-referenced expression.

## Previous design decisions

`docs/superpowers/plans/2026-07-11-config-panel-host-bridge.md` documents this panel's origin as bridging `conf_`-prefixed datamodel vars to host-pushed overrides — the whole `conf_` naming convention predates this specific plan (it's referenced as already-established) but this plan is what added the live host-sync UI on top of it. `docs/superpowers/plans/2026-08-25-config-value-deletion.md` documents the usage-checked-deletion safety feature as a distinct, later addition — implying an earlier version allowed unchecked deletion.
