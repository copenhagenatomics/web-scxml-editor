# Visual SCXML Editor Implementation Plan: XState v5 + React Flow

## Phase 1: Foundation Setup
1. **Install Dependencies**
   - Add XState v5: `npm install xstate@latest`
   - Add React Flow: `npm install reactflow`
   - Add supporting libraries: `react-resizable-panels`, `@types/d3`

2. **Core Architecture Setup**
   - Create SCXML-to-XState converter service
   - Setup React Flow custom node types for SCXML elements
   - Implement two-tab layout with resizable panels

## Phase 2: SCXML Runtime Integration
3. **XState v5 SCXML Parser**
   - Extend existing `scxml-parser.ts` to generate XState v5 machines
   - Implement SCXML → XState conversion logic
   - Handle visual metadata extraction/preservation

4. **State Machine Execution Engine**
   - Create XState actor system for SCXML execution
   - Implement Inspect API integration for real-time state tracking
   - Setup simulation controls (play/pause/step/reset)

## Phase 3: Visual Diagram Implementation  
5. **React Flow Custom Nodes**
   - Create SCXML state nodes (simple, compound, final, initial)
   - Design transition edges with event/condition/action labels
   - Implement custom handles for transition connections

6. **Interactive Features**
   - Drag-and-drop positioning with visual metadata sync
   - Zoom/pan controls with minimap
   - Node selection and property editing
   - Waypoint editing for transition paths

## Phase 4: Two-Way Synchronization
7. **Visual → Code Sync**
   - Update SCXML visual attributes when nodes move
   - Sync Monaco Editor when diagram changes
   - Handle real-time validation and error display

8. **Code → Visual Sync** 
   - Parse Monaco Editor changes and update React Flow
   - Maintain cursor position and selection state
   - Handle syntax errors gracefully in visual view

## Phase 5: Advanced Features
9. **SCXML-Specific Features**
   - Compound state nesting visualization
   - Parallel state region handling  
   - History state indicators
   - Action namespace management

10. **Polish & Testing**
    - Implement undo/redo system
    - Add keyboard shortcuts
    - Performance optimization for large state machines
    - Comprehensive testing suite

## Key Components to Build
- `SCXMLToXStateConverter` - Parse SCXML → XState machine
- `TwoTabLayout` - Code editor + visual diagram tabs
- `SCXMLStateNode` - Custom React Flow node for states
- `SCXMLTransitionEdge` - Custom React Flow edge for transitions  
- `VisualMetadataManager` - Handle xmlns:visual attributes
- `SimulationController` - XState execution controls

## Success Criteria
✅ Seamless switching between code and visual tabs
✅ Real-time two-way synchronization
✅ Interactive node dragging with position persistence
✅ SCXML execution with visual state highlighting
✅ Professional VS Code-like experience