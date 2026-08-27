# Config Value Deletion — Design Spec

**Date:** 2026-08-25
**Branch:** new-requirements-ui

## Problem

`config-panel.tsx` supports adding a config value (`onAddField`) and editing its default/type/override inline, but there is no way to delete one once created. `deleteConfigField(xmlContent, name)` already exists in `datamodel-extractor.ts:186-214` — it correctly splices the matching `<data id="conf_<name>">` node out of the parsed XML — but it is never imported or called anywhere in the app.

A config value is not a standalone entity: it's a `<data>` element in the SCXML `<datamodel>` whose `id` starts with `conf_` (`extractConfigFields`, `datamodel-extractor.ts:57-70`). Its name is referenced elsewhere in the same document as a plain identifier in expression attributes (`cond`, `expr`, `location`, `namelist`, `targetexpr`, `srcexpr`) — there's no ID-based indirection. Deleting the `<data>` node without checking those references would silently turn every reference into an undeclared-variable reference, with no existing mechanism to warn about it.

## Goal

Add a delete action to `ConfigPanel`, wired through the already-implemented `deleteConfigField`. Before deleting, check whether the config value is still referenced anywhere in the SCXML; if so, block the delete and tell the user where it's used via an error toast. If it's unused, delete immediately with an info toast — matching the app's existing convention for Events and Channel Mappings (no confirmation dialog).

---

## Data Model

No new types. `ConfigField { name, type, defaultValue }` (`datamodel-extractor.ts:42-46`) is unchanged.

## New function: `getConfigFieldUsage`

Added to `src/lib/utils/datamodel-extractor.ts`, next to `extractUnresolvedChannelRefs`/`extractMainPrefixedExpressionRefs` (which it structurally mirrors):

```ts
/**
 * Returns the set of expression attribute values (cond/expr/location/namelist/
 * targetexpr/srcexpr) anywhere in the SCXML — excluding the conf_<name> field's own
 * <data> declaration — that reference conf_<name>. Empty array means safe to delete.
 */
export function getConfigFieldUsage(xmlContent: string, name: string): string[] {
  const targetId = `conf_${name}`;
  const locations: string[] = [];

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlContent);
  } catch {
    return [];
  }

  function walk(node: unknown, parentKey?: string, parentAttrs?: Record<string, unknown>): void {
    if (!node || typeof node !== 'object') return;
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (SCXML_EXPR_ATTRS.has(key) && typeof val === 'string') {
        // Skip the field's own declaration (data id="conf_<name>" expr="...")
        if (key === '@_expr' && parentKey === 'data' && parentAttrs?.['@_id'] === targetId) continue;
        const stripped = val.replace(/_event\./g, '');
        if (ConditionEvaluator.extractVariables(stripped).includes(targetId)) {
          locations.push(parentAttrs?.['@_id'] as string ?? parentKey ?? key);
        }
      } else if (key !== '@_id') {
        const attrs = node as Record<string, unknown>;
        if (Array.isArray(val)) val.forEach(item => walk(item, key, attrs));
        else walk(val, key, attrs);
      }
    }
  }

  walk(parsed);
  return locations;
}
```

This reuses `ConditionEvaluator.extractVariables` and the existing `SCXML_EXPR_ATTRS` set (`datamodel-extractor.ts:216`) — the same building blocks `extractUnresolvedChannelRefs` already uses — rather than introducing a second scanning mechanism. `locations` collects the enclosing element's `id` (falling back to its tag name) for each match, so the caller can report specifics, not just a count.

*Implementation note:* the exact shape of "
which identifying label to push per match" (state id vs. tag name vs. both) is a detail to finalize against real fixtures during implementation — the contract that matters is: empty array ⇔ safe to delete.

---

## UI Changes

### `config-panel.tsx`

- Add `onDeleteField: (name: string) => void` to `ConfigPanelProps` (`config-panel.tsx:75-83`), alongside `onAddField`/`onFieldChange`/`onTypeChange`.
- Add a `Trash2` icon button to each entry row's header line (next to the name/type, `config-panel.tsx:162-177`), styled the same as the delete button in `events-panel.tsx:134-140` (dimmed icon, hover → error color).
- Clicking it calls `onDeleteField(field.name)`. No local confirmation state — the block/allow decision happens in the handler passed down from `side-panels.tsx`.

### `side-panels.tsx`

Add an `onDeleteField` prop to the `ConfigPanel` instance (`side-panels.tsx:22-40`), following the same shape as `onFieldChange`/`onTypeChange`:

```ts
onDeleteField={(name) => {
  const usage = getConfigFieldUsage(content, name);
  if (usage.length > 0) {
    showFeedback(`Cannot delete 'conf_${name}': still referenced in ${usage.join(', ')}`, 'error');
    return;
  }
  onContentChange(deleteConfigField(content, name));
  showFeedback('Config value deleted.', 'info');
}}
```

`showFeedback` comes from `useHostAPIStore` (already used this way in `events-panel.tsx:21,36`) — `side-panels.tsx` will need to pull it in the same way. `getConfigFieldUsage` and `deleteConfigField` are added to the existing `datamodel-extractor` import (`side-panels.tsx:5`).

---

## Error Handling

- **Blocked delete** is a pure read-then-branch: `getConfigFieldUsage` never mutates anything, so a blocked delete leaves the SCXML byte-for-byte unchanged. No partial-state risk.
- **Allowed delete** calls `deleteConfigField` once and applies its result the same way every other content-mutating action in this panel already does (`onContentChange`), so it participates in undo/history exactly like edits and adds.
- **Stale UI state** (delete clicked on a name that no longer matches any `conf_` field, e.g. a race with an external SCXML reload): `deleteConfigField`'s splice loop (`datamodel-extractor.ts:196-210`) simply finds no matching node and no-ops, returning the rebuilt-but-unchanged XML. Safe by construction — no special-casing needed.
- No confirmation dialog on the unused-field path, consistent with Events (`events-panel.tsx:34-37`) and Channel Mappings (`channel-mapping-panel.tsx:153-160`), which also delete instantly with just a toast.

---

## Edge Cases

| Case | Behavior |
|---|---|
| Config value unused anywhere | Delete immediately, info toast |
| Config value referenced in a transition `cond` | Blocked, error toast naming the referencing location(s) |
| Config value referenced only inside its own `<data expr="...">` (i.e., self-reference, malformed) | Not counted as usage — the field's own declaration is excluded from the scan |
| Config value referenced many times (long location list) | Toast still lists all locations; if this proves unreadably long in practice, truncate with "+N more" — left as an implementation-time call, not a blocking design decision |
| Delete clicked twice quickly / stale name | Second call finds nothing to delete or nothing to report; no-ops safely (see Error Handling) |

---

## Testing

- Unit tests for `getConfigFieldUsage` in `datamodel-extractor.test.ts` (or wherever its siblings are tested):
  - Unused config → `[]`.
  - Referenced in a `cond` → returns the referencing element's id.
  - Referenced in an `assign` `expr` → returns a match.
  - Referenced in `namelist` → returns a match.
  - `conf_foo` vs. `conf_foobar` → no false-positive match (word-boundary correctness, inherited from `ConditionEvaluator.extractVariables`).
  - The field's own `<data id="conf_X" expr="...">` declaration is never reported as a usage of itself.
- Manual verification in the running app (per this repo's convention of testing UI changes live): delete an unused config value → toast + row disappears; delete a referenced config value → error toast + row remains; confirm the blocked case makes no SCXML change (e.g., via undo history staying flat).

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/utils/datamodel-extractor.ts` | Add `getConfigFieldUsage(xmlContent, name)` |
| `src/components/ui/config-panel.tsx` | Add `onDeleteField` prop; add delete icon button per row |
| `src/app/_components/side-panels.tsx` | Wire `onDeleteField` handler (usage check → block-with-toast or delete-with-toast) |
