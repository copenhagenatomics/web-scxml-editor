import type { Node, Edge } from 'reactflow';
import type { SCXMLStateNodeData } from '@/components/diagram/nodes/scxml-state-node';

/**
 * @deprecated - Legacy type for nested rendering (not used with hierarchy navigation)
 */
export interface ContainerMetadata {
  childLayout: 'auto' | 'grid' | 'manual';
  padding: number;
  minSize: { width: number; height: number };
  isCollapsible: boolean;
  isExpanded: boolean;
}

/**
 * @deprecated - Legacy type for CompoundStateNode (removed - use SCXMLStateNode with data.stateType instead)
 */
export interface CompoundStateNodeData extends SCXMLStateNodeData {
  children: string[]; // Child state IDs
  containerMetadata: ContainerMetadata;
  childPositions?: Map<string, { x: number; y: number }>;
  descendants?: HierarchicalNode[]; // All descendant nodes for visual rendering (deprecated)
  childCount?: number; // Number of child nodes (for new format)
}

/**
 * @deprecated - Legacy type for parallel state nested rendering (not used)
 */
export interface ParallelStateNodeData extends CompoundStateNodeData {
  parallelRegions: string[][]; // Groups of parallel child state IDs
}

/**
 * Hierarchical node structure with parent-child relationships
 * All nodes use SCXMLStateNode component with type='scxmlState'
 * State classification handled via data.stateType property
 */
export interface HierarchicalNode extends Node {
  data: SCXMLStateNodeData;
  parentId?: string;
  childIds?: string[];
  depth: number;
  containerBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LayoutStrategy {
  type: 'auto' | 'grid' | 'force' | 'manual' | 'elk-layered' | 'elk-force' | 'elk-stress';
  options?: {
    columns?: number;
    spacing?: { x: number; y: number };
    alignment?: 'center' | 'left' | 'right' | 'top' | 'bottom';
    // ELK-specific options
    direction?: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT';
    edgeRouting?: 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES' | 'UNDEFINED';
    hierarchical?: boolean;
  };
}

export interface ChildPosition {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type NodeType = 'simple' | 'compound' | 'parallel' | 'final' | 'history';

export interface HierarchicalLayout {
  nodes: HierarchicalNode[];
  edges: Edge[];
  hierarchy: Map<string, string[]>; // parent -> children mapping
  parentMap: Map<string, string>; // child -> parent mapping
}