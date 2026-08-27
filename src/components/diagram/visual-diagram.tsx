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
  cloneStateSubtreeWithFreshIds,
  rewriteOrDropTransitions,
  detachStateFromParent,
  isDescendantOf,
} from '@/lib/utils/scxml-manipulation-utils';
import {
  checkNewConnectionSlotConflict,
  checkTransitionEditSlotConflict,
} from '@/lib/utils/transition-slot-rules';
import { resolveFocusTarget } from '@/lib/utils/resolve-focus-target';
import { computeVisualStyles } from '@/lib/utils/visual-style-utils';
import {
  ALWAYS_TRANSITION_COLOR,
  EVENT_TRANSITION_COLOR,
  getTransitionColor,
} from '@/lib/consts/transition-colors';
import { ActionType } from '@/types/history';
import type { SCXMLDocument, StateElement, TransitionElement } from '@/types/scxml';
import { useStateClipboardStore } from '@/stores/state-clipboard-store';
import { MultiSelectToolbar } from './multi-select-toolbar';
import {
  SmartBezierEdge,
  SmartStepEdge,
  SmartStraightEdge,
} from '@tisoap/react-flow-smart-edge';
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
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { isNoteId, VISUAL_METADATA_CONSTANTS } from '@/types/visual-metadata';
import { SCXMLTransitionEdge } from './edges/scxml-transition-edge';
import { HistoryWrapperNode } from './nodes/history-wrapper-node';
import { SCXMLStateNode } from './nodes/scxml-state-node';
import { StickyNoteNode } from './nodes/sticky-note-node';
import { StateActionsPanel } from '@/components/ui/state-actions-panel';
import { TransitionPanel, type TransitionApplyArgs, type TransitionApplyResult } from './transition-panel';
import { InitialGroupConflictBanner } from './initial-group-conflict-banner';
import { useIsDark } from '@/lib/theme/use-is-dark';
import { usePanelStore } from '@/stores/panel-store';
import { useEditorStore } from '@/stores/editor-store';
import { buildInitialChildByParent } from '@/lib/utils/hierarchy-initial-info';
import { findTimeEventToken, resolveTimeEventDisplay } from '@/lib/utils/time-transition';
import {
  wouldMergeDistinctGroups,
  isMarkedInitial,
  wouldConflictIfMarkedInitial,
} from '@/lib/utils/initial-group-utils';

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
  scxmlNote: StickyNoteNode,
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
  const updateNodeInternals = useUpdateNodeInternals();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  // Set right before setNodes(enhancedNodes) on a full re-parse; consumed by
  // the effect below once that `nodes` update actually commits. Deliberately
  // NOT set by ordinary drag/onNodesChange updates, which also change
  // `nodes` continuously — calling updateNodeInternals on every node on
  // every drag frame would be wasteful and janky.
  const pendingNodeInternalsUpdateRef = React.useRef(false);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // UI State
  const [activeStates, setActiveStates] = React.useState<Set<string>>(
    new Set()
  );
  const [selectedTransitions, setSelectedTransitions] = React.useState<
    Set<string>
  >(new Set());

  // Drag-to-nest state: the node currently being hovered over as a valid
  // reparent target, and the set of node ids being dragged together.
  const [dropTargetId, setDropTargetId] = React.useState<string | null>(null);
  const draggingNodeIdsRef = React.useRef<string[]>([]);

  // Un-nest drop zone: a fixed "Back to parent" control (rendered only while
  // drilled into a state) that lets a drag pull the dragged node(s) back out
  // to the grandparent level. Tracked separately from dropTargetId because
  // the zone is a screen-space DOM element, not a flow-space node.
  const [isOverUnnestZone, setIsOverUnnestZone] = React.useState(false);
  const unnestZoneRef = React.useRef<HTMLDivElement>(null);

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
  const { activePanel, setActivePanel } = usePanelStore();

  const [connectionBlockedMessage, setConnectionBlockedMessage] = React.useState<string | null>(null);

  // React-flow's default wheelDelta only boosts pinch-zoom (ctrlKey wheel
  // events) on macOS, leaving pinch zoom on Windows using the tiny raw
  // deltaY the trackpad reports. We only target Windows, so drop that
  // check and boost pinch zoom the same way scroll zoom is boosted.
  const d3ZoomInstance = useStore((s) => s.d3Zoom);
  React.useEffect(() => {
    if (!d3ZoomInstance) return;
    d3ZoomInstance.wheelDelta((event: WheelEvent) => {
      const factor = event.ctrlKey ? 10 : 1;
      return (
        -event.deltaY *
        (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002) *
        factor
      );
    });
  }, [d3ZoomInstance]);

  React.useEffect(() => {
    if (!connectionBlockedMessage) return;
    const timer = setTimeout(() => setConnectionBlockedMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [connectionBlockedMessage]);

  const [selectedEdgeForEdit, setSelectedEdgeForEdit] = React.useState<{
    id: string;
    source: string;
    target: string;
    event?: string;
    cond?: string;
  } | null>(null);

  // State for editing onentry/onexit actions
  type ParsedAssignRow = { type: 'assign'; location: string; expr: string };
  type ParsedSendRow   = { type: 'send'; event: string; delayType: 'delay' | 'delayexpr'; delayValue: string };
  type ParsedCancelRow = { type: 'cancel'; sendid: string };
  type ParsedActionRow = ParsedAssignRow | ParsedSendRow | ParsedCancelRow;

  const [selectedStateForActions, setSelectedStateForActions] = React.useState<{
    id: string;
    entryActions: ParsedActionRow[];
    exitActions: ParsedActionRow[];
    internalEventActions: Array<{ event: string; location: string; expr: string; type: 'internal' | 'external' }>;
    stateType: 'simple' | 'compound' | 'parallel' | 'final';
    isInitial: boolean;
    canMarkInitial: boolean;
  } | null>(null);

  // Dark mode tracking for canvas theming
  const canvasDark = useIsDark();

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

  const handleTransitionApply = React.useCallback(
    ({ newValue, editingField, delay, cancelSendId, originalEventName, originalCancelSendId }: TransitionApplyArgs): TransitionApplyResult => {
      if (!onSCXMLChange || !scxmlContent || !selectedEdgeForEdit) return;
      try {
        // Pre-check: block if this edit would create a duplicate slot or an invalid
        // event+cond-both transition, instead of applying it. UpdateTransitionCommand
        // always clears the field NOT being edited, so the candidate is unambiguous.
        if (parserRef.current) {
          const preCheck = parserRef.current.parse(scxmlContent);
          if (preCheck.success && preCheck.data) {
            const { parseTransitionIndexFromEdgeId } = require('@/lib/converters/converter-modules');
            const transitionIndex = parseTransitionIndexFromEdgeId(selectedEdgeForEdit.id);
            const candidate: TransitionElement =
              editingField === 'cond'
                ? { '@_cond': newValue, '@_target': selectedEdgeForEdit.target }
                : editingField === 'event'
                  ? { '@_event': newValue, '@_target': selectedEdgeForEdit.target }
                  : { '@_target': selectedEdgeForEdit.target };
            const slotCheck = checkTransitionEditSlotConflict(
              preCheck.data,
              selectedEdgeForEdit.source,
              transitionIndex,
              candidate
            );
            if (slotCheck.blocked) {
              return { blocked: true, reason: slotCheck.reason };
            }
          }
        }

        let content = scxmlContent;

        // Step 1: apply transition event/cond update
        const { UpdateTransitionCommand } = require('@/lib/commands');
        const { parseTransitionIndexFromEdgeId } = require('@/lib/converters/converter-modules');
        const transitionIndex = parseTransitionIndexFromEdgeId(selectedEdgeForEdit.id);
        const transResult = new UpdateTransitionCommand(
          selectedEdgeForEdit.source,
          selectedEdgeForEdit.target,
          selectedEdgeForEdit.event,
          selectedEdgeForEdit.cond,
          newValue,
          editingField,
          transitionIndex
        ).execute(content);
        if (transResult.success) content = transResult.newContent;
        else console.error('Failed to update transition:', transResult.error);

        // Step 2: apply delay/cancel actions on the already-updated content
        // Runs in event mode (add/remove), when switching to cond (cleanup old send/cancel),
        // and when clearing to eventless (cleanup old send/cancel; a no-op when there was no delay)
        if (editingField === 'event' || editingField === 'none' || (editingField === 'cond' && originalEventName)) {
          const sourceNodeId = selectedEdgeForEdit.source;
          const sourceNode = nodes.find((n) => n.id === sourceNodeId);
          if (sourceNode) {
            const existingEntry: string[] = sourceNode.data.entryActions ?? [];
            const existingExit: string[] = sourceNode.data.exitActions ?? [];

            // Remove send for the original OR new time-event sendId, then add back if delay is
            // set. Keyed by cancelSendId/originalCancelSendId (the actual _t_ event name) rather
            // than newValue/originalEventName, since those may be a comma-merged @_event list
            // when the time event is merged with a plain event sharing target/cond/actions —
            // delay and cancelSendId are always both-set or both-null together (TransitionApplyArgs).
            const newEntry = [
              ...existingEntry.filter((a) => {
                if (cancelSendId && a.startsWith(`send|${cancelSendId}|`)) return false;
                if (originalCancelSendId && a.startsWith(`send|${originalCancelSendId}|`)) return false;
                return true;
              }),
              ...(delay && cancelSendId ? [`send|${cancelSendId}|${delay.type}|${delay.value}`] : []),
            ];

            // Remove old cancel by original sendId and by new sendId, then add back if set
            const newExit = [
              ...existingExit.filter((a) => {
                if (originalCancelSendId && a === `cancel|${originalCancelSendId}`) return false;
                if (cancelSendId && a === `cancel|${cancelSendId}`) return false;
                return true;
              }),
              ...(cancelSendId ? [`cancel|${cancelSendId}`] : []),
            ];

            const entryChanged = JSON.stringify(newEntry) !== JSON.stringify(existingEntry);
            const exitChanged = JSON.stringify(newExit) !== JSON.stringify(existingExit);
            if (entryChanged || exitChanged) {
              const { UpdateActionsCommand } = require('@/lib/commands');
              const actResult = new UpdateActionsCommand(sourceNodeId, newEntry, newExit).execute(content);
              if (actResult.success) content = actResult.newContent;
              else console.error('Failed to update actions:', actResult.error);
            }
          }
        }

        onSCXMLChange(content, 'property');
      } catch (error) {
        console.error('Failed to apply transition:', error);
      }
    },
    [scxmlContent, onSCXMLChange, selectedEdgeForEdit, nodes]
  );

  const handleNodeInternalEventsChange = React.useCallback(
    (nodeId: string, actions: Array<{ event: string; location: string; expr: string; type: 'internal' | 'external' }>) => {
      if (!onSCXMLChange || !scxmlContent) return;
      try {
        const { UpdateInternalEventsCommand } = require('@/lib/commands');
        const command = new UpdateInternalEventsCommand(nodeId, actions);
        const result = command.execute(scxmlContent);
        if (result.success) {
          onSCXMLChange(result.newContent, 'property');
        } else {
          console.error('Failed to update internal event reactions:', result.error);
        }
      } catch (error) {
        console.error('Failed to update internal event reactions:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  const handleToggleInitialState = React.useCallback(
    (stateId: string) => {
      if (!onSCXMLChange || !scxmlContent) return;
      try {
        const { ToggleInitialStateCommand } = require('@/lib/commands');
        const command = new ToggleInitialStateCommand(stateId);
        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'structure');
          setSelectedStateForActions((prev) => {
            if (!prev || prev.id !== stateId || !parserRef.current) return prev;
            const parseResult = parserRef.current.parse(result.newContent);
            if (!parseResult.success || !parseResult.data) return prev;
            return {
              ...prev,
              isInitial: isMarkedInitial(parseResult.data, stateId),
              canMarkInitial: !wouldConflictIfMarkedInitial(parseResult.data, stateId).blocked,
            };
          });
        } else {
          console.error('Failed to toggle initial state:', result.error);
          setConnectionBlockedMessage(result.error || 'Failed to toggle Initial State.');
        }
      } catch (error) {
        console.error('Failed to toggle initial state:', error);
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
        const { DeleteNodeCommand, DeleteNoteCommand } = require('@/lib/commands');

        // Notes and states live in different elements; route each to its command
        const allIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
        const noteIds = allIds.filter((id) => isNoteId(id));
        const stateIds = allIds.filter((id) => !isNoteId(id));

        let content = scxmlContent;

        if (stateIds.length > 0) {
          const result = new DeleteNodeCommand(stateIds).execute(content);
          if (!result.success) {
            console.error('Failed to delete node:', result.error);
            return;
          }
          content = result.newContent;
        }

        if (noteIds.length > 0) {
          const result = new DeleteNoteCommand(noteIds).execute(content);
          if (!result.success) {
            console.error('Failed to delete note:', result.error);
            return;
          }
          content = result.newContent;
        }

        if (content !== scxmlContent) {
          onSCXMLChange(content, 'structure');
          setActiveStates(new Set());
        }
      } catch (error) {
        console.error('Failed to delete node:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  // ==================== NOTE HANDLERS ====================
  const handleNoteTextChange = React.useCallback(
    (noteId: string, newText: string) => {
      if (!onSCXMLChange || !scxmlContent) return;

      try {
        const { UpdateNoteTextCommand } = require('@/lib/commands');
        const command = new UpdateNoteTextCommand(noteId, newText);

        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'property');
        } else {
          console.error('Failed to update note text:', result.error);
        }
      } catch (error) {
        console.error('Failed to update note text:', error);
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

  const handleNewChannel = React.useCallback(
    (
      channelName: string,
      source: string,
      target: string,
      originalEvent: string | undefined,
      originalCond: string | undefined,
      editingField: 'event' | 'cond',
      edgeId: string
    ) => {
      if (!onSCXMLChange || !scxmlContent) return;
      try {
        const { AddDataCommand, UpdateTransitionCommand } = require('@/lib/commands');
        const { parseTransitionIndexFromEdgeId } = require('@/lib/converters/converter-modules');

        // Step 1: insert <data> element
        const addResult = new AddDataCommand(channelName).execute(scxmlContent);
        const base = addResult.success ? addResult.newContent : scxmlContent;

        // Step 2: update the transition cond/event on the already-modified content
        const transitionIndex = parseTransitionIndexFromEdgeId(edgeId);
        const updateResult = new UpdateTransitionCommand(
          source, target, originalEvent, originalCond,
          channelName, editingField, transitionIndex
        ).execute(base);

        if (updateResult.success) {
          onSCXMLChange(updateResult.newContent, 'structure');
        } else {
          console.error('Failed to update transition after adding channel:', updateResult.error);
        }
      } catch (error) {
        console.error('Failed to add channel:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );

  const handleNewChannelForStateActions = React.useCallback(
    (
      channelName: string,
      apply:
        | { kind: 'actions'; entryActions: string[]; exitActions: string[] }
        | { kind: 'reactions'; actions: Array<{ event: string; location: string; expr: string; type: 'internal' | 'external' }> }
    ) => {
      if (!onSCXMLChange || !scxmlContent || !selectedStateForActions) return;
      try {
        const { AddDataCommand, UpdateActionsCommand, UpdateInternalEventsCommand } = require('@/lib/commands');

        // Step 1: insert the data element for the new channel
        const addResult = new AddDataCommand(channelName).execute(scxmlContent);
        const base = addResult.success ? addResult.newContent : scxmlContent;

        // Step 2: apply the actions/reactions change on the already-patched content
        const stateId = selectedStateForActions.id;
        const result = apply.kind === 'actions'
          ? new UpdateActionsCommand(stateId, apply.entryActions, apply.exitActions).execute(base)
          : new UpdateInternalEventsCommand(stateId, apply.actions).execute(base);

        if (result.success) {
          onSCXMLChange(result.newContent, 'structure');
        } else {
          console.error('Failed to update state actions after adding channel:', result.error);
        }
      } catch (error) {
        console.error('Failed to add channel:', error);
      }
    },
    [scxmlContent, onSCXMLChange, selectedStateForActions]
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

              let updatedSCXML = parserRef.current.serialize(scxmlDoc, true);

              // Clean up send/cancel actions on the source state for deleted _t_ time-transition edges.
              // The edge's event may be a comma-merged list (a time event merged with a plain event
              // sharing the same target/cond/actions), so the actual send/cancel key is extracted
              // from within it rather than assumed to be the whole event string.
              for (const change of deleteChanges) {
                const deletedEdge = edges.find((e) => e.id === change.id);
                if (!deletedEdge) continue;
                const eventName = findTimeEventToken(deletedEdge.data?.event);
                if (!eventName) continue;

                const sourceNode = nodes.find((n) => n.id === deletedEdge.source);
                if (!sourceNode) continue;

                const entryActions: string[] = sourceNode.data.entryActions ?? [];
                const exitActions: string[] = sourceNode.data.exitActions ?? [];
                const newEntry = entryActions.filter((a) => !a.startsWith(`send|${eventName}|`));
                const newExit = exitActions.filter((a) => a !== `cancel|${eventName}`);

                if (newEntry.length !== entryActions.length || newExit.length !== exitActions.length) {
                  const { UpdateActionsCommand } = require('@/lib/commands');
                  const result = new UpdateActionsCommand(deletedEdge.source, newEntry, newExit).execute(updatedSCXML);
                  if (result.success) updatedSCXML = result.newContent;
                }
              }

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
      if (params.source && params.target && parserRef.current && scxmlContent) {
        const preCheck = parserRef.current.parse(scxmlContent);
        if (preCheck.success && preCheck.data) {
          const { blocked, reason } = wouldMergeDistinctGroups(
            preCheck.data,
            params.source,
            params.target
          );
          if (blocked) {
            setConnectionBlockedMessage(
              reason || 'Cannot connect states that belong to different Initial State groups.'
            );
            return;
          }

          const slotCheck = checkNewConnectionSlotConflict(preCheck.data, params.source, params.target);
          if (slotCheck.blocked) {
            setConnectionBlockedMessage(slotCheck.reason || 'Cannot add this transition.');
            return;
          }
        }
      }

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
          event: undefined,
          condition: undefined,
          actions: [],
          sourceHandle: sourceHandle,
          targetHandle: targetHandle,
        },
        style: {
          strokeWidth: 2,
          zIndex: 1,
          stroke: ALWAYS_TRANSITION_COLOR,
        },
        zIndex: 1,
        animated: false,
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
                undefined, // No event — eventless by default
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

  // Set for the duration of a drag on an existing edge's endpoint (onReconnectStart ->
  // onReconnectEnd), so isValidConnection can tell "moving this edge's own handle" apart
  // from "drawing a brand new connection" — otherwise the transition being dragged shows
  // up as its own conflicting duplicate in the same-target slot check below, since it's
  // still present, untouched, in the parsed scxmlContent at validation time.
  const reconnectingEdgeRef = React.useRef<Edge | null>(null);

  const onReconnectStart = useCallback((_event: unknown, edge: Edge) => {
    reconnectingEdgeRef.current = edge;
  }, []);

  const onReconnectEnd = useCallback(() => {
    reconnectingEdgeRef.current = null;
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return true;
      if (!parserRef.current || !scxmlContent) return true;
      const parseResult = parserRef.current.parse(scxmlContent);
      if (!parseResult.success || !parseResult.data) return true;

      const { blocked, reason } = wouldMergeDistinctGroups(
        parseResult.data,
        connection.source,
        connection.target
      );
      if (blocked) {
        // ReactFlow never calls onConnect for a connection isValidConnection
        // rejects, so this is the only place a warning can be surfaced —
        // fires live while dragging (on hover) and again on drop.
        setConnectionBlockedMessage(
          reason || 'Cannot connect states that belong to different Initial State groups.'
        );
        return false;
      }

      const reconnecting = reconnectingEdgeRef.current;
      const { parseTransitionIndexFromEdgeId } = require('@/lib/converters/converter-modules');
      const slotCheck =
        reconnecting && reconnecting.source === connection.source
          ? checkTransitionEditSlotConflict(
              parseResult.data,
              connection.source,
              parseTransitionIndexFromEdgeId(reconnecting.id),
              {
                '@_event': reconnecting.data?.event,
                '@_cond': reconnecting.data?.condition,
                '@_target': connection.target,
              }
            )
          : checkNewConnectionSlotConflict(parseResult.data, connection.source, connection.target);
      if (slotCheck.blocked) {
        setConnectionBlockedMessage(slotCheck.reason || 'Cannot add this transition.');
        return false;
      }
      return true;
    },
    [scxmlContent]
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
    (stateId: string, event?: React.MouseEvent, nodeType?: string) => {
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
                // (notes are annotations - they select but have no actions panel)
                const node = nodes.find((n) => n.id === stateId);
                if (node && node.data && nodeType !== 'scxmlNote') {
                  const parseActions = (actions: string[]): ParsedActionRow[] => {
                    return actions.flatMap((a): ParsedActionRow[] => {
                      if (a.startsWith('assign|')) {
                        const parts = a.split('|');
                        return [{ type: 'assign', location: parts[1] || '', expr: parts[2] || '' }];
                      }
                      if (a.startsWith('send|')) {
                        const parts = a.split('|');
                        const event = parts[1] || '';
                        const delayType = (parts[2] === 'delayexpr' ? 'delayexpr' : 'delay') as 'delay' | 'delayexpr';
                        const delayValue = parts.slice(3).join('|');
                        return [{ type: 'send', event, delayType, delayValue }];
                      }
                      if (a.startsWith('cancel|')) {
                        const parts = a.split('|');
                        return [{ type: 'cancel', sendid: parts[1] || '' }];
                      }
                      return [];
                    });
                  };

                  let isInitialFlag = false;
                  let canMarkFlag = true;
                  if (parserRef.current && scxmlContent) {
                    const parseResult = parserRef.current.parse(scxmlContent);
                    if (parseResult.success && parseResult.data) {
                      isInitialFlag = isMarkedInitial(parseResult.data, stateId);
                      canMarkFlag = !wouldConflictIfMarkedInitial(parseResult.data, stateId).blocked;
                    }
                  }

                  setSelectedEdgeForEdit(null);
                  setSelectedTransitions(new Set());
                  setActivePanel('stateActions');
                  setSelectedStateForActions({
                    id: stateId,
                    entryActions: parseActions(node.data.entryActions || []),
                    exitActions: parseActions(node.data.exitActions || []),
                    internalEventActions: node.data.internalEventActions || [],
                    stateType: node.data.stateType,
                    isInitial: isInitialFlag,
                    canMarkInitial: canMarkFlag,
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
    [nodes, scxmlContent]
  );

  // ==================== MARQUEE (CTRL/CMD+DRAG) SELECTION HANDLER ====================
  // Triggered via selectionKeyCode={['Control', 'Meta']} on <ReactFlow> below.
  // React Flow only fires onSelectionStart for a mousedown that targets the
  // Pane background itself (not a node) — so this ref is a reliable "a real
  // marquee drag began" flag. onSelectionEnd, by contrast, fires on ANY
  // mouseup while the selection key is held, even if the mousedown was on a
  // node — so handleSelectionEnd must check this ref before acting, or a
  // Ctrl/Cmd+click on a node self-cancels handleStateClick's deferred click
  // logic.
  const marqueeStartedRef = React.useRef(false);

  // Root DOM element React Flow renders (`.react-flow`, the direct child of
  // this wrapper div) is `overflow: hidden` but still a valid scroll
  // container. Clicking a control button inside it (e.g. "Add State") keeps
  // browser focus on that button; the resulting re-render/relayout then
  // trips the browser's native "scroll focused element into view" behavior,
  // permanently setting a nonzero scrollTop on `.react-flow` even though it
  // has no visible scrollbar. That scroll offset silently shifts every
  // descendant absolutely-positioned relative to it — including
  // `.react-flow__pane`, which React Flow's own pane-background mousedown
  // hit-testing (used by the Ctrl/Cmd+drag marquee) depends on being aligned
  // with the visible canvas. Left uncorrected, the marquee's drop-in
  // computations run against the wrong coordinates and silently select
  // nothing. Force it back to 0 whenever it drifts.
  const reactFlowWrapperRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const wrapper = reactFlowWrapperRef.current;
    if (!wrapper) return;
    const flowRoot = wrapper.querySelector<HTMLDivElement>('.react-flow');
    if (!flowRoot) return;

    const resetScroll = () => {
      if (flowRoot.scrollTop !== 0 || flowRoot.scrollLeft !== 0) {
        flowRoot.scrollTop = 0;
        flowRoot.scrollLeft = 0;
        window.dispatchEvent(new Event('resize'));
      }
    };

    flowRoot.addEventListener('scroll', resetScroll);
    return () => flowRoot.removeEventListener('scroll', resetScroll);
  }, []);

  const handleSelectionStart = useCallback(() => {
    marqueeStartedRef.current = true;
  }, []);

  // Cleanup once the marquee gesture ends. The actual selection itself is
  // now applied incrementally in handleNodesChange below, as React Flow
  // reports 'select'-type changes during the drag — see the comment there
  // for why reading getNodes().selected here doesn't work.
  const handleSelectionEnd = useCallback(() => {
    if (!marqueeStartedRef.current) return;
    marqueeStartedRef.current = false;
    setSelectedStateForActions(null);
  }, []);

  // ==================== REACTFLOW NODE CHANGE HANDLER ====================
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // React Flow's own box-select implementation (Pane's onMouseMove, in
      // @reactflow/core) does NOT mutate node.selected internally for a
      // controlled `nodes` prop — it computes the newly (de)selected ids and
      // calls onNodesChange with 'select'-type changes, exactly like this
      // handler receives here, EXPECTING the consumer to apply them (this is
      // the only pathway that ever sets .selected in this app's controlled
      // setup). The unconditional filter below intentionally discards
      // 'select' changes everywhere else (Ctrl/Cmd+click multi-select is
      // driven entirely by activeStates, not React Flow's native selection),
      // but that means marquee-select can never mark anything selected
      // unless we specifically consume its 'select' changes here — gated on
      // marqueeStartedRef so an ordinary node click's own 'select' change
      // (already handled by handleStateClick) isn't double-applied.
      if (marqueeStartedRef.current) {
        const selectChanges = changes.filter((c) => c.type === 'select');
        if (selectChanges.length > 0) {
          setActiveStates((prev) => {
            const next = new Set(prev);
            selectChanges.forEach((c) => {
              if (isNoteId(c.id)) return;
              if (c.selected) {
                next.add(c.id);
              } else {
                next.delete(c.id);
              }
            });
            return next;
          });
        }
      }

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
        (change) =>
          change.type === 'position' &&
          change.dragging === false &&
          !justReparentedIdsRef.current.has(change.id)
      );
      justReparentedIdsRef.current = new Set();

      if (dragEndChanges.length === 0) {
        return;
      }

      // Only process nodes that were actually dragged (mouse) or moved via
      // keyboard (ReactFlow's built-in arrow-key nudging never sets
      // dragging: true, so it would otherwise be dropped here as "just a
      // click" and the moved node would snap back to its stale SCXML
      // position the next time something re-syncs from the source of truth,
      // e.g. selecting another node).
      const positionChanges = dragEndChanges.filter((change) => {
        if (isDraggingRef.current.has(change.id)) {
          return true;
        }
        const currentNode = nodes.find((n) => n.id === change.id);
        if (!currentNode?.position || !change.position) {
          return false;
        }
        return (
          Math.abs(currentNode.position.x - change.position.x) >= 1 ||
          Math.abs(currentNode.position.y - change.position.y) >= 1
        );
      });

      if (positionChanges.length === 0) {
        // This was a click, not a drag or keyboard move - don't update SCXML
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
          setSelectedStateForActions(null);
          setActiveStates(new Set());
          setActivePanel('transition');
          setSelectedEdgeForEdit({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            event: edge.data?.event,
            cond: edge.data?.condition,
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
            // Notes keep the converter's position and fixed size; they only
            // need delete and text-edit callbacks (no visual styles, resize
            // or label wiring)
            if (node.type === 'scxmlNote') {
              return {
                ...node,
                data: {
                  ...node.data,
                  onDelete: () => handleNodeDelete(node.id),
                  onTextChange: (newText: string) =>
                    handleNoteTextChange(node.id, newText),
                },
              };
            }

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

            // The stored width can go stale for reasons other than resizing
            // (renaming to a longer id, adding the "Initial" badge), leaving
            // it too narrow for what's now rendered inside — never let it
            // shrink content below its calculated minimum; only ever widen
            // up from the stored value, so an intentional manual widening
            // (NodeResizer) isn't clobbered back down to the minimum.
            const effectiveVizWidth = vizWidth
              ? Math.max(
                  vizWidth,
                  nodeDimensionCalculator.calculateWidth(
                    node.id,
                    nodeUpdate.data?.stateType || 'simple',
                    Boolean(nodeUpdate.data?.isInitial)
                  )
                )
              : vizWidth;

            // Set dimensions at multiple levels for React Flow compatibility
            nodeUpdate.width =
              effectiveVizWidth ?? nodeUpdate.width ?? nodeUpdate.style?.width;
            nodeUpdate.height =
              vizHeight ?? nodeUpdate.height ?? nodeUpdate.style?.height;

            nodeUpdate.style = {
              ...nodeUpdate.style,
              width: effectiveVizWidth ?? nodeUpdate.style?.width,
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
                  : effectiveVizWidth ?? nodeUpdate.style?.width,
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

          // Group by the physical pair of connection points (node+handle), not by
          // direction, so the curvature/offset fan-out below applies whenever two edges
          // share the same two anchor points — including an A→B / B→A pair that landed
          // on the same mirrored handle slot — not just literal duplicate (source,
          // target, sourceHandle, targetHandle) tuples. Edges distributed onto genuinely
          // different sides during handle assignment won't share a key and are left alone.
          const edgeSlotKey = (edge: Edge) =>
            [`${edge.source}:${edge.sourceHandle}`, `${edge.target}:${edge.targetHandle}`]
              .sort()
              .join('|');

          const edgeGroups = new Map<string, any[]>();
          edges.forEach((edge) => {
            const key = edgeSlotKey(edge);
            if (!edgeGroups.has(key)) {
              edgeGroups.set(key, []);
            }
            edgeGroups.get(key)!.push(edge);
          });


          const edgesWithMarkers = edges.map((edge) => {
            const edgeMetadata = metadataManager.getVisualMetadata(edge.id);
            const edgeKey = edgeSlotKey(edge);
            const parallelEdges = edgeGroups.get(edgeKey) || [];
            const edgeIndex = parallelEdges.findIndex((e) => e.id === edge.id);
            const hasParallelEdges = parallelEdges.length > 1;
            const hasWaypoints =
              edge.data?.waypoints && edge.data.waypoints.length > 0;

            const edgeType = 'scxmlTransition';

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

              // The path bows perpendicular to its connection axis (left/right for a
              // vertical top/bottom connection, up/down for a horizontal left/right
              // connection). Horizontal connections separate their labels along that
              // same bow axis (Y). Vertical connections bow left/right too, but two
              // stacked nodes leave little horizontal room — an X spread isn't wide
              // enough to clear a label pill, so those labels stack vertically (Y)
              // instead, regardless of the path's own bow direction.
              const isVerticalConnection =
                edge.sourceHandle === 'top' || edge.sourceHandle === 'bottom';
              const labelSpread =
                (edgeIndex - (parallelEdges.length - 1) / 2) *
                (isVerticalConnection ? 24 : 25);

              pathOptions = {
                offset,
                borderRadius: 20 + edgeIndex * 10,
                curvature: 0.25 + edgeIndex * 0.1,
                labelOffsetX: 0,
                labelOffsetY: labelSpread,
              };
            }

            // For time-transition edges, reconstruct the "after X" display string
            // from the source node's send action so the label shows "after 2s" not the raw event name.
            // edgeEventName may be a comma-merged list (event-merge combines a time event with a
            // plain event sharing the same target/cond/actions), so each token is resolved on its
            // own rather than matching the whole string against a single send action.
            const edgeEventName = edge.data?.event;
            const displayEvent = (() => {
              if (!edgeEventName) return undefined;
              const sourceNode = nodes.find((n) => n.id === edge.source);
              const entryActions: string[] = sourceNode?.data.entryActions ?? [];
              const resolved = resolveTimeEventDisplay(edgeEventName, (token) =>
                entryActions.find((a) => a.startsWith(`send|${token}|`))
              );
              return resolved === edgeEventName ? undefined : resolved;
            })();

            const fullLabel = [
              displayEvent ?? edge.data?.event,
              edge.data?.condition,
              edge.data?.actions?.length > 0
                ? `/ ${edge.data.actions.length} action${edge.data.actions.length > 1 ? 's' : ''}`
                : null,
            ]
              .filter(Boolean)
              .join(' ');

            const edgeUpdate: any = {
              ...edge,
              type: edgeType,
              label: undefined,
              data: {
                ...edge.data,
                fullLabel,
                displayEvent,
                offset: pathOptions.offset,
                labelOffsetX: pathOptions.labelOffsetX,
                labelOffsetY: pathOptions.labelOffsetY,
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
    handleNoteTextChange,
  ]);

  // ==================== HIERARCHY NAVIGATION ====================
  const {
    filteredNodes,
    filteredEdges: hierarchyFilteredEdges,
    canNavigateUp,
    navigateUp: originalNavigateUp,
    navigateToRoot: originalNavigateToRoot,
    navigateIntoState: originalNavigateIntoState,
    currentParentId,
  } = useHierarchyNavigation({
    allNodes: parsedData.nodes,
    allEdges: parsedData.edges,
  });

  // Update allNodesRef with original nodes (with parentId intact)
  allNodesRef.current = parsedData.nodes;

  // The parent of the state we're currently drilled into, if any — the
  // un-nest drop zone's target when un-nesting a child of currentParentId.
  const grandparentId = React.useMemo(() => {
    if (!currentParentId) return undefined;
    const parentNode = parsedData.nodes.find((n) => n.id === currentParentId);
    return parentNode?.parentId;
  }, [currentParentId, parsedData.nodes]);

  // Keep the hierarchy index panel's tooltip data (editor-store) in sync
  // with the current node set, so it works from the toolbar without that
  // component needing direct access to the diagram's node graph.
  const setInitialChildByParent = useEditorStore((state) => state.setInitialChildByParent);
  React.useEffect(() => {
    setInitialChildByParent(buildInitialChildByParent(parsedData.nodes));
  }, [parsedData.nodes, setInitialChildByParent]);

  const focusTarget = useEditorStore((state) => state.focusTarget);
  const setFocusTarget = useEditorStore((state) => state.setFocusTarget);

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

    navigateWithFitView(() => {
      originalNavigateToRoot();
      resolution.ancestorIds.forEach((ancestorId) => originalNavigateIntoState(ancestorId));
    });
    setSelectedTransitions(new Set());
    setActiveStates(resolution.highlightIds);
    setFocusTarget(null);
  }, [
    focusTarget,
    navigateWithFitView,
    originalNavigateToRoot,
    originalNavigateIntoState,
    setFocusTarget,
  ]);

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

  // ==================== COPY / PASTE SELECTION HANDLERS ====================
  const lastPastedClipboardRef = React.useRef<StateElement[] | null>(null);
  const pasteOffsetMultiplierRef = React.useRef(1);

  const handleCopySelection = useCallback(() => {
    if (!scxmlContent || activeStates.size === 0) return;
    const parseResult = parserRef.current?.parse(scxmlContent);
    if (!parseResult?.success || !parseResult.data) return;

    const clones: StateElement[] = [];
    activeStates.forEach((id) => {
      const found = findStateById(parseResult.data as SCXMLDocument, id);
      if (found) clones.push(JSON.parse(JSON.stringify(found)));
    });
    if (clones.length > 0) {
      useStateClipboardStore.getState().copy(clones);
    }
  }, [scxmlContent, activeStates]);

  const handlePasteClipboard = useCallback(() => {
    const copied = useStateClipboardStore.getState().copied;
    if (!copied || copied.length === 0 || !onSCXMLChange || !scxmlContent) return;

    if (copied !== lastPastedClipboardRef.current) {
      lastPastedClipboardRef.current = copied;
      pasteOffsetMultiplierRef.current = 1;
    } else {
      pasteOffsetMultiplierRef.current += 1;
    }
    const offset = 40 * pasteOffsetMultiplierRef.current;

    const parseResult = parserRef.current?.parse(scxmlContent);
    if (!parseResult?.success || !parseResult.data) return;
    const scxmlDoc = parseResult.data as SCXMLDocument;

    const existingIds = new Set(parsedData.nodes.map((n) => n.id));
    const combinedIdMap = new Map<string, string>();
    const clones: StateElement[] = [];

    copied.forEach((state) => {
      const { clone, idMap } = cloneStateSubtreeWithFreshIds(state, existingIds, offset, offset);
      idMap.forEach((newId, oldId) => combinedIdMap.set(oldId, newId));
      clones.push(clone);
    });

    clones.forEach((clone) => {
      rewriteOrDropTransitions(clone, combinedIdMap);
      addStateToDocument(scxmlDoc, clone, currentParentId ?? undefined);
    });

    const updatedSCXML = parserRef.current!.serialize(scxmlDoc, true);
    onSCXMLChange(updatedSCXML, 'structure');
    setActiveStates(new Set(clones.map((c) => c['@_id'])));
  }, [scxmlContent, onSCXMLChange, parsedData?.nodes, currentParentId]);

  // ==================== DRAG-TO-NEST ====================
  const handleReparent = useCallback(
    (stateIds: string[], targetParentId: string | undefined) => {
      if (!onSCXMLChange || !scxmlContent) return;
      const parseResult = parserRef.current?.parse(scxmlContent);
      if (!parseResult?.success || !parseResult.data) return;
      const scxmlDoc = parseResult.data as SCXMLDocument;

      let changed = false;
      stateIds.forEach((id) => {
        if (id === targetParentId) return;
        if (targetParentId && isDescendantOf(scxmlDoc, targetParentId, id)) return;
        const detached = detachStateFromParent(scxmlDoc, id);
        if (!detached) return;
        addStateToDocument(scxmlDoc, detached, targetParentId);
        changed = true;

        if (targetParentId) {
          const newParent = findStateById(scxmlDoc, targetParentId);
          if (newParent && !newParent['@_initial'] && newParent.state) {
            const children = Array.isArray(newParent.state) ? newParent.state : [newParent.state];
            if (children.length === 1) {
              newParent['@_initial'] = children[0]['@_id'];
            }
          }
        }
      });

      if (!changed) return;
      const updatedSCXML = parserRef.current!.serialize(scxmlDoc, true);
      onSCXMLChange(updatedSCXML, 'structure');
      setActiveStates(new Set());
    },
    [scxmlContent, onSCXMLChange]
  );

  const rectsOverlap = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node, draggedNodes: Node[]) => {
      draggingNodeIdsRef.current = (draggedNodes.length > 0 ? draggedNodes : [node]).map((n) => n.id);
    },
    []
  );

  // React Flow drags a multi-node selection via a SEPARATE overlay element
  // (`.react-flow__nodesselection-rect`, shown once 2+ nodes are selected)
  // rather than through any individual node — that overlay fires its own
  // onSelectionDragStart/onSelectionDrag/onSelectionDragStop props, distinct
  // from onNodeDragStart/onNodeDrag/onNodeDragStop. Without wiring those too,
  // dragging a marquee-selected group silently does nothing on the first
  // attempt (the mousedown lands on the overlay, not a node, so none of the
  // onNodeDrag* handlers below ever fire) until the selection is lost some
  // other way and a subsequent drag happens to target a single node instead.
  // Both paths share the same drop-target detection, factored out here.
  const computeDropTarget = useCallback(
    (
      event: React.MouseEvent,
      draggedRect: { x: number; y: number; width: number; height: number }
    ) => {
      if (currentParentId && unnestZoneRef.current) {
        const zoneRect = unnestZoneRef.current.getBoundingClientRect();
        const overZone =
          event.clientX >= zoneRect.left &&
          event.clientX <= zoneRect.right &&
          event.clientY >= zoneRect.top &&
          event.clientY <= zoneRect.bottom;
        setIsOverUnnestZone(overZone);
        if (overZone) {
          setDropTargetId(null);
          return;
        }
      } else {
        setIsOverUnnestZone(false);
      }

      const candidate = nodes.find((n) => {
        if (draggingNodeIdsRef.current.includes(n.id) || isNoteId(n.id)) return false;
        const rect = { x: n.position.x, y: n.position.y, width: n.width || 120, height: n.height || 60 };
        return rectsOverlap(draggedRect, rect);
      });

      if (!candidate || !scxmlContent) {
        setDropTargetId((prev) => (prev === null ? prev : null));
        return;
      }

      const parseResult = parserRef.current?.parse(scxmlContent);
      if (!parseResult?.success || !parseResult.data) {
        setDropTargetId(null);
        return;
      }
      const scxmlDoc = parseResult.data as SCXMLDocument;
      const invalid =
        candidate.type !== 'scxmlState' ||
        draggingNodeIdsRef.current.includes(candidate.id) ||
        draggingNodeIdsRef.current.some((id) => isDescendantOf(scxmlDoc, candidate.id, id));

      setDropTargetId(invalid ? null : candidate.id);
    },
    [nodes, scxmlContent, currentParentId]
  );

  const handleNodeDrag = useCallback(
    (event: React.MouseEvent, node: Node) => {
      computeDropTarget(event, {
        x: node.position.x,
        y: node.position.y,
        width: node.width || 120,
        height: node.height || 60,
      });
    },
    [computeDropTarget]
  );

  const handleSelectionDragStart = useCallback(
    (_event: React.MouseEvent, draggedNodes: Node[]) => {
      draggingNodeIdsRef.current = draggedNodes.map((n) => n.id);
    },
    []
  );

  const handleSelectionDrag = useCallback(
    (event: React.MouseEvent, draggedNodes: Node[]) => {
      if (draggedNodes.length === 0) return;
      const lefts = draggedNodes.map((n) => n.position.x);
      const tops = draggedNodes.map((n) => n.position.y);
      const rights = draggedNodes.map((n) => n.position.x + (n.width || 120));
      const bottoms = draggedNodes.map((n) => n.position.y + (n.height || 60));
      const left = Math.min(...lefts);
      const top = Math.min(...tops);
      computeDropTarget(event, {
        x: left,
        y: top,
        width: Math.max(...rights) - left,
        height: Math.max(...bottoms) - top,
      });
    },
    [computeDropTarget]
  );

  const justReparentedIdsRef = React.useRef<Set<string>>(new Set());

  const handleNodeDragStop = useCallback(() => {
    if (isOverUnnestZone && currentParentId) {
      justReparentedIdsRef.current = new Set(draggingNodeIdsRef.current);
      handleReparent(draggingNodeIdsRef.current, grandparentId);
    } else if (dropTargetId) {
      justReparentedIdsRef.current = new Set(draggingNodeIdsRef.current);
      handleReparent(draggingNodeIdsRef.current, dropTargetId);
    }
    setDropTargetId(null);
    setIsOverUnnestZone(false);
    draggingNodeIdsRef.current = [];
  }, [dropTargetId, isOverUnnestZone, currentParentId, grandparentId, handleReparent]);

  const handleAddNote = React.useCallback(() => {
    if (!onSCXMLChange || !scxmlContent) {
      console.error('Cannot add note: SCXML not available');
      return;
    }

    try {
      const noteId = `${VISUAL_METADATA_CONSTANTS.NOTE.ID_PREFIX}${uuidv4().slice(0, 8)}`;

      // Place to the right of nodes already visible at the current
      // hierarchy level (root, or whichever state we've navigated into).
      // `nodes` only ever holds the currently displayed level's nodes.
      let x = 100;
      let y = 100;
      if (nodes.length > 0) {
        const maxX = Math.max(
          ...nodes.map((n) => n.position.x + (n.width || 160))
        );
        x = maxX + 100;
      }

      const { AddNoteCommand } = require('@/lib/commands');
      // currentParentId is set when the user has drilled into a state; the
      // note is stored as a child of that state so it only appears there.
      const command = new AddNoteCommand(
        noteId,
        x,
        y,
        '',
        currentParentId || undefined
      );
      const result = command.execute(scxmlContent);

      if (result.success) {
        onSCXMLChange(result.newContent, 'structure');

        setTimeout(() => {
          fitView({
            padding: 0.3,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
            duration: 600,
          });
        }, 200);
      } else {
        console.error('Failed to add note:', result.error);
      }
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  }, [scxmlContent, onSCXMLChange, nodes, fitView, currentParentId]);

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
          onTextChange: node.data?.onTextChange,
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
        const selectionColor = getTransitionColor(edge.data?.condition, edge.data?.event);
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
    // 1. Coming from history (undo/redo) — unconditional, even if a node
    //    drag happens to be in flight (mouse still down): an undo/redo must
    //    never be silently dropped waiting for a drag to end, since nothing
    //    re-triggers this effect once draggingNodeIdsRef (a plain ref, not a
    //    reactive dependency) later empties out. OR
    // 2. Not currently updating positions from a drag operation, AND no node
    //    drag gesture is in progress (mouse still down, tracked via
    //    draggingNodeIdsRef — see drag-to-nest below): enhancedNodes' positions
    //    come from parsedData (the last-committed SCXML), not the live drag
    //    position, so firing this effect mid-drag for a non-history reason
    //    (e.g. a drop-target highlight change) would snap the dragged node(s)
    //    back to their pre-drag position while the user is still dragging.
    //    (The drop-target highlight itself is applied via a separate,
    //    position-preserving effect further below, specifically to avoid
    //    routing through this resync.)
    // This runs whenever enhancedNodes changes (which happens after parsing).
    if (
      (isUpdatingFromHistory ||
        (!isUpdatingPositionRef.current && draggingNodeIdsRef.current.length === 0)) &&
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

        // Node dimensions can change as a side effect of a full re-parse
        // (e.g. the "Initial" badge resizing a node, or a label edit
        // changing its calculated width) without going through the
        // interactive NodeResizer drag path — the only case ReactFlow
        // automatically re-measures handle positions for. Without this,
        // edges render against stale handle coordinates and visually
        // disconnect from the node. Flag it for the effect below, which
        // fires once this nodes update has actually committed and painted.
        pendingNodeInternalsUpdateRef.current = true;
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

  // Reflect the current drag-to-nest drop target directly onto the live
  // `nodes` state's `data.isDropTarget`, deliberately NOT routed through
  // nodeEnhancements/enhancedNodes above: that path feeds the resync effect
  // just above, which replaces node positions from parsedData (the last
  // COMMITTED SCXML) — firing that mid-drag would snap the actively-dragged
  // node back to its pre-drag position on every hover-target change, since
  // parsedData doesn't reflect the live, uncommitted drag position. This
  // effect instead uses the functional setNodes form, which always starts
  // from the latest live node state (including in-flight drag positions),
  // and only ever touches the `isDropTarget` field.
  React.useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        const isDropTarget = n.id === dropTargetId;
        if (Boolean((n.data as any)?.isDropTarget) === isDropTarget) {
          return n;
        }
        changed = true;
        return { ...n, data: { ...n.data, isDropTarget } };
      });
      return changed ? next : nds;
    });
  }, [dropTargetId, setNodes]);

  // Runs strictly after the `nodes` state update above has committed and
  // React has painted the new (possibly resized) node — see the flag's
  // comment at its declaration for why this doesn't run on every drag frame.
  React.useEffect(() => {
    if (!pendingNodeInternalsUpdateRef.current) return;
    pendingNodeInternalsUpdateRef.current = false;
    nodes.forEach((node) => updateNodeInternals(node.id));
  }, [nodes, updateNodeInternals]);

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
      if (event.key === 'Delete' && !activePanel && selectedTransitions.size > 0) {
        event.preventDefault();
        const edgeId = Array.from(selectedTransitions)[0];
        handleEdgesChange([{ id: edgeId, type: 'remove' }]);
      }
      if (event.key === 'Delete' && !activePanel && activeStates.size > 0) {
        event.preventDefault();
        const stateId = Array.from(activeStates);
        handleNodesChange(stateId.map((id) => ({ id, type: 'remove' })));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTransitions, handleEdgesChange, activeStates, handleNodesChange]);

  // Handle Ctrl/Cmd+C / Ctrl/Cmd+V for copy/paste of selected states
  React.useEffect(() => {
    const isTextInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
    };

    const handleCopyPasteKeys = (event: KeyboardEvent) => {
      if (isTextInputFocused()) return;
      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod) return;

      if (event.key === 'c' && activeStates.size > 0) {
        event.preventDefault();
        handleCopySelection();
      } else if (event.key === 'v') {
        event.preventDefault();
        handlePasteClipboard();
      }
    };

    window.addEventListener('keydown', handleCopyPasteKeys);
    return () => window.removeEventListener('keydown', handleCopyPasteKeys);
  }, [activeStates, handleCopySelection, handlePasteClipboard]);

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
    <div className='h-full w-full flex'>
      {/* Diagram area */}
      <div className='flex-1 bg-base flex flex-col relative overflow-hidden'>
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

        <div ref={reactFlowWrapperRef} className='flex-1 relative'>
          <ReactFlow
            nodes={nodes}
            edges={displayFilteredEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onNodeClick={(event, node) =>
              handleStateClick(node.id, event, node.type)
            }
            onSelectionStart={handleSelectionStart}
            onSelectionEnd={handleSelectionEnd}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onSelectionDragStart={handleSelectionDragStart}
            onSelectionDrag={handleSelectionDrag}
            onSelectionDragStop={handleNodeDragStop}
            onNodeDoubleClick={(event, node) => {
              event.stopPropagation();
              const nodeElement = nodes.find((n) => n.id === node.id);
              if (
                nodeElement?.data?.onLabelChange ||
                nodeElement?.type === 'scxmlNote'
              ) {
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
              setActivePanel(null);
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
            className='bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950'
            minZoom={0.2}
            maxZoom={4}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            deleteKeyCode={activePanel === 'validation' ? [] : ['Delete']}
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
            selectionKeyCode={['Control', 'Meta']}
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
                  <path d='M 2 2 L 18 10 L 2 18 L 7 10 Z' fill={EVENT_TRANSITION_COLOR} />
                </marker>
              </defs>
            </svg>
            <Background
              color={canvasDark ? '#3f3f46' : '#cbd5e1'}
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
                className='text-muted hover:text-default'
              >
                S
              </ControlButton>
              <ControlButton
                onClick={handleAddNote}
                title='Add Note'
                aria-label='Add Note'
                className='text-muted hover:text-default'
              >
                N
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
            {currentParentId && (
              <Panel position='top-left'>
                <div
                  ref={unnestZoneRef}
                  className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-xs shadow-sm transition-colors ${
                    isOverUnnestZone
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'border-default bg-elevated text-muted'
                  }`}
                >
                  ↑ Back to parent
                </div>
              </Panel>
            )}
          </ReactFlow>
          <InitialGroupConflictBanner
            message={connectionBlockedMessage}
            onDismiss={() => setConnectionBlockedMessage(null)}
          />
          {activeStates.size >= 2 && (
            <MultiSelectToolbar
              count={activeStates.size}
              onCopy={handleCopySelection}
              onDelete={() => {
                const ids = Array.from(activeStates);
                handleNodesChange(ids.map((id) => ({ id, type: 'remove' })));
              }}
            />
          )}
        </div>
      </div>

      {/* Transition panel */}
      {selectedEdgeForEdit && activePanel === 'transition' && (
        <TransitionPanel
          key={selectedEdgeForEdit.id}
          edgeId={selectedEdgeForEdit.id}
          source={selectedEdgeForEdit.source}
          target={selectedEdgeForEdit.target}
          event={selectedEdgeForEdit.event}
          cond={selectedEdgeForEdit.cond}
          scxmlContent={scxmlContent}
          entryActions={nodes.find((n) => n.id === selectedEdgeForEdit.source)?.data.entryActions ?? []}
          exitActions={nodes.find((n) => n.id === selectedEdgeForEdit.source)?.data.exitActions ?? []}
          onApply={handleTransitionApply}
          onNewChannel={handleNewChannel}
          onClose={() => {
            setSelectedEdgeForEdit(null);
            setSelectedTransitions(new Set());
            setActivePanel(null);
          }}
        />
      )}

      {/* State Actions side panel */}
      <StateActionsPanel
        isVisible={selectedStateForActions !== null && activePanel === 'stateActions'}
        onClose={() => {
          setSelectedStateForActions(null);
          setActiveStates(new Set());
          setActivePanel(null);
        }}
        stateId={selectedStateForActions?.id ?? ''}
        entryActions={selectedStateForActions?.entryActions ?? []}
        exitActions={selectedStateForActions?.exitActions ?? []}
        internalEventActions={selectedStateForActions?.internalEventActions ?? []}
        scxmlContent={scxmlContent}
        stateType={selectedStateForActions?.stateType ?? 'simple'}
        isInitial={selectedStateForActions?.isInitial ?? false}
        canMarkInitial={selectedStateForActions?.canMarkInitial ?? true}
        onToggleInitial={() => {
          if (selectedStateForActions) {
            handleToggleInitialState(selectedStateForActions.id);
          }
        }}
        onApply={(entryActions, exitActions) => {
          if (selectedStateForActions) {
            handleNodeActionsChange(
              selectedStateForActions.id,
              entryActions,
              exitActions,
            );
          }
        }}
        onApplyReactions={(actions) => {
          if (selectedStateForActions) {
            handleNodeInternalEventsChange(selectedStateForActions.id, actions);
          }
        }}
        onNewChannel={handleNewChannelForStateActions}
      />
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
