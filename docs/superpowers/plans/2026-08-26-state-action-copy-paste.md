# State Action Copy/Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user copy an assign action or an event-reaction row from `StateActionsPanel` and paste it into another state (or the same state) in one click each, instead of manually re-typing both fields.

**Architecture:** A new in-memory Zustand store (`useActionClipboardStore`) holds at most one copied item, tagged `{ kind: 'action' | 'reaction' }`. `StateActionsPanel` gets a per-row Copy button (assign rows and reaction rows only) that writes to the store, and a header Paste button that reads it and appends a new row through the existing `onApply`/`onApplyReactions` commit path — the same path row delete already uses.

**Tech Stack:** React 19, Zustand 5, Vitest + React Testing Library, `lucide-react` icons (`Copy`, `ClipboardPaste`).

**Design doc:** `docs/superpowers/specs/2026-08-26-state-action-copy-paste-design.md`

---

## Task 1: Action clipboard store

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx:29` and `:34`
- Create: `src/stores/action-clipboard-store.ts`
- Test: `src/stores/action-clipboard-store.test.ts`

- [ ] **Step 1: Export the two row types (no behavior change)**

In `src/components/ui/state-actions-panel.tsx`, these two interfaces are currently unexported local types (lines 29 and 34):

```ts
interface AssignActionRow { type: 'assign'; location: string; expr: string; }
```
```ts
interface InternalEventActionRow {
```

Change them to:

```ts
export interface AssignActionRow { type: 'assign'; location: string; expr: string; }
```
```ts
export interface InternalEventActionRow {
```

Leave `SendActionRow`, `CancelActionRow`, and `ActionRow` unexported — only these two types are needed outside the file. This step is purely mechanical (adding `export`); nothing else in the file changes, so existing tests should still pass unmodified.

- [ ] **Step 2: Write the failing test for the new store**

Create `src/stores/action-clipboard-store.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { useActionClipboardStore } from './action-clipboard-store';

afterEach(() => {
  useActionClipboardStore.setState({ copied: null });
});

describe('useActionClipboardStore', () => {
  it('starts with nothing copied', () => {
    expect(useActionClipboardStore.getState().copied).toBeNull();
  });

  it('stores a copied action', () => {
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'foo', expr: '1' },
    });

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'action',
      row: { type: 'assign', location: 'foo', expr: '1' },
    });
  });

  it('stores a copied reaction', () => {
    useActionClipboardStore.getState().copy({
      kind: 'reaction',
      row: { event: 'evt', location: 'foo', expr: '1', type: 'internal' },
    });

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'reaction',
      row: { event: 'evt', location: 'foo', expr: '1', type: 'internal' },
    });
  });

  it('replaces a previously copied item when copying again', () => {
    useActionClipboardStore.getState().copy({ kind: 'action', row: { type: 'assign', location: 'a', expr: '1' } });
    useActionClipboardStore.getState().copy({ kind: 'action', row: { type: 'assign', location: 'b', expr: '2' } });

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'action',
      row: { type: 'assign', location: 'b', expr: '2' },
    });
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `npm test -- src/stores/action-clipboard-store.test.ts`
Expected: FAIL — `Cannot find module './action-clipboard-store'` (the file doesn't exist yet).

- [ ] **Step 4: Implement the store**

Create `src/stores/action-clipboard-store.ts`:

```ts
import { create } from 'zustand';
import type { AssignActionRow, InternalEventActionRow } from '@/components/ui/state-actions-panel';

export type CopiedAction =
  | { kind: 'action'; row: AssignActionRow }
  | { kind: 'reaction'; row: InternalEventActionRow };

interface ActionClipboardState {
  copied: CopiedAction | null;
  copy: (item: CopiedAction) => void;
}

export const useActionClipboardStore = create<ActionClipboardState>((set) => ({
  copied: null,
  copy: (item) => set({ copied: item }),
}));
```

This is a type-only import from the panel file (`import type`), so it's erased at compile time — no runtime circular dependency, even though the panel will import this store back in Task 2.

- [ ] **Step 5: Run the test, confirm it passes**

Run: `npm test -- src/stores/action-clipboard-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS — all existing tests (including `state-actions-panel.test.tsx`) still pass; the only change to that file so far is adding two `export` keywords.

- [ ] **Step 7: Commit**

```bash
git add src/stores/action-clipboard-store.ts src/stores/action-clipboard-store.test.ts src/components/ui/state-actions-panel.tsx
git commit -m "feat: add action clipboard store for state action copy/paste"
```

---

## Task 2: Copy button on assign action rows (onentry/onexit)

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx`
- Test: `src/components/ui/state-actions-panel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/components/ui/state-actions-panel.test.tsx` (new imports and a new describe block):

```ts
import { useActionClipboardStore } from '@/stores/action-clipboard-store';
```

```ts
describe('StateActionsPanel copy action', () => {
  afterEach(() => {
    useActionClipboardStore.setState({ copied: null });
    useHostAPIStore.setState({ feedbackQueue: [] });
  });

  it('copies an assign row to the clipboard store when its Copy button is clicked', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByTitle('Copy action'));

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'action',
      row: { type: 'assign', location: 'a', expr: '1' },
    });
  });

  it('shows a confirmation toast after copying', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByTitle('Copy action'));

    expect(useHostAPIStore.getState().feedbackQueue.map((f) => f.message)).toContain('Action copied.');
  });

  it('clicking Copy does not open the row for editing', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByTitle('Copy action'));

    expect(screen.queryByPlaceholderText('variable or channel')).not.toBeInTheDocument();
  });

  it('renders one Copy button per assign row', () => {
    renderPanel({
      entryActions: [
        { type: 'assign', location: 'a', expr: '1' },
        { type: 'assign', location: 'b', expr: '2' },
      ],
    });

    expect(screen.getAllByTitle('Copy action')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npm test -- src/components/ui/state-actions-panel.test.tsx -t "copy action"`
Expected: FAIL — `Unable to find an element with the title: Copy action` (button doesn't exist yet).

- [ ] **Step 3: Implement the Copy button and handler**

In `src/components/ui/state-actions-panel.tsx`:

**3a. Extend imports** — change:

```ts
import { GripVertical, Plus, X } from 'lucide-react';
```

to:

```ts
import { Copy, GripVertical, Plus, X } from 'lucide-react';
```

and add, alongside the other store import:

```ts
import { useActionClipboardStore } from '@/stores/action-clipboard-store';
```

**3b. Extend `SortableActionRowProps` and `SortableActionRow`** — the current component (lines 87–156) ends with a single delete button:

```tsx
interface SortableActionRowProps {
  id: string;
  index: number;
  disabled: boolean;
  align?: 'center' | 'start';
  onClick: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

function SortableActionRow({
  id,
  index,
  disabled,
  align = 'center',
  onClick,
  onDelete,
  children,
}: SortableActionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex ${align === 'start' ? 'items-start' : 'items-center'} justify-between px-2 py-1.5 rounded text-xs cursor-pointer group hover:bg-muted`}
    >
      <div className={`flex ${align === 'start' ? 'items-start' : 'items-center'} gap-1.5 min-w-0 flex-1`}>
        <button
          type='button'
          aria-label='Reorder action'
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
          className={`flex-shrink-0 ${
            disabled
              ? 'text-dimmed opacity-30 cursor-not-allowed'
              : 'text-dimmed hover:text-default cursor-grab active:cursor-grabbing'
          }`}
        >
          <GripVertical className='h-3 w-3' />
        </button>
        <span
          data-testid='action-order-badge'
          className='text-[10px] text-dimmed font-mono flex-shrink-0 w-4 text-right'
        >
          {index + 1}
        </span>
        <div className='min-w-0 flex-1'>{children}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={`ml-2 flex-shrink-0 text-dimmed hover:text-error opacity-0 group-hover:opacity-100 transition-opacity ${
          align === 'start' ? 'mt-0.5' : ''
        }`}
      >
        <X className='h-3 w-3' />
      </button>
    </div>
  );
}
```

Replace the whole thing with:

```tsx
interface SortableActionRowProps {
  id: string;
  index: number;
  disabled: boolean;
  align?: 'center' | 'start';
  onClick: () => void;
  onCopy?: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

function SortableActionRow({
  id,
  index,
  disabled,
  align = 'center',
  onClick,
  onCopy,
  onDelete,
  children,
}: SortableActionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex ${align === 'start' ? 'items-start' : 'items-center'} justify-between px-2 py-1.5 rounded text-xs cursor-pointer group hover:bg-muted`}
    >
      <div className={`flex ${align === 'start' ? 'items-start' : 'items-center'} gap-1.5 min-w-0 flex-1`}>
        <button
          type='button'
          aria-label='Reorder action'
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
          className={`flex-shrink-0 ${
            disabled
              ? 'text-dimmed opacity-30 cursor-not-allowed'
              : 'text-dimmed hover:text-default cursor-grab active:cursor-grabbing'
          }`}
        >
          <GripVertical className='h-3 w-3' />
        </button>
        <span
          data-testid='action-order-badge'
          className='text-[10px] text-dimmed font-mono flex-shrink-0 w-4 text-right'
        >
          {index + 1}
        </span>
        <div className='min-w-0 flex-1'>{children}</div>
      </div>
      <div
        className={`ml-2 flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${
          align === 'start' ? 'mt-0.5' : ''
        }`}
      >
        {onCopy && (
          <button
            type='button'
            title='Copy action'
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className='text-dimmed hover:text-primary'
          >
            <Copy className='h-3 w-3' />
          </button>
        )}
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className='text-dimmed hover:text-error'
        >
          <X className='h-3 w-3' />
        </button>
      </div>
    </div>
  );
}
```

(The visual change is just wrapping the trailing buttons in a flex container so Copy and Delete sit side by side, hover-revealed together — delete's own click/stop-propagation behavior is unchanged.)

**3c. Add `handleCopyRow`** — insert right after `handleDelete` (currently ends at line 488, just before `handleActionsDragEnd`):

```ts
const handleCopyRow = (row: ActionRow) => {
  if (row.type !== 'assign') return;
  useActionClipboardStore.getState().copy({
    kind: 'action',
    row: { type: 'assign', location: row.location, expr: row.expr },
  });
  showFeedback('Action copied.', 'info');
};
```

(Guard-then-return on non-assign rows mirrors the existing `handleRowClick`, which has the identical guard for the same reason: only assign rows are editable/addable in this panel today.)

**3d. Wire `onCopy` into the onentry/onexit row rendering** — in the row-mapping block (currently around lines 882–913), change:

```tsx
<SortableActionRow
  key={row._rowId}
  id={row._rowId}
  index={index}
  disabled={formMode !== 'idle'}
  onClick={() => handleRowClick(row, index)}
  onDelete={() => handleDelete(index)}
>
```

to:

```tsx
<SortableActionRow
  key={row._rowId}
  id={row._rowId}
  index={index}
  disabled={formMode !== 'idle'}
  onClick={() => handleRowClick(row, index)}
  onCopy={row.type === 'assign' ? () => handleCopyRow(row) : undefined}
  onDelete={() => handleDelete(index)}
>
```

The reactions tab's `SortableActionRow` usage (around lines 844–851) is untouched in this task — no `onCopy` prop yet, so no Copy button appears there (that's Task 3).

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npm test -- src/components/ui/state-actions-panel.test.tsx -t "copy action"`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — including the pre-existing ordering/reordering tests, since `SortableActionRow`'s existing props/behavior are unchanged, only extended.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/state-actions-panel.tsx src/components/ui/state-actions-panel.test.tsx
git commit -m "feat: add copy button to assign action rows"
```

---

## Task 3: Copy button on event reaction rows

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx`
- Test: `src/components/ui/state-actions-panel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the `StateActionsPanel copy action` describe block from Task 2 (or a new adjacent describe block — either is fine, keep them near each other):

```ts
it('copies a reaction row to the clipboard store when its Copy button is clicked', () => {
  renderPanel({
    internalEventActions: [{ event: 'evtA', location: 'x', expr: '1', type: 'internal' }],
  });

  fireEvent.click(screen.getByText(/event reactions/));
  fireEvent.click(screen.getByTitle('Copy action'));

  expect(useActionClipboardStore.getState().copied).toEqual({
    kind: 'reaction',
    row: { event: 'evtA', location: 'x', expr: '1', type: 'internal' },
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npm test -- src/components/ui/state-actions-panel.test.tsx -t "copies a reaction row"`
Expected: FAIL — `Unable to find an element with the title: Copy action` (no Copy button on reaction rows yet).

- [ ] **Step 3: Implement**

**3a. Add `handleCopyReaction`** — right after `handleCopyRow`:

```ts
const handleCopyReaction = (row: InternalEventActionRow) => {
  useActionClipboardStore.getState().copy({
    kind: 'reaction',
    row: { event: row.event, location: row.location, expr: row.expr, type: row.type },
  });
  showFeedback('Action copied.', 'info');
};
```

**3b. Wire `onCopy` into the reactions row rendering** — change:

```tsx
<SortableActionRow
  key={row._rowId}
  id={row._rowId}
  index={index}
  disabled={formMode !== 'idle'}
  align='start'
  onClick={() => handleReactionsRowClick(row, index)}
  onDelete={() => handleDelete(index)}
>
```

to:

```tsx
<SortableActionRow
  key={row._rowId}
  id={row._rowId}
  index={index}
  disabled={formMode !== 'idle'}
  align='start'
  onClick={() => handleReactionsRowClick(row, index)}
  onCopy={() => handleCopyReaction(row)}
  onDelete={() => handleDelete(index)}
>
```

(Every reaction row is copyable — unlike the assign-only guard in Task 2, all reaction rows are editable/addable, so there's no type to filter on here.)

- [ ] **Step 4: Run the test, confirm it passes**

Run: `npm test -- src/components/ui/state-actions-panel.test.tsx -t "copies a reaction row"`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/state-actions-panel.tsx src/components/ui/state-actions-panel.test.tsx
git commit -m "feat: add copy button to event reaction rows"
```

---

## Task 4: Paste button

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx`
- Test: `src/components/ui/state-actions-panel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `src/components/ui/state-actions-panel.test.tsx`:

```ts
describe('StateActionsPanel paste action', () => {
  afterEach(() => {
    useActionClipboardStore.setState({ copied: null });
    useHostAPIStore.setState({ feedbackQueue: [] });
  });

  it('disables Paste when nothing has been copied', () => {
    renderPanel();

    expect(screen.getByTitle('Copy an action first')).toBeDisabled();
  });

  it('pastes a copied assign action as a new onentry row and calls onApply', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApply).toHaveBeenCalledWith(['assign|copied|42'], []);
  });

  it('shows a confirmation toast after pasting', () => {
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel();

    fireEvent.click(screen.getByTitle('Paste action'));

    expect(useHostAPIStore.getState().feedbackQueue.map((f) => f.message)).toContain('Action pasted.');
  });

  it('pastes a copied assign action from onentry into onexit (cross-tab)', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({ onApply, entryActions: [{ type: 'assign', location: 'a', expr: '1' }] });

    fireEvent.click(screen.getByText(/onexit/));
    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApply).toHaveBeenCalledWith(['assign|a|1'], ['assign|copied|42']);
  });

  it('pastes the same copied action twice, producing two independent rows', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Paste action'));
    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApply).toHaveBeenLastCalledWith(['assign|copied|42', 'assign|copied|42'], []);
  });

  it('disables Paste on the reactions tab when an assign action (not a reaction) is copied', () => {
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel();

    fireEvent.click(screen.getByText(/event reactions/));

    expect(screen.getByTitle('Copy an action first')).toBeDisabled();
  });

  it('pastes a copied reaction as a new reaction row and calls onApplyReactions', () => {
    const onApplyReactions = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'reaction',
      row: { event: 'evtA', location: 'x', expr: '1', type: 'internal' },
    });
    renderPanel({ onApplyReactions });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApplyReactions).toHaveBeenCalledWith([
      expect.objectContaining({ event: 'evtA', location: 'x', expr: '1', type: 'internal' }),
    ]);
  });

  it('a pasted row can be clicked afterward to edit it like any other row', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Paste action'));
    fireEvent.click(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'copied = 42'),
    );

    expect(screen.getByPlaceholderText('variable or channel')).toHaveValue('copied');
    expect(screen.getByPlaceholderText('expression')).toHaveValue('42');
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npm test -- src/components/ui/state-actions-panel.test.tsx -t "paste action"`
Expected: FAIL — `Unable to find an element with the title: Copy an action first` / `Paste action` (button doesn't exist yet).

- [ ] **Step 3: Implement the Paste button and handler**

**3a. Extend imports** — change:

```ts
import { Copy, GripVertical, Plus, X } from 'lucide-react';
```

to:

```ts
import { ClipboardPaste, Copy, GripVertical, Plus, X } from 'lucide-react';
```

**3b. Read the clipboard reactively** — add near the other store selectors (alongside `channels`/`channelMappings`/`showFeedback`, around line 283–285):

```ts
const copied = useActionClipboardStore((s) => s.copied);
const canPaste = copied !== null && copied.kind === (activeTab === 'reactions' ? 'reaction' : 'action');
```

**3c. Add `handlePaste`** — insert right after `handleCopyReaction` (from Task 3):

```ts
const handlePaste = () => {
  if (!copied) return;

  if (activeTab === 'reactions') {
    if (copied.kind !== 'reaction') return;
    const newRow: WithRowId<InternalEventActionRow> = { ...copied.row, _rowId: uuidv4() };
    const updated = [...localReactions, newRow];
    setLocalReactions(updated);
    onApplyReactions(updated);
    showFeedback('Action pasted.', 'info');
    return;
  }

  if (copied.kind !== 'action') return;
  const newRow: WithRowId<ActionRow> = { ...copied.row, _rowId: uuidv4() };
  const updated = [...currentList, newRow];
  if (activeTab === 'onentry') {
    setLocalEntry(updated);
    onApply(toStrings(updated), toStrings(localExit));
  } else {
    setLocalExit(updated);
    onApply(toStrings(localEntry), toStrings(updated));
  }
  showFeedback('Action pasted.', 'info');
};
```

**3d. Add the Paste button to the sub-header** — the current sub-header (around lines 764–774):

```tsx
<div className='flex items-center justify-between px-3 py-1.5 border-b border-default bg-muted flex-shrink-0'>
  <p className='text-xs text-primary'>{stateId}</p>
  <button
    onClick={handleAddClick}
    title='Add action'
    className='text-dimmed hover:text-primary p-0.5 rounded hover:bg-primary-muted transition-colors'
  >
    <Plus className='h-4 w-4' />
  </button>
</div>
```

becomes:

```tsx
<div className='flex items-center justify-between px-3 py-1.5 border-b border-default bg-muted flex-shrink-0'>
  <p className='text-xs text-primary'>{stateId}</p>
  <div className='flex items-center gap-1'>
    <button
      onClick={handlePaste}
      disabled={!canPaste}
      title={canPaste ? 'Paste action' : 'Copy an action first'}
      className={`p-0.5 rounded transition-colors ${
        canPaste
          ? 'text-dimmed hover:text-primary hover:bg-primary-muted'
          : 'text-dimmed opacity-30 cursor-not-allowed'
      }`}
    >
      <ClipboardPaste className='h-4 w-4' />
    </button>
    <button
      onClick={handleAddClick}
      title='Add action'
      className='text-dimmed hover:text-primary p-0.5 rounded hover:bg-primary-muted transition-colors'
    >
      <Plus className='h-4 w-4' />
    </button>
  </div>
</div>
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npm test -- src/components/ui/state-actions-panel.test.tsx -t "paste action"`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests across the project, including every pre-existing `state-actions-panel.test.tsx` test and the new copy/paste ones from Tasks 1–4.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/state-actions-panel.tsx src/components/ui/state-actions-panel.test.tsx
git commit -m "feat: add paste button for state actions and event reactions"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Clipboard store (Task 1) → copy on assign rows (Task 2) → copy on reaction rows (Task 3) → paste with kind-matching, cross-tab, repeat-paste, and edit-after-paste (Task 4) — every design-doc verification scenario (1–8) has a corresponding test.
- **Type consistency:** `CopiedAction`, `AssignActionRow`, `InternalEventActionRow`, `WithRowId<T>` are used identically across all four tasks; `handleCopyRow`/`handleCopyReaction`/`handlePaste` names are introduced once each and never renamed.
- **No placeholders:** every step shows complete, runnable code.
