//visual-diagram.tsx
'use client';

// ==================== IMPORTS ====================
import { useHierarchyNavigation } from '@/hooks/use-hierarchy-navigation';
import { SCXMLToXStateConverter } from '@/lib/converters/scxml-to-xstate';
import { nodeDimensionCalculator } from '@/lib/layout/node-dimension-calculator';
import { VisualMetadataManager } from '@/lib/metadata';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import {
  addStateToDocument,
  createStateElement,
  findStateById,
  removeTransitionByEdgeId,
} from '@/lib/utils/scxml-manipulation-utils';
import { computeVisualStyles } from '@/lib/utils/visual-style-utils';
import { ActionType } from '@/types/history';
import type { SCXMLDocument, TransitionElement } from '@/types/scxml';
import {
  SmartBezierEdge,
  SmartStepEdge,
  SmartStraightEdge,
} from '@tisoap/react-flow-smart-edge';
import { ChevronRight } from 'lucide-react';
import React, { useCallback } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  ControlButton,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { SCXMLTransitionEdge } from './edges/scxml-transition-edge';
import { HistoryWrapperNode } from './nodes/history-wrapper-node';
import { SCXMLStateNode } from './nodes/scxml-state-node';

// ==================== TYPES & INTERFACES ====================
interface VisualDiagramProps {
  scxmlContent: string;
  onNodeChange?: (nodes: Node[]) => void;
  onEdgeChange?: (edges: Edge[]) => void;
  onSCXMLChange?: (
    scxmlContent: string,
    changeType?: 'position' | 'structure' | 'property' | 'resize'
  ) => void;
  isUpdatingFromHistory?: boolean;
  historyActionType?: ActionType;
}

// ==================== CONSTANTS ====================
// Custom node types for SCXML elements
const nodeTypes: NodeTypes = {
  scxmlState: SCXMLStateNode,
  scxmlHistory: HistoryWrapperNode,
};

// Custom edge types for SCXML transitions
const edgeTypes = {
  scxmlTransition: SCXMLTransitionEdge,
  smart: SmartBezierEdge,
  smartStep: SmartStepEdge,
  smartStraight: SmartStraightEdge,
};

// Default demo data
const initialNodes: Node[] = [
  {
    id: 'idle',
    type: 'scxmlState',
    position: { x: 100, y: 100 },
    data: {
      label: 'idle',
      stateType: 'simple',
      isInitial: true,
      entryActions: [],
      exitActions: [],
    },
  },
  {
    id: 'active',
    type: 'scxmlState',
    position: { x: 300, y: 100 },
    data: {
      label: 'active',
      stateType: 'simple',
      isInitial: false,
      entryActions: ['log("Entering active state")'],
      exitActions: ['log("Exiting active state")'],
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'idle-to-active',
    type: 'aligned',
    source: 'idle',
    target: 'active',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#6b7280',
    },
    data: {
      event: 'start',
      condition: null,
      actions: [],
    },
  },
  {
    id: 'active-to-idle',
    type: 'aligned',
    source: 'active',
    target: 'idle',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#6b7280',
    },
    data: {
      event: 'stop',
      condition: null,
      actions: [],
    },
  },
];

// ==================== MAIN COMPONENT ====================
const VisualDiagramInner: React.FC<VisualDiagramProps> = ({
  scxmlContent,
  onNodeChange,
  onEdgeChange,
  onSCXMLChange,
  isUpdatingFromHistory = false,
  historyActionType,
}) => {
  // ==================== STATE MANAGEMENT ====================
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // UI State
  const [activeStates, setActiveStates] = React.useState<Set<string>>(
    new Set()
  );
  const [selectedTransitions, setSelectedTransitions] = React.useState<
    Set<string>
  >(new Set());

  // Ref to always access latest selection state in callbacks
  const selectedTransitionsRef = React.useRef(selectedTransitions);
  React.useEffect(() => {
    selectedTransitionsRef.current = selectedTransitions;
  }, [selectedTransitions]);

  // Ref to always access latest edges in callbacks
  const edgesRef = React.useRef(edges);
  React.useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Track edge identity during waypoint operations to re-select after reparse
  const edgeIdentityForReselection = React.useRef<{
    source: string;
    target: string;
    event?: string;
    condition?: string;
  } | null>(null);

  const [hoveredEdge, setHoveredEdge] = React.useState<{
    id: string;
    fullLabel: string;
    x: number;
    y: number;
  } | null>(null);
  const [selectedEdgeForEdit, setSelectedEdgeForEdit] = React.useState<{
    id: string;
    source: string;
    target: string;
    event?: string;
    cond?: string;
    rawValue?: string;
    editingField: 'event' | 'cond';
  } | null>(null);

  // State for editing onentry/onexit actions
  const [selectedStateForActions, setSelectedStateForActions] = React.useState<{
    id: string;
    entryActions: Array<{ location: string; expr: string }>;
    exitActions: Array<{ location: string; expr: string }>;
  } | null>(null);
  // ==================== REFS ====================
  // Position update management
  const isUpdatingPositionRef = React.useRef(false);
  const previousScxmlRef = React.useRef<string>('');
  const positionUpdateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastPositionUpdateRef = React.useRef<
    Map<string, { x: number; y: number }>
  >(new Map());
  const isDraggingRef = React.useRef<Set<string>>(new Set()); // Track nodes being dragged

  // Handler refs for callbacks
  const handleNodeDeleteRef = React.useRef<((nodeId: string) => void) | null>(
    null
  );

  // Hover delay ref
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // SCXML parsing and metadata
  const parserRef = React.useRef<SCXMLParser | null>(null);
  const metadataManagerRef = React.useRef<VisualMetadataManager | null>(null);
  const scxmlDocRef = React.useRef<SCXMLDocument | null>(null);
  const scxmlContentRef = React.useRef<string>('');

  // Keep scxmlContent ref up to date
  React.useEffect(() => {
    scxmlContentRef.current = scxmlContent;
  }, [scxmlContent]);

  // ReactFlow state refs for isolated handler
  const nodesRef = React.useRef(nodes);
  const allNodesRef = React.useRef<Node[]>([]); // Store original nodes with parentId
  const onNodesChangeRef = React.useRef(onNodesChange);
  const handleNodePositionChangeRef = React.useRef<any>(null);

  // Keep refs up to date
  nodesRef.current = nodes;
  onNodesChangeRef.current = onNodesChange;

  // ==================== NODE CONTENT HANDLERS ====================
  const handleNodeLabelChange = React.useCallback(
    (nodeId: string, newLabel: string) => {
      if (!onSCXMLChange || !scxmlContent) return;

      try {
        // Use command pattern for unified SCXML updates
        const { RenameStateCommand } = require('@/lib/commands');
        const command = new RenameStateCommand(nodeId, newLabel);

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'property');
        } else {
          console.error('Failed to rename state:', result.error);
        }
      } catch (error) {
        console.error('Failed to sync label change:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  const handleNodeActionsChange = React.useCallback(
    (nodeId: string, entryActions: string[], exitActions: string[]) => {
      if (!onSCXMLChange || !scxmlContent) return;

      try {
        // Use command pattern for unified SCXML updates
        const { UpdateActionsCommand } = require('@/lib/commands');
        const command = new UpdateActionsCommand(
          nodeId,
          entryActions,
          exitActions
        );

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'property');
        } else {
          console.error('Failed to update actions:', result.error);
        }
      } catch (error) {
        console.error('Failed to sync actions change:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  const handleNodeStateTypeChange = React.useCallback(
    (nodeId: string, newStateType: string) => {
      if (!onSCXMLChange || !scxmlContent) return;

      try {
        // Use command pattern for unified SCXML updates
        const { ChangeStateTypeCommand } = require('@/lib/commands');
        const command = new ChangeStateTypeCommand(nodeId, newStateType);

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'property');
        } else {
          console.error('Failed to change state type:', result.error);
        }
      } catch (error) {
        console.error('Failed to sync state type change:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  // ==================== NODE DELETION HANDLERS ====================
  const handleNodeDelete = React.useCallback(
    (nodeIds: string | string[]) => {
      if (!onSCXMLChange || !scxmlContent) return;

      try {
        // Use command pattern for unified SCXML updates
        const { DeleteNodeCommand } = require('@/lib/commands');
        const command = new DeleteNodeCommand(nodeIds);

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'structure');
          setActiveStates(new Set());
        } else {
          console.error('Failed to delete node:', result.error);
        }
      } catch (error) {
        console.error('Failed to delete node:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  // ==================== POSITION UPDATE HANDLERS ====================
  const handleNodePositionChange = React.useCallback(
    (nodeId: string, x: number, y: number) => {
      const currentScxmlContent = scxmlContentRef.current;
      if (!onSCXMLChange || !currentScxmlContent) {
        console.warn('Cannot update position: SCXML content not available');
        return;
      }

      try {
        // Use command pattern for unified SCXML updates
        const {
          UpdatePositionCommand,
        } = require('@/lib/commands/update-position-command');
        const command = new UpdatePositionCommand(nodeId, x, y);

        const result = command.execute(currentScxmlContent);

        if (result.success) {
          previousScxmlRef.current = result.newContent;
          onSCXMLChange(result.newContent, 'position');
        } else {
          console.error('Failed to update position:', result.error);
          isUpdatingPositionRef.current = false;
        }
      } catch (error) {
        isUpdatingPositionRef.current = false;
        console.error('Failed to sync position change:', error);
      }
    },
    [onSCXMLChange, setEdges]
  );

  handleNodePositionChangeRef.current = handleNodePositionChange;

  // ==================== RESIZE HANDLER ====================
  const handleNodeResize = React.useCallback(
    (nodeId: string, x: number, y: number, width: number, height: number) => {
      const currentScxmlContent = scxmlContentRef.current;
      if (!onSCXMLChange || !currentScxmlContent) {
        console.warn('Cannot update dimensions: SCXML content not available');
        return;
      }
      isUpdatingPositionRef.current = true;
      // Force edge recalculation immediately
      setEdges((edges) => [...edges]);

      // Use command pattern for unified SCXML updates
      const {
        UpdatePositionAndDimensionsCommand,
      } = require('@/lib/commands/update-position-and-dimensions-command');
      const command = new UpdatePositionAndDimensionsCommand(
        nodeId,
        x,
        y,
        width,
        height
      );

      const result = command.execute(currentScxmlContent);

      if (result.success) {
        previousScxmlRef.current = result.newContent;
        onSCXMLChange(result.newContent, 'resize');

        // Ensure final edge recalculation after resize completes
        // setTimeout(() => {
        //   setNodes((node) => [...enhancedNodes]);
        //   setEdges((edges) => [...edges]);
        //   isUpdatingPositionRef.current = false;
        // }, 50);

        requestAnimationFrame(() => {
          // Force edge recalculation by triggering a re-render
          // Use functional update to ensure we're working with current state
          setNodes((node) => [...enhancedNodes]);
          setEdges((currentEdges) => [...currentEdges]);
          isUpdatingPositionRef.current = false;
        });
      } else {
        console.error('Failed to resize node:', result.error);
        isUpdatingPositionRef.current = false;
      }
    },
    [onSCXMLChange, setNodes, setEdges]
  );

  // ==================== EDGE HANDLERS ====================
  const handleTransitionLabelChange = React.useCallback(
    (
      source: string,
      target: string,
      originalEvent: string | undefined,
      originalCond: string | undefined,
      newLabel: string,
      editingField: 'event' | 'cond' = 'event',
      edgeId?: string
    ) => {
      if (!onSCXMLChange || !scxmlContent) {
        return;
      }

      try {
        // Extract transition index from edge ID for deterministic lookup
        let transitionIndex: number | undefined;
        if (edgeId) {
          const {
            parseTransitionIndexFromEdgeId,
          } = require('@/lib/converters/converter-modules');
          transitionIndex = parseTransitionIndexFromEdgeId(edgeId);
        }

        // Use command pattern for unified SCXML updates
        const { UpdateTransitionCommand } = require('@/lib/commands');
        const command = new UpdateTransitionCommand(
          source,
          target,
          originalEvent,
          originalCond,
          newLabel,
          editingField,
          transitionIndex
        );

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'property');
        } else {
          console.error('Failed to update transition:', result.error);
        }
      } catch (error) {
        console.error('Failed to update transition label:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  const handleEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (edge.data?.fullLabel) {
        // Clear any existing timeout
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }

        // Set a delay of 500ms before showing the hover tooltip
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredEdge({
            id: edge.id,
            fullLabel: edge.data.fullLabel,
            x: event.clientX,
            y: event.clientY,
          });
        }, 500);
      }
    },
    []
  );

  const handleEdgeMouseLeave = useCallback(() => {
    // Clear the timeout if mouse leaves before the delay expires
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredEdge(null);
  }, []);

  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      // Filter out selection changes - they don't affect SCXML structure
      const structuralChanges = changes.filter(
        (change) => change.type !== 'select'
      );

      // Only pass structural changes to ReactFlow
      if (structuralChanges.length > 0) {
        onEdgesChange(structuralChanges);
      }

      const deleteChanges = structuralChanges.filter(
        (change) => change.type === 'remove'
      );

      if (deleteChanges.length > 0 && parserRef.current && onSCXMLChange) {
        try {
          const parseResult = parserRef.current.parse(scxmlContent);
          if (parseResult.success && parseResult.data) {
            const scxmlDoc = parseResult.data;
            let anyRemoved = false;

            for (const change of deleteChanges) {
              const removed = removeTransitionByEdgeId(scxmlDoc, change.id);
              if (removed) anyRemoved = true;
            }

            if (anyRemoved) {
              // Re-extract visual metadata after deletion to ensure metadata store is in sync
              // This prevents stale index-based transition metadata from being incorrectly applied
              parserRef.current
                .getVisualMetadataManager()
                .extractAllVisualMetadata(scxmlDoc);

              const updatedSCXML = parserRef.current.serialize(scxmlDoc, true);
              onSCXMLChange(updatedSCXML, 'structure');
              setSelectedTransitions(new Set());
              setSelectedEdgeForEdit(null);
            }
          }
        } catch (error) {
          console.error('Failed to sync edge deletion to SCXML:', error);
        }
      }

      if (onEdgeChange) {
        onEdgeChange(edges);
      }
    },
    [onEdgesChange, onEdgeChange, edges, scxmlContent, onSCXMLChange]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // Set intelligent defaults: outgoing from bottom, incoming to top
      const sourceHandle = params.sourceHandle || 'bottom';
      const targetHandle = params.targetHandle || 'top';

      const newEdge: Edge = {
        id: `${params.source}-${params.target}-${Date.now()}`,
        type: 'smoothstep',
        source: params.source!,
        target: params.target!,
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
        // markerEnd: {
        //   type: MarkerType.ArrowClosed,
        //   width: 20,
        //   height: 20,
        //   color: '#6b7280',
        // },
        data: {
          event: 'event',
          condition: undefined,
          actions: [],
          sourceHandle: sourceHandle,
          targetHandle: targetHandle,
        },
        style: {
          strokeWidth: 2,
          zIndex: 1,
          stroke: '#3b82f6',
        },
        zIndex: 1,
        animated: true,
      };

      setEdges((eds) => addEdge(newEdge, eds));

      if (parserRef.current && scxmlContent) {
        try {
          const parseResult = parserRef.current.parse(scxmlContent);
          if (parseResult.success && parseResult.data) {
            const scxmlDoc = parseResult.data;
            const sourceState = findStateById(scxmlDoc, params.source!);

            if (sourceState) {
              const newTransition: TransitionElement = {
                '@_event': 'event',
                '@_target': params.target!,
              };

              if (!sourceState.transition) {
                sourceState.transition = newTransition;
              } else if (Array.isArray(sourceState.transition)) {
                sourceState.transition.push(newTransition);
              } else {
                sourceState.transition = [
                  sourceState.transition,
                  newTransition,
                ];
              }

              let finalSCXML = parserRef.current.serialize(scxmlDoc, true);

              // Persist handle information (with intelligent defaults)
              const {
                UpdateTransitionHandlesCommand,
              } = require('@/lib/commands');
              const handleCommand = new UpdateTransitionHandlesCommand(
                params.source!,
                params.target!,
                'event', // The event we just created
                undefined, // No condition
                sourceHandle,
                targetHandle
              );

              const handleResult = handleCommand.execute(finalSCXML);
              if (handleResult.success) {
                finalSCXML = handleResult.newContent;
              }

              previousScxmlRef.current = finalSCXML;

              if (onSCXMLChange) {
                isUpdatingPositionRef.current = true;
                onSCXMLChange(finalSCXML, 'structure');
                setTimeout(() => {
                  isUpdatingPositionRef.current = false;
                }, 100);
              }
            }
          }
        } catch (error) {
          console.error('Failed to update SCXML in background:', error);
        }
      }
    },
    [setEdges, scxmlContent, onSCXMLChange]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!onSCXMLChange || !scxmlContent) {
        console.warn('Cannot reconnect edge: SCXML content not available');
        return;
      }

      try {
        // Use command pattern for unified SCXML updates
        const { ReconnectTransitionCommand } = require('@/lib/commands');
        const command = new ReconnectTransitionCommand(
          oldEdge.source,
          oldEdge.target,
          newConnection.source,
          newConnection.target,
          oldEdge.data?.event,
          oldEdge.data?.condition,
          oldEdge.sourceHandle || undefined,
          oldEdge.targetHandle || undefined,
          newConnection.sourceHandle || undefined,
          newConnection.targetHandle || undefined
        );

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'structure');
        } else {
          console.error('Failed to reconnect transition:', result.error);
        }
      } catch (error) {
        console.error('Failed to reconnect edge:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  // ==================== STATE CLICK HANDLERS ====================
  const clickTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = React.useRef<number>(0);

  const handleStateClick = useCallback(
    (stateId: string, event?: React.MouseEvent) => {
      // Increment click count
      clickCountRef.current++;

      // Clear any existing timeout
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }

      // Set a timeout to handle single click after a delay
      clickTimeoutRef.current = setTimeout(() => {
        // Only process single click if click count is 1
        if (clickCountRef.current === 1) {
          setSelectedTransitions(new Set());
          setSelectedEdgeForEdit(null);

          setActiveStates((prev) => {
            const newStates = new Set(prev);

            // If Ctrl (or Cmd on Mac) is pressed, allow multi-select
            const isMultiSelect = event?.ctrlKey || event?.metaKey;

            if (isMultiSelect) {
              // Toggle selection when Ctrl is held
              if (newStates.has(stateId)) {
                newStates.delete(stateId);
                setSelectedStateForActions(null);
              } else {
                newStates.add(stateId);
              }
            } else {
              // Single selection mode - clear all and select only this state
              if (newStates.has(stateId)) {
                newStates.clear();
                setSelectedStateForActions(null);
              } else {
                newStates.clear();
                newStates.add(stateId);

                // Show actions editor for single selected state
                const node = nodes.find((n) => n.id === stateId);
                if (node && node.data) {
                  const parseActions = (actions: string[]) => {
                    return actions
                      .filter((a) => a.startsWith('assign|'))
                      .map((a) => {
                        const parts = a.split('|');
                        return {
                          location: parts[1] || '',
                          expr: parts[2] || '',
                        };
                      });
                  };

                  setSelectedStateForActions({
                    id: stateId,
                    entryActions: parseActions(node.data.entryActions || []),
                    exitActions: parseActions(node.data.exitActions || []),
                  });
                }
              }
            }

            return newStates;
          });
        }

        // Reset click count
        clickCountRef.current = 0;
      }, 250); // 250ms delay to distinguish single vs double click
    },
    [nodes]
  );

  // ==================== REACTFLOW NODE CHANGE HANDLER ====================
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // Filter out selection changes - they don't affect SCXML structure
      const structuralChanges = changes.filter(
        (change) => change.type !== 'select'
      );

      const removeChanges = structuralChanges.filter(
        (change) => change.type === 'remove'
      );

      if (removeChanges.length > 0) {
        // Delete all selected nodes directly without confirmation
        const nodeIdsToDelete = removeChanges.map((change) => change.id);
        handleNodeDelete(nodeIdsToDelete);

        const nonRemoveChanges = structuralChanges.filter(
          (change) => change.type !== 'remove'
        );
        if (nonRemoveChanges.length > 0) {
          onNodesChangeRef.current(nonRemoveChanges);
        }
        return;
      }

      // Track dragging state across change events
      structuralChanges.forEach((change) => {
        if (change.type === 'position') {
          if (change.dragging === true) {
            // User is actively dragging this node
            isDraggingRef.current.add(change.id);
          }
        }
      });

      // Pass structural changes to ReactFlow for visual updates
      onNodesChangeRef.current(structuralChanges);

      // Check for position changes where dragging ended
      const dragEndChanges = structuralChanges.filter(
        (change) => change.type === 'position' && change.dragging === false
      );

      if (dragEndChanges.length === 0) {
        return;
      }

      // Only process nodes that were actually dragged
      const positionChanges = dragEndChanges.filter((change) =>
        isDraggingRef.current.has(change.id)
      );

      if (positionChanges.length === 0) {
        // This was a click, not a drag - don't update SCXML
        return;
      }

      // Remove nodes from dragging set since drag has ended
      positionChanges.forEach((change) => {
        isDraggingRef.current.delete(change.id);
      });

      if (isUpdatingPositionRef.current) {
        return;
      }

      if (positionUpdateTimeoutRef.current) {
        clearTimeout(positionUpdateTimeoutRef.current);
        positionUpdateTimeoutRef.current = null;
      }

      positionUpdateTimeoutRef.current = setTimeout(() => {
        if (isUpdatingPositionRef.current) {
          return;
        }

        isUpdatingPositionRef.current = true;

        try {
          const positionMap = new Map<string, { x: number; y: number }>();
          const currentNodes = [...nodesRef.current];

          structuralChanges.forEach((change) => {
            if (change.type === 'position' && change.position) {
              const nodeIndex = currentNodes.findIndex(
                (n) => n.id === change.id
              );
              if (nodeIndex >= 0) {
                currentNodes[nodeIndex] = {
                  ...currentNodes[nodeIndex],
                  position: change.position,
                };
              }
              positionMap.set(change.id, change.position);
            }
          });

          // Get all nodes that ended dragging - including all selected nodes
          const nodesToUpdate = new Set<string>();

          // Add all nodes from positionChanges (nodes that were explicitly dragged)
          positionChanges.forEach((change) => {
            nodesToUpdate.add(change.id);
          });

          // Also check for other selected nodes that may have moved along with the drag
          // but didn't trigger individual drag events
          if (nodesToUpdate.size > 0) {
            currentNodes.forEach((node) => {
              if (node.selected && positionMap.has(node.id)) {
                nodesToUpdate.add(node.id);
              }
            });
          }

          // Collect all position updates to batch them
          const batchUpdates: Array<{ nodeId: string; x: number; y: number }> =
            [];

          for (const nodeId of nodesToUpdate) {
            const node = currentNodes.find((n) => n.id === nodeId);
            if (!node?.position) continue;

            // In hierarchy navigation mode, positions are always absolute
            // because parentId is removed from filtered nodes (see use-hierarchy-navigation.ts:45)
            // The position we get from ReactFlow is already the correct absolute position
            let absoluteX = positionMap.get(nodeId)?.x ?? node.position.x;
            let absoluteY = positionMap.get(nodeId)?.y ?? node.position.y;

            const lastPos = lastPositionUpdateRef.current.get(nodeId);
            if (
              lastPos &&
              Math.abs(lastPos.x - absoluteX) < 2 &&
              Math.abs(lastPos.y - absoluteY) < 2
            ) {
              continue;
            }

            lastPositionUpdateRef.current.set(nodeId, {
              x: absoluteX,
              y: absoluteY,
            });

            batchUpdates.push({ nodeId, x: absoluteX, y: absoluteY });
          }

          // Execute batch update if there are any updates
          if (batchUpdates.length > 0) {
            const currentScxmlContent = scxmlContentRef.current;
            if (!onSCXMLChange || !currentScxmlContent) {
              console.warn(
                'Cannot update positions: SCXML content not available'
              );
              return;
            }

            try {
              const {
                BatchUpdatePositionCommand,
              } = require('@/lib/commands/batch-update-position-command');
              const command = new BatchUpdatePositionCommand(batchUpdates);

              const result = command.execute(currentScxmlContent);

              if (result.success) {
                previousScxmlRef.current = result.newContent;
                onSCXMLChange(result.newContent, 'position');
              } else {
                console.error('Failed to update positions:', result.error);
                isUpdatingPositionRef.current = false;
              }
            } catch (error) {
              isUpdatingPositionRef.current = false;
              console.error('Failed to sync position changes:', error);
            }
          }
        } finally {
          setTimeout(() => {
            isUpdatingPositionRef.current = false;
          }, 200);
        }
      }, 150);
    },
    [nodes, handleNodeDelete]
  );

  // ==================== SCXML PARSING ====================
  const [parsedData, setParsedData] = React.useState<{
    nodes: Node[];
    edges: Edge[];
    parser: SCXMLParser | null;
    metadataManager: VisualMetadataManager | null;
  }>({
    nodes: [],
    edges: [],
    parser: null,
    metadataManager: null,
  });

  // Ref to always access latest parsedData in callbacks
  const parsedDataRef = React.useRef(parsedData);
  React.useEffect(() => {
    parsedDataRef.current = parsedData;
  }, [parsedData]);

  // ==================== WAYPOINT HANDLERS ====================
  const handleWaypointDrag = React.useCallback(
    (edgeId: string, index: number, x: number, y: number) => {
      // Update parsedData edges to ensure visual updates
      setParsedData((current) => {
        const updatedEdges = current.edges.map((edge) => {
          if (edge.id !== edgeId) return edge;

          const waypoints = [...(edge.data?.waypoints || [])];
          if (index >= 0 && index < waypoints.length) {
            waypoints[index] = { x, y };
          }

          return {
            ...edge,
            data: {
              ...edge.data,
              waypoints,
            },
          };
        });

        return {
          ...current,
          edges: updatedEdges,
        };
      });
    },
    []
  );

  const handleWaypointDragEnd = React.useCallback(
    (edgeId: string, index: number) => {
      if (!onSCXMLChange || !scxmlContent) return;

      try {
        // Get the edge with updated waypoints from parsedData ref (to access current state)
        const edge = parsedDataRef.current.edges.find((e) => e.id === edgeId);
        if (!edge || !edge.data?.waypoints) return;

        // Store edge identity for re-selection after reparse (edge ID will change due to random suffix)
        edgeIdentityForReselection.current = {
          source: edge.source,
          target: edge.target,
          event: edge.data?.event,
          condition: edge.data?.condition,
        };

        // Use command pattern for unified SCXML updates
        const { UpdateWaypointsCommand } = require('@/lib/commands');
        const command = new UpdateWaypointsCommand(
          edge.source,
          edge.target,
          edge.data?.event,
          edge.data?.condition,
          edge.data.waypoints
        );

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'position');
        } else {
          console.error('Failed to update waypoints:', result.error);
        }
      } catch (error) {
        console.error('Failed to update waypoint:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  const handleWaypointAdd = React.useCallback(
    (edgeId: string, x: number, y: number, insertIndex: number) => {
      if (!onSCXMLChange || !scxmlContent) return;

      try {
        // Get the edge from parsedData ref (to access current state)
        const edge = parsedDataRef.current.edges.find((e) => e.id === edgeId);
        if (!edge) return;

        // Store edge identity for re-selection after reparse (edge ID will change due to random suffix)
        edgeIdentityForReselection.current = {
          source: edge.source,
          target: edge.target,
          event: edge.data?.event,
          condition: edge.data?.condition,
        };

        // Insert new waypoint at the specified index
        const waypoints = [...(edge.data?.waypoints || [])];
        waypoints.splice(insertIndex, 0, { x, y });

        // Use command pattern for unified SCXML updates
        const { UpdateWaypointsCommand } = require('@/lib/commands');
        const command = new UpdateWaypointsCommand(
          edge.source,
          edge.target,
          edge.data?.event,
          edge.data?.condition,
          waypoints
        );

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'position');
        } else {
          console.error('Failed to add waypoint:', result.error);
        }
      } catch (error) {
        console.error('Failed to add waypoint:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  const handleWaypointDelete = React.useCallback(
    (edgeId: string, index: number) => {
      if (!onSCXMLChange || !scxmlContent) return;

      try {
        // Get the edge from parsedData ref (to access current state)
        const edge = parsedDataRef.current.edges.find((e) => e.id === edgeId);
        if (!edge || !edge.data?.waypoints) return;

        // Store edge identity for re-selection after reparse (edge ID will change due to random suffix)
        edgeIdentityForReselection.current = {
          source: edge.source,
          target: edge.target,
          event: edge.data?.event,
          condition: edge.data?.condition,
        };

        // Remove waypoint from array
        const newWaypoints = edge.data.waypoints.filter(
          (_: any, i: number) => i !== index
        );

        // Update parsedData edges to ensure visual updates
        setParsedData((current) => {
          const updatedEdges = current.edges.map((e) => {
            if (e.id !== edgeId) return e;
            return {
              ...e,
              data: {
                ...e.data,
                waypoints: newWaypoints,
              },
            };
          });

          return {
            ...current,
            edges: updatedEdges,
          };
        });

        // Use command pattern for unified SCXML updates
        const { UpdateWaypointsCommand } = require('@/lib/commands');
        const command = new UpdateWaypointsCommand(
          edge.source,
          edge.target,
          edge.data?.event,
          edge.data?.condition,
          newWaypoints
        );

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'position');
        } else {
          console.error('Failed to delete waypoint:', result.error);
        }
      } catch (error) {
        console.error('Failed to delete waypoint:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  // Re-select edge after reparse if edge identity is tracked
  React.useEffect(() => {
    if (edgeIdentityForReselection.current && parsedData.edges.length > 0) {
      const identity = edgeIdentityForReselection.current;

      // Find the new edge with matching identity
      const matchingEdge = parsedData.edges.find(
        (e) =>
          e.source === identity.source &&
          e.target === identity.target &&
          e.data?.event === identity.event &&
          e.data?.condition === identity.condition
      );

      if (matchingEdge) {
        setSelectedTransitions(new Set([matchingEdge.id]));
        edgeIdentityForReselection.current = null; // Clear after reselection
      }
    }
  }, [parsedData.edges]);

  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();

      // Check if Shift key is pressed and edge is already selected - add waypoint
      if (event.shiftKey && selectedTransitions.has(edge.id)) {
        // Get click position in flow coordinates
        const flowPosition = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        // Find the closest segment to insert the waypoint
        // Get source and target positions from the edge
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);

        if (!sourceNode || !targetNode) return;

        const waypoints = edge.data?.waypoints || [];
        const points = [
          {
            x: sourceNode.position.x + (sourceNode.width || 150) / 2,
            y: sourceNode.position.y + (sourceNode.height || 80) / 2,
          },
          ...waypoints,
          {
            x: targetNode.position.x + (targetNode.width || 150) / 2,
            y: targetNode.position.y + (targetNode.height || 80) / 2,
          },
        ];

        let closestSegmentIndex = 0;
        let minDistance = Infinity;

        // Find which segment is closest to the click
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];

          // Calculate distance from click to line segment
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const lengthSquared = dx * dx + dy * dy;

          if (lengthSquared === 0) continue;

          let t =
            ((flowPosition.x - p1.x) * dx + (flowPosition.y - p1.y) * dy) /
            lengthSquared;
          t = Math.max(0, Math.min(1, t));

          const closestX = p1.x + t * dx;
          const closestY = p1.y + t * dy;
          const distance = Math.sqrt(
            (flowPosition.x - closestX) ** 2 + (flowPosition.y - closestY) ** 2
          );

          if (distance < minDistance) {
            minDistance = distance;
            closestSegmentIndex = i;
          }
        }
        handleWaypointAdd(
          edge.id,
          flowPosition.x,
          flowPosition.y,
          closestSegmentIndex
        );
        return;
      }

      setActiveStates(new Set());
      setSelectedTransitions((prev) => {
        const newTransitions = new Set(prev);
        if (newTransitions.has(edge.id)) {
          newTransitions.clear();
          setSelectedEdgeForEdit(null);
        } else {
          newTransitions.clear();
          newTransitions.add(edge.id);
          // Set the selected edge for editing
          const hasEvent = !!edge.data?.event;
          const hasCond = !!edge.data?.condition;
          const initialValue =
            (hasEvent ? edge.data.event : hasCond ? edge.data.condition : '') ||
            '';
          setSelectedEdgeForEdit({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            event: edge.data?.event,
            cond: edge.data?.condition,
            rawValue: initialValue,
            editingField: hasEvent ? 'event' : 'cond',
          });
        }
        return newTransitions;
      });
    },
    [selectedTransitions, screenToFlowPosition, nodes, handleWaypointAdd]
  );

  // Parse SCXML and convert to ReactFlow format (async due to ELK layout)
  React.useEffect(() => {
    if (!scxmlContent.trim()) {
      setParsedData({
        nodes: [],
        edges: [],
        parser: null,
        metadataManager: null,
      });
      return;
    }

    let isMounted = true; // Cleanup flag to prevent state updates after unmount

    async function parseAndConvert() {
      try {
        const parser = new SCXMLParser();
        const converter = new SCXMLToXStateConverter();
        const metadataManager = parser.getVisualMetadataManager();

        parserRef.current = parser;
        metadataManagerRef.current = metadataManager;

        const parseResult = parser.parse(scxmlContent);

        if (parseResult.success && parseResult.data) {
          scxmlDocRef.current = parseResult.data;

          // Async conversion with ELK layout
          // Pass original SCXML content for potential write-back
          const { nodes, edges, initializedSCXML } =
            await converter.convertToReactFlow(parseResult.data, scxmlContent);

          // If SCXML was initialized (viz:xywh added), update with history
          if (initializedSCXML && onSCXMLChange) {
            onSCXMLChange(initializedSCXML, 'position');
          }

          const enhancedNodes = nodes.map((node) => {
            const visualMetadata = metadataManager.getVisualMetadata(node.id);
            const nodeUpdate: any = { ...node };

            if (visualMetadata?.layout) {
              nodeUpdate.position = {
                x: visualMetadata.layout.x ?? node.position.x,
                y: visualMetadata.layout.y ?? node.position.y,
              };
            }

            // Always set node dimensions with priority: viz:xywh > existing dimensions
            // React Flow needs width/height at the top level of node object for NodeResizer
            const vizWidth = visualMetadata?.layout?.width;
            const vizHeight = visualMetadata?.layout?.height;

            // Set dimensions at multiple levels for React Flow compatibility
            nodeUpdate.width =
              vizWidth ?? nodeUpdate.width ?? nodeUpdate.style?.width;
            nodeUpdate.height =
              vizHeight ?? nodeUpdate.height ?? nodeUpdate.style?.height;

            nodeUpdate.style = {
              ...nodeUpdate.style,
              width: vizWidth ?? nodeUpdate.style?.width,
              height: vizHeight ?? nodeUpdate.style?.height,
            };

            if (
              nodeUpdate.type === 'scxmlHistory' &&
              node.data?.isHistoryWrapper
            ) {
              const calculatedWidth =
                (node.data as any).width || node.style?.width;
              const calculatedHeight =
                (node.data as any).height || node.style?.height;

              if (calculatedWidth && calculatedHeight) {
                nodeUpdate.style = {
                  ...nodeUpdate.style,
                  width: calculatedWidth,
                  height: calculatedHeight,
                };
              }
            }

            const visualStyles = computeVisualStyles(
              visualMetadata,
              node.data?.stateType || 'simple'
            );

            nodeUpdate.data = {
              ...nodeUpdate.data,
              visualStyles,
              // Priority: viz:xywh dimensions > existing node.style dimensions
              width:
                nodeUpdate.type === 'scxmlHistory' &&
                node.data?.isHistoryWrapper
                  ? nodeUpdate.style?.width || (node.data as any).width
                  : visualMetadata?.layout?.width ?? nodeUpdate.style?.width,
              height:
                nodeUpdate.type === 'scxmlHistory' &&
                node.data?.isHistoryWrapper
                  ? nodeUpdate.style?.height || (node.data as any).height
                  : visualMetadata?.layout?.height ?? nodeUpdate.style?.height,
              onLabelChange: (newLabel: string) =>
                handleNodeLabelChange(node.id, newLabel),
              onStateTypeChange: (newStateType: string) =>
                handleNodeStateTypeChange(node.id, newStateType),
              onActionsChange: (
                entryActions: string[],
                exitActions: string[]
              ) => handleNodeActionsChange(node.id, entryActions, exitActions),
              onDelete: () => handleNodeDelete(node.id),
              onResize: (x: number, y: number, width: number, height: number) =>
                handleNodeResize(node.id, x, y, width, height),
            };

            return nodeUpdate;
          });

          const edgeGroups = new Map<string, any[]>();
          edges.forEach((edge) => {
            const key = `${edge.source}-${edge.target}`;
            if (!edgeGroups.has(key)) {
              edgeGroups.set(key, []);
            }
            edgeGroups.get(key)!.push(edge);
          });

          const haveSameParent = (sourceId: string, targetId: string) => {
            const sourceNode = nodes.find((n) => n.id === sourceId);
            const targetNode = nodes.find((n) => n.id === targetId);
            return sourceNode?.parentId === targetNode?.parentId;
          };

          const edgesWithMarkers = edges.map((edge) => {
            const edgeMetadata = metadataManager.getVisualMetadata(edge.id);
            const edgeKey = `${edge.source}-${edge.target}`;
            const parallelEdges = edgeGroups.get(edgeKey) || [];
            const edgeIndex = parallelEdges.findIndex((e) => e.id === edge.id);
            const hasParallelEdges = parallelEdges.length > 1;
            const inSameContainer = haveSameParent(edge.source, edge.target);
            const hasWaypoints =
              edge.data?.waypoints && edge.data.waypoints.length > 0;

            let edgeType = 'smoothstep';

            // Always use custom edge type if waypoints are present
            if (hasWaypoints) {
              edgeType = 'scxmlTransition';
            } else if (inSameContainer) {
              if (hasParallelEdges) {
                // Use custom edge type for parallel edges to support offset
                edgeType = 'scxmlTransition';
              } else {
                edgeType = 'smoothstep';
              }
            } else {
              if (hasParallelEdges) {
                // Use custom edge type for parallel edges to support offset
                edgeType = 'scxmlTransition';
              } else {
                edgeType = 'smart';
              }
            }

            let pathOptions: any = {};
            if (hasParallelEdges) {
              // Apply symmetrical offset for parallel edges
              // For 2 edges: first curves down (-offset), second curves up (+offset)
              // For 3+ edges: distribute symmetrically around center
              let offset: number;

              if (parallelEdges.length === 2) {
                // Simple case: one up, one down with same magnitude
                offset = edgeIndex === 0 ? -50 : 50;
              } else {
                // For 3+ edges: center the distribution
                offset = (edgeIndex - (parallelEdges.length - 1) / 2) * 60;
              }

              const labelOffsetY =
                (edgeIndex - (parallelEdges.length - 1) / 2) * 25;
              pathOptions = {
                offset,
                borderRadius: 20 + edgeIndex * 10,
                curvature: 0.25 + edgeIndex * 0.1,
                labelOffsetY,
              };
            }

            // Build label content with event and condition
            const getLabelContent = () => {
              const parts: string[] = [];
              if (edge.data?.event) parts.push(`${edge.data.event}`);
              if (edge.data?.condition) parts.push(`${edge.data.condition}`);
              if (edge.data?.actions?.length > 0)
                parts.push(
                  `/ ${edge.data.actions.length} action${
                    edge.data.actions.length > 1 ? 's' : ''
                  }`
                );
              return parts.join(' ');
            };

            const fullLabel = getLabelContent();
            const truncateLabel = (text: string, maxLength: number = 10) => {
              if (text.length <= maxLength) return text;
              return text.substring(0, maxLength) + '...';
            };

            const edgeUpdate: any = {
              ...edge,
              type: edgeType,
              label: truncateLabel(fullLabel),
              data: {
                ...edge.data,
                fullLabel,
                offset: pathOptions.offset,
                labelOffsetY: pathOptions.labelOffsetY,
                // Add waypoint handlers for interactive editing
                onWaypointDrag: handleWaypointDrag,
                onWaypointDragEnd: handleWaypointDragEnd,
                onWaypointDelete: handleWaypointDelete,
                onWaypointAdd: handleWaypointAdd,
              },
              pathOptions,

              style: {
                ...edge.style,
                strokeWidth: 2,
                zIndex: 1,
              },
              zIndex: 1,
              labelStyle: {
                fill: '#fff',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              },
              labelBgStyle: {
                fill: edge.labelBgStyle?.fill || '#3b82f6',
                fillOpacity: 0.95,
              },
              labelBgPadding: [6, 4] as [number, number],
              labelBgBorderRadius: 4,
              interactionWidth: 30,
            };

            if (edgeMetadata) {
              if (edgeMetadata.style?.stroke) {
                edgeUpdate.style = {
                  ...edgeUpdate.style,
                  stroke: edgeMetadata.style.stroke,
                  zIndex: 9999,
                };
                edgeUpdate.markerEnd.color = edgeMetadata.style.stroke;
              }

              if (edgeMetadata.style?.strokeWidth !== undefined) {
                edgeUpdate.style = {
                  ...edgeUpdate.style,
                  strokeWidth: edgeMetadata.style.strokeWidth,
                  zIndex: 9999,
                };
              }

              if (edgeMetadata.diagram) {
                // Only apply curve type if no waypoints exist
                // Waypoints always use scxmlTransition edge type for interactive handles
                if (edgeMetadata.diagram.curveType && !hasWaypoints) {
                  const curveTypeMap: Record<string, string> = {
                    smooth: 'smart',
                    step: 'smartStep',
                    straight: 'smartStraight',
                    bezier: 'smart',
                  };
                  edgeUpdate.type =
                    curveTypeMap[edgeMetadata.diagram.curveType] || 'smart';
                }

                if (
                  edgeMetadata.diagram.waypoints &&
                  edgeMetadata.diagram.waypoints.length > 0
                ) {
                  edgeUpdate.data = {
                    ...edgeUpdate.data,
                    waypoints: edgeMetadata.diagram.waypoints,
                  };
                  // Ensure edge type is scxmlTransition when waypoints are added from metadata
                  edgeUpdate.type = 'scxmlTransition';
                }
              }
            }
            return edgeUpdate;
          });

          // Only update state if component is still mounted
          if (isMounted) {
            setParsedData({
              nodes: enhancedNodes,
              edges: edgesWithMarkers,
              parser,
              metadataManager,
            });
          }
        } else {
          console.warn('SCXML parsing failed:', parseResult.errors);
          if (isMounted) {
            setParsedData({
              nodes: initialNodes,
              edges: initialEdges,
              parser: null,
              metadataManager: null,
            });
          }
        }
      } catch (error) {
        console.error('Error parsing SCXML for visual diagram:', error);
        if (isMounted) {
          setParsedData({
            nodes: initialNodes,
            edges: initialEdges,
            parser: null,
            metadataManager: null,
          });
        }
      }
    }

    parseAndConvert();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [
    scxmlContent,
    handleNodeLabelChange,
    handleNodeActionsChange,
    handleNodeStateTypeChange,
    handleNodeDelete,
    handleNodeResize,
  ]);

  // ==================== HIERARCHY NAVIGATION ====================
  const {
    filteredNodes,
    filteredEdges: hierarchyFilteredEdges,
    breadcrumbPath,
    canNavigateUp,
    navigateUp: originalNavigateUp,
    navigateToRoot: originalNavigateToRoot,
    navigateIntoState: originalNavigateIntoState,
    navigateToBreadcrumb: originalNavigateToBreadcrumb,
    currentParentNode,
    currentParentId,
  } = useHierarchyNavigation({
    allNodes: parsedData.nodes,
    allEdges: parsedData.edges,
  });

  // Update allNodesRef with original nodes (with parentId intact)
  allNodesRef.current = parsedData.nodes;

  const navigateWithFitView = useCallback(
    (navigationFn: () => void) => {
      navigationFn();
      setTimeout(() => {
        fitView({
          padding: 0.3,
          includeHiddenNodes: false,
          minZoom: 0.5,
          maxZoom: 2,
          duration: 800,
        });
      }, 50);
    },
    [fitView]
  );

  const navigateUp = useCallback(
    () => navigateWithFitView(originalNavigateUp),
    [navigateWithFitView, originalNavigateUp]
  );

  const navigateToRoot = useCallback(
    () => navigateWithFitView(originalNavigateToRoot),
    [navigateWithFitView, originalNavigateToRoot]
  );

  const navigateIntoState = useCallback(
    (stateId: string) =>
      navigateWithFitView(() => originalNavigateIntoState(stateId)),
    [navigateWithFitView, originalNavigateIntoState]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) =>
      navigateWithFitView(() => originalNavigateToBreadcrumb(index)),
    [navigateWithFitView, originalNavigateToBreadcrumb]
  );

  // ==================== ADD ROOT STATE HANDLER ====================
  const handleAddRootState = React.useCallback(() => {
    if (!onSCXMLChange || !scxmlContent) {
      console.error('Cannot add state: SCXML not available');
      return;
    }

    try {
      let newStateId = 'state_1';
      let counter = 1;
      const existingIds = new Set(parsedData.nodes.map((n) => n.id));
      while (existingIds.has(newStateId)) {
        counter++;
        newStateId = `state_${counter}`;
      }

      const parseResult = parserRef.current?.parse(scxmlContent);
      if (parseResult?.success && parseResult.data) {
        const scxmlDoc = parseResult.data;
        let parentId: string | undefined = undefined;

        // Only set parentId if we're inside a specific parent (hierarchy navigation)
        // Otherwise leave it undefined to add at true root level
        if (currentParentId) {
          parentId = currentParentId;
        }

        let x = 100;
        let y = 100;

        if (parentId) {
          const childNodes = nodes.length;

          if (childNodes) {
            const cols = 4;
            const rowHeight = 120;
            const colWidth = 200;

            const existingPositions = nodes.map((n) => ({
              col: Math.floor((n.position?.x || 0) / colWidth),
              row: Math.floor(((n.position?.y || 0) - 100) / rowHeight),
            }));

            let found = false;
            for (let row = 0; row < 10 && !found; row++) {
              for (let col = 0; col < cols && !found; col++) {
                const occupied = existingPositions.some(
                  (p) => p.col === col && p.row === row
                );
                if (!occupied) {
                  x = 50 + col * colWidth;
                  y = 100 + row * rowHeight;
                  found = true;
                }
              }
            }
          } else {
            x = 50;
            y = 100;
          }
        } else {
          const rootNodes = nodes.filter((n) => !n.parentId);
          if (rootNodes.length > 0) {
            const maxX = Math.max(...rootNodes.map((n) => n.position.x));
            x = maxX + 200;
          }
        }

        // Check if this will be the initial state (parent has no children)
        let isInitial = false;
        if (parentId) {
          const parentState = findStateById(scxmlDoc, parentId);
          if (parentState && !parentState.state) {
            isInitial = true;
          }
        }

        // Calculate dimensions using the NodeDimensionCalculator
        // This accounts for the "Initial" tag width when isInitial is true
        const dimensions = nodeDimensionCalculator.calculateDimensions(
          newStateId,
          'simple',
          0,
          0,
          isInitial
        );

        const newState = createStateElement(newStateId);
        (newState as any)[
          '@_viz:xywh'
        ] = `${x},${y},${dimensions.width},${dimensions.height}`;

        // Set the state as initial if it's the first child
        if (isInitial && parentId) {
          const parentState = findStateById(scxmlDoc, parentId);
          if (parentState) {
            parentState['@_initial'] = newStateId;
          }
        }

        addStateToDocument(scxmlDoc, newState, parentId);

        const updatedSCXML = parserRef.current!.serialize(scxmlDoc, true);
        onSCXMLChange(updatedSCXML, 'structure');

        setTimeout(() => {
          fitView({
            padding: 0.3,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
            duration: 600,
          });
        }, 200);
      }
    } catch (error) {
      console.error('Failed to add new state:', error);
    }
  }, [
    scxmlContent,
    onSCXMLChange,
    parsedData?.nodes,
    currentParentId,
    nodes,
    fitView,
  ]);

  // ==================== NODE ENHANCEMENTS ====================
  const nodeEnhancements = React.useMemo(() => {
    const enhancements = new Map();

    filteredNodes.forEach((node) => {
      const isActive = activeStates.has(node.id);
      const visualMetadata = metadataManagerRef.current?.getVisualMetadata(
        node.id
      );
      const updatedVisualStyles = computeVisualStyles(
        visualMetadata,
        node.data?.stateType || 'simple',
        isActive,
        false
      );

      enhancements.set(node.id, {
        data: {
          ...node.data,
          isActive,
          visualStyles: updatedVisualStyles,
          // Preserve all callback functions
          onNavigateInto: node.data?.onNavigateInto,
          onResize: node.data?.onResize,
          onLabelChange: node.data?.onLabelChange,
          onStateTypeChange: node.data?.onStateTypeChange,
          onActionsChange: node.data?.onActionsChange,
          onDelete: node.data?.onDelete,
        },
        style: {
          ...node.style,
        },
        // Sync React Flow's selected property with our activeStates
        selected: activeStates.has(node.id),
      });
    });

    return enhancements;
  }, [filteredNodes, activeStates]);

  const enhancedNodes = React.useMemo(() => {
    return filteredNodes.map((node) => {
      const enhancement = nodeEnhancements.get(node.id);
      return {
        ...node,
        data: enhancement ? enhancement.data : node.data,
        style: enhancement ? enhancement.style : node.style,
        selected: enhancement ? enhancement.selected : false,
      };
    });
  }, [filteredNodes, nodeEnhancements]);

  // ==================== EDGE FILTERING ====================
  const displayFilteredEdges = React.useMemo(() => {
    const applySelectionStyles = (edge: Edge) => {
      const isSelected = selectedTransitions.has(edge.id);
      if (isSelected) {
        const existingMarker = (edge.markerEnd as any) || {
          type: MarkerType.ArrowClosed,
          color: '#6b7280',
        };

        // Determine selection color based on edge type
        const selectionColor = edge.data?.condition ? '#ef4444' : '#3b82f6';
        return {
          ...edge,
          selected: true, // CRITICAL: This prop enables waypoint handles to show
          style: {
            ...edge.style,
            stroke: selectionColor,
            strokeWidth: 3,
            filter: 'drop-shadow(0 0 3px rgba(0, 0, 0, 0.3))',
          },
          animated: false,
          // markerEnd: {
          //   type: MarkerType.ArrowClosed,
          //   color: selectionColor,
          //   width: 20,
          //   height: 20,
          // },
          selectable: true,
          focusable: true,
        };
      }
      return {
        ...edge,
        selected: false,
        selectable: true,
        focusable: true,
      };
    };

    return hierarchyFilteredEdges
      .filter((edge) => true)
      .map((edge) => applySelectionStyles(edge));
  }, [hierarchyFilteredEdges, activeStates, selectedTransitions]);

  // ==================== EFFECTS ====================
  // Set node delete handler ref
  React.useEffect(() => {
    handleNodeDeleteRef.current = handleNodeDelete;
  }, [handleNodeDelete]);

  // Initialize nodes and edges when SCXML content changes or when enhanced nodes update
  React.useEffect(() => {
    const contentChanged = scxmlContent !== previousScxmlRef.current;

    if (contentChanged) {
      if (positionUpdateTimeoutRef.current) {
        clearTimeout(positionUpdateTimeoutRef.current);
        positionUpdateTimeoutRef.current = null;
      }
      lastPositionUpdateRef.current.clear();
      previousScxmlRef.current = scxmlContent;
    }

    // Always update nodes when:
    // 1. Coming from history (undo/redo), OR
    // 2. Not currently updating positions from a drag operation
    // This runs whenever enhancedNodes changes (which happens after parsing)
    if (
      (isUpdatingFromHistory || !isUpdatingPositionRef.current) &&
      enhancedNodes.length > 0
    ) {
      if (historyActionType === 'node-resize') {
        setNodes([]);
        setEdges([]);
      } else {
        setNodes(enhancedNodes);

        const selectableEdges = hierarchyFilteredEdges.map((edge) => ({
          ...edge,
          selectable: true,
          focusable: true,
        }));
        setEdges(selectableEdges);
      }
    }
  }, [
    scxmlContent,
    enhancedNodes,
    hierarchyFilteredEdges,
    setNodes,
    setEdges,
    isUpdatingFromHistory,
  ]);

  // Sync nodes with hierarchy navigation changes
  // This effect preserves node positions during hierarchy navigation,
  // but should NOT run when updating from history (undo/redo)
  React.useEffect(() => {
    // Skip this effect when updating from history - let the previous effect handle it
    if (isUpdatingFromHistory) {
      return;
    }

    setNodes((currentNodes) => {
      if (enhancedNodes.length === 0) {
        // Clear nodes when navigating into an empty state
        return [];
      }

      const currentPositions = new Map(
        currentNodes.map((node) => [node.id, node.position])
      );

      return enhancedNodes.map((node) => {
        const currentPosition = currentPositions.get(node.id);
        return {
          ...node,
          position: currentPosition || node.position,
        };
      });
    });
  }, [currentParentId, enhancedNodes, setNodes, isUpdatingFromHistory]);

  // Auto-fit view when hierarchy level changes
  React.useEffect(() => {
    if (filteredNodes.length > 0) {
      const timeoutId = setTimeout(() => {
        if (!isUpdatingPositionRef.current) {
          fitView({
            padding: 0.3,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
            duration: 800,
          });
        } else {
          const retryTimeoutId = setTimeout(() => {
            fitView({
              padding: 0.3,
              includeHiddenNodes: false,
              minZoom: 0.5,
              maxZoom: 2,
              duration: 800,
            });
          }, 300);
          return () => clearTimeout(retryTimeoutId);
        }
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [currentParentId, fitView, filteredNodes.length]);

  // Handle keyboard events for edge deletion
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && selectedTransitions.size > 0) {
        event.preventDefault();
        const edgeId = Array.from(selectedTransitions)[0];
        handleEdgesChange([{ id: edgeId, type: 'remove' }]);
      }
      if (event.key === 'Delete' && activeStates.size > 0) {
        event.preventDefault();
        const stateId = Array.from(activeStates);
        handleNodesChange(stateId.map((id) => ({ id, type: 'remove' })));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTransitions, handleEdgesChange, activeStates, handleNodesChange]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (positionUpdateTimeoutRef.current) {
        clearTimeout(positionUpdateTimeoutRef.current);
      }
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);
  // ==================== RENDER ====================
  return (
    <div className='h-full w-full bg-gray-50 flex flex-col relative'>
      {/* Edge hover tooltip */}
      {hoveredEdge && (
        <div
          className='fixed z-[10000] pointer-events-none'
          style={{
            left: hoveredEdge.x + 10,
            top: hoveredEdge.y + 10,
          }}
        >
          <div className='bg-gray-900 text-white text-xs px-3 py-2 rounded-md shadow-lg max-w-xs break-words'>
            {hoveredEdge.fullLabel}
          </div>
        </div>
      )}

      {/* Hierarchy Navigation Controls */}
      <div className='flex items-center gap-2 px-4 py-2 bg-white border-b shadow-sm'>
        <div className='flex items-center gap-1 flex-1'>
          {breadcrumbPath.map((path, index) => (
            <React.Fragment key={index}>
              <button
                onClick={() => navigateToBreadcrumb(index)}
                className={`px-2 py-1 text-sm hover:bg-gray-100 rounded transition-colors ${
                  index === breadcrumbPath.length - 1
                    ? 'font-semibold text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {path}
              </button>
              {index < breadcrumbPath.length - 1 && (
                <ChevronRight className='h-3 w-3 text-gray-400' />
              )}
            </React.Fragment>
          ))}
        </div>

        {currentParentNode && (
          <div className='text-sm text-gray-600 ml-auto'>
            Level: {breadcrumbPath.length - 1}
          </div>
        )}
      </div>

      {/* Transition Label Editor - Overlays the diagram */}
      {selectedEdgeForEdit && (
        <div className='absolute top-[49px] left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 bg-blue-50 border-b shadow-md'>
          <span className='text-sm font-medium text-gray-700'>
            Edit Transition:
          </span>
          <input
            type='text'
            value={selectedEdgeForEdit.rawValue || ''}
            onChange={(e) => {
              const newValue = e.target.value;
              setSelectedEdgeForEdit({
                ...selectedEdgeForEdit,
                rawValue: newValue,
              });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const newLabel = selectedEdgeForEdit.rawValue || '';
                if (newLabel) {
                  handleTransitionLabelChange(
                    selectedEdgeForEdit.source,
                    selectedEdgeForEdit.target,
                    selectedEdgeForEdit.event,
                    selectedEdgeForEdit.cond,
                    newLabel,
                    selectedEdgeForEdit.editingField,
                    selectedEdgeForEdit.id
                  );
                }
                setSelectedEdgeForEdit(null);
                setSelectedTransitions(new Set());
              } else if (e.key === 'Escape') {
                setSelectedEdgeForEdit(null);
                setSelectedTransitions(new Set());
              }
            }}
            className='flex-1 px-3 py-1.5 text-sm text-gray-800 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            placeholder={
              selectedEdgeForEdit.editingField === 'cond'
                ? 'Enter condition'
                : 'Enter event'
            }
            autoFocus
          />
          <button
            onClick={() => {
              setSelectedEdgeForEdit(null);
              setSelectedTransitions(new Set());
            }}
            className='text-sm text-gray-600 hover:text-gray-900 px-2'
          >
            Cancel
          </button>
        </div>
      )}

      {/* State Actions Editor (onentry/onexit with assign) - Overlays the diagram */}
      {selectedStateForActions && (
        <div className='absolute top-[49px] left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 bg-green-50 border-b shadow-md'>
          <span className='text-xs font-medium text-gray-700'>
            Edit onentry for {selectedStateForActions.id}:
          </span>

          {selectedStateForActions.entryActions.length === 0 ? (
            <button
              onClick={() => {
                setSelectedStateForActions({
                  ...selectedStateForActions,
                  entryActions: [{ location: '', expr: '' }],
                });
              }}
              className='text-xs text-green-600 hover:text-green-800 font-medium px-2 py-1 border border-green-300 rounded hover:bg-green-100'
            >
              + Add Assign
            </button>
          ) : (
            <>
              <input
                type='text'
                value={selectedStateForActions.entryActions[0].location}
                onChange={(e) => {
                  const updated = [...selectedStateForActions.entryActions];
                  updated[0] = { ...updated[0], location: e.target.value };
                  setSelectedStateForActions({
                    ...selectedStateForActions,
                    entryActions: updated,
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const entryActions = selectedStateForActions.entryActions
                      .filter((a) => a.location || a.expr)
                      .map((a) => `assign|${a.location}|${a.expr}`);
                    const exitActions = selectedStateForActions.exitActions
                      .filter((a) => a.location || a.expr)
                      .map((a) => `assign|${a.location}|${a.expr}`);
                    handleNodeActionsChange(
                      selectedStateForActions.id,
                      entryActions,
                      exitActions
                    );
                    setSelectedStateForActions(null);
                    setActiveStates(new Set());
                  } else if (e.key === 'Escape') {
                    setSelectedStateForActions(null);
                    setActiveStates(new Set());
                  }
                }}
                className='w-32 px-2 py-1 text-xs border text-gray-800 border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500'
                placeholder='location'
              />
              <input
                type='text'
                value={selectedStateForActions.entryActions[0].expr}
                onChange={(e) => {
                  const updated = [...selectedStateForActions.entryActions];
                  updated[0] = { ...updated[0], expr: e.target.value };
                  setSelectedStateForActions({
                    ...selectedStateForActions,
                    entryActions: updated,
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const entryActions = selectedStateForActions.entryActions
                      .filter((a) => a.location || a.expr)
                      .map((a) => `assign|${a.location}|${a.expr}`);
                    const exitActions = selectedStateForActions.exitActions
                      .filter((a) => a.location || a.expr)
                      .map((a) => `assign|${a.location}|${a.expr}`);
                    handleNodeActionsChange(
                      selectedStateForActions.id,
                      entryActions,
                      exitActions
                    );
                    setSelectedStateForActions(null);
                    setActiveStates(new Set());
                  } else if (e.key === 'Escape') {
                    setSelectedStateForActions(null);
                    setActiveStates(new Set());
                  }
                }}
                className='flex-1 px-2 py-1 text-xs border text-gray-800 border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500'
                placeholder='expr'
              />
              <button
                onClick={() => {
                  // Convert back to action format and save
                  const entryActions = selectedStateForActions.entryActions
                    .filter((a) => a.location || a.expr)
                    .map((a) => `assign|${a.location}|${a.expr}`);
                  const exitActions = selectedStateForActions.exitActions
                    .filter((a) => a.location || a.expr)
                    .map((a) => `assign|${a.location}|${a.expr}`);

                  handleNodeActionsChange(
                    selectedStateForActions.id,
                    entryActions,
                    exitActions
                  );
                  setSelectedStateForActions(null);
                  setActiveStates(new Set());
                }}
                className='px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700'
              >
                Save
              </button>
            </>
          )}

          <button
            onClick={() => {
              setSelectedStateForActions(null);
              setActiveStates(new Set());
            }}
            className='text-xs text-gray-600 hover:text-gray-900 ml-auto'
          >
            Cancel
          </button>
        </div>
      )}

      <div className='flex-1'>
        <ReactFlow
          nodes={nodes}
          edges={displayFilteredEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onNodeClick={(event, node) => handleStateClick(node.id, event)}
          onNodeDoubleClick={(event, node) => {
            // Double-click on node should trigger label editing
            event.stopPropagation();
            const nodeElement = nodes.find((n) => n.id === node.id);
            if (nodeElement?.data?.onLabelChange) {
              // Trigger label editing by updating node data
              setNodes((nds) =>
                nds.map((n) => {
                  if (n.id === node.id) {
                    return {
                      ...n,
                      data: {
                        ...n.data,
                        isEditing: true,
                      },
                    };
                  }
                  return n;
                })
              );
            }
          }}
          onEdgeClick={handleEdgeClick}
          onEdgeMouseEnter={handleEdgeMouseEnter}
          onEdgeMouseLeave={handleEdgeMouseLeave}
          onPaneClick={() => {
            setSelectedEdgeForEdit(null);
            setSelectedTransitions(new Set());
            setSelectedStateForActions(null);
            setActiveStates(new Set());
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView={true}
          fitViewOptions={{
            padding: 0.3,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
          }}
          attributionPosition='bottom-left'
          className='bg-gradient-to-br from-slate-50 to-slate-100'
          minZoom={0.2}
          maxZoom={4}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          nodesDraggable={true}
          nodesConnectable={true}
          elementsSelectable={true}
          deleteKeyCode={['Delete']}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={2}
          reconnectRadius={20}
          edgesUpdatable={true}
          edgesFocusable={true}
          elevateEdgesOnSelect={true}
          elevateNodesOnSelect={false}
          zoomOnScroll={true}
          zoomOnPinch={true}
          panOnScroll={false}
          panOnDrag={true}
          zoomOnDoubleClick={false}
        >
          {/* Global SVG definitions for arrows */}
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs>
              <marker
                id='arrow-marker'
                viewBox='0 0 20 20'
                refX='20'
                refY='10'
                markerWidth='10'
                markerHeight='10'
                orient='auto'
              >
                <path d='M 2 2 L 18 10 L 2 18 L 7 10 Z' fill='currentColor' />
              </marker>
              <marker
                id='arrow-marker-selected'
                viewBox='0 0 20 20'
                refX='20'
                refY='10'
                markerWidth='12'
                markerHeight='12'
                orient='auto'
              >
                <path d='M 2 2 L 18 10 L 2 18 L 7 10 Z' fill='#3b82f6' />
              </marker>
            </defs>
          </svg>
          <Background
            color='#cbd5e1'
            gap={20}
            size={1}
            variant={BackgroundVariant.Dots}
          />
          <Controls
            position='bottom-left'
            showZoom={true}
            showFitView={true}
            showInteractive={true}
          >
            <ControlButton
              onClick={handleAddRootState}
              title='Add State'
              aria-label='Add State'
              className='text-gray-600 hover:text-gray-900'
            >
              S
            </ControlButton>
          </Controls>
          <MiniMap
            position='bottom-right'
            nodeStrokeColor='#64748b'
            nodeColor='#f8fafc'
            nodeBorderRadius={12}
            maskColor='rgba(0, 0, 0, 0.05)'
            className='bg-white/90 border border-slate-200 rounded-lg shadow-sm'
          />
        </ReactFlow>
      </div>
    </div>
  );
};

// ==================== EXPORT WRAPPER ====================
export const VisualDiagram: React.FC<VisualDiagramProps> = (props) => {
  return (
    <ReactFlowProvider>
      <VisualDiagramInner {...props} />
    </ReactFlowProvider>
  );
};
