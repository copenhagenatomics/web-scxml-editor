import type { SCXMLStateNodeData } from '@/components/diagram';
import { ContainerLayoutManager } from '@/lib/layout/container-layout-manager';
import { nodeDimensionCalculator } from '@/lib/layout/node-dimension-calculator';
import type {
  HierarchicalLayout,
  HierarchicalNode,
} from '@/types/hierarchical-node';
import type { SCXMLDocument } from '@/types/scxml';
import type { Edge, Node } from 'reactflow';

// Import converter modules
import {
  collectAllTransitions,
  extractActionsText,
} from './converter-modules/edge-conversion';
import { toSafeId } from './converter-modules/id-mapping';
import {
  applyDefaultELKLayout,
  isInitialState,
  positionHistoryStates,
} from './converter-modules/layout-positioning';
import {
  getAncestorChain,
  registerAllStates,
  type StateRegistryEntry,
} from './converter-modules/state-registry';
import {
  convertDataModel,
  extractVisualMetadata,
  getAttribute,
  getElements,
  writeLayoutToSCXML,
} from './converter-modules/visual-metadata';

/**
 * Converts SCXML documents to XState v5 machine configurations and React Flow diagram data
 */

export class SCXMLToXStateConverter {
  private stateRegistry: Map<string, StateRegistryEntry> = new Map();
  private hierarchyMap: Map<string, string[]> = new Map(); // parent -> children mapping
  private parentMap: Map<string, string> = new Map(); // child -> parent mapping
  private rootScxml: any = null;
  private claimedStates: Set<string> = new Set(); // Track states already claimed by their parent
  private edgePairCounts: Map<string, number> = new Map(); // Track edge pairs for handle assignment

  // Map original IDs to safe IDs (without dots) and vice versa
  private idToSafeId: Map<string, string> = new Map();
  private safeIdToId: Map<string, string> = new Map();

  // Store original SCXML content for write-back
  private originalScxmlContent: string = '';

  // Store initialized SCXML content (with viz:xywh added)
  private initializedSCXML: string | null = null;

  /**
   * Wrapper method for toSafeId - delegates to module function
   */
  private toSafeId(id: string | null | undefined): string | null | undefined {
    return toSafeId(id, this.idToSafeId, this.safeIdToId);
  }

  /**
   * Wrapper method for getAttribute - delegates to module function
   */
  private getAttribute(element: any, attrName: string): string | undefined {
    return getAttribute(element, attrName);
  }

  /**
   * Wrapper method for getElements - delegates to module function
   */
  private getElements(parent: any, elementName: string): any {
    return getElements(parent, elementName);
  }

  /**
   * Convert SCXML document to React Flow nodes and edges with ELK force-directed layout
   * @async This method is async because it uses ELK layout computation
   */
  async convertToReactFlow(
    scxmlDoc: SCXMLDocument,
    originalXmlContent?: string
  ): Promise<{
    nodes: Node[];
    edges: Edge[];
    initializedSCXML?: string | null;
  }> {
    const scxml = scxmlDoc.scxml;
    this.rootScxml = scxml;

    // Store original content for potential write-back
    if (originalXmlContent) {
      this.originalScxmlContent = originalXmlContent;
    }

    // Reset initialized SCXML
    this.initializedSCXML = null;

    // Parse datamodel to get context
    const dataModel = this.getElements(scxml, 'datamodel');
    if (dataModel) {
      convertDataModel(dataModel, getElements, getAttribute);
    }

    // First, ensure state registry is populated
    if (this.stateRegistry.size === 0) {
      this.stateRegistry.clear();
      this.hierarchyMap.clear();
      this.parentMap.clear();
      this.claimedStates.clear();
      this.idToSafeId.clear();
      this.safeIdToId.clear();
      registerAllStates(
        scxml,
        '',
        this.stateRegistry,
        this.hierarchyMap,
        this.parentMap,
        this.claimedStates,
        getAttribute,
        getElements
      );
    }

    const layoutManager = new ContainerLayoutManager();
    const hierarchicalLayout = await this.createHierarchicalLayout(
      layoutManager
    );

    return {
      nodes: hierarchicalLayout.nodes,
      edges: hierarchicalLayout.edges,
      initializedSCXML: this.initializedSCXML,
    };
  }

  /**
   * Create hierarchical layout with ELK force-directed positioning
   * Preserves viz:xywh positions with absolute priority
   */
  private async createHierarchicalLayout(
    layoutManager: ContainerLayoutManager
  ): Promise<HierarchicalLayout> {
    const allNodes: HierarchicalNode[] = [];
    const edges: Edge[] = [];

    // First pass: Create all nodes with basic information
    const stateEntries = Array.from(this.stateRegistry.entries());

    for (const [stateId, stateInfo] of stateEntries) {
      const node = this.createHierarchicalNode(stateId, stateInfo);
      if (node) {
        allNodes.push(node);
      }
    }

    // Filter to only include root-level nodes (nodes without parents) for ReactFlow
    // Also exclude history states from root nodes since they wrap containers
    const rootNodes = allNodes.filter(
      (node) =>
        !node.parentId &&
        this.stateRegistry.get(node.id)?.elementType !== 'history'
    );

    // No longer need to attach descendants - using native parent-child relationships

    // Reset edge pair counts for handle assignment
    this.edgePairCounts.clear();

    // Collect all transitions/edges BEFORE layout
    // ELK needs edges to calculate optimal node positions
    collectAllTransitions(
      this.rootScxml,
      edges,
      this.stateRegistry,
      this.parentMap,
      this.edgePairCounts,
      getAttribute,
      getElements
    );

    // Apply ELK force-directed layout with viz:xywh priority
    await applyDefaultELKLayout(allNodes, edges);

    // Calculate dimensions for nodes without viz:xywh width/height
    // Track whether any nodes needed initialization
    let needsInitialization = false;

    allNodes.forEach((node) => {
      const nodeData = node.data as any;
      const hasVizDimensions =
        nodeData.width !== undefined && nodeData.height !== undefined;

      if (!hasVizDimensions) {
        // Calculate dimensions using the new simple logic
        const dims = nodeDimensionCalculator.calculateDimensionsFromNode(node);

        // Store calculated dimensions
        nodeData.width = dims.width;
        nodeData.height = dims.height;

        // Mark that this node needs initialization
        needsInitialization = true;
      }
    });

    // If any nodes needed initialization, write back to SCXML
    if (needsInitialization && this.originalScxmlContent) {
      this.initializedSCXML = writeLayoutToSCXML(
        allNodes,
        this.originalScxmlContent
      );
    }

    // Update container bounds after layout is complete
    allNodes.forEach((node) => {
      if (
        node.childIds &&
        node.childIds.length > 0 &&
        this.stateRegistry.get(node.id)?.elementType !== 'history'
      ) {
        const nodeData = node.data as any;
        // Use the largest available dimensions
        const finalWidth = Math.max(
          nodeData.width || 0,
          node.containerBounds?.width || 0,
          300 // minimum fallback
        );
        const finalHeight = Math.max(
          nodeData.height || 0,
          node.containerBounds?.height || 0,
          200 // minimum fallback
        );

        node.containerBounds = {
          x: node.position.x,
          y: node.position.y,
          width: finalWidth,
          height: finalHeight,
        };
      }
    });

    // Position history states (but allow them to also participate in sibling layout)
    positionHistoryStates(allNodes, this.stateRegistry);

    // DON'T convert absolute positions to relative positions
    // We're using hierarchy navigation which removes parentId for flat rendering
    // All positions should remain absolute for correct display
    //
    // Convert absolute positions to relative positions for nested nodes
    allNodes.forEach((node) => {
      if (node.parentId) {
        const parent = allNodes.find((p) => p.id === node.parentId);
        if (parent) {
          const hasVizPosition = (node.data as any).hasVizPosition === true;

          // For nodes with viz positions, keep them absolute (don't convert to relative)
          // because hierarchy navigation removes parentId and treats all nodes as root-level
          if (hasVizPosition) {
            // SKIP conversion - keep absolute position
          } else {
            // For auto-laid out nodes, they're already relative - keep as is
          }

          // Add extent to constrain child within parent bounds
          (node as any).extent = 'parent';
          // Make parent expand to fit children automatically
          (node as any).expandParent = true;
        }
      }
    });

    // Include history wrapper nodes that should be rendered at the top level
    const historyWrapperNodes = allNodes.filter(
      (node) =>
        this.stateRegistry.get(node.id)?.elementType === 'history' &&
        (node.data as any).isHistoryWrapper
    );

    // Use all nodes with native parent-child relationships
    const finalNodes = allNodes;

    // All nodes now use scxmlState type
    // State classification is handled via data.stateType property

    // Remove proxy node creation helpers - no longer needed

    // No proxy nodes needed

    // Remove descendant processing - no longer needed

    // Layout processing function removed - no longer needed

    // Layout calculation function removed - no longer needed

    // No longer need to process descendants for proxy nodes

    // Edges now connect directly to the actual nodes

    return {
      nodes: finalNodes, // All nodes with proper parent-child relationships
      edges: edges, // Direct edges without proxy mapping
      hierarchy: this.hierarchyMap,
      parentMap: this.parentMap,
    };
  }

  /**
   * Create a hierarchical node from state registry entry
   */
  private createHierarchicalNode(
    stateId: string,
    stateInfo: StateRegistryEntry
  ): HierarchicalNode | null {
    const state = stateInfo.state;
    const isContainer = stateInfo.isContainer;

    // Extract visual metadata FIRST
    const visualMetadata = extractVisualMetadata(state, getAttribute);

    // Extract actions
    const onentry = this.getElements(state, 'onentry');
    const onexit = this.getElements(state, 'onexit');
    const entryActions = onentry
      ? extractActionsText(onentry, getAttribute, getElements)
      : [];
    const exitActions = onexit
      ? extractActionsText(onexit, getAttribute, getElements)
      : [];

    // Determine node type
    // Most states use 'scxmlState' type, history states use 'scxmlHistory'
    // State classification is handled via data.stateType
    let nodeType: 'scxmlState' | 'scxmlHistory' = 'scxmlState';
    let stateType: SCXMLStateNodeData['stateType'] = 'simple';

    if (stateInfo.elementType === 'parallel') {
      stateType = 'parallel';
    } else if (stateInfo.elementType === 'history') {
      nodeType = 'scxmlHistory'; // Keep history wrapper as special type
      stateType = 'simple';
    } else if (isContainer) {
      stateType = 'compound';
    } else if (state['@_type'] === 'final') {
      stateType = 'final';
    }

    // Check if this is an initial state
    const isInitial = isInitialState(
      stateId,
      stateInfo.parentPath,
      this.rootScxml,
      this.stateRegistry,
      getAttribute,
      getElements
    );

    // Initial position placeholder - will be set by applyDefaultELKLayout()
    // This placeholder is necessary for node creation but will be overwritten
    const position: { x: number; y: number } = { x: 0, y: 0 };

    // Create base node data
    const baseNodeData: SCXMLStateNodeData = {
      label: stateId,
      stateType,
      isInitial,
      entryActions,
      exitActions,
    };

    // Create hierarchical node
    const node: HierarchicalNode = {
      id: stateId,
      type: nodeType,
      position,
      data: baseNodeData,
      parentId: stateInfo.parentPath ? this.parentMap.get(stateId) : undefined,
      childIds: stateInfo.children,
      depth: stateInfo.depth,
    };

    // If this is a container, store children array for reference
    if (isContainer) {
      (node.data as any).children = stateInfo.children;
    }

    // Store viz metadata for position tracking in auto-layout
    if (visualMetadata.x !== undefined && visualMetadata.y !== undefined) {
      // Store absolute viz:xywh position for tracking
      (node.data as any).vizX = visualMetadata.x;
      (node.data as any).vizY = visualMetadata.y;
      (node.data as any).hasVizPosition = true; // Flag to indicate viz position exists
    }

    // Apply viz:xywh width/height at all levels for NodeResizer compatibility
    if (
      visualMetadata.width !== undefined &&
      visualMetadata.height !== undefined
    ) {
      // Top-level dimensions (required by NodeResizer)
      (node as any).width = visualMetadata.width;
      (node as any).height = visualMetadata.height;

      // Style-level dimensions
      (node as any).style = {
        width: visualMetadata.width,
        height: visualMetadata.height,
      };

      // Data-level dimensions (for component access)
      (node.data as any).width = visualMetadata.width;
      (node.data as any).height = visualMetadata.height;
    }

    return node;
  }

  /**
   * Wrapper for getAncestorChain - delegates to module function (kept as public method)
   */
  getAncestorChain(stateId: string): string[] {
    return getAncestorChain(stateId, this.stateRegistry);
  }
}
