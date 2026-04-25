# SCXML Visual Editor - Implementation Plan (Due Oct 5th)

## REVISED Implementation Plan - Hierarchy Navigation as TOP PRIORITY

### **PRIORITY 1: Hierarchical Navigation System**

**This fundamentally changes how the diagram displays states - only showing one level at a time**

#### Core Concept:

- Initially show only root level states (direct children of `<scxml>`)
- Users navigate into compound states to see their children
- Only one hierarchy level visible at a time
- Navigate up/down through the hierarchy using toolbar buttons and node interactions

#### Example Navigation Flow:

```
Level 0: <scxml> root
User sees: stateA, stateB, stateC
  ■■ stateA (compound - dashed border)
  ■■ stateB (compound - dashed border)
  ■■ stateC (simple - solid border)

Level 1: Inside stateB
User navigated into stateB, sees: stateB1, stateB2
  ■■ stateB1 (simple - solid border)
  ■■ stateB2 (compound - dashed border)

Level 2: Inside stateB2
User navigated into stateB2, sees: stateB2a, stateB2b
  ■■ stateB2a (simple - solid border)
  ■■ stateB2b (simple - solid border)
```

#### Technical Implementation:

1. **Store Hierarchy State** (`src/stores/editor-store.ts`)

   ```typescript
   interface HierarchyState {
     currentPath: string[]; // ['stateB', 'stateB2']
     currentParentId: string | null; // Current container we're inside
     navigationHistory: string[][]; // For back navigation
     visibleNodes: Set<string>; // IDs of nodes to show at current level
   }
   ```

2. **Modify Visual Diagram** (`src/components/diagram/visual-diagram.tsx`)

   - Filter nodes to only show current level children
   - Hide all nodes outside current hierarchy level
   - Show only edges between visible nodes
   - Add breadcrumb navigation display

3. **Update Toolbar Controls**

   - Add "↑" (Up Arrow) button to navigate up one level
   - Add "S" (New State) button that creates states at current level
   - Show current hierarchy path in toolbar (e.g., "scxml > stateB > stateB2")

4. **Node Visual Indicators**

   - Compound states: Dashed border (has children inside)
   - Simple states: Solid border (no children)
   - Add descend icon (↓) in bottom-right corner on hover for compound states
   - Click descend icon to navigate into that state

5. **Update SCXML-to-ReactFlow Converter**
   - Return complete hierarchical structure
   - Apply filtering based on current hierarchy level
   - Preserve all nodes internally but only render current level

### **PRIORITY 2: Undo/Redo System**

#### Implementation:

- **Command Pattern Architecture**

  - Create `UndoRedoManager` class with action stack
  - Define action types: Create, Delete, Move, Rename, Edit
  - Store before/after states for each action

- **Keyboard Shortcuts**

  - Ctrl+Z for undo
  - Ctrl+Y for redo
  - Ctrl+Shift+Z as alternative redo

- **Integration Points**
  - Visual Diagram: Track node/edge changes
  - SCXML Editor: Track text changes with debouncing
  - Store undo/redo state in Zustand store

### **PRIORITY 3: Delete Without Confirmation**

- ✅ Fixed: Nodes can now be deleted using Delete/Backspace key
- ✅ Removed confirmation dialog for keyboard delete or trash icon (Delete key)
- ✅ Support multi-selection deletion for nodes
- ✅ Integrated with undo system for easy recovery

**Implementation Notes:**

- Modified `handleNodeDelete` to accept both single string and array of node IDs
- Removed `deleteConfirm` state and `handleNodeDeleteWrapper` function
- Removed `ConfirmationDialog` component import and usage from visual-diagram.tsx
- Deletion now happens immediately without confirmation
- Multi-node selection deletion is supported through ReactFlow's native multi-select
- Trash icon on nodes calls `handleNodeDelete` directly without confirmation
- Undo/redo integration works automatically via existing `onSCXMLChange` callback with `changeType: 'structure'`

### **PRIORITY 4: Edit State Name in Visual Diagram**

- Double-click state to enter edit mode
- Inline text editing with input field
- ESC to cancel, Enter to confirm
- Update SCXML document on change
- Update all transition targets referencing the state
- Integration with undo/redo system

### **PRIORITY 5: Transition Label Enhancements**

- Display both event and condition on edges
- Format: "event [condition]"
- Truncate long labels (10 chars + "...")
- Show full text on hover in tooltip/panel
- Edit labels directly on diagram
- Update `SCXMLTransitionEdge` component

### **PRIORITY 6: Enhanced Type Completion**

- Improve Monaco editor state ID completion
- Extract all state IDs from document
- Show dropdown with all valid targets
- Arrow key navigation in dropdown
- Enter key selection
- Position dropdown near cursor

### **PRIORITY 7: Collapse/Expand in SCXML Editor**

- Enable XML folding in Monaco Editor
- Add custom folding provider for SCXML elements
- Show fold indicators for each state element
- Persist fold state across edits
- Keyboard shortcuts for fold/unfold all

### **PRIORITY 8: New State Button Improvements**

- Ensure creation at current hierarchy level
- Auto-position new states intelligently
- Set as initial state if first at level
- Generate unique IDs automatically
- Add to proper parent in SCXML structure

## Technical Implementation Details

### File Structure:

```
New Files:
- src/hooks/use-hierarchy-navigation.ts
- src/lib/undo-redo/UndoRedoManager.ts
- src/lib/undo-redo/actions.ts
- src/components/diagram/toolbar/HierarchyToolbar.tsx
- src/components/diagram/toolbar/DiagramToolbar.tsx

Modified Files:
- src/stores/editor-store.ts
- src/components/diagram/visual-diagram.tsx
- src/components/diagram/nodes/scxml-state-node.tsx
- src/components/diagram/edges/scxml-transition-edge.tsx
- src/components/editor/xml-editor.tsx
- src/lib/converters/scxml-to-xstate.ts
- src/lib/monaco/enhanced-scxml-completion.ts
```

### Hierarchy Navigation Implementation Details:

```typescript
// Filter logic for visible nodes
function getVisibleNodes(allNodes: Node[], hierarchyState: HierarchyState) {
  if (!hierarchyState.currentParentId) {
    // Show root level - states without parents
    return allNodes.filter((node) => !node.parentId);
  }
  // Show children of current parent
  return allNodes.filter(
    (node) => node.parentId === hierarchyState.currentParentId
  );
}

// Navigation functions
function navigateIntoState(stateId: string) {
  // Update current path
  // Set new parent ID
  // Refresh visible nodes
}

function navigateUp() {
  // Pop from current path
  // Set parent's parent as new parent
  // Refresh visible nodes
}
```

### Undo/Redo Architecture:

```typescript
interface Action {
  type: 'CREATE' | 'DELETE' | 'MOVE' | 'RENAME' | 'EDIT';
  execute(): void;
  undo(): void;
  redo(): void;
}

class UndoRedoManager {
  private undoStack: Action[] = [];
  private redoStack: Action[] = [];

  execute(action: Action) {
    action.execute();
    this.undoStack.push(action);
    this.redoStack = []; // Clear redo on new action
  }

  undo() {
    const action = this.undoStack.pop();
    if (action) {
      action.undo();
      this.redoStack.push(action);
    }
  }

  redo() {
    const action = this.redoStack.pop();
    if (action) {
      action.redo();
      this.undoStack.push(action);
    }
  }
}
```

## Implementation Timeline

### Day 1-2: Hierarchy Navigation (Critical)

- Implement hierarchy state management
- Add filtering logic for single-level display
- Create navigation controls (up button, descend icon)
- Update node visual indicators (dashed/solid borders)
- Add breadcrumb navigation

### Day 2-3: Undo/Redo System

- Implement UndoRedoManager
- Create action classes for each operation
- Add keyboard shortcuts
- Integrate with both editors

### Day 3-4: Remaining Features

- Delete without confirmation
- Edit state name in diagram
- Transition label enhancements
- Enhanced type completion

### Day 4-5: Testing & Polish

- Collapse/expand in editor
- New state button improvements
- Bug fixes and edge cases
- Performance optimization
- User testing

## Success Criteria

1. **Hierarchy Navigation**: Users can navigate through state hierarchy one level at a time
2. **Undo/Redo**: All actions can be undone/redone with keyboard shortcuts
3. **Delete**: Keyboard delete works without confirmation
4. **Edit Names**: States can be renamed directly in diagram
5. **Transitions**: Labels show event and condition with truncation
6. **Type Completion**: State IDs autocomplete in SCXML editor
7. **Collapse/Expand**: SCXML editor supports folding
8. **New State**: Creates states at correct hierarchy level

## Notes

- Hierarchy navigation is the most critical feature as it fundamentally changes the user experience
- All features must integrate with the existing two-way synchronization
- Preserve visual metadata during all operations
- Maintain SCXML document validity
- Consider performance with large state machines
