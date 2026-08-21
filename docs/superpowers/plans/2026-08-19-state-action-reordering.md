# State Action Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an order-number badge and drag-to-reorder support to the onentry, onexit, and event-reaction rows in `StateActionsPanel`, so users can see and change execution order without leaving the visual editor.

**Architecture:** A new pure helper, `reorderByDragEvent`, turns a dnd-kit `DragEndEvent` into a reordered array (using the row's array index as its dnd-kit item id, since action rows have no persistent identity). `StateActionsPanel` gets a new internal `SortableActionRow` wrapper (grip handle + number badge + existing row content) used by all three tabs, each wrapped in its own `DndContext`/`SortableContext`. Dropping a row calls the same `onApply`/`onApplyReactions` props the existing Apply/Delete flows already use — no changes to `UpdateActionsCommand` or `UpdateInternalEventsCommand` are needed, since both already serialize actions in array order.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new dependency), Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-08-19-state-action-reordering-design.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| **Modify** | `package.json` / `package-lock.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| **Create** | `src/lib/utils/reorder-by-drag-event.ts` | Pure helper: `DragEndEvent` ids → reordered array |
| **Create** | `src/lib/utils/reorder-by-drag-event.test.ts` | Unit tests for the helper |
| **Modify** | `src/components/ui/state-actions-panel.tsx` | Add `SortableActionRow`, wire numbering + drag-and-drop into all three tabs |
| **Create** | `src/components/ui/state-actions-panel.test.tsx` | Numbering + disabled-handle tests |

---

### Task 1: Add the `@dnd-kit` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the packages**

Run:

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: install completes with no `ERESOLVE`/peer-dependency errors (peer ranges are `react >=16.8.0`, compatible with the project's React 19).

- [ ] **Step 2: Verify the install**

Run:

```bash
npm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: all three print a resolved version (e.g. `@dnd-kit/core@6.3.1`) with no `UNMET DEPENDENCY` / `invalid` lines.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit for state action drag-to-reorder"
```

---

### Task 2: TDD the `reorderByDragEvent` helper

**Files:**
- Create: `src/lib/utils/reorder-by-drag-event.ts`
- Test: `src/lib/utils/reorder-by-drag-event.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/reorder-by-drag-event.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reorderByDragEvent } from './reorder-by-drag-event';

describe('reorderByDragEvent', () => {
  it('moves an item from an earlier index to a later index', () => {
    expect(reorderByDragEvent(['a', 'b', 'c'], '0', '2')).toEqual(['b', 'c', 'a']);
  });

  it('moves an item from a later index to an earlier index', () => {
    expect(reorderByDragEvent(['a', 'b', 'c'], '2', '0')).toEqual(['c', 'a', 'b']);
  });

  it('returns the same list reference when dropped outside a valid target', () => {
    const list = ['a', 'b', 'c'];
    expect(reorderByDragEvent(list, '0', undefined)).toBe(list);
    expect(reorderByDragEvent(list, '0', null)).toBe(list);
  });

  it('returns the same list reference when dropped back in the same spot', () => {
    const list = ['a', 'b', 'c'];
    expect(reorderByDragEvent(list, '1', '1')).toBe(list);
  });

  it('returns the same list reference for a single-item list', () => {
    const list = ['only'];
    expect(reorderByDragEvent(list, '0', '0')).toBe(list);
  });

  it('ignores out-of-range ids instead of throwing', () => {
    const list = ['a', 'b'];
    expect(reorderByDragEvent(list, '0', '5')).toBe(list);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/utils/reorder-by-drag-event.test.ts`
Expected: FAIL — `Cannot find module './reorder-by-drag-event'` (or similar), since the module doesn't exist yet.

- [ ] **Step 3: Implement the helper**

Create `src/lib/utils/reorder-by-drag-event.ts`:

```ts
import { arrayMove } from '@dnd-kit/sortable';
import type { UniqueIdentifier } from '@dnd-kit/core';

/**
 * Reorders `list` from a dnd-kit drag-end event's active/over ids.
 * Item ids are expected to be the item's index (as a string) within `list` —
 * action rows have no persistent identity of their own, and the array only
 * mutates on drop, never mid-drag, so index-as-id is safe here.
 */
export function reorderByDragEvent<T>(
  list: T[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier | null | undefined,
): T[] {
  if (overId == null || activeId === overId) return list;

  const oldIndex = Number(activeId);
  const newIndex = Number(overId);
  if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return list;
  if (oldIndex < 0 || oldIndex >= list.length || newIndex < 0 || newIndex >= list.length) return list;

  return arrayMove(list, oldIndex, newIndex);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/utils/reorder-by-drag-event.test.ts`
Expected: PASS — 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/reorder-by-drag-event.ts src/lib/utils/reorder-by-drag-event.test.ts
git commit -m "feat: add reorderByDragEvent helper for action list reordering"
```

---

### Task 3: Add `SortableActionRow` and wire it into the onentry/onexit tabs

**Files:**
- Create: `src/components/ui/state-actions-panel.test.tsx`
- Modify: `src/components/ui/state-actions-panel.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/state-actions-panel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StateActionsPanel } from './state-actions-panel';

const noop = () => {};

type Props = Parameters<typeof StateActionsPanel>[0];

function renderPanel(overrides: Partial<Props> = {}) {
  return render(
    <StateActionsPanel
      isVisible
      onClose={noop}
      stateId='StateA'
      entryActions={[]}
      exitActions={[]}
      internalEventActions={[]}
      scxmlContent='<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="StateA"/></scxml>'
      stateType='simple'
      isInitial={false}
      canMarkInitial
      onToggleInitial={noop}
      onApply={noop}
      onApplyReactions={noop}
      {...overrides}
    />
  );
}

describe('StateActionsPanel action ordering', () => {
  it('numbers onentry rows in array order', () => {
    renderPanel({
      entryActions: [
        { type: 'assign', location: 'a', expr: '1' },
        { type: 'assign', location: 'b', expr: '2' },
        { type: 'assign', location: 'c', expr: '3' },
      ],
    });

    const badges = screen.getAllByTestId('action-order-badge');
    expect(badges.map((b) => b.textContent)).toEqual(['1', '2', '3']);
  });

  it('drag handles are enabled when no row is being added or edited', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    const handle = screen.getByRole('button', { name: 'Reorder action' });
    expect(handle).not.toBeDisabled();
  });

  it('disables the remaining drag handles while a row is being edited', () => {
    renderPanel({
      entryActions: [
        { type: 'assign', location: 'a', expr: '1' },
        { type: 'assign', location: 'b', expr: '2' },
      ],
    });

    fireEvent.click(screen.getByText('a = 1'));

    const handles = screen.getAllByRole('button', { name: 'Reorder action' });
    expect(handles).toHaveLength(1);
    expect(handles[0]).toBeDisabled();
  });

  it('disables drag handles while adding a new row', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByTitle('Add action'));

    const handle = screen.getByRole('button', { name: 'Reorder action' });
    expect(handle).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/components/ui/state-actions-panel.test.tsx`
Expected: FAIL — no elements found with `data-testid="action-order-badge"` or `role="button"`/`name: "Reorder action"` (they don't exist yet).

- [ ] **Step 3: Add the imports**

In `src/components/ui/state-actions-panel.tsx`, replace the import block (current lines 1–8):

```tsx
'use client';

import { BADGE_COLORS, EVENT_FALLBACK_VALUE, getVariableType } from '@/lib';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { Plus, X } from 'lucide-react';
import React from 'react';
import { Panel, inputClass, FormActions, PanelEmptyState } from '@/components/ui/primitives';
```

with:

```tsx
'use client';

import { BADGE_COLORS, EVENT_FALLBACK_VALUE, getVariableType } from '@/lib';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { GripVertical, Plus, X } from 'lucide-react';
import React from 'react';
import { Panel, inputClass, FormActions, PanelEmptyState } from '@/components/ui/primitives';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderByDragEvent } from '@/lib/utils/reorder-by-drag-event';
```

- [ ] **Step 4: Add the `SortableActionRow` component**

Immediately after the `toStrings` function (current lines 42–48) and before `export function StateActionsPanel`, insert:

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
        className='ml-2 flex-shrink-0 text-dimmed hover:text-error opacity-0 group-hover:opacity-100 transition-opacity'
      >
        <X className='h-3 w-3' />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Add the pointer sensor**

Immediately after the `blurTimerRef` declaration (current line 81: `const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);`), insert:

```tsx
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
```

- [ ] **Step 6: Add the onentry/onexit drag-end handler**

Immediately after `handleDelete` (ends at current line 192, right before `handleRowClick`), insert:

```tsx
  const handleActionsDragEnd = (event: DragEndEvent) => {
    const reordered = reorderByDragEvent(currentList, event.active.id, event.over?.id);
    if (reordered === currentList) return;

    if (activeTab === 'onentry') {
      setLocalEntry(reordered);
      onApply(toStrings(reordered), toStrings(localExit));
    } else {
      setLocalExit(reordered);
      onApply(toStrings(localEntry), toStrings(reordered));
    }
  };
```

- [ ] **Step 7: Replace the onentry/onexit row list with the sortable version**

Replace this block (current lines 484–534, the `<>...</>` fragment for the non-reactions tabs):

```tsx
          <>
            {currentList.length === 0 && formMode !== 'adding' && (
              <PanelEmptyState><p>No actions yet.</p></PanelEmptyState>
            )}

            {currentList.map((row, index) =>
              formMode === 'editing' && editingRowIndex === index ? (
                <div key={index}>{inlineForm}</div>
              ) : (
                <div
                  key={index}
                  onClick={() => handleRowClick(row, index)}
                  className='flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer group hover:bg-muted'
                >
                  {row.type === 'assign' && (
                    <span className='font-mono truncate text-default'>
                      <span className='text-primary'>{row.location || '…'}</span>
                      <span className='text-dimmed'> = </span>
                      <span className='text-default'>{row.expr || '…'}</span>
                    </span>
                  )}
                  {row.type === 'send' && (
                    <span className='font-mono text-default flex flex-col min-w-0'>
                      <span className='text-primary truncate'>{row.event || '…'}</span>
                      <span className='text-dimmed text-[10px]'>{row.delayType}: {row.delayValue || '…'}</span>
                    </span>
                  )}
                  {row.type === 'cancel' && (
                    <span className='font-mono truncate text-default'>
                      <span className='text-dimmed'>cancel: </span>
                      <span className='text-primary'>{row.sendid || '…'}</span>
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(index);
                    }}
                    className='ml-2 flex-shrink-0 text-dimmed hover:text-error opacity-0 group-hover:opacity-100 transition-opacity'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              ),
            )}

            {/* New action form appended at bottom when adding */}
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
```

with:

```tsx
          <>
            {currentList.length === 0 && formMode !== 'adding' && (
              <PanelEmptyState><p>No actions yet.</p></PanelEmptyState>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActionsDragEnd}>
              <SortableContext
                items={currentList.map((_, i) => String(i))}
                strategy={verticalListSortingStrategy}
              >
                {currentList.map((row, index) =>
                  formMode === 'editing' && editingRowIndex === index ? (
                    <div key={index}>{inlineForm}</div>
                  ) : (
                    <SortableActionRow
                      key={index}
                      id={String(index)}
                      index={index}
                      disabled={formMode !== 'idle'}
                      onClick={() => handleRowClick(row, index)}
                      onDelete={() => handleDelete(index)}
                    >
                      {row.type === 'assign' && (
                        <span className='font-mono truncate text-default'>
                          <span className='text-primary'>{row.location || '…'}</span>
                          <span className='text-dimmed'> = </span>
                          <span className='text-default'>{row.expr || '…'}</span>
                        </span>
                      )}
                      {row.type === 'send' && (
                        <span className='font-mono text-default flex flex-col min-w-0'>
                          <span className='text-primary truncate'>{row.event || '…'}</span>
                          <span className='text-dimmed text-[10px]'>{row.delayType}: {row.delayValue || '…'}</span>
                        </span>
                      )}
                      {row.type === 'cancel' && (
                        <span className='font-mono truncate text-default'>
                          <span className='text-dimmed'>cancel: </span>
                          <span className='text-primary'>{row.sendid || '…'}</span>
                        </span>
                      )}
                    </SortableActionRow>
                  ),
                )}
              </SortableContext>
            </DndContext>

            {/* New action form appended at bottom when adding */}
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npx vitest run src/components/ui/state-actions-panel.test.tsx`
Expected: PASS — 4 passed.

- [ ] **Step 9: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: all existing tests still pass (no unrelated failures introduced).

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/state-actions-panel.tsx src/components/ui/state-actions-panel.test.tsx
git commit -m "feat(state-actions): add order numbering and drag-to-reorder to onentry/onexit"
```

---

### Task 4: Wire the same pattern into the event-reactions tab

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx`
- Modify: `src/components/ui/state-actions-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/components/ui/state-actions-panel.test.tsx` (after the existing `describe` block, same file):

```tsx

describe('StateActionsPanel reaction ordering', () => {
  it('numbers reaction rows in array order across different events', () => {
    renderPanel({
      internalEventActions: [
        { event: 'evtA', location: 'x', expr: '1', type: 'internal' },
        { event: 'evtB', location: 'y', expr: '2', type: 'internal' },
      ],
    });

    fireEvent.click(screen.getByText(/event reactions/));

    const badges = screen.getAllByTestId('action-order-badge');
    expect(badges.map((b) => b.textContent)).toEqual(['1', '2']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/components/ui/state-actions-panel.test.tsx`
Expected: FAIL — the new test finds 0 badges (reactions tab isn't wired up yet).

- [ ] **Step 3: Add the reactions drag-end handler**

Immediately after the `handleActionsDragEnd` handler added in Task 3 Step 6, insert:

```tsx
  const handleReactionsDragEnd = (event: DragEndEvent) => {
    const reordered = reorderByDragEvent(localReactions, event.active.id, event.over?.id);
    if (reordered === localReactions) return;

    setLocalReactions(reordered);
    onApplyReactions(reordered);
  };
```

- [ ] **Step 4: Replace the reactions row list with the sortable version**

Replace this block (the `activeTab === 'reactions'` branch, current lines 445–483):

```tsx
        {activeTab === 'reactions' ? (
          <>
            {localReactions.length === 0 && formMode !== 'adding' && (
              <PanelEmptyState><p>No reactions yet.</p></PanelEmptyState>
            )}
            {localReactions.map((row, index) =>
              formMode === 'editing' && editingRowIndex === index ? (
                <div key={index}>{inlineForm}</div>
              ) : (
                <div
                  key={index}
                  onClick={() => handleReactionsRowClick(row, index)}
                  className='flex items-start justify-between px-2 py-1.5 rounded text-xs cursor-pointer group hover:bg-muted'
                >
                  <div className='flex flex-col min-w-0'>
                    <div className='flex items-center gap-1'>
                      <span className='text-primary text-[10px] font-medium'>{row.event}</span>
                      <span className='text-[9px] px-1 rounded border border-default text-dimmed'>{row.type}</span>
                    </div>
                    <span className='font-mono text-xs text-default pl-2 break-all'>
                      <span className='text-default'>{row.location || '…'}</span>
                      <span className='text-default'> = </span>
                      <span className='text-muted'>{row.expr || '…'}</span>
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(index);
                    }}
                    className='ml-2 mt-0.5 flex-shrink-0 text-dimmed hover:text-error opacity-0 group-hover:opacity-100 transition-opacity'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              )
            )}
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
        ) : (
```

with:

```tsx
        {activeTab === 'reactions' ? (
          <>
            {localReactions.length === 0 && formMode !== 'adding' && (
              <PanelEmptyState><p>No reactions yet.</p></PanelEmptyState>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReactionsDragEnd}>
              <SortableContext
                items={localReactions.map((_, i) => String(i))}
                strategy={verticalListSortingStrategy}
              >
                {localReactions.map((row, index) =>
                  formMode === 'editing' && editingRowIndex === index ? (
                    <div key={index}>{inlineForm}</div>
                  ) : (
                    <SortableActionRow
                      key={index}
                      id={String(index)}
                      index={index}
                      disabled={formMode !== 'idle'}
                      align='start'
                      onClick={() => handleReactionsRowClick(row, index)}
                      onDelete={() => handleDelete(index)}
                    >
                      <div className='flex flex-col min-w-0'>
                        <div className='flex items-center gap-1'>
                          <span className='text-primary text-[10px] font-medium'>{row.event}</span>
                          <span className='text-[9px] px-1 rounded border border-default text-dimmed'>{row.type}</span>
                        </div>
                        <span className='font-mono text-xs text-default pl-2 break-all'>
                          <span className='text-default'>{row.location || '…'}</span>
                          <span className='text-default'> = </span>
                          <span className='text-muted'>{row.expr || '…'}</span>
                        </span>
                      </div>
                    </SortableActionRow>
                  )
                )}
              </SortableContext>
            </DndContext>
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
        ) : (
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/components/ui/state-actions-panel.test.tsx`
Expected: PASS — 5 passed.

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/state-actions-panel.tsx src/components/ui/state-actions-panel.test.tsx
git commit -m "feat(state-actions): add order numbering and drag-to-reorder to event reactions"
```

---

### Task 5: Manual browser verification

Automated tests cover the reorder logic (Task 2) and the static rendering/disabled-state wiring (Tasks 3–4), but an actual pointer drag gesture is impractical to simulate reliably in jsdom. Verify the real interaction by hand.

**Files:** none (manual QA only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts, prints a local URL (e.g. `http://localhost:3000`).

- [ ] **Step 2: Open the app and load or create a state machine with a state that has 3+ onentry actions**

Click the state to open the "State Actions" panel.

- [ ] **Step 3: Verify numbering**

Confirm each row shows `1`, `2`, `3`… in order down the list.

- [ ] **Step 4: Verify drag reorder**

Drag row 3's grip handle above row 1. Confirm:
- The row moves and renumbers immediately.
- Switching to the code/XML view shows the `<onentry>` children reordered to match.
- Ctrl+Z undoes the reorder, restoring the previous order in both the panel and the code view.

- [ ] **Step 5: Verify drag is blocked during edit**

Click a row to open its inline edit form. Confirm the grip handles on other rows in the list appear dimmed and dragging them does nothing. Close the form (Apply or Discard) and confirm handles become active again.

- [ ] **Step 6: Repeat steps 2–5 for the onexit tab**

- [ ] **Step 7: Verify reaction ordering across events**

Add reaction rows for two different events, interleaved (e.g. `evtA`, `evtB`, `evtA`). Drag the `evtB` row above both `evtA` rows. Confirm in the code view that the `evtB` `<transition>` block now appears before the `evtA` block.

- [ ] **Step 8: Verify keyboard reordering**

Tab to a grip handle (focus ring visible), press Space to pick up the row, use Arrow Up/Down to move it, press Space to drop. Confirm the row moves and the change persists (check the code view).

- [ ] **Step 9: Stop the dev server**

Stop the process (Ctrl+C in the terminal running `npm run dev`).

---

## Post-Implementation

After Task 5 passes, use the requesting-code-review skill (or finishing-a-development-branch, if this completes the unit of work) to decide how to integrate the branch.
