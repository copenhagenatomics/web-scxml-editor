# Highlight Validation Errors in the Visual Diagram Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While on the Visual Diagram tab, clicking the error/warning indicator opens the validation panel in place, and clicking a state/transition-anchored error highlights that state (and its transition partner, when visible at the same level) directly in the diagram instead of force-switching to the Code Editor tab.

**Architecture:** `ValidationError` gains optional `stateId`/`targetStateId` fields, populated at the validator call sites that already have the relevant id in scope (`transition-validator.ts`, `state-validator.ts`, `scxml-validator.ts`, `initial-group-validator.ts`). A new `focusTarget` field on `editor-store.ts` carries a "please show and highlight this state" request from `TwoTabLayout` to `VisualDiagram`, which resolves it (via a small pure utility) into a hierarchy path plus a set of node ids to highlight, reusing the diagram's existing `activeStates` selection styling. The Code tab's existing docked `ValidationPanel` is untouched; a second `ValidationPanel` instance is added to `TwoTabLayout`, rendered only over the Visual tab.

**Tech Stack:** TypeScript, React 19, Next.js, Zustand, ReactFlow, Vitest.

---

## Design deviations from the spec (implementation-time findings)

While mapping the spec to exact files, two things turned out differently than first assumed — both already reflected in the updated spec doc, noted here for traceability:

1. **`w3c-validator.ts` is out of scope.** Its per-element checks only carry a structural `path` string (element type names + array indices), never a real SCXML id, so there's no id to attach without a much larger refactor. None of the target error types (duplicate IDs, missing initial states, bad transition targets, invalid event names, cross-hierarchy transitions) live there anyway.
2. **No edge-id matching.** `ValidationError` doesn't carry a transition index, so matching a transition error to one exact ReactFlow edge id is unreliable. Instead, transition errors highlight the **source and target state nodes** (when both are visible at the same hierarchy level — cross-hierarchy errors by definition put them at different levels, so only the source is highlighted then).
3. **Two separate click handlers, not one branching handler.** The Code tab's existing `ValidationPanel` (in `CodeEditorPane`) is untouched and keeps calling `page.tsx`'s existing `handleErrorClick` (always navigates to line — it's only ever reachable while already on the Code tab). A new, separate `ValidationPanel` instance lives in `TwoTabLayout`, rendered only when the Visual tab is active, with its own handler that always takes the "stay and highlight" path. This produces the same net behavior as the spec's single branching handler, with less conditional logic per handler.

---

### Task 1: Add `stateId`/`targetStateId` to `ValidationError`

**Files:**
- Modify: `src/types/common/index.ts:1-7`

- [ ] **Step 1: Add the fields**

```ts
export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  code?: string;
  stateId?: string;
  targetStateId?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (optional fields are additive; nothing currently constructs a `ValidationError` with excess properties that would now be rejected).

- [ ] **Step 3: Commit**

```bash
git add src/types/common/index.ts
git commit -m "feat(validation): add stateId/targetStateId to ValidationError"
```

---

### Task 2: Attach `stateId`/`targetStateId` in `transition-validator.ts`

**Files:**
- Modify: `src/lib/validators/transition-validator.ts`
- Test: `src/lib/validators/transition-validator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/validators/transition-validator.test.ts` (add the import and a new `describe` block; keep the existing `describe('validateTransitionSemantics event name validation', ...)` block as-is):

```ts
import {
  validateTransitionsInElement,
  validateInitialStates,
  validateTransitionSemantics,
  validateCrossHierarchyTransitions,
} from './transition-validator';
```

(replace the existing `import { validateTransitionSemantics } from './transition-validator';` line with the block above)

```ts
describe('validateTransitionsInElement stateId attachment', () => {
  it('attaches the source and missing target ids to a target-not-found error', () => {
    const element = {
      '@_id': 'A',
      transition: { '@_target': 'Ghost' },
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionsInElement(element, new Set(['A']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
    expect(errors[0].targetStateId).toBe('Ghost');
  });
});

describe('validateInitialStates stateId attachment', () => {
  it('attaches the parent state id and the missing initial reference', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'Parent', '@_initial': 'Ghost' }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStates(scxml, new Set(['Parent']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('Parent');
    expect(errors[0].targetStateId).toBe('Ghost');
  });
});

describe('validateTransitionSemantics stateId attachment', () => {
  it('attaches the source state id to an invalid transition type error', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_type': 'bogus', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
  });

  it('attaches the source state id to an internal-transition-with-target error', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_type': 'internal', '@_target': 'B' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A', 'B']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
  });

  it('attaches the source state id to an invalid event name warning', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': '1bad', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
  });
});

describe('validateCrossHierarchyTransitions stateId attachment', () => {
  it('attaches source and target ids to a cross-hierarchy transition error', () => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'P1', state: [{ '@_id': 'A', transition: { '@_target': 'B' } }] },
        { '@_id': 'P2', state: [{ '@_id': 'B' }] },
      ],
    } as any;
    const stateParentMap = new Map<string, string | null>([
      ['P1', null],
      ['P2', null],
      ['A', 'P1'],
      ['B', 'P2'],
    ]);
    const errors: ValidationError[] = [];
    validateCrossHierarchyTransitions(scxml, stateParentMap, undefined, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
    expect(errors[0].targetStateId).toBe('B');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/validators/transition-validator.test.ts`
Expected: the 5 new tests FAIL (`stateId`/`targetStateId` are `undefined`); the pre-existing event-name tests still PASS.

- [ ] **Step 3: Implement — `validateTransitionsInElement` (target-not-found)**

In `src/lib/validators/transition-validator.ts`, replace (around line 89-93):

```ts
          if (!stateIds.has(target)) {
            errors.push({
              message: `Transition target '${target}' not found. Make sure a state with id="${target}" exists in your SCXML document.`,
              severity: 'error',
            });
          }
```

with:

```ts
          if (!stateIds.has(target)) {
            errors.push({
              message: `Transition target '${target}' not found. Make sure a state with id="${target}" exists in your SCXML document.`,
              severity: 'error',
              stateId: element['@_id'],
              targetStateId: target,
            });
          }
```

- [ ] **Step 4: Implement — `validateInitialStates`**

Replace (around line 114-119):

```ts
          if (!stateIds.has(stateId)) {
            errors.push({
              message: `Initial state '${stateId}' in state '${state['@_id'] || 'unnamed'}' not found. Make sure a state with id="${stateId}" exists in your SCXML document.`,
              severity: 'error',
            });
          }
```

with:

```ts
          if (!stateIds.has(stateId)) {
            errors.push({
              message: `Initial state '${stateId}' in state '${state['@_id'] || 'unnamed'}' not found. Make sure a state with id="${stateId}" exists in your SCXML document.`,
              severity: 'error',
              stateId: state['@_id'],
              targetStateId: stateId,
            });
          }
```

- [ ] **Step 5: Implement — `validateTransitionSemantics` (3 sites)**

Replace (around line 144-152):

```ts
        if (
          transition['@_type'] &&
          !['internal', 'external'].includes(transition['@_type'])
        ) {
          errors.push({
            message: `Invalid transition type '${transition['@_type']}'. Must be 'internal' or 'external'`,
            severity: 'error',
          });
        }
```

with:

```ts
        if (
          transition['@_type'] &&
          !['internal', 'external'].includes(transition['@_type'])
        ) {
          errors.push({
            message: `Invalid transition type '${transition['@_type']}'. Must be 'internal' or 'external'`,
            severity: 'error',
            stateId: (element as any)['@_id'],
          });
        }
```

Replace (around line 154-167):

```ts
        if (transition['@_type'] === 'internal' && transition['@_target']) {
          const targets = parseStateIdList(transition['@_target'], stateIds);
          const sourceId = (element as any)['@_id']
            ? (element as any)['@_id']
            : undefined;

          if (targets.some((target: string) => target !== sourceId)) {
            errors.push({
              message: 'Internal transitions cannot target other states',
              severity: 'error',
            });
          }
        }
```

with:

```ts
        if (transition['@_type'] === 'internal' && transition['@_target']) {
          const targets = parseStateIdList(transition['@_target'], stateIds);
          const sourceId = (element as any)['@_id']
            ? (element as any)['@_id']
            : undefined;

          if (targets.some((target: string) => target !== sourceId)) {
            errors.push({
              message: 'Internal transitions cannot target other states',
              severity: 'error',
              stateId: sourceId,
            });
          }
        }
```

Replace (around line 169-183):

```ts
        if (transition['@_event']) {
          const events = transition['@_event'].split(/[\s,]+/).map((e) => e.trim()).filter(Boolean);
          events.forEach((event: string) => {
            if (
              event !== '*' &&
              !/^[a-zA-Z_][a-zA-Z0-9_\-\.]*(\.\*)?$/.test(event)
            ) {
              errors.push({
                message: `Invalid event name '${event}'. Event names must be valid identifiers`,
                severity: 'warning',
              });
            }
          });
        }
```

with:

```ts
        if (transition['@_event']) {
          const events = transition['@_event'].split(/[\s,]+/).map((e) => e.trim()).filter(Boolean);
          events.forEach((event: string) => {
            if (
              event !== '*' &&
              !/^[a-zA-Z_][a-zA-Z0-9_\-\.]*(\.\*)?$/.test(event)
            ) {
              errors.push({
                message: `Invalid event name '${event}'. Event names must be valid identifiers`,
                severity: 'warning',
                stateId: (element as any)['@_id'],
              });
            }
          });
        }
```

- [ ] **Step 6: Implement — `validateCrossHierarchyInElement`**

Replace (around line 264-269):

```ts
              errors.push({
                message: `Cross-hierarchy transition not allowed: State '${elementId}' ${transitionInfo ? `(${transitionInfo}) ` : ''}cannot transition to '${targetId}' - they are at different hierarchy levels. Transitions must only occur between states with the same parent.`,
                severity: 'error',
                line: position?.line,
                column: position?.column,
              });
```

with:

```ts
              errors.push({
                message: `Cross-hierarchy transition not allowed: State '${elementId}' ${transitionInfo ? `(${transitionInfo}) ` : ''}cannot transition to '${targetId}' - they are at different hierarchy levels. Transitions must only occur between states with the same parent.`,
                severity: 'error',
                line: position?.line,
                column: position?.column,
                stateId: elementId,
                targetStateId: targetId,
              });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/lib/validators/transition-validator.test.ts`
Expected: all tests PASS (5 new + 4 pre-existing).

- [ ] **Step 8: Commit**

```bash
git add src/lib/validators/transition-validator.ts src/lib/validators/transition-validator.test.ts
git commit -m "feat(validation): attach stateId/targetStateId in transition-validator"
```

---

### Task 3: Attach `stateId` in `state-validator.ts`

**Files:**
- Modify: `src/lib/validators/state-validator.ts:412-417`
- Test: `src/lib/validators/state-validator.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `src/lib/validators/state-validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateCompoundStates } from './state-validator';

describe('validateCompoundStates stateId attachment', () => {
  it('attaches the compound state id to a missing-initial error', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'Parent', state: [{ '@_id': 'Child' }] }],
    } as any;
    const errors: ValidationError[] = [];
    validateCompoundStates(scxml, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('Parent');
  });

  it('reports no error for a compound state with an initial attribute', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'Parent', '@_initial': 'Child', state: [{ '@_id': 'Child' }] }],
    } as any;
    const errors: ValidationError[] = [];
    validateCompoundStates(scxml, errors);
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validators/state-validator.test.ts`
Expected: FAIL — `errors[0].stateId` is `undefined`, not `'Parent'`.

- [ ] **Step 3: Implement**

In `src/lib/validators/state-validator.ts`, replace (around line 412-417):

```ts
      // Compound state must have initial attribute or initial element
      if (!state['@_initial'] && !state.initial) {
        errors.push({
          message: `Compound state '${state['@_id']}' must have either an 'initial' attribute or an <initial> child element`,
          severity: 'error',
        });
      }
```

with:

```ts
      // Compound state must have initial attribute or initial element
      if (!state['@_initial'] && !state.initial) {
        errors.push({
          message: `Compound state '${state['@_id']}' must have either an 'initial' attribute or an <initial> child element`,
          severity: 'error',
          stateId: state['@_id'],
        });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/validators/state-validator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/state-validator.ts src/lib/validators/state-validator.test.ts
git commit -m "feat(validation): attach stateId in state-validator compound-state check"
```

---

### Task 4: Attach `stateId` in `scxml-validator.ts`

**Files:**
- Modify: `src/lib/validators/scxml-validator.ts:229-235`
- Test: `src/lib/validators/scxml-validator.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `src/lib/validators/scxml-validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import { SCXMLValidator } from './scxml-validator';

describe('SCXMLValidator duplicate state id', () => {
  it('attaches the duplicated id as stateId', () => {
    const scxml: SCXMLElement = {
      '@_xmlns': 'http://www.w3.org/2005/07/scxml',
      '@_version': '1.0',
      '@_initial': 'A',
      state: [{ '@_id': 'A' }, { '@_id': 'A' }],
    } as any;
    const errors = new SCXMLValidator().validate(scxml);
    const duplicateError = errors.find((e) => e.message.includes('Duplicate state ID'));
    expect(duplicateError).toBeDefined();
    expect(duplicateError!.stateId).toBe('A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validators/scxml-validator.test.ts`
Expected: FAIL — `duplicateError!.stateId` is `undefined`.

- [ ] **Step 3: Implement**

In `src/lib/validators/scxml-validator.ts`, replace (around line 229-235):

```ts
    const duplicateIds = findDuplicateIds(scxml);
    duplicateIds.forEach((id) => {
      errors.push({
        message: `Duplicate state ID '${id}'`,
        severity: 'error',
      });
    });
```

with:

```ts
    const duplicateIds = findDuplicateIds(scxml);
    duplicateIds.forEach((id) => {
      errors.push({
        message: `Duplicate state ID '${id}'`,
        severity: 'error',
        stateId: id,
      });
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/validators/scxml-validator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/scxml-validator.ts src/lib/validators/scxml-validator.test.ts
git commit -m "feat(validation): attach stateId in scxml-validator duplicate-id check"
```

---

### Task 5: Attach `stateId`/`targetStateId` in `initial-group-validator.ts`

**Files:**
- Modify: `src/lib/validators/initial-group-validator.ts:36-43`
- Test: `src/lib/validators/initial-group-validator.test.ts:27-38` (extend existing test)

- [ ] **Step 1: Extend the failing test**

In `src/lib/validators/initial-group-validator.test.ts`, replace the test at line 27-38:

```ts
  it('reports an error when a transition connects two different root-level Initial State groups', () => {
    const scxml: SCXMLElement = {
      '@_initial': 'A B',
      state: [{ '@_id': 'A', transition: { '@_target': 'B' } }, { '@_id': 'B' }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].severity).toBe('error');
    expect(errors[0].message).toContain('A');
    expect(errors[0].message).toContain('B');
  });
```

with:

```ts
  it('reports an error when a transition connects two different root-level Initial State groups', () => {
    const scxml: SCXMLElement = {
      '@_initial': 'A B',
      state: [{ '@_id': 'A', transition: { '@_target': 'B' } }, { '@_id': 'B' }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].severity).toBe('error');
    expect(errors[0].message).toContain('A');
    expect(errors[0].message).toContain('B');
    expect(errors[0].stateId).toBe('A');
    expect(errors[0].targetStateId).toBe('B');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validators/initial-group-validator.test.ts`
Expected: FAIL on the new `stateId`/`targetStateId` assertions; other tests in the file still PASS.

- [ ] **Step 3: Implement**

In `src/lib/validators/initial-group-validator.ts`, replace (around line 36-43):

```ts
    conflictedGroups.forEach((members) => {
      errors.push({
        message: `States ${members
          .map((m) => `'${m}'`)
          .join(' and ')} are both marked as Initial States but are connected by a transition (directly or indirectly), which merges two Initial State groups. Remove one of the Initial markers, or remove the transition(s) connecting them.`,
        severity: 'error',
      });
    });
```

with:

```ts
    conflictedGroups.forEach((members) => {
      errors.push({
        message: `States ${members
          .map((m) => `'${m}'`)
          .join(' and ')} are both marked as Initial States but are connected by a transition (directly or indirectly), which merges two Initial State groups. Remove one of the Initial markers, or remove the transition(s) connecting them.`,
        severity: 'error',
        stateId: members[0],
        targetStateId: members[1],
      });
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/validators/initial-group-validator.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/initial-group-validator.ts src/lib/validators/initial-group-validator.test.ts
git commit -m "feat(validation): attach stateId/targetStateId in initial-group-validator"
```

---

### Task 6: Add `focusTarget` to `editor-store.ts`

**Files:**
- Modify: `src/stores/editor-store.ts`
- Test: `src/stores/editor-store.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `src/stores/editor-store.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { useEditorStore } from './editor-store';

describe('editor-store focusTarget', () => {
  afterEach(() => {
    useEditorStore.getState().setFocusTarget(null);
  });

  it('defaults to null', () => {
    expect(useEditorStore.getState().focusTarget).toBeNull();
  });

  it('sets and clears the focus target', () => {
    useEditorStore.getState().setFocusTarget({ stateId: 'A', targetStateId: 'B' });
    expect(useEditorStore.getState().focusTarget).toEqual({ stateId: 'A', targetStateId: 'B' });

    useEditorStore.getState().setFocusTarget(null);
    expect(useEditorStore.getState().focusTarget).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/editor-store.test.ts`
Expected: FAIL — `focusTarget`/`setFocusTarget` don't exist on the store yet (TypeScript/runtime error).

- [ ] **Step 3: Implement**

In `src/stores/editor-store.ts`, add to the `EditorStore` interface (after `initialChildByParent: Map<string, InitialChildInfo[]>;` around line 20):

```ts
  // Cross-component request to navigate the diagram to and highlight a
  // specific state (e.g. from clicking a validation error while on the
  // Visual tab). Consumed and cleared by VisualDiagram.
  focusTarget: { stateId: string; targetStateId?: string } | null;
```

Add to the actions section of the interface (after `setInitialChildByParent: (map: Map<string, InitialChildInfo[]>) => void;` around line 35):

```ts
  setFocusTarget: (target: { stateId: string; targetStateId?: string } | null) => void;
```

Add to the store implementation, in the initial state (after `initialChildByParent: new Map(),` around line 55):

```ts
  focusTarget: null,
```

Add to the store implementation, in the actions (after `setInitialChildByParent` around line 155-157):

```ts
  setFocusTarget: (target) => {
    set({ focusTarget: target });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/editor-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor-store.ts src/stores/editor-store.test.ts
git commit -m "feat(store): add focusTarget for diagram error highlighting"
```

---

### Task 7: Add `resolveFocusTarget` utility

**Files:**
- Create: `src/lib/utils/resolve-focus-target.ts`
- Test: `src/lib/utils/resolve-focus-target.test.ts`

This is a small pure function so the id-resolution and ancestor-walk logic can be unit tested without mounting `VisualDiagram`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/resolve-focus-target.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import { toSafeNodeId, resolveFocusTarget } from './resolve-focus-target';

function node(id: string, parentId?: string): Node {
  return { id, parentId, position: { x: 0, y: 0 }, data: {} } as Node;
}

describe('toSafeNodeId', () => {
  it('replaces dots with double underscores, matching converter toSafeId', () => {
    expect(toSafeNodeId('a.b.c')).toBe('a__b__c');
  });

  it('leaves ids without dots unchanged', () => {
    expect(toSafeNodeId('pressure_up')).toBe('pressure_up');
  });
});

describe('resolveFocusTarget', () => {
  it('returns null when the source state id has no matching node', () => {
    const nodes = [node('A')];
    expect(resolveFocusTarget(nodes, 'Ghost')).toBeNull();
  });

  it('resolves a root-level state with no ancestors and no target', () => {
    const nodes = [node('A'), node('B')];
    const result = resolveFocusTarget(nodes, 'A');
    expect(result).toEqual({ ancestorIds: [], highlightIds: new Set(['A']) });
  });

  it('builds the root-to-parent ancestor chain for a nested state', () => {
    const nodes = [node('Root'), node('Mid', 'Root'), node('Leaf', 'Mid')];
    const result = resolveFocusTarget(nodes, 'Leaf');
    expect(result).toEqual({ ancestorIds: ['Root', 'Mid'], highlightIds: new Set(['Leaf']) });
  });

  it('highlights both source and target when they share the same parent', () => {
    const nodes = [node('Parent'), node('A', 'Parent'), node('B', 'Parent')];
    const result = resolveFocusTarget(nodes, 'A', 'B');
    expect(result).toEqual({ ancestorIds: ['Parent'], highlightIds: new Set(['A', 'B']) });
  });

  it('highlights only the source when source and target are at different levels', () => {
    const nodes = [node('P1'), node('P2'), node('A', 'P1'), node('B', 'P2')];
    const result = resolveFocusTarget(nodes, 'A', 'B');
    expect(result).toEqual({ ancestorIds: ['P1'], highlightIds: new Set(['A']) });
  });

  it('safe-converts dotted ids before matching nodes', () => {
    const nodes = [node('a__b')];
    const result = resolveFocusTarget(nodes, 'a.b');
    expect(result).toEqual({ ancestorIds: [], highlightIds: new Set(['a__b']) });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/resolve-focus-target.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/lib/utils/resolve-focus-target.ts`:

```ts
import type { Node } from 'reactflow';

/**
 * Convert a raw SCXML state id to its ReactFlow node id. Mirrors the
 * converter's toSafeId (id-mapping.ts), which only replaces dots — ReactFlow
 * treats dots in node ids as path separators.
 */
export function toSafeNodeId(id: string): string {
  return id.replace(/\./g, '__');
}

export interface FocusResolution {
  /** Ancestor node ids from root to the source state's direct parent, in
   * navigation order (pass to navigateIntoState in this order after
   * navigateToRoot). */
  ancestorIds: string[];
  /** Node ids to highlight once that hierarchy level is showing. */
  highlightIds: Set<string>;
}

/**
 * Resolve a validation error's stateId/targetStateId into the diagram
 * hierarchy path that reveals the source state, plus the node ids to
 * highlight there. Returns null if the source state isn't in the graph
 * (e.g. a stale error referencing a since-deleted state).
 */
export function resolveFocusTarget(
  allNodes: Node[],
  stateId: string,
  targetStateId?: string
): FocusResolution | null {
  const safeSourceId = toSafeNodeId(stateId);
  const sourceNode = allNodes.find((n) => n.id === safeSourceId);
  if (!sourceNode) return null;

  const ancestorIds: string[] = [];
  let parentId = sourceNode.parentId;
  while (parentId) {
    ancestorIds.unshift(parentId);
    const parentNode = allNodes.find((n) => n.id === parentId);
    parentId = parentNode?.parentId;
  }

  const highlightIds = new Set<string>([safeSourceId]);
  if (targetStateId) {
    const safeTargetId = toSafeNodeId(targetStateId);
    const targetNode = allNodes.find((n) => n.id === safeTargetId);
    if (targetNode && targetNode.parentId === sourceNode.parentId) {
      highlightIds.add(safeTargetId);
    }
  }

  return { ancestorIds, highlightIds };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/resolve-focus-target.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/resolve-focus-target.ts src/lib/utils/resolve-focus-target.test.ts
git commit -m "feat(diagram): add resolveFocusTarget utility"
```

---

### Task 8: Wire `focusTarget` into `VisualDiagram`

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

No new automated test here (this is store-driven ReactFlow wiring with no existing component-test precedent in this file); verified manually in Task 10.

- [ ] **Step 1: Add the import**

In `src/components/diagram/visual-diagram.tsx`, add near the other `@/lib/utils/*` imports (after `import { computeVisualStyles } from '@/lib/utils/visual-style-utils';` around line 21):

```ts
import { resolveFocusTarget } from '@/lib/utils/resolve-focus-target';
```

- [ ] **Step 2: Read and clear `focusTarget` from the store**

`VisualDiagramInner` already reads from `useEditorStore` for the hierarchy index panel sync (around line 2064: `const setInitialChildByParent = useEditorStore((state) => state.setInitialChildByParent);`). Add alongside it:

```ts
  const focusTarget = useEditorStore((state) => state.focusTarget);
  const setFocusTarget = useEditorStore((state) => state.setFocusTarget);
```

- [ ] **Step 3: Add the focus-handling effect**

Add this effect immediately after the `navigateIntoState` callback definition (after the block ending `[navigateWithFitView, originalNavigateIntoState]);` around line 2099, before `// ==================== ADD ROOT STATE HANDLER ====================`):

```ts
  // Handle a request (from the validation panel, via editor-store) to
  // navigate to and highlight a specific state/transition in the diagram.
  React.useEffect(() => {
    if (!focusTarget) return;

    const resolution = resolveFocusTarget(
      allNodesRef.current,
      focusTarget.stateId,
      focusTarget.targetStateId
    );

    if (!resolution) {
      setFocusTarget(null);
      return;
    }

    navigateToRoot();
    resolution.ancestorIds.forEach((ancestorId) => navigateIntoState(ancestorId));
    setSelectedTransitions(new Set());
    setActiveStates(resolution.highlightIds);
    setFocusTarget(null);
  }, [focusTarget, navigateToRoot, navigateIntoState, setFocusTarget]);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat(diagram): navigate to and highlight focusTarget from editor-store"
```

---

### Task 9: Add a Visual-tab validation panel overlay to `TwoTabLayout`

**Files:**
- Modify: `src/components/layout/two-tab-layout.tsx`

No new automated test (no existing component-test precedent for this file); verified manually in Task 10.

- [ ] **Step 1: Add imports**

In `src/components/layout/two-tab-layout.tsx`, add:

```ts
import { ValidationPanel } from "@/components/ui";
import { usePanelStore } from "@/stores/panel-store";
import type { ValidationError } from "@/types/common";
```

- [ ] **Step 2: Extend `TwoTabLayoutProps`**

Replace the `TwoTabLayoutProps` interface (lines 12-25):

```ts
interface TwoTabLayoutProps {
  codeEditor: React.ReactNode;
  visualDiagram: React.ReactNode;
  fileInfo?: {
    name?: string;
    isDirty?: boolean;
  };
  actions?:
    | React.ReactNode
    | ((
        activeTab: TabType,
        setActiveTab: (tab: TabType) => void,
      ) => React.ReactNode);
}
```

with:

```ts
interface TwoTabLayoutProps {
  codeEditor: React.ReactNode;
  visualDiagram: React.ReactNode;
  fileInfo?: {
    name?: string;
    isDirty?: boolean;
  };
  actions?:
    | React.ReactNode
    | ((
        activeTab: TabType,
        setActiveTab: (tab: TabType) => void,
      ) => React.ReactNode);
  validationPanelTab: 'validation' | 'host-alerts';
  onValidationTabChange: (tab: 'validation' | 'host-alerts') => void;
  onValidationClose: () => void;
  onNavigateToLine: (line: number, column: number) => void;
}
```

- [ ] **Step 3: Accept the new props and read the extra store state**

Replace the component signature and store reads (lines 29-40):

```ts
export const TwoTabLayout: React.FC<TwoTabLayoutProps> = ({
  codeEditor,
  visualDiagram,
  fileInfo,
  actions,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(
    () => useHostAPIStore.getState().requestedTab ?? "code"
  );
  const { commands, feedbackQueue, executeCommand, dismissFeedback, requestedTab, setRequestedTab } =
    useHostAPIStore();
  const { hierarchyState, navigateToRoot, navigateUp, initialChildByParent } = useEditorStore();
```

with:

```ts
export const TwoTabLayout: React.FC<TwoTabLayoutProps> = ({
  codeEditor,
  visualDiagram,
  fileInfo,
  actions,
  validationPanelTab,
  onValidationTabChange,
  onValidationClose,
  onNavigateToLine,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(
    () => useHostAPIStore.getState().requestedTab ?? "code"
  );
  const {
    commands, feedbackQueue, executeCommand, dismissFeedback, requestedTab, setRequestedTab,
    hostErrors, dismissHostError, clearHostErrors,
  } = useHostAPIStore();
  const { hierarchyState, navigateToRoot, navigateUp, initialChildByParent, errors, setFocusTarget } = useEditorStore();
  const { activePanel } = usePanelStore();
```

- [ ] **Step 4: Add the click handler**

Add after `handleTabChange` (after line 71, `}, []);`):

```ts
  const handleVisualErrorClick = useCallback(
    (error: ValidationError) => {
      if (error.stateId) {
        setFocusTarget({ stateId: error.stateId, targetStateId: error.targetStateId });
        return;
      }
      if (error.line && error.column) {
        setActiveTab("code");
        onNavigateToLine(error.line, error.column);
      }
    },
    [setFocusTarget, onNavigateToLine]
  );
```

- [ ] **Step 5: Render the overlay in the Visual tab branch**

Replace the Content Area block (lines 348-356):

```tsx
      {/* Content Area */}
      <div className='flex-1 overflow-hidden'>
        {activeTab === "code" && (
          <div className='h-full p-4 bg-base'>{codeEditor}</div>
        )}
        {activeTab === "visual" && (
          <div className='h-full bg-muted'>{visualDiagram}</div>
        )}
      </div>
```

with:

```tsx
      {/* Content Area */}
      <div className='flex-1 overflow-hidden'>
        {activeTab === "code" && (
          <div className='h-full p-4 bg-base'>{codeEditor}</div>
        )}
        {activeTab === "visual" && (
          <div className='h-full bg-muted relative'>
            {visualDiagram}
            {activePanel === 'validation' && (
              <div className='absolute right-4 top-4 bottom-4 z-40'>
                <ValidationPanel
                  errors={errors}
                  hostErrors={hostErrors}
                  isVisible={true}
                  activeTab={validationPanelTab}
                  onClose={onValidationClose}
                  onTabChange={onValidationTabChange}
                  onErrorClick={handleVisualErrorClick}
                  onDismissHostError={dismissHostError}
                  onClearHostErrors={clearHostErrors}
                />
              </div>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this will surface if `page.tsx` isn't updated yet — that's Task 10, do it next before running this check for real, or expect missing-prop errors on `<TwoTabLayout>` until then).

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/two-tab-layout.tsx
git commit -m "feat(layout): show validation panel over the Visual tab without switching tabs"
```

---

### Task 10: Wire `page.tsx` — drop the forced tab switch, pass new props

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Remove the forced tab switch**

Replace (around line 116-122):

```tsx
        <button
          onClick={() => {
            if (activeTab === 'visual') setActiveTab('code');
            const opening = activePanel !== 'validation';
            setActivePanel(opening ? 'validation' : null);
            if (!opening) setValidationPanelTab('validation');
          }}
```

with:

```tsx
        <button
          onClick={() => {
            const opening = activePanel !== 'validation';
            setActivePanel(opening ? 'validation' : null);
            if (!opening) setValidationPanelTab('validation');
          }}
```

- [ ] **Step 2: Pass the new props to `TwoTabLayout`**

Replace (around line 197-220):

```tsx
            <TwoTabLayout
              codeEditor={
                <CodeEditorPane
                  editorRef={editorRef}
                  onContentChange={handleContentChange}
                  onErrorClick={handleErrorClick}
                  validationPanelTab={validationPanelTab}
                  onValidationTabChange={setValidationPanelTab}
                  onValidationClose={handleValidationClose}
                  onEntriesChange={handleEntriesChange}
                />
              }
              visualDiagram={
                <VisualEditorPane
                  onSCXMLChange={handleSCXMLChangeFromDiagram}
                  isUpdatingFromHistory={isUpdatingFromHistory}
                  historyActionType={currentHistoryActionType}
                  onEntriesChange={handleEntriesChange}
                  onContentChange={handleContentChange}
                />
              }
              fileInfo={{ name: fileInfo?.name, isDirty }}
              actions={renderActions}
            />
```

with:

```tsx
            <TwoTabLayout
              codeEditor={
                <CodeEditorPane
                  editorRef={editorRef}
                  onContentChange={handleContentChange}
                  onErrorClick={handleErrorClick}
                  validationPanelTab={validationPanelTab}
                  onValidationTabChange={setValidationPanelTab}
                  onValidationClose={handleValidationClose}
                  onEntriesChange={handleEntriesChange}
                />
              }
              visualDiagram={
                <VisualEditorPane
                  onSCXMLChange={handleSCXMLChangeFromDiagram}
                  isUpdatingFromHistory={isUpdatingFromHistory}
                  historyActionType={currentHistoryActionType}
                  onEntriesChange={handleEntriesChange}
                  onContentChange={handleContentChange}
                />
              }
              fileInfo={{ name: fileInfo?.name, isDirty }}
              actions={renderActions}
              validationPanelTab={validationPanelTab}
              onValidationTabChange={setValidationPanelTab}
              onValidationClose={handleValidationClose}
              onNavigateToLine={(line, column) => editorRef.current?.navigateToLine(line, column)}
            />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS, including the ones added in Tasks 2-7.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(page): stop force-switching to code tab when opening validation panel"
```

---

### Task 11: Manual verification

No new files. This is a manual pass through the app (`npm run dev`) to confirm the feature works end to end, since ReactFlow diagram interaction isn't covered by the automated tests above.

- [ ] **Step 1: Reproduce the screenshot scenario**

Load or write an SCXML document with a cross-hierarchy transition (a `<transition>` whose `target` belongs to a different parent than its source state — matching the "pressure_up → Error_Oven_stop" case from the original bug report).

- [ ] **Step 2: Verify in-place panel + highlight on the Visual tab**

- Switch to the Visual Diagram tab.
- Click the error/warning status dot in the toolbar.
- Confirm: the validation panel opens **over the diagram**, and the tab **stays on Visual** (no jump to Code).
- Click the cross-hierarchy transition error.
- Confirm: the diagram navigates to the hierarchy level containing the source state (e.g. `pressure_up`) and highlights it (same highlight style as a manual click), and the tab is still Visual.

- [ ] **Step 3: Verify the Code tab is unaffected**

- Switch to the Code Editor tab.
- Click the error/warning status dot — confirm the panel still docks beside the editor exactly as before.
- Click an error — confirm it still jumps to the line/column in Monaco as before.

- [ ] **Step 4: Verify the stale-target case is a safe no-op**

- With a validation error selected that has a `stateId` for a state you then delete from the diagram (or simulate by editing the XML to remove that state while keeping the stale error momentarily visible), confirm clicking it does nothing harmful — no crash, no wrong state highlighted, no tab switch. (Note: this deliberately does NOT fall back to switching to the Code tab — `VisualDiagram` is the only place that discovers a `stateId` doesn't resolve, and by the time it does, `TwoTabLayout`'s click handler has already returned; wiring a signal back across that boundary for a rare edge case — the error list is normally kept in sync with the document via revalidation — wasn't judged worth the added complexity.)

- [ ] **Step 5: Verify non-anchored errors still fall back**

- Introduce a raw XML syntax error (e.g. an unclosed tag) via the Code tab.
- Switch to the Visual tab, open the panel, click that error.
- Confirm it still switches to the Code tab and jumps to the line (no `stateId` was available to highlight).

---

## Self-review notes

- **Spec coverage:** Data model (Task 1-5), panel placement (Task 9), focus-target store field (Task 6), data flow (Tasks 8-10), error handling for unresolved state ids (Task 8 step 3 / Task 11 step 4), non-anchored-error fallback (Task 11 step 5) — all covered.
- **Type consistency:** `focusTarget` shape (`{ stateId: string; targetStateId?: string } | null`) is identical across `editor-store.ts` (Task 6), `resolve-focus-target.ts`'s `resolveFocusTarget` parameters (Task 7), and `two-tab-layout.tsx`'s `handleVisualErrorClick` (Task 9) and `visual-diagram.tsx`'s effect (Task 8).
- **No placeholders:** every step has literal code, not a description of code.
