# Hierarchical State Containment Implementation Plan

## Problem Statement

The current SCXML visualization renders all states as flat, separate nodes, but compound states should visually contain their child states in a hierarchical layout. This plan addresses how to transform the flat node layout into proper hierarchical visualization.

## Current vs Expected Behavior

**Current (Problematic):**
- All states rendered as separate ReactFlow nodes
- No visual parent-child containment
- Hierarchy information lost in visualization
- Compound states appear same as simple states

**Expected (Target):**
- Compound states render as visual containers
- Child states positioned within parent boundaries
- Clear hierarchical visual structure
- Maintains SCXML semantic hierarchy

## Root Cause Analysis

1. **SCXMLToXStateConverter** creates flat nodes for all states regardless of hierarchy
2. **Visual positioning** doesn't implement true parent-child containment
3. **SCXMLStateNode** renders individual nodes with no containment concept
4. **ReactFlow** doesn't natively support hierarchical node containment

## Generic Solution Architecture

### 1. Enhanced Node Components (`src/components/diagram/nodes/`)

#### Create CompoundStateNode Component
```typescript
// New: compound-state-node.tsx
interface CompoundStateNodeData {
  label: string;
  children: string[]; // Child state IDs
  containerStyle: ContainerStyle;
  isExpanded: boolean;
}

const CompoundStateNode = ({ data, children }) => {
  // Renders as container with child positioning
  // Handles expand/collapse functionality
  // Manages child layout within bounds
}
```

#### Modify SCXMLStateNode
- Add hierarchical rendering modes
- Support for both standalone and contained rendering
- Parent awareness for relative positioning

#### Parent-Child Layout System
- Implement relative positioning within parent bounds
- Auto-sizing containers based on children
- Collision detection and layout optimization

### 2. Hierarchical Layout Algorithm (`src/lib/converters/scxml-to-xstate.ts`)

#### Update convertToReactFlow()
```typescript
convertToReactFlow(scxmlDoc: SCXMLDocument): {
  nodes: HierarchicalNode[];
  edges: Edge[];
} {
  // Generate hierarchical node relationships
  // Create parent-child node structures
  // Calculate container dimensions
  // Position children relative to parents
}
```

#### Enhanced calculateHierarchicalPosition()
- Position children relative to parent containers
- Implement container auto-sizing
- Handle nested compound states
- Optimize layout for readability

#### Container Sizing Logic
```typescript
calculateContainerSize(parentId: string, children: Node[]): {
  width: number;
  height: number;
} {
  // Calculate minimum container size
  // Add padding for visual clarity
  // Handle dynamic resizing
}
```

### 3. ReactFlow Integration (`src/components/diagram/visual-diagram.tsx`)

#### Custom Node Types Registration
```typescript
const nodeTypes: NodeTypes = {
  scxmlState: SCXMLStateNode,
  scxmlCompound: CompoundStateNode, // New
  scxmlParallel: ParallelStateNode, // New
};
```

#### Parent-Child Relations
- Establish proper node relationships in ReactFlow
- Handle nested node updates
- Manage container resizing

#### Layout Management
- Handle nested positioning and updates
- Coordinate parent-child movement
- Maintain hierarchy during drag operations

### 4. Visual Metadata Enhancement (`src/lib/metadata/`)

#### Container Metadata Extension
```typescript
interface ElementVisualMetadata {
  layout?: LayoutMetadata;
  style?: StyleMetadata;
  container?: ContainerMetadata; // New
}

interface ContainerMetadata {
  childLayout: 'auto' | 'grid' | 'manual';
  padding: number;
  minSize: { width: number; height: number };
  isCollapsible: boolean;
}
```

#### Child Positioning
- Add relative positioning within parent bounds
- Support for different layout strategies
- Auto-arrangement algorithms

#### Hierarchy Preservation
- Maintain parent-child relationships in visual data
- Serialize container information to SCXML
- Preserve layout during round-trip editing

### 5. SCXML Parser Updates (`src/lib/parsers/scxml-parser.ts`)

#### Enhanced State Registry
```typescript
interface StateRegistryEntry {
  state: any;
  parentPath: string;
  children: string[]; // New
  isContainer: boolean; // New
}
```

#### Hierarchy Tracking
- Track containment relationships bidirectionally
- Maintain parent-child references
- Support for nested compound states

#### Container Validation
- Ensure proper nested structure parsing
- Validate container relationships
- Handle malformed hierarchies gracefully

### 6. New Layout Algorithms

#### Auto-Layout for Containers
```typescript
class ContainerLayoutManager {
  arrangeChildren(
    parentBounds: Rectangle,
    children: Node[],
    strategy: LayoutStrategy
  ): ChildPosition[] {
    // Grid layout
    // Force-directed layout
    // Manual positioning preservation
  }
}
```

#### Collision Detection
- Prevent child overlap within containers
- Handle container boundary constraints
- Optimize spacing and alignment

## Implementation Strategy

### Phase 1: Foundation
1. Create CompoundStateNode component
2. Extend visual metadata for containers
3. Update state registry for hierarchy tracking

### Phase 2: Layout Engine
1. Implement hierarchical layout algorithms
2. Add container sizing logic
3. Create child positioning system

### Phase 3: ReactFlow Integration
1. Register new node types
2. Implement parent-child relationships
3. Handle nested interactions

### Phase 4: Parser Enhancement
1. Update SCXML parser for hierarchy
2. Enhance serialization for containers
3. Add validation for nested structures

### Phase 5: Testing & Refinement
1. Test with complex nested state machines
2. Optimize layout algorithms
3. Handle edge cases and performance

## Expected Files to Modify/Create

### New Files
- `src/components/diagram/nodes/compound-state-node.tsx`
- `src/components/diagram/nodes/parallel-state-node.tsx`
- `src/lib/layout/container-layout-manager.ts`
- `src/lib/layout/hierarchy-calculator.ts`
- `src/types/hierarchical-node.ts`

### Modified Files
- `src/components/diagram/nodes/scxml-state-node.tsx`
- `src/components/diagram/visual-diagram.tsx`
- `src/lib/converters/scxml-to-xstate.ts`
- `src/lib/parsers/scxml-parser.ts`
- `src/lib/metadata/visual-metadata-manager.ts`
- `src/types/visual-metadata.ts`

## Success Criteria

1. **Visual Hierarchy**: Compound states render as containers containing child states
2. **Layout Preservation**: Maintains existing positioning while adding containment
3. **Interaction Support**: Drag/drop works correctly for both containers and children
4. **Performance**: No significant performance degradation with complex hierarchies
5. **Compatibility**: Existing SCXML files render correctly with new hierarchy
6. **Generic Solution**: Works for any SCXML hierarchical structure, not just specific examples

## Technical Challenges

1. **ReactFlow Limitations**: ReactFlow doesn't natively support node containment
2. **Layout Complexity**: Calculating optimal container sizes and child positions
3. **Event Handling**: Managing interactions for nested nodes
4. **Performance**: Ensuring smooth rendering with deep hierarchies
5. **Backwards Compatibility**: Maintaining existing functionality

## Risk Mitigation

1. **Incremental Implementation**: Build in phases with fallback options
2. **Feature Flags**: Allow toggling between flat and hierarchical modes
3. **Extensive Testing**: Test with various SCXML structures
4. **Performance Monitoring**: Profile layout calculations and rendering
5. **User Feedback**: Gather feedback on visualization usability

## Alternative Approaches Considered

1. **Custom Canvas Rendering**: More control but higher complexity
2. **SVG-based Hierarchy**: Better nesting support but ReactFlow integration issues
3. **Grouped Nodes**: ReactFlow groups but limited styling control
4. **Layout Libraries**: External libraries but dependency complexity

The chosen approach balances ReactFlow integration with hierarchical requirements while maintaining the existing codebase architecture.