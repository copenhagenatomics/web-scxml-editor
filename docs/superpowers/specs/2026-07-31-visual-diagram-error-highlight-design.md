# Highlight validation errors in the Visual Diagram tab

## Problem

Today, clicking the error/warning status dot while on the Visual Diagram tab
force-switches to the Code Editor tab before opening the validation panel
([page.tsx:116-122](../../../src/app/page.tsx#L116-L122)), because the panel's
"click to navigate" behavior only knows how to jump to a line/column in the
Monaco code editor ([validation-panel.tsx:280-284](../../../src/components/ui/validation-panel.tsx#L280-L284)).
For an operator working visually, this is a jarring context switch: they lose
the diagram they were looking at just to see what's wrong.

## Goal

While on the Visual Diagram tab, clicking the error indicator opens the
validation panel in place. Clicking an individual error that references a
state or transition highlights that state/transition directly in the
diagram — no tab switch. Errors with no state context (raw XML/syntax errors)
keep today's fallback of switching to the code tab.

## Design

### 1. Data model

Add two optional fields to `ValidationError` in
[common/index.ts](../../../src/types/common/index.ts):

```ts
export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  code?: string;
  stateId?: string;       // the state the error is anchored to
  targetStateId?: string; // for transition errors, the transition's target
}
```

Populate these at each `errors.push(...)` call site that already has the
relevant id in scope:

- `transition-validator.ts`:
  - `validateInitialStates` (L103-124) — initial-state-not-found:
    `stateId: state['@_id']`.
  - `validateTransitionsInElement` (L75-98) — transition-target-not-found:
    `stateId: element['@_id']`, `targetStateId: target`.
  - `validateTransitionSemantics` (L129-202) — invalid transition type,
    internal-transition-with-target, invalid event name: all inside a loop
    with the source `element` and `transition` available;
    `stateId: (element as any)['@_id']`.
  - `validateCrossHierarchyInElement` (L220-294) — cross-hierarchy
    transition: `stateId: elementId`, `targetStateId: targetId` (both
    already computed locally for the message text).
- `scxml-validator.ts` — duplicate state id
  (`validateStateMachineSemanticsInternal`, L229-235): `stateId: id`.
- `state-validator.ts` — `validateCompoundStates` (L402-431),
  compound-state-missing-initial: `stateId: state['@_id']`.
- `initial-group-validator.ts` — `validateContainer` (L24-47), conflicting
  initial-state-group members: attach the conflicting id(s) (e.g. `stateId:
  members[0]`, or emit one error per member).

This deliberately excludes `w3c-validator.ts`. Its per-element checks only
carry a structural `path` string built from element type names and array
indices (e.g. `scxml.state[0].transition`) — never real SCXML ids — so unlike
the sites above, there is no id already in scope to attach; wiring one in
would mean threading the nearest ancestor's real id through roughly 15
recursive functions. That's a separate, larger effort and out of scope here.
Pure XML/syntax errors in `scxml-parser.ts`, and `w3c-validator.ts` checks in
general, have no state to anchor to and leave `stateId` unset — these keep
the existing code-tab-navigation fallback.

### 2. Panel placement

Lift `ValidationPanel` out of `CodeEditorPane`
([code-editor-pane.tsx:51-64](../../../src/app/_components/code-editor-pane.tsx#L51-L64))
up into `TwoTabLayout`
([two-tab-layout.tsx](../../../src/components/layout/two-tab-layout.tsx)), so
it renders once as a floating overlay regardless of which tab (`code` /
`visual`) is active, instead of only existing inside the code pane. Single
source of truth for panel visibility/state — no duplicated instance.

### 3. Focus target in the store

Add to `editor-store.ts`, alongside the existing `hierarchyState`:

```ts
focusTarget: { stateId: string; targetStateId?: string } | null;
setFocusTarget: (target: EditorStore['focusTarget']) => void;
```

`VisualDiagram` already reads hierarchy state directly from this store
rather than via props, so this follows the existing pattern rather than
threading new callback props through `VisualEditorPane`.

### 4. Data flow

1. User is on the Visual tab and clicks the error/warning status dot — the
   panel opens in place; the forced `setActiveTab('code')` at
   [page.tsx:118](../../../src/app/page.tsx#L118) is removed.
2. User clicks an error item. `handleErrorClick`
   ([page.tsx:81-85](../../../src/app/page.tsx#L81-L85)) branches:
   - **Has `stateId`, currently on visual tab** → `setFocusTarget({ stateId,
     targetStateId })`. No tab switch, no Monaco navigation.
   - **Has `stateId`, currently on code tab** → unchanged: navigate to
     line/column in Monaco.
   - **No `stateId`** → unchanged fallback: switch to code tab (if on
     visual) + navigate to line/column.
3. `VisualDiagram` adds a `useEffect` watching `focusTarget`. When set, it:
   - Converts `stateId` to its safe node id (`stateId.replace(/\./g, '__')`,
     the same transform `toSafeId` applies) and looks it up in
     `allNodesRef.current` (already-parsed nodes, each carrying `parentId`
     from the SCXML hierarchy — no need to instantiate a new converter or
     call `getAncestorChain`).
   - If not found, bail out to the not-found fallback (see Error handling).
   - Walks the node's `parentId` chain up to the root to build the ancestor
     list, then calls `navigateToRoot()` followed by `navigateIntoState()`
     per ancestor (root → leaf) to bring the source state's hierarchy level
     into view.
   - Sets `activeStates` to `{ safeSourceId }` (clearing
     `selectedTransitions`) — the same state that already drives the
     existing selection highlight style. If `targetStateId` is present
     *and* resolves to a node sharing the same `parentId` as the source
     (i.e. it's visible at the same level being navigated to), it's added
     to `activeStates` too. Cross-hierarchy transition errors, by
     definition, have source and target at different levels, so only the
     source gets highlighted in that case — there's no single level where
     both are visible at once.
   - Clears `focusTarget` on the store.

### 5. Error handling

- If `stateId` doesn't resolve to a node currently in `allNodesRef.current`
  (stale error referencing a since-deleted state), fall back to the
  code-tab + line-navigation behavior instead of doing nothing.

### 6. Testing

- Extend existing validator unit tests (`transition-validator`,
  `state-validator`, etc.) to assert `stateId`/`targetStateId` are populated
  on the relevant error objects.
- Add a test for the new `focusTarget`/`setFocusTarget` store action.
- Manual check: reproduce the cross-hierarchy-transition scenario, confirm
  clicking the error while on the Visual tab stays on that tab and
  highlights the source state without switching to code.

## Out of scope

- Highlighting for raw XML/syntax errors (no state context available).
- Highlighting for `w3c-validator.ts` checks (missing required attributes,
  unknown attributes, invalid `<log>`/`<invoke>`/etc. content) — these only
  carry a structural path, not a real state id; wiring real ids through that
  recursive traversal is a separate, larger effort.
- Any new visual language for the highlight — it reuses the existing
  selection style rather than introducing an error-specific outline/pulse.
