# Config Value Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete a config value (`conf_` datamodel field) from `ConfigPanel`, blocking the delete with an error toast when the value is still referenced elsewhere in the SCXML, and deleting immediately with an info toast when it's unused.

**Architecture:** A new pure function `getConfigFieldUsage(xmlContent, name)` in `datamodel-extractor.ts` walks the parsed SCXML (reusing `ConditionEvaluator.extractVariables` and the existing `SCXML_EXPR_ATTRS` set, the same building blocks `extractUnresolvedChannelRefs` already uses) and returns the ids of elements that reference `conf_<name>`, excluding the field's own `<data>` declaration. `ConfigPanel` gets a delete button per row that calls a new `onDeleteField` prop. The handler, wired in `side-panels.tsx`, calls `getConfigFieldUsage` first: non-empty → block with an error toast listing locations; empty → call the already-implemented (but currently unused) `deleteConfigField` and show an info toast. No new UI state, no confirmation dialog — matches the existing instant-delete-with-toast pattern used by `EventsPanel` and `ChannelMappingPanel`.

**Tech Stack:** React 19, TypeScript, Zustand (`useHostAPIStore`), `fast-xml-parser`, Vitest

**Spec:** `docs/superpowers/specs/2026-08-25-config-value-deletion-design.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| **Modify** | `src/lib/utils/datamodel-extractor.ts` | Add `getConfigFieldUsage(xmlContent, name)` |
| **Create** | `src/lib/utils/datamodel-extractor.test.ts` | Unit tests for `getConfigFieldUsage` |
| **Modify** | `src/components/ui/config-panel.tsx` | Add `onDeleteField` prop; add delete icon button per row |
| **Modify** | `src/app/_components/side-panels.tsx` | Wire `onDeleteField`: usage check → block-with-toast or delete-with-toast |

---

### Task 1: Add `getConfigFieldUsage` with tests

**Files:**
- Modify: `src/lib/utils/datamodel-extractor.ts`
- Create: `src/lib/utils/datamodel-extractor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/datamodel-extractor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getConfigFieldUsage } from './datamodel-extractor';

describe('getConfigFieldUsage', () => {
  it('returns [] when the config value is not referenced anywhere', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual([]);
  });

  it('finds a reference in a transition cond, reported under the enclosing state id', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1">
          <transition cond="conf_threshold &gt; 3" target="S2"/>
        </state>
        <state id="S2"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('finds a reference in an assign expr', () => {
    const xml = `
      <scxml>
        <datamodel>
          <data id="conf_threshold" expr="5" confType="int"/>
          <data id="counter" expr="0"/>
        </datamodel>
        <state id="S1">
          <onentry><assign location="counter" expr="conf_threshold + 1"/></onentry>
        </state>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('finds a reference in a namelist', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1">
          <onentry><send event="e1" namelist="conf_threshold"/></onentry>
        </state>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('does not false-positive match a longer identifier with the same prefix', () => {
    const xml = `
      <scxml>
        <datamodel>
          <data id="conf_foo" expr="1" confType="int"/>
          <data id="conf_foobar" expr="2" confType="int"/>
        </datamodel>
        <state id="S1">
          <transition cond="conf_foobar &gt; 1" target="S2"/>
        </state>
        <state id="S2"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'foo')).toEqual([]);
  });

  it('does not count the field\'s own <data> declaration as a usage of itself', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="conf_threshold" confType="int"/></datamodel>
        <state id="S1"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/utils/datamodel-extractor.test.ts`
Expected: FAIL — `getConfigFieldUsage` is not exported from `./datamodel-extractor` (import error / undefined).

- [ ] **Step 3: Implement `getConfigFieldUsage`**

Add to `src/lib/utils/datamodel-extractor.ts`, after `extractMainPrefixedExpressionRefs` (end of file — it needs the `SCXML_EXPR_ATTRS` constant defined at line 216, so it must come after that):

```ts
/**
 * Returns the ids of elements that reference conf_<name> anywhere in the SCXML
 * (cond, expr, location, namelist, targetexpr, srcexpr), excluding the field's own
 * <data> declaration. Each entry is the nearest enclosing element id (e.g. the state
 * containing the referencing transition), falling back to the element's tag name if
 * no ancestor has an id. Empty array means the field is safe to delete.
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

  function walk(node: unknown, tag: string | undefined, ancestorId: string | undefined): void {
    if (!node || typeof node !== 'object') return;
    const nodeObj = node as Record<string, unknown>;
    const ownId = typeof nodeObj['@_id'] === 'string' ? (nodeObj['@_id'] as string) : undefined;
    const currentAncestorId = ownId ?? ancestorId;

    for (const [key, val] of Object.entries(nodeObj)) {
      if (SCXML_EXPR_ATTRS.has(key) && typeof val === 'string') {
        if (key === '@_expr' && tag === 'data' && ownId === targetId) continue;
        const stripped = val.replace(/_event\./g, '');
        if (ConditionEvaluator.extractVariables(stripped).includes(targetId)) {
          locations.push(currentAncestorId ?? tag ?? key);
        }
      } else if (key !== '@_id') {
        if (Array.isArray(val)) val.forEach(item => walk(item, key, currentAncestorId));
        else walk(val, key, currentAncestorId);
      }
    }
  }

  walk(parsed, undefined, undefined);
  return locations;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/utils/datamodel-extractor.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/datamodel-extractor.ts src/lib/utils/datamodel-extractor.test.ts
git commit -m "feat(datamodel-extractor): add getConfigFieldUsage for delete-safety checks"
```

---

### Task 2: Add delete button to `ConfigPanel`

**Files:**
- Modify: `src/components/ui/config-panel.tsx`

- [ ] **Step 1: Add the `Trash2` import**

In `src/components/ui/config-panel.tsx`, change:

```ts
import { ChevronDown } from 'lucide-react';
```

to:

```ts
import { ChevronDown, Trash2 } from 'lucide-react';
```

- [ ] **Step 2: Add `onDeleteField` to the props interface**

Change:

```ts
interface ConfigPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
  onAddField: (name: string, defaultValue: string) => void;
  onFieldChange: (name: string, newDefaultValue: string) => void;
  onTypeChange: (name: string, newType: ConfigField['type']) => void;
  onEntriesChange?: (values: ConfigValue[]) => void;
}
```

to:

```ts
interface ConfigPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
  onAddField: (name: string, defaultValue: string) => void;
  onFieldChange: (name: string, newDefaultValue: string) => void;
  onTypeChange: (name: string, newType: ConfigField['type']) => void;
  onDeleteField: (name: string) => void;
  onEntriesChange?: (values: ConfigValue[]) => void;
}
```

- [ ] **Step 3: Destructure the new prop**

Change:

```ts
export function ConfigPanel({ isVisible, onClose, scxmlContent, onAddField, onFieldChange, onTypeChange, onEntriesChange }: ConfigPanelProps) {
```

to:

```ts
export function ConfigPanel({ isVisible, onClose, scxmlContent, onAddField, onFieldChange, onTypeChange, onDeleteField, onEntriesChange }: ConfigPanelProps) {
```

- [ ] **Step 4: Add the delete button to each row**

Change the row header block:

```tsx
              <div className='flex items-center justify-between gap-2 mb-1.5'>
                <span className='font-medium text-default text-xs truncate' title={field.name}>
                  {field.name}
                </span>
                <TypeSelect
                  value={field.type}
                  onChange={newType => {
                    setEntries(prev =>
                      prev.map(en =>
                        en.field.name === field.name ? { ...en, field: { ...en.field, type: newType } } : en,
                      ),
                    );
                    onTypeChange(field.name, newType);
                  }}
                />
              </div>
```

to:

```tsx
              <div className='flex items-center justify-between gap-2 mb-1.5'>
                <span className='font-medium text-default text-xs truncate' title={field.name}>
                  {field.name}
                </span>
                <div className='flex items-center gap-1.5 shrink-0'>
                  <TypeSelect
                    value={field.type}
                    onChange={newType => {
                      setEntries(prev =>
                        prev.map(en =>
                          en.field.name === field.name ? { ...en, field: { ...en.field, type: newType } } : en,
                        ),
                      );
                      onTypeChange(field.name, newType);
                    }}
                  />
                  <button
                    onClick={() => onDeleteField(field.name)}
                    className='p-1 rounded text-dimmed hover:text-error hover:bg-muted transition-colors'
                    title='Delete config value'
                    aria-label='Delete config value'
                  >
                    <Trash2 className='h-3 w-3' />
                  </button>
                </div>
              </div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (`side-panels.tsx` will now fail to compile because it doesn't pass `onDeleteField` yet — that's expected and fixed in Task 3. If Task 3 hasn't been done yet, confirm the only new error is the missing `onDeleteField` prop on the `<ConfigPanel>` usage in `side-panels.tsx`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/config-panel.tsx
git commit -m "feat(config-panel): add delete button per config value row"
```

---

### Task 3: Wire the delete handler in `SidePanels`

**Files:**
- Modify: `src/app/_components/side-panels.tsx`

- [ ] **Step 1: Update imports**

Change:

```ts
import { updateConfigFieldExpr, updateConfigFieldType } from '@/lib/utils/datamodel-extractor';
import { useEditorStore } from '@/stores/editor-store';
import { usePanelStore } from '@/stores/panel-store';
```

to:

```ts
import { deleteConfigField, getConfigFieldUsage, updateConfigFieldExpr, updateConfigFieldType } from '@/lib/utils/datamodel-extractor';
import { useEditorStore } from '@/stores/editor-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { usePanelStore } from '@/stores/panel-store';
```

- [ ] **Step 2: Pull `showFeedback` from the host API store**

Change:

```ts
export function SidePanels({ onEntriesChange, onContentChange }: SidePanelsProps) {
  const { activePanel, setActivePanel } = usePanelStore();
  const content = useEditorStore(state => state.content);
  const handleClose = useCallback(() => setActivePanel(null), [setActivePanel]);
```

to:

```ts
export function SidePanels({ onEntriesChange, onContentChange }: SidePanelsProps) {
  const { activePanel, setActivePanel } = usePanelStore();
  const content = useEditorStore(state => state.content);
  const showFeedback = useHostAPIStore(state => state.showFeedback);
  const handleClose = useCallback(() => setActivePanel(null), [setActivePanel]);
```

- [ ] **Step 3: Add the `onDeleteField` handler to the `<ConfigPanel>` usage**

Change:

```tsx
      <ConfigPanel
        isVisible={activePanel === 'config'}
        onClose={handleClose}
        scxmlContent={content}
        onEntriesChange={onEntriesChange}
        onFieldChange={(name, newValue) => {
          onContentChange(updateConfigFieldExpr(content, name, newValue));
        }}
        onTypeChange={(name, newType) => {
          onContentChange(updateConfigFieldType(content, name, newType));
        }}
        onAddField={(name, defaultValue) => {
          const node = `\n    <data id="conf_${name}" expr="${defaultValue}" confType="string"/>`;
          const next = content.includes('</datamodel>')
            ? content.replace('</datamodel>', `${node}\n  </datamodel>`)
            : content.replace('</scxml>', `\n  <datamodel>${node}\n  </datamodel>\n</scxml>`);
          onContentChange(next);
        }}
      />
```

to:

```tsx
      <ConfigPanel
        isVisible={activePanel === 'config'}
        onClose={handleClose}
        scxmlContent={content}
        onEntriesChange={onEntriesChange}
        onFieldChange={(name, newValue) => {
          onContentChange(updateConfigFieldExpr(content, name, newValue));
        }}
        onTypeChange={(name, newType) => {
          onContentChange(updateConfigFieldType(content, name, newType));
        }}
        onDeleteField={(name) => {
          const usage = getConfigFieldUsage(content, name);
          if (usage.length > 0) {
            showFeedback(`Cannot delete 'conf_${name}': still referenced in ${usage.join(', ')}`, 'error');
            return;
          }
          onContentChange(deleteConfigField(content, name));
          showFeedback('Config value deleted.', 'info');
        }}
        onAddField={(name, defaultValue) => {
          const node = `\n    <data id="conf_${name}" expr="${defaultValue}" confType="string"/>`;
          const next = content.includes('</datamodel>')
            ? content.replace('</datamodel>', `${node}\n  </datamodel>`)
            : content.replace('</scxml>', `\n  <datamodel>${node}\n  </datamodel>\n</scxml>`);
          onContentChange(next);
        }}
      />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the 6 new `getConfigFieldUsage` tests from Task 1.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/side-panels.tsx
git commit -m "feat(side-panels): block config value delete when still referenced in SCXML"
```

---

### Task 4: Manual browser verification

Automated tests cover `getConfigFieldUsage` (Task 1), but the end-to-end delete flow through the panel UI and toast system is easiest to confirm by hand.

**Files:** none (manual QA only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts, prints a local URL (e.g. `http://localhost:3000`).

- [ ] **Step 2: Open the app and load or create an SCXML document with a `conf_` field that is referenced somewhere and one that isn't**

E.g. a datamodel with `conf_threshold` (referenced in a transition `cond`) and `conf_unused` (not referenced anywhere). Open the Config panel.

- [ ] **Step 3: Delete the unused config value**

Click the delete (trash) icon on the `conf_unused` row.
Expected: the row disappears immediately, an info toast reads "Config value deleted.", and the corresponding `<data>` node is gone from the code view.

- [ ] **Step 4: Attempt to delete the referenced config value**

Click the delete (trash) icon on the `conf_threshold` row.
Expected: the row remains, an error toast reads something like `Cannot delete 'conf_threshold': still referenced in <state id>`, and the code view is unchanged.

- [ ] **Step 5: Remove the reference, then retry the delete**

Edit the SCXML (code view or panel) to remove the `cond="conf_threshold ..."` reference, then click delete on `conf_threshold` again.
Expected: now succeeds — row disappears, info toast shown.

- [ ] **Step 6: Stop the dev server**

Stop the process (Ctrl+C in the terminal running `npm run dev`).

---

## Post-Implementation

- All 6 `getConfigFieldUsage` unit tests pass.
- Full suite (`npm test`) passes.
- `npx tsc --noEmit` is clean.
- Manual verification (Task 4) confirms both the block and allow paths work end-to-end in the browser.
