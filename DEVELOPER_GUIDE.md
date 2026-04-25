# SCXML Visual Editor - Advanced Developer Guide

This comprehensive guide is for developers who want to modify, extend, or deeply understand the SCXML Visual Editor codebase.

## Table of Contents

1. [Architecture Deep Dive](#architecture-deep-dive)
2. [Core Systems](#core-systems)
3. [Command Pattern Implementation](#command-pattern-implementation)
4. [Visual Metadata System](#visual-metadata-system)
5. [Parser & Validator Architecture](#parser--validator-architecture)
6. [Layout Engine](#layout-engine)
7. [State Management](#state-management)
8. [History & Undo/Redo System](#history--undoredo-system)
9. [Monaco Editor Integration](#monaco-editor-integration)
10. [ReactFlow Integration](#reactflow-integration)
11. [Extending the Editor](#extending-the-editor)
12. [Performance Optimization](#performance-optimization)
13. [Debugging Guide](#debugging-guide)
14. [API Reference](#api-reference)

---

## Architecture Deep Dive

### Application Architecture

The SCXML Visual Editor follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Presentation Layer                          │
│  ┌──────────────────┐              ┌──────────────────┐         │
│  │  React Components│              │  Custom Hooks    │         │
│  │  (src/components)│              │  (src/hooks)     │         │
│  └──────────────────┘              └──────────────────┘         │
└────────────────────────┬────────────────────┬───────────────────┘
                         │                    │
┌────────────────────────┴────────────────────┴───────────────────┐
│                    Application Layer                            │
│  ┌──────────────────┐              ┌──────────────────┐         │
│  │  State Stores    │              │  History Manager │         │
│  │  (Zustand)       │              │  (Singleton)     │         │
│  └──────────────────┘              └──────────────────┘         │
└────────────────────────┬────────────────────┬───────────────────┘
                         │                    │
┌────────────────────────┴────────────────────┴───────────────────┐
│                      Domain Layer                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  │
│  │  Commands  │  │  Converters│  │  Validators│  │  Parsers │  │
│  │  (Pattern) │  │            │  │            │  │          │  │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘  │
└────────────────────────┬────────────────────┬───────────────────┘
                         │                    │
┌────────────────────────┴────────────────────┴───────────────────┐
│                   Infrastructure Layer                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  │
│  │  Layout    │  │  Metadata  │  │  Utilities │  │  Types   │  │
│  │  (ELK)     │  │  Manager   │  │            │  │          │  │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure Explained

```
src/
├── app/                    # Next.js App Router (Entry Point)
│   ├── layout.tsx          # Root layout, metadata, fonts
│   └── page.tsx            # Main application orchestrator (478 lines)
│
├── components/             # React Components (Presentation)
│   ├── diagram/            # Visual diagram rendering
│   │   ├── nodes/          # ReactFlow custom nodes
│   │   ├── edges/          # ReactFlow custom edges
│   │   └── visual-diagram.tsx  # Main diagram orchestrator (2425 lines)
│   ├── editor/             # Monaco-based code editor
│   ├── file-operations/    # File upload/export
│   ├── layout/             # Layout containers
│   ├── simulation/         # State machine simulation (future)
│   └── ui/                 # Reusable UI components
│
├── hooks/                  # Custom React Hooks
│   └── use-hierarchy-navigation.ts  # Hierarchy filtering logic
│
├── stores/                 # State Management (Zustand)
│   ├── editor-store.ts     # Main app state (155 lines)
│   └── history-store.ts    # History stack (116 lines)
│
├── lib/                    # Core Business Logic
│   ├── commands/           # Command Pattern (Undo/Redo)
│   ├── converters/         # SCXML ↔ ReactFlow conversion
│   ├── history/            # History manager (361 lines)
│   ├── layout/             # ELK layout engine integration
│   ├── metadata/           # Visual metadata serialization (741 lines)
│   ├── monaco/             # Monaco editor customization
│   ├── parsers/            # XML → SCXML parsing (473 lines)
│   ├── scxml/              # SCXML runtime utilities
│   ├── utils/              # Helper functions
│   ├── validators/         # SCXML validation (2044 lines)
│   └── consts/             # Constants and templates
│
└── types/                  # TypeScript Type Definitions
    ├── scxml/              # SCXML element types
    ├── common/             # Shared types
    ├── visual-metadata/    # Metadata schema (337 lines)
    ├── history/            # History types
    └── hierarchical-node.ts # Node hierarchy types
```

---

## Core Systems

### 1. Two-Way Synchronization

The editor maintains **bidirectional sync** between code and visual representations.

**Implementation Location:** `src/app/page.tsx` (lines 106-129)

```typescript
// Code Editor → Visual Diagram
const handleContentChange = useCallback(
  (newContent: string) => {
    setContent(newContent);

    // Track in history (debounced 500ms)
    if (!isUpdatingFromHistory) {
      historyManager.trackTextEdit(newContent);
    }
  },
  [setContent, historyManager, isUpdatingFromHistory]
);

// Visual Diagram → Code Editor
const handleSCXMLChangeFromDiagram = useCallback(
  (
    newContent: string,
    changeType?: 'position' | 'structure' | 'property' | 'resize'
  ) => {
    setContent(newContent);

    // Track in history (immediate for structure, debounced for position)
    if (!isUpdatingFromHistory) {
      historyManager.trackDiagramChange(newContent, undefined, changeType);
    }
  },
  [setContent, historyManager, isUpdatingFromHistory]
);
```

**Key Mechanism:** The `isUpdatingFromHistory` flag prevents infinite loops during undo/redo operations.

### 2. Hierarchy Navigation

Supports drilling down into compound states.

**Implementation Location:** `src/hooks/use-hierarchy-navigation.ts` (159 lines)

```typescript
interface HierarchyState {
  currentPath: string[]; // ['parent', 'child', 'grandchild']
  currentParentId: string | null;
  visibleNodes: Set<string>;
}

// Filter nodes by current hierarchy level
const filteredNodes = nodes.filter((node) => {
  if (currentParentId === null) {
    // Root level: show nodes without parents
    return !node.parentId;
  } else {
    // Child level: show only children of current parent
    return node.parentId === currentParentId;
  }
});
```

**Store Integration:** `src/stores/editor-store.ts` (lines 91-155)

```typescript
navigateIntoState: (stateId: string) => {
  set((state) => ({
    hierarchyState: {
      currentPath: [...state.hierarchyState.currentPath, stateId],
      currentParentId: stateId,
      navigationHistory: [
        ...state.hierarchyState.navigationHistory,
        state.hierarchyState.currentPath,
      ],
    },
  }));
};
```

---

## Command Pattern Implementation

All SCXML modifications are implemented as **reversible commands**.

### Base Command Class

**Location:** `src/lib/commands/base-command.ts` (150 lines)

```typescript
export abstract class BaseCommand {
  /**
   * Execute the command and return modified SCXML
   */
  abstract execute(scxmlContent: string): CommandResult;

  /**
   * Undo the command and return previous SCXML
   */
  abstract undo(scxmlContent: string): CommandResult;

  /**
   * Get human-readable description for history
   */
  abstract getDescription(): string;

  // Helper methods for XML manipulation
  protected parseXML(scxmlContent: string): {
    doc: Document | null;
    error?: string;
  };
  protected serializeXML(doc: Document): string;
  protected findStateElement(doc: Document, stateId: string): Element | null;
  protected ensureVizNamespace(doc: Document): void;
}

interface CommandResult {
  success: boolean;
  content?: string;
  error?: string;
}
```

### Example: Update Position Command

**Location:** `src/lib/commands/update-position-command.ts` (91 lines)

```typescript
export class UpdatePositionCommand extends BaseCommand {
  constructor(
    private stateId: string,
    private oldPosition: { x: number; y: number },
    private newPosition: { x: number; y: number }
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc || error) {
      return { success: false, error };
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return { success: false, error: `State ${this.stateId} not found` };
    }

    // Ensure viz namespace exists
    this.ensureVizNamespace(doc);

    // Get existing dimensions (or defaults)
    const xywh = stateElement.getAttribute('viz:xywh') || '0,0,150,80';
    const [, , width, height] = xywh.split(',').map(Number);

    // Update position
    stateElement.setAttribute(
      'viz:xywh',
      `${this.newPosition.x},${this.newPosition.y},${width},${height}`
    );

    return {
      success: true,
      content: this.serializeXML(doc),
    };
  }

  undo(scxmlContent: string): CommandResult {
    // Same logic but with oldPosition
    // ... (implementation mirrors execute)
  }

  getDescription(): string {
    return `Move state "${this.stateId}" to (${this.newPosition.x}, ${this.newPosition.y})`;
  }
}
```

### Available Commands

| Command                              | File                                      | Purpose                     | Lines |
| ------------------------------------ | ----------------------------------------- | --------------------------- | ----- |
| `UpdatePositionCommand`              | update-position-command.ts                | Move single node            | 91    |
| `BatchUpdatePositionCommand`         | batch-update-position-command.ts          | Move multiple nodes         | ~120  |
| `UpdatePositionAndDimensionsCommand` | update-position-and-dimensions-command.ts | Resize node                 | ~110  |
| `RenameStateCommand`                 | rename-state-command.ts                   | Rename state (updates refs) | ~180  |
| `DeleteNodeCommand`                  | delete-node-command.ts                    | Delete node (cascade)       | ~150  |
| `ChangeStateTypeCommand`             | change-state-type-command.ts              | Convert state type          | ~130  |
| `UpdateTransitionCommand`            | update-transition-command.ts              | Update transition props     | ~140  |
| `UpdateWaypointsCommand`             | update-waypoints-command.ts               | Update edge path            | ~100  |
| `UpdateTransitionHandlesCommand`     | update-transition-handles-command.ts      | Update connection points    | ~120  |
| `UpdateActionsCommand`               | update-actions-command.ts                 | Update entry/exit actions   | ~160  |
| `ReconnectTransitionCommand`         | reconnect-transition-command.ts           | Change edge endpoints       | ~170  |

### Using Commands in Components

**Location:** `src/components/diagram/visual-diagram.tsx` (lines 800-850)

```typescript
// In node drag handler
const handleNodesChange = useCallback(
  (changes: NodeChange[]) => {
    changes.forEach((change) => {
      if (change.type === 'position' && change.position) {
        const node = nodes.find((n) => n.id === change.id);

        // Create command
        const command = new UpdatePositionCommand(
          change.id,
          { x: node.position.x, y: node.position.y }, // old
          { x: change.position.x, y: change.position.y } // new
        );

        // Execute
        const result = command.execute(scxmlContent);

        if (result.success) {
          // Update content (triggers re-render)
          onSCXMLChange(result.content, 'position');
        }
      }
    });
  },
  [nodes, scxmlContent, onSCXMLChange]
);
```

---

## Visual Metadata System

The visual metadata system allows **non-intrusive** layout persistence using XML namespaces.

### Namespace Declaration

**Namespace URI:** `http://visual-scxml-editor/metadata`

**Prefix:** `viz:`

```xml
<scxml xmlns="http://www.w3.org/2005/07/scxml"
       xmlns:viz="http://visual-scxml-editor/metadata"
       version="1.0">
```

### Attribute Schema

| Attribute       | Format              | Example                                            | Purpose                 |
| --------------- | ------------------- | -------------------------------------------------- | ----------------------- |
| `viz:xywh`      | `"x,y,w,h"`         | `"100,200,150,80"`                                 | Position and dimensions |
| `viz:rgb`       | `"#RRGGBB"`         | `"#4A90E2"`                                        | Fill color              |
| `viz:waypoints` | `"x1,y1;x2,y2;..."` | `"100,50;200,100"`                                 | Edge path               |
| `viz:handles`   | JSON string         | `"[{\"type\":\"source\",\"position\":\"right\"}]"` | Connection handles      |

### Visual Metadata Manager

**Location:** `src/lib/metadata/visual-metadata-manager.ts` (741 lines)

#### Key Methods

```typescript
class VisualMetadataManager {
  /**
   * Extract all visual metadata from SCXML content
   * Lines 49-108
   */
  static extractAllVisualMetadata(scxmlContent: string): {
    nodes: Record<string, VisualMetadata>;
    edges: Record<string, VisualMetadata>;
  };

  /**
   * Apply visual metadata to SCXML content
   * Lines 123-175
   */
  static applyVisualMetadata(
    scxmlContent: string,
    metadata: AllVisualMetadata
  ): string;

  /**
   * Remove all visual metadata (clean export)
   * Lines 184-220
   */
  static stripVisualMetadata(scxmlContent: string): string;

  /**
   * Validate metadata integrity
   * Lines 236-327
   */
  static validateMetadata(metadata: AllVisualMetadata): {
    isValid: boolean;
    errors: string[];
  };

  /**
   * Update single node position
   * Lines 345-398
   */
  static updateNodePosition(
    scxmlContent: string,
    nodeId: string,
    x: number,
    y: number
  ): string;

  /**
   * Update single node dimensions
   * Lines 407-462
   */
  static updateNodeDimensions(
    scxmlContent: string,
    nodeId: string,
    width: number,
    height: number
  ): string;

  /**
   * Update edge waypoints
   * Lines 479-534
   */
  static updateEdgeWaypoints(
    scxmlContent: string,
    edgeId: string,
    waypoints: Array<{ x: number; y: number }>
  ): string;
}
```

#### Metadata Type Definition

**Location:** `src/types/visual-metadata/index.ts` (337 lines)

```typescript
interface VisualMetadata {
  layout?: LayoutMetadata;
  style?: StyleMetadata;
  diagram?: DiagramMetadata;
  container?: ContainerMetadata;
  actions?: ActionNamespaceMetadata;
  view?: ViewStateMetadata;
}

interface LayoutMetadata {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

interface StyleMetadata {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

interface DiagramMetadata {
  waypoints?: Array<{ x: number; y: number }>;
  curveType?: 'bezier' | 'straight' | 'step' | 'smoothstep';
  handles?: HandleMetadata[];
}

interface ContainerMetadata {
  childLayout?: 'horizontal' | 'vertical' | 'grid' | 'free';
  padding?: { top: number; right: number; bottom: number; left: number };
  elkOptions?: Record<string, any>;
}
```

### Usage Examples

```typescript
import { VisualMetadataManager } from '@/lib/metadata';

// Extract metadata
const metadata = VisualMetadataManager.extractAllVisualMetadata(xmlContent);
console.log(metadata.nodes['state1']); // { layout: { x: 100, y: 200, ... }, ... }

// Update node position
const updatedXml = VisualMetadataManager.updateNodePosition(
  xmlContent,
  'state1',
  150, // new x
  250 // new y
);

// Strip metadata for clean export
const cleanXml = VisualMetadataManager.stripVisualMetadata(xmlContent);
```

---

## Parser & Validator Architecture

### SCXML Parser

**Location:** `src/lib/parsers/scxml-parser.ts` (473 lines)

#### Parser Configuration

Uses `fast-xml-parser` library with custom options:

```typescript
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: false,
  trimValues: true,
  parseTrueNumberOnly: false,
  arrayMode: false,
  allowBooleanAttributes: true,
  preserveOrder: false,
};
```

#### Parse Flow

```typescript
class SCXMLParser {
  parse(xmlContent: string): ParseResult<SCXMLDocument> {
    // 1. XML syntax validation (lines 137-318)
    const xmlErrors = this.validateXMLSyntax(xmlContent);
    if (xmlErrors.length > 0) {
      return { success: false, errors: xmlErrors };
    }

    // 2. Parse XML to JSON structure
    const parser = new XMLParser(parserOptions);
    let jsonObj;
    try {
      jsonObj = parser.parse(xmlContent);
    } catch (error) {
      return {
        success: false,
        errors: [
          { message: `XML parse error: ${error.message}`, severity: 'error' },
        ],
      };
    }

    // 3. Extract SCXML root element
    const scxml = jsonObj.scxml;
    if (!scxml) {
      return {
        success: false,
        errors: [
          { message: 'No <scxml> root element found', severity: 'error' },
        ],
      };
    }

    // 4. Extract visual metadata (line 323)
    const hasVizMetadata = this.detectVisualMetadata(xmlContent);

    // 5. Build document structure
    const document: SCXMLDocument = {
      scxml,
      states: this.extractStates(scxml),
      transitions: this.extractTransitions(scxml),
      hasVisualMetadata: hasVizMetadata,
    };

    return { success: true, data: document, errors: [] };
  }
}
```

#### State Extraction

```typescript
private extractStates(scxml: SCXMLElement): StateElement[] {
  const states: StateElement[] = [];

  function traverse(element: any, parentId?: string) {
    if (element.state) {
      const stateArray = Array.isArray(element.state)
        ? element.state
        : [element.state];

      stateArray.forEach(state => {
        states.push({
          ...state,
          parentId,
          type: 'state'
        });

        // Recurse for nested states
        traverse(state, state['@_id']);
      });
    }

    if (element.parallel) {
      // Handle parallel states
      // ...
    }
  }

  traverse(scxml);
  return states;
}
```

### SCXML Validator

**Location:** `src/lib/validators/scxml-validator.ts` (2044 lines)

#### Validation Rules

The validator enforces **W3C SCXML specification** compliance with comprehensive checks.

**Rule Categories:**

1. **Structural Validation** (lines 80-340)

   - Root element must be `<scxml>`
   - Version attribute required
   - Valid namespace
   - State IDs must be unique

2. **State Reference Validation** (lines 350-680)

   - Transition targets must exist
   - Initial states must be valid
   - History defaults must exist
   - Parent-child relationships valid

3. **Attribute Validation** (lines 690-1240)

   - Required attributes present
   - Attribute value types correct
   - Enum values valid
   - Event names valid

4. **Semantic Validation** (lines 1250-1780)

   - No unreachable states (dead code detection)
   - No circular dependencies
   - Proper nesting (can't transition out of parallel)
   - Datamodel consistency

5. **Cross-Hierarchy Validation** (lines 1909-1983)

   - Transitions across hierarchy levels are valid
   - Target states are reachable from source
   - History states used correctly

6. **Spell-Check Validation** (lines 1990-2044)
   - Suggests corrections for typos (Levenshtein distance)
   - Example: "traget" → suggests "target"

#### Validation Example

```typescript
class SCXMLValidator {
  validate(scxml: SCXMLElement, xmlContent: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. Validate state IDs are unique
    const stateIds = new Set<string>();
    this.traverseStates(scxml, (state) => {
      const id = state['@_id'];
      if (!id) {
        errors.push({
          message: `State missing required 'id' attribute`,
          severity: 'error',
          line: this.getLineNumber(xmlContent, state),
        });
      } else if (stateIds.has(id)) {
        errors.push({
          message: `Duplicate state ID: ${id}`,
          severity: 'error',
          line: this.getLineNumber(xmlContent, id),
        });
      } else {
        stateIds.add(id);
      }
    });

    // 2. Validate transition targets exist
    this.traverseTransitions(scxml, (transition) => {
      const target = transition['@_target'];
      if (target && !stateIds.has(target)) {
        // Check for typo
        const suggestion = this.findClosestMatch(target, Array.from(stateIds));

        errors.push({
          message: `Transition target "${target}" does not exist.${
            suggestion ? ` Did you mean "${suggestion}"?` : ''
          }`,
          severity: 'error',
          line: this.getLineNumber(xmlContent, target),
        });
      }
    });

    // 3. Validate initial states
    // 4. Validate event names
    // ... (more validations)

    return errors;
  }
}
```

#### Dead Code Detection

```typescript
private detectUnreachableStates(
  scxml: SCXMLElement
): ValidationError[] {
  const errors: ValidationError[] = [];
  const reachable = new Set<string>();

  // Start from initial state
  const initialState = scxml['@_initial'] || this.findFirstState(scxml);
  reachable.add(initialState);

  // BFS to find all reachable states
  const queue = [initialState];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const transitions = this.getTransitionsFrom(current);

    transitions.forEach(t => {
      const target = t['@_target'];
      if (target && !reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    });
  }

  // Find unreachable states
  const allStates = this.getAllStateIds(scxml);
  allStates.forEach(stateId => {
    if (!reachable.has(stateId)) {
      errors.push({
        message: `State "${stateId}" is unreachable from initial state`,
        severity: 'warning',
        line: this.getLineNumber(this.xmlContent, stateId)
      });
    }
  });

  return errors;
}
```

---

## Layout Engine

The editor uses **ELK (Eclipse Layout Kernel)** for automatic graph layout.

### ELK Layout Service

**Location:** `src/lib/layout/elk-layout-service.ts` (304 lines)

#### Layout Algorithms

| Algorithm | Use Case                             | Characteristics                 |
| --------- | ------------------------------------ | ------------------------------- |
| `layered` | Hierarchical flow diagrams (default) | Directed, layers, good for FSMs |
| `force`   | Network-style layouts                | Force-directed, organic         |
| `stress`  | Graph visualization                  | Minimize edge length            |
| `mrtree`  | Tree structures                      | Multi-rooted trees              |
| `radial`  | Radial layouts                       | Center-outward arrangement      |

#### Configuration

```typescript
interface ELKLayoutOptions {
  algorithm: 'layered' | 'force' | 'stress' | 'mrtree' | 'radial';
  direction: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
  spacing: {
    nodeSpacing: number; // Space between nodes
    edgeSpacing: number; // Space between edges
    componentSpacing: number; // Space between disconnected components
  };
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  hierarchical: boolean; // Support nested states
  edgeRouting: 'SPLINES' | 'POLYLINE' | 'ORTHOGONAL';
}
```

#### Layout Process

```typescript
class ELKLayoutService {
  async layout(
    nodes: Node[],
    edges: Edge[],
    options?: Partial<ELKLayoutOptions>
  ): Promise<{ nodes: Node[]; edges: Edge[] }> {
    // 1. Convert ReactFlow nodes/edges to ELK graph
    const elkGraph = this.toELKGraph(nodes, edges);

    // 2. Configure ELK options
    elkGraph.layoutOptions = {
      'elk.algorithm': options?.algorithm || 'layered',
      'elk.direction': options?.direction || 'RIGHT',
      'elk.spacing.nodeNode': options?.spacing?.nodeSpacing || 80,
      'elk.spacing.edgeEdge': options?.spacing?.edgeSpacing || 20,
      'elk.padding': `[top=${options?.padding?.top || 50},...`,
      'elk.hierarchyHandling': options?.hierarchical
        ? 'INCLUDE_CHILDREN'
        : 'SEPARATE_CHILDREN',
    };

    // 3. Run ELK layout algorithm
    const elk = new ELK();
    const layoutedGraph = await elk.layout(elkGraph);

    // 4. Convert back to ReactFlow format
    const layoutedNodes = this.fromELKGraph(layoutedGraph, nodes);
    const layoutedEdges = this.updateEdgePaths(layoutedGraph, edges);

    return { nodes: layoutedNodes, edges: layoutedEdges };
  }

  /**
   * Convert ReactFlow to ELK format (lines 140-194)
   */
  private toELKGraph(nodes: Node[], edges: Edge[]): ELKNode {
    return {
      id: 'root',
      layoutOptions: {
        /* ... */
      },
      children: nodes.map((node) => ({
        id: node.id,
        width: node.width || 150,
        height: node.height || 80,
        // Handle hierarchy
        children: node.data.children?.map(/* ... */),
        edges: edges
          .filter((e) => e.source === node.id)
          .map((e) => ({
            id: e.id,
            sources: [e.source],
            targets: [e.target],
          })),
      })),
    };
  }
}
```

### Node Dimension Calculator

**Location:** `src/lib/layout/node-dimension-calculator.ts`

```typescript
class NodeDimensionCalculator {
  /**
   * Calculate node dimensions based on content
   */
  static calculateDimensions(node: Node): { width: number; height: number } {
    const baseWidth = 150;
    const baseHeight = 80;

    // State name affects width
    const labelLength = node.data.label?.length || 0;
    const width = Math.max(baseWidth, labelLength * 8 + 40);

    // Add height for "Initial" tag
    const hasInitialTag = node.data.isInitial;
    const height = hasInitialTag ? baseHeight + 20 : baseHeight;

    // Add height for actions
    const actionCount =
      (node.data.onentry?.length || 0) + (node.data.onexit?.length || 0);
    const actionHeight = actionCount * 20;

    return {
      width,
      height: height + actionHeight,
    };
  }
}
```

---

## State Management

### Editor Store

**Location:** `src/stores/editor-store.ts` (155 lines)

#### Store Schema

```typescript
interface EditorStore {
  // Content state
  content: string;
  setContent: (content: string) => void;

  // File state
  fileInfo: FileInfo | null;
  setFileInfo: (info: FileInfo | null) => void;
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;

  // Validation state
  errors: ValidationError[];
  setErrors: (errors: ValidationError[]) => void;
  isValidationPanelVisible: boolean;
  setValidationPanelVisible: (visible: boolean) => void;

  // Hierarchy navigation
  hierarchyState: {
    currentPath: string[]; // Navigation breadcrumb
    currentParentId: string | null; // Current parent being viewed
    navigationHistory: string[][]; // History for back navigation
    visibleNodes: Set<string>; // Currently visible node IDs
  };

  // Hierarchy actions
  navigateIntoState: (stateId: string) => void;
  navigateUp: () => void;
  navigateToRoot: () => void;
  setVisibleNodes: (nodes: Set<string>) => void;
}
```

#### Implementation

```typescript
import { create } from 'zustand';

export const useEditorStore = create<EditorStore>((set, get) => ({
  // Initial state
  content: '',
  fileInfo: null,
  isDirty: false,
  errors: [],
  isValidationPanelVisible: false,
  hierarchyState: {
    currentPath: [],
    currentParentId: null,
    navigationHistory: [],
    visibleNodes: new Set(),
  },

  // Actions
  setContent: (content: string) => {
    const current = get().content;
    set({
      content,
      isDirty: content !== get().fileInfo?.content,
    });
  },

  navigateIntoState: (stateId: string) => {
    const currentState = get().hierarchyState;
    set({
      hierarchyState: {
        ...currentState,
        currentPath: [...currentState.currentPath, stateId],
        currentParentId: stateId,
        navigationHistory: [
          ...currentState.navigationHistory,
          currentState.currentPath,
        ],
      },
    });
  },

  navigateUp: () => {
    const currentState = get().hierarchyState;
    if (currentState.currentPath.length === 0) return;

    const newPath = currentState.currentPath.slice(0, -1);
    set({
      hierarchyState: {
        ...currentState,
        currentPath: newPath,
        currentParentId:
          newPath.length > 0 ? newPath[newPath.length - 1] : null,
      },
    });
  },

  // ... other actions
}));
```

#### Usage in Components

```typescript
import { useEditorStore } from '@/stores/editor-store';

function MyComponent() {
  // Select only needed state (automatic re-render on change)
  const content = useEditorStore((state) => state.content);
  const setContent = useEditorStore((state) => state.setContent);

  // Or destructure multiple
  const { errors, setErrors, isDirty } = useEditorStore();

  return (
    <div>
      {isDirty && <span>Unsaved changes</span>}
      <button onClick={() => setContent('new content')}>Update</button>
    </div>
  );
}
```

---

## History & Undo/Redo System

The history system supports **intelligent undo/redo** with debouncing for different action types.

### History Manager

**Location:** `src/lib/history/history-manager.ts` (361 lines)

#### Architecture

```typescript
class HistoryManager {
  private static instance: HistoryManager;

  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxSize = 50;

  // Debounce timers
  private textEditTimer: NodeJS.Timeout | null = null;
  private positionUpdateTimer: NodeJS.Timeout | null = null;
  private resizeTimer: NodeJS.Timeout | null = null;

  // Pending operations
  private pendingTextEdit: string | null = null;
  private pendingPositionUpdate: string | null = null;
  private pendingResize: string | null = null;

  private constructor() {}

  static getInstance(): HistoryManager {
    if (!HistoryManager.instance) {
      HistoryManager.instance = new HistoryManager();
    }
    return HistoryManager.instance;
  }
}
```

#### History Entry Schema

**Location:** `src/types/history/index.ts`

```typescript
interface HistoryEntry {
  id: string; // UUID
  timestamp: number; // Unix timestamp
  actionType: ActionType; // Type of change
  description: string; // Human-readable
  content: string; // Full SCXML snapshot
  metadata?: HistoryMetadata; // Additional context
}

type ActionType =
  | 'text-edit' // Manual text editing
  | 'node-add' // Node creation
  | 'node-delete' // Node deletion
  | 'node-move' // Node position change
  | 'node-resize' // Node dimension change
  | 'node-update' // Node property change
  | 'edge-add' // Edge creation
  | 'edge-delete' // Edge deletion
  | 'edge-update' // Edge property change
  | 'bulk-change' // Multiple operations
  | 'file-load'; // Initial file load

interface HistoryMetadata {
  cursorPosition?: { line: number; column: number };
  viewport?: { x: number; y: number; zoom: number };
  selectedNodes?: string[];
}
```

#### Debouncing Strategy

```typescript
/**
 * Track text edits with 500ms debounce
 * Lines 47-92
 */
trackTextEdit(content: string): void {
  // Clear existing timer
  if (this.textEditTimer) {
    clearTimeout(this.textEditTimer);
  }

  // Store pending edit
  this.pendingTextEdit = content;

  // Set new timer
  this.textEditTimer = setTimeout(() => {
    if (this.pendingTextEdit) {
      this.pushToHistory({
        id: uuid(),
        timestamp: Date.now(),
        actionType: 'text-edit',
        description: 'Text edit',
        content: this.pendingTextEdit
      });

      this.pendingTextEdit = null;
    }
  }, 500);  // 500ms debounce
}

/**
 * Track diagram changes with variable debouncing
 * Lines 97-133
 */
trackDiagramChange(
  content: string,
  description?: string,
  changeType?: 'position' | 'structure' | 'property' | 'resize'
): void {
  if (changeType === 'position') {
    // Debounce position changes (300ms)
    this.trackPositionUpdate(content, description);
  } else if (changeType === 'resize') {
    // Debounce resize changes (300ms)
    this.trackResize(content, description);
  } else {
    // Immediate for structure changes
    this.pushToHistory({
      id: uuid(),
      timestamp: Date.now(),
      actionType: this.inferActionType(changeType),
      description: description || 'Diagram change',
      content
    });
  }
}
```

#### Undo/Redo Implementation

```typescript
/**
 * Undo the last action
 * Lines 265-302
 */
undo(): { content: string; actionType: ActionType } | null {
  // Flush any pending debounced changes first
  this.flushPendingChanges();

  if (this.undoStack.length === 0) {
    return null;
  }

  // Pop from undo stack
  const entry = this.undoStack.pop()!;

  // Push to redo stack
  this.redoStack.push(entry);

  // Enforce max size
  if (this.redoStack.length > this.maxSize) {
    this.redoStack.shift();
  }

  // Get previous entry (new current state)
  const previousEntry = this.undoStack[this.undoStack.length - 1];

  if (!previousEntry) {
    return null;
  }

  return {
    content: previousEntry.content,
    actionType: previousEntry.actionType
  };
}

/**
 * Redo the last undone action
 * Lines 307-342
 */
redo(): { content: string; actionType: ActionType } | null {
  if (this.redoStack.length === 0) {
    return null;
  }

  // Pop from redo stack
  const entry = this.redoStack.pop()!;

  // Push back to undo stack
  this.undoStack.push(entry);

  return {
    content: entry.content,
    actionType: entry.actionType
  };
}
```

#### Helper Methods

```typescript
/**
 * Flush all pending debounced changes
 */
private flushPendingChanges(): void {
  if (this.textEditTimer) {
    clearTimeout(this.textEditTimer);
    if (this.pendingTextEdit) {
      this.pushToHistory(/* ... */);
    }
  }

  if (this.positionUpdateTimer) {
    clearTimeout(this.positionUpdateTimer);
    if (this.pendingPositionUpdate) {
      this.pushToHistory(/* ... */);
    }
  }

  // ... same for resize
}

/**
 * Push entry to undo stack
 */
private pushToHistory(entry: HistoryEntry): void {
  this.undoStack.push(entry);

  // Enforce max size
  if (this.undoStack.length > this.maxSize) {
    this.undoStack.shift();
  }

  // Clear redo stack (new branch)
  this.redoStack = [];
}
```

---

## Monaco Editor Integration

Monaco Editor (VS Code's editor) is integrated with SCXML-specific features.

### Language Definition

**Location:** `src/lib/monaco/scxml-language.ts`

```typescript
import * as monaco from 'monaco-editor';

export function registerSCXMLLanguage() {
  // Register SCXML as XML variant
  monaco.languages.register({ id: 'scxml' });

  // Set language configuration
  monaco.languages.setLanguageConfiguration('scxml', {
    comments: {
      blockComment: ['<!--', '-->'],
    },
    brackets: [
      ['<', '>'],
      ['{', '}'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    folding: {
      markers: {
        start: new RegExp('^\\s*<!--\\s*#region\\b.*-->'),
        end: new RegExp('^\\s*<!--\\s*#endregion\\b.*-->'),
      },
    },
  });

  // Set token provider (syntax highlighting)
  monaco.languages.setMonarchTokensProvider('scxml', {
    tokenizer: {
      root: [
        [/<\?xml.*\?>/, 'metatag'],
        [/<!--/, 'comment', '@comment'],
        [/<\/?scxml\b/, 'tag'],
        [/<\/?state\b/, 'tag'],
        [/<\/?transition\b/, 'tag'],
        [/<\/?parallel\b/, 'tag'],
        // ... more SCXML elements
        [/\bid\s*=/, 'attribute.name'],
        [/\btarget\s*=/, 'attribute.name'],
        [/\bevent\s*=/, 'attribute.name'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
      ],
      comment: [
        [/[^<-]+/, 'comment'],
        [/-->/, 'comment', '@pop'],
        [/<!--/, 'comment'],
      ],
    },
  });
}
```

### Autocomplete Provider

**Location:** `src/lib/monaco/enhanced-scxml-completion.ts`

```typescript
export function registerSCXMLCompletion(
  monaco: Monaco,
  getStateIds: () => string[]
) {
  monaco.languages.registerCompletionItemProvider('xml', {
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const suggestions: monaco.languages.CompletionItem[] = [];

      // Suggest SCXML elements
      if (textUntilPosition.match(/<$/)) {
        suggestions.push(
          {
            label: 'state',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'state id="$1">\n\t$0\n</state>',
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'SCXML state element',
          },
          {
            label: 'transition',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'transition event="$1" target="$2"/>',
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'SCXML transition element',
          }
          // ... more element suggestions
        );
      }

      // Suggest state IDs for target attribute
      if (textUntilPosition.match(/target="$/)) {
        const stateIds = getStateIds();
        stateIds.forEach((id) => {
          suggestions.push({
            label: id,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: id,
            documentation: `Transition to state: ${id}`,
          });
        });
      }

      return { suggestions };
    },
  });
}
```

### Editor Configuration

**Location:** `src/components/editor/xml-editor.tsx`

```typescript
const editorOptions: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: true },
  lineNumbers: 'on',
  roundedSelection: false,
  scrollBeyondLastLine: false,
  readOnly: false,
  fontSize: 14,
  automaticLayout: true,
  folding: true,
  foldingStrategy: 'indentation',
  showFoldingControls: 'always',
  wordWrap: 'on',
  theme: 'vs',
  tabSize: 2,
  insertSpaces: true,
};
```

---

## ReactFlow Integration

ReactFlow provides the visual diagram canvas.

### Custom Node Types

#### SCXML State Node

**Location:** `src/components/diagram/nodes/scxml-state-node.tsx`

```typescript
interface SCXMLStateNodeData {
  label: string;
  stateType: 'simple' | 'compound' | 'parallel' | 'final' | 'history';
  isInitial: boolean;
  hasChildren: boolean;
  onentry?: string[];
  onexit?: string[];
  color?: string;
}

const SCXMLStateNode = ({ data, selected }: NodeProps<SCXMLStateNodeData>) => {
  const borderStyle = data.hasChildren ? 'dashed' : 'solid';
  const bgColor = data.color || '#E3F2FD';

  return (
    <div
      className={`scxml-state-node ${selected ? 'selected' : ''}`}
      style={{
        border: `2px ${borderStyle} #2196F3`,
        backgroundColor: bgColor,
        borderRadius: '8px',
        padding: '12px',
        minWidth: '150px',
        minHeight: '80px',
      }}
    >
      {/* Initial state indicator */}
      {data.isInitial && <div className='initial-badge'>Initial</div>}

      {/* State label */}
      <div className='state-label'>{data.label}</div>

      {/* Entry/exit actions */}
      {data.onentry && data.onentry.length > 0 && (
        <div className='actions'>
          <strong>entry:</strong> {data.onentry.join(', ')}
        </div>
      )}

      {/* Compound state indicator */}
      {data.hasChildren && (
        <div className='children-indicator'>⬇ Contains child states</div>
      )}

      {/* Connection handles */}
      <Handle
        type='target'
        position={Position.Top}
        style={{ background: '#555' }}
      />
      <Handle
        type='source'
        position={Position.Bottom}
        style={{ background: '#555' }}
      />
    </div>
  );
};

export default memo(SCXMLStateNode);
```

### Custom Edge Types

#### SCXML Transition Edge

**Location:** `src/components/diagram/edges/scxml-transition-edge.tsx`

```typescript
interface SCXMLTransitionEdgeData {
  event?: string;
  cond?: string;
  target: string;
  actions?: string[];
}

const SCXMLTransitionEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<SCXMLTransitionEdgeData>) => {
  // Use smart edge for automatic routing
  const { edgePath, labelX, labelY } = getSmartEdge({
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <>
      {/* Edge path */}
      <path
        id={id}
        className='react-flow__edge-path'
        d={edgePath}
        strokeWidth={2}
        stroke={selected ? '#2196F3' : '#757575'}
        fill='none'
        markerEnd='url(#arrow)'
      />

      {/* Edge label */}
      {data?.event && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '12px',
            }}
          >
            <strong>{data.event}</strong>
            {data.cond && (
              <div style={{ fontSize: '10px', color: '#666' }}>
                [{data.cond}]
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default memo(SCXMLTransitionEdge);
```

### Visual Diagram Component

**Location:** `src/components/diagram/visual-diagram.tsx` (2425 lines)

```typescript
const VisualDiagram = ({
  scxmlContent,
  onSCXMLChange,
  isUpdatingFromHistory,
}: VisualDiagramProps) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Register custom node/edge types
  const nodeTypes = useMemo(
    () => ({
      scxmlState: SCXMLStateNode,
      historyWrapper: HistoryWrapperNode,
    }),
    []
  );

  const edgeTypes = useMemo(
    () => ({
      scxmlTransition: SCXMLTransitionEdge,
    }),
    []
  );

  // Parse SCXML and convert to ReactFlow format
  useEffect(() => {
    const parser = new SCXMLParser();
    const result = parser.parse(scxmlContent);

    if (result.success && result.data) {
      const converter = new SCXMLToXStateConverter();
      const { nodes, edges } = converter.convertToReactFlow(result.data);

      setNodes(nodes);
      setEdges(edges);
    }
  }, [scxmlContent]);

  // Handle node changes (drag, select, etc.)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply changes to nodes
      setNodes((nds) => applyNodeChanges(changes, nds));

      // Execute commands for position changes
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && !change.dragging) {
          const command = new UpdatePositionCommand(/* ... */);
          const result = command.execute(scxmlContent);

          if (result.success) {
            onSCXMLChange(result.content, 'position');
          }
        }
      });
    },
    [scxmlContent, onSCXMLChange]
  );

  // Handle edge changes
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      attributionPosition='bottom-right'
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
};
```

---

## Extending the Editor

### Adding a New Command

**Example: Add Command to Change State Color**

1. **Create command file:** `src/lib/commands/change-state-color-command.ts`

```typescript
import { BaseCommand, CommandResult } from './base-command';

export class ChangeStateColorCommand extends BaseCommand {
  constructor(
    private stateId: string,
    private oldColor: string,
    private newColor: string
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc || error) {
      return { success: false, error };
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return {
        success: false,
        error: `State ${this.stateId} not found`,
      };
    }

    // Ensure viz namespace
    this.ensureVizNamespace(doc);

    // Set color attribute
    stateElement.setAttribute('viz:rgb', this.newColor);

    return {
      success: true,
      content: this.serializeXML(doc),
    };
  }

  undo(scxmlContent: string): CommandResult {
    // Same logic but with oldColor
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc || error) {
      return { success: false, error };
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return { success: false, error: `State ${this.stateId} not found` };
    }

    stateElement.setAttribute('viz:rgb', this.oldColor);

    return {
      success: true,
      content: this.serializeXML(doc),
    };
  }

  getDescription(): string {
    return `Change color of state "${this.stateId}" to ${this.newColor}`;
  }
}
```

2. **Export from index:** `src/lib/commands/index.ts`

```typescript
export { ChangeStateColorCommand } from './change-state-color-command';
```

3. **Use in component:** Add color picker to node

```typescript
// In SCXMLStateNode component
const handleColorChange = (newColor: string) => {
  const command = new ChangeStateColorCommand(
    data.id,
    data.color || '#E3F2FD',
    newColor
  );

  const result = command.execute(scxmlContent);
  if (result.success) {
    onSCXMLChange(result.content, 'property');
  }
};
```

### Adding a New Validation Rule

**Example: Warn About States with No Transitions**

**Edit:** `src/lib/validators/scxml-validator.ts`

```typescript
validate(scxml: SCXMLElement, xmlContent: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Existing validations...

  // New validation: Check for states with no outgoing transitions
  const statesWithNoTransitions = this.findStatesWithoutTransitions(scxml);

  statesWithNoTransitions.forEach(stateId => {
    const isFinalState = this.isFinalState(scxml, stateId);

    if (!isFinalState) {
      errors.push({
        message: `State "${stateId}" has no outgoing transitions. Consider adding transitions or marking as final state.`,
        severity: 'warning',
        line: this.getLineNumber(xmlContent, stateId)
      });
    }
  });

  return errors;
}

private findStatesWithoutTransitions(scxml: SCXMLElement): string[] {
  const allStates = this.getAllStateIds(scxml);
  const statesWithTransitions = new Set<string>();

  this.traverseTransitions(scxml, (transition) => {
    const source = this.findTransitionSource(transition);
    if (source) {
      statesWithTransitions.add(source);
    }
  });

  return allStates.filter(id => !statesWithTransitions.has(id));
}
```

### Adding Monaco Autocomplete Suggestions

**Edit:** `src/lib/monaco/enhanced-scxml-completion.ts`

```typescript
// Add custom action type suggestions
if (textUntilPosition.match(/<(onentry|onexit)[^>]*$/)) {
  const actionTypes = ['log', 'assign', 'raise', 'send', 'script', 'if'];

  actionTypes.forEach((actionType) => {
    suggestions.push({
      label: actionType,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: `${actionType} $0/>`,
      insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: `SCXML ${actionType} action`,
    });
  });
}
```

---

## Performance Optimization

### Optimization Strategies

1. **Memoization**

```typescript
// Use React.memo for expensive components
export default memo(SCXMLStateNode, (prevProps, nextProps) => {
  return (
    prevProps.data === nextProps.data &&
    prevProps.selected === nextProps.selected
  );
});

// Use useMemo for expensive computations
const filteredNodes = useMemo(() => {
  return nodes.filter((node) => node.parentId === currentParentId);
}, [nodes, currentParentId]);
```

2. **Debouncing**

```typescript
// Debounce validation
useEffect(() => {
  const timer = setTimeout(() => {
    validateContent(content);
  }, 500); // Wait 500ms after user stops typing

  return () => clearTimeout(timer);
}, [content]);
```

3. **Virtualization**

```typescript
// For large error lists, use virtual scrolling
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={400}
  itemCount={errors.length}
  itemSize={40}
  width='100%'
>
  {({ index, style }) => (
    <div style={style}>
      <ErrorItem error={errors[index]} />
    </div>
  )}
</FixedSizeList>;
```

4. **Lazy Loading**

```typescript
// Lazy load Monaco Editor
const XMLEditor = lazy(() => import('@/components/editor/xml-editor'));

<Suspense fallback={<div>Loading editor...</div>}>
  <XMLEditor value={content} onChange={handleChange} />
</Suspense>;
```

5. **Selective Re-rendering**

```typescript
// Use zustand selectors to prevent unnecessary re-renders
const content = useEditorStore((state) => state.content); // Only re-render when content changes
const setContent = useEditorStore((state) => state.setContent); // This never changes
```

---

## Debugging Guide

### Enable Debug Logging

1. **Uncomment console.logs in key files:**

```typescript
// In visual-diagram.tsx
console.log('Nodes changed:', changes);
console.log('Current SCXML:', scxmlContent);

// In history-manager.ts
console.log('Pushing to history:', entry);
console.log('Undo stack size:', this.undoStack.length);

// In commands
console.log('Executing command:', this.getDescription());
console.log('Result:', result);
```

2. **Add custom logging utility:**

```typescript
// src/lib/utils/debug.ts
const DEBUG = process.env.NODE_ENV === 'development';

export const debug = {
  log: (...args: any[]) => {
    if (DEBUG) console.log('[DEBUG]', ...args);
  },
  error: (...args: any[]) => {
    if (DEBUG) console.error('[ERROR]', ...args);
  },
  time: (label: string) => {
    if (DEBUG) console.time(label);
  },
  timeEnd: (label: string) => {
    if (DEBUG) console.timeEnd(label);
  },
};
```

### React DevTools

1. **Install React DevTools browser extension**
2. **Inspect component tree**
3. **View props and state**
4. **Profile performance**

### Zustand DevTools

```typescript
import { devtools } from 'zustand/middleware';

export const useEditorStore = create<EditorStore>()(
  devtools(
    (set, get) => ({
      // ... store implementation
    }),
    { name: 'EditorStore' }
  )
);
```

### Debugging Commands

```typescript
// Add debugging to command execution
execute(scxmlContent: string): CommandResult {
  console.log('Before:', scxmlContent);

  const result = /* ... execute logic ... */;

  console.log('After:', result.content);
  console.log('Success:', result.success);

  return result;
}
```

### Common Issues & Solutions

| Issue                           | Cause                         | Solution                                                           |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Changes don't sync              | `isUpdatingFromHistory` stuck | Check timeout in undo/redo handlers (line 161-164 in page.tsx)     |
| Undo doesn't work               | History not initialized       | Ensure `historyManager.initialize()` called on file load (line 87) |
| Nodes overlap                   | ELK layout suboptimal         | Adjust ELK spacing options or manually position                    |
| Validation wrong line numbers   | Parser line calculation off   | Check `getLineNumber()` in validator (lines 2010-2044)             |
| Monaco autocomplete not working | Provider not registered       | Check registration in xml-editor.tsx mount handler                 |

---

## API Reference

### SCXMLParser API

```typescript
class SCXMLParser {
  parse(xmlContent: string): ParseResult<SCXMLDocument>;
}

interface ParseResult<T> {
  success: boolean;
  data?: T;
  errors: ValidationError[];
}

interface SCXMLDocument {
  scxml: SCXMLElement;
  states: StateElement[];
  transitions: TransitionElement[];
  hasVisualMetadata: boolean;
}
```

### SCXMLValidator API

```typescript
class SCXMLValidator {
  validate(scxml: SCXMLElement, xmlContent: string): ValidationError[];
}

interface ValidationError {
  message: string;
  severity: 'error' | 'warning';
  line?: number;
  column?: number;
  code?: string;
}
```

### VisualMetadataManager API

```typescript
class VisualMetadataManager {
  static extractAllVisualMetadata(scxmlContent: string): AllVisualMetadata;
  static applyVisualMetadata(
    scxmlContent: string,
    metadata: AllVisualMetadata
  ): string;
  static stripVisualMetadata(scxmlContent: string): string;
  static validateMetadata(metadata: AllVisualMetadata): ValidationResult;
  static updateNodePosition(
    scxmlContent: string,
    nodeId: string,
    x: number,
    y: number
  ): string;
  static updateNodeDimensions(
    scxmlContent: string,
    nodeId: string,
    width: number,
    height: number
  ): string;
  static updateEdgeWaypoints(
    scxmlContent: string,
    edgeId: string,
    waypoints: Point[]
  ): string;
}
```

### HistoryManager API

```typescript
class HistoryManager {
  static getInstance(): HistoryManager;

  initialize(content: string, description: string): void;
  trackTextEdit(content: string): void;
  trackDiagramChange(
    content: string,
    description?: string,
    changeType?: ChangeType
  ): void;

  canUndo(): boolean;
  canRedo(): boolean;
  undo(): { content: string; actionType: ActionType } | null;
  redo(): { content: string; actionType: ActionType } | null;

  clear(): void;
  getUndoStack(): HistoryEntry[];
  getRedoStack(): HistoryEntry[];
}
```

### ELKLayoutService API

```typescript
class ELKLayoutService {
  async layout(
    nodes: Node[],
    edges: Edge[],
    options?: Partial<ELKLayoutOptions>
  ): Promise<{ nodes: Node[]; edges: Edge[] }>;
}

interface ELKLayoutOptions {
  algorithm: 'layered' | 'force' | 'stress' | 'mrtree' | 'radial';
  direction: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
  spacing: {
    nodeSpacing: number;
    edgeSpacing: number;
    componentSpacing: number;
  };
  padding: { top: number; right: number; bottom: number; left: number };
  hierarchical: boolean;
  edgeRouting: 'SPLINES' | 'POLYLINE' | 'ORTHOGONAL';
}
```

### EditorStore API

```typescript
interface EditorStore {
  // State
  content: string;
  fileInfo: FileInfo | null;
  isDirty: boolean;
  errors: ValidationError[];
  isValidationPanelVisible: boolean;
  hierarchyState: HierarchyState;

  // Actions
  setContent(content: string): void;
  setFileInfo(info: FileInfo | null): void;
  markDirty(): void;
  markClean(): void;
  setErrors(errors: ValidationError[]): void;
  setValidationPanelVisible(visible: boolean): void;
  navigateIntoState(stateId: string): void;
  navigateUp(): void;
  navigateToRoot(): void;
}
```

---

## Resources

### Official Documentation

- [SCXML Specification (W3C)](https://www.w3.org/TR/scxml/)
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [ReactFlow Documentation](https://reactflow.dev/learn)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [ELK Documentation](https://eclipse.dev/elk/)

### Tools & Libraries

- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)
- [XState](https://xstate.js.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript](https://www.typescriptlang.org/)

### Development Tools

- [React DevTools](https://react.dev/learn/react-developer-tools)
- [TypeScript Playground](https://www.typescriptlang.org/play)
- [RegEx101](https://regex101.com/) - For XML parsing patterns

---

## Contributing

### Code Standards

- **TypeScript:** Use strict mode, explicit types
- **Components:** Functional components with hooks
- **Naming:** camelCase for variables, PascalCase for components
- **Comments:** Document complex logic, algorithms
- **Exports:** Use barrel exports (index.ts files)

### Testing Checklist

Before submitting changes:

- [ ] Code compiles without TypeScript errors
- [ ] File upload/download works
- [ ] Two-way sync (code ↔ visual) works
- [ ] Undo/redo works in both modes
- [ ] Multi-selection and batch operations work
- [ ] Hierarchy navigation works
- [ ] Validation shows correct errors
- [ ] Visual metadata preserved on export
- [ ] No console errors in production build

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes
# ... code, code, code ...

# Test thoroughly
npm run dev
# Manual testing...

# Commit
git add .
git commit -m "feat: add state color picker"

# Push
git push origin feature/my-feature

# Create Pull Request on GitHub
```

---

**Questions?** Check the [main README](README.md), review code comments, or open an issue on GitHub.

**Happy developing! 🚀**
