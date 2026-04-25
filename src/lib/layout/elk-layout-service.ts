import ELK, { type ElkNode, type ElkExtendedEdge, type LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from 'reactflow';
import type { HierarchicalNode } from '@/types/hierarchical-node';

export type ELKAlgorithm = 'layered' | 'force' | 'stress' | 'mrtree' | 'radial';
export type ELKDirection = 'DOWN' | 'UP' | 'RIGHT' | 'LEFT';
export type ELKEdgeRouting = 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES' | 'UNDEFINED';

export interface ELKLayoutOptions {
  algorithm?: ELKAlgorithm;
  direction?: ELKDirection;
  edgeRouting?: ELKEdgeRouting;
  spacing?: {
    nodeNode?: number;
    edgeNode?: number;
    edgeEdge?: number;
  };
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  hierarchical?: boolean;
  separateConnectedComponents?: boolean;
  aspectRatio?: number;
}

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Service for computing graph layouts using ELK (Eclipse Layout Kernel)
 * Provides professional graph layout algorithms optimized for hierarchical structures
 */
export class ELKLayoutService {
  private elk: InstanceType<typeof ELK>;

  constructor() {
    this.elk = new ELK();
  }

  /**
   * Compute layout for a set of nodes and edges using ELK
   */
  async computeLayout(
    nodes: HierarchicalNode[],
    edges: Edge[],
    options: ELKLayoutOptions = {}
  ): Promise<Map<string, PositionedNode>> {
    const {
      algorithm = 'layered',
      direction = 'DOWN',
      edgeRouting = 'ORTHOGONAL',
      spacing = {},
      padding = {},
      hierarchical = true,
      separateConnectedComponents = true,
      aspectRatio,
    } = options;

    // Convert to ELK graph format
    const elkGraph = this.convertToELKGraph(nodes, edges, {
      algorithm,
      direction,
      edgeRouting,
      spacing,
      padding,
      hierarchical,
      separateConnectedComponents,
      aspectRatio,
    });

    // Run ELK layout
    const layoutedGraph = await this.elk.layout(elkGraph);

    // Extract positions from layouted graph
    return this.extractPositions(layoutedGraph, nodes);
  }

  /**
   * Convert ReactFlow nodes and edges to ELK graph format
   */
  private convertToELKGraph(
    nodes: HierarchicalNode[],
    edges: Edge[],
    options: Omit<Required<ELKLayoutOptions>, 'aspectRatio'> & { aspectRatio?: number }
  ): ElkNode {
    const {
      algorithm,
      direction,
      edgeRouting,
      spacing,
      padding,
      hierarchical,
      separateConnectedComponents,
      aspectRatio,
    } = options;

    // Build layout options for ELK
    const layoutOptions: LayoutOptions = {
      'elk.algorithm': algorithm,
      'elk.direction': direction,
      'elk.edgeRouting': edgeRouting,
      'elk.spacing.nodeNode': String(spacing.nodeNode ?? 80),
      'elk.spacing.edgeNode': String(spacing.edgeNode ?? 40),
      'elk.spacing.edgeEdge': String(spacing.edgeEdge ?? 20),
      'elk.padding': `[top=${padding.top ?? 50},left=${padding.left ?? 50},bottom=${padding.bottom ?? 50},right=${padding.right ?? 50}]`,
      'elk.separateConnectedComponents': String(separateConnectedComponents),
      ...(aspectRatio && { 'elk.aspectRatio': String(aspectRatio) }),
    };

    // Additional layered algorithm options for better hierarchical layout
    if (algorithm === 'layered') {
      Object.assign(layoutOptions, {
        'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing.nodeNode ?? 80),
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.cycleBreaking.strategy': 'GREEDY',
        'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      });
    }

    // Build node hierarchy
    if (hierarchical) {
      return this.buildHierarchicalGraph(nodes, edges, layoutOptions);
    } else {
      return this.buildFlatGraph(nodes, edges, layoutOptions);
    }
  }

  /**
   * Build hierarchical ELK graph (respects parent-child relationships)
   */
  private buildHierarchicalGraph(
    nodes: HierarchicalNode[],
    edges: Edge[],
    layoutOptions: LayoutOptions
  ): ElkNode {
    const nodeMap = new Map<string, HierarchicalNode>(
      nodes.map((n) => [n.id, n])
    );

    // Find root nodes (nodes without parents)
    const rootNodes = nodes.filter((n) => !n.parentId);

    // Recursive function to build ELK node with children
    const buildElkNode = (node: HierarchicalNode): ElkNode => {
      const childNodes = nodes.filter((n) => n.parentId === node.id);
      const hasChildren = childNodes.length > 0;

      const width = node.style?.width || node.data?.width || 160;
      const height = node.style?.height || node.data?.height || 80;

      const elkNode: ElkNode = {
        id: node.id,
        width: typeof width === 'number' ? width : 160,
        height: typeof height === 'number' ? height : 80,
        ...(hasChildren && {
          children: childNodes.map(buildElkNode),
          layoutOptions: {
            ...layoutOptions,
            'elk.padding': '[top=80,left=30,bottom=30,right=30]',
          },
        }),
      };

      return elkNode;
    };

    // Build edges - only include edges where both source and target exist
    const elkEdges: ElkExtendedEdge[] = edges
      .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      }));

    // Create root container
    const rootContainer: ElkNode = {
      id: 'root',
      layoutOptions,
      children: rootNodes.map(buildElkNode),
      edges: elkEdges,
    };

    return rootContainer;
  }

  /**
   * Build flat ELK graph (ignores parent-child relationships)
   */
  private buildFlatGraph(
    nodes: HierarchicalNode[],
    edges: Edge[],
    layoutOptions: LayoutOptions
  ): ElkNode {
    const elkNodes: ElkNode[] = nodes.map((node) => {
      const width = node.style?.width || node.data?.width || 160;
      const height = node.style?.height || node.data?.height || 80;

      return {
        id: node.id,
        width: typeof width === 'number' ? width : 160,
        height: typeof height === 'number' ? height : 80,
      };
    });

    const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    }));

    return {
      id: 'root',
      layoutOptions,
      children: elkNodes,
      edges: elkEdges,
    };
  }

  /**
   * Extract positions from layouted ELK graph
   */
  private extractPositions(
    elkGraph: ElkNode,
    originalNodes: HierarchicalNode[]
  ): Map<string, PositionedNode> {
    const positions = new Map<string, PositionedNode>();

    // Recursive function to extract positions from nested nodes
    const extractNodePositions = (elkNode: ElkNode, parentX = 0, parentY = 0) => {
      if (elkNode.children) {
        for (const child of elkNode.children) {
          const absoluteX = (child.x ?? 0) + parentX;
          const absoluteY = (child.y ?? 0) + parentY;

          positions.set(child.id, {
            id: child.id,
            x: absoluteX,
            y: absoluteY,
            width: child.width ?? 160,
            height: child.height ?? 80,
          });

          // Recursively extract positions from children
          if (child.children && child.children.length > 0) {
            extractNodePositions(child, absoluteX, absoluteY);
          }
        }
      }
    };

    extractNodePositions(elkGraph);

    return positions;
  }

  /**
   * Compute layout for a simple list of nodes (no hierarchy)
   */
  async computeSimpleLayout(
    nodes: { id: string; width?: number; height?: number }[],
    edges: { source: string; target: string }[],
    options: ELKLayoutOptions = {}
  ): Promise<Map<string, PositionedNode>> {
    // Convert simple nodes to HierarchicalNode format
    const hierarchicalNodes: HierarchicalNode[] = nodes.map((node) => ({
      id: node.id,
      type: 'scxmlState',
      position: { x: 0, y: 0 },
      data: {
        label: node.id,
        stateType: 'simple' as const,
        width: node.width,
        height: node.height,
      },
      depth: 0,
    }));

    // Convert simple edges to ReactFlow Edge format
    const reactFlowEdges: Edge[] = edges.map((edge, index) => ({
      id: `edge-${index}`,
      source: edge.source,
      target: edge.target,
    }));

    return this.computeLayout(hierarchicalNodes, reactFlowEdges, {
      ...options,
      hierarchical: false,
    });
  }
}

// Export singleton instance
export const elkLayoutService = new ELKLayoutService();
