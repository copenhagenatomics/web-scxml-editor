import { useHistoryStore } from '@/stores/history-store';
import type { ActionType, HistoryMetadata } from '@/types/history';

export class HistoryManager {
  private static instance: HistoryManager;
  private debounceTimer: NodeJS.Timeout | null = null;
  private nodePositionDebounceTimer: NodeJS.Timeout | null = null;
  private nodeResizeDebounceTimer: NodeJS.Timeout | null = null;
  private lastContent: string = '';
  private pendingTextChanges: string[] = [];
  private textEditStartTime: number = 0;
  private nodePositionStartTime: number = 0;
  private nodeResizeStartTime: number = 0;
  private pendingNodeMove: { content: string; nodeId?: string } | null = null;
  private pendingNodeResize: { content: string; nodeId?: string } | null = null;

  private constructor() {}

  static getInstance(): HistoryManager {
    if (!HistoryManager.instance) {
      HistoryManager.instance = new HistoryManager();
    }
    return HistoryManager.instance;
  }

  /**
   * Initialize history with initial content
   */
  initialize(content: string, description: string = 'Initial state') {
    const store = useHistoryStore.getState();
    store.clear();

    if (content) {
      store.pushEntry({
        actionType: 'file-load',
        description,
        content,
      });
    }

    this.lastContent = content;
  }

  /**
   * Track a text edit with debouncing
   */
  trackTextEdit(
    content: string,
    metadata?: HistoryMetadata,
    debounceMs: number = 500
  ) {
    const store = useHistoryStore.getState();

    // If this is the first text edit in a series, record the start time
    if (!this.debounceTimer) {
      this.textEditStartTime = Date.now();
    }

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Store pending content
    this.pendingTextChanges.push(content);

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      const duration = Date.now() - this.textEditStartTime;
      const changeCount = this.pendingTextChanges.length;

      // Create description based on the nature of changes
      let description = 'Text edit';
      if (changeCount > 10) {
        description = `Multiple text edits (${Math.round(duration / 1000)}s)`;
      } else if (changeCount > 1) {
        description = `Text edits`;
      }

      store.pushEntry({
        actionType: 'text-edit',
        description,
        content: this.pendingTextChanges[this.pendingTextChanges.length - 1],
        metadata,
      });

      this.lastContent = content;
      this.pendingTextChanges = [];
      this.debounceTimer = null;
      this.textEditStartTime = 0;
    }, debounceMs);
  }

  /**
   * Track an immediate action (no debouncing)
   */
  trackAction(
    actionType: ActionType,
    content: string,
    description: string,
    metadata?: HistoryMetadata
  ) {
    // Cancel any pending text edits
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.pendingTextChanges = [];
    }

    // Cancel any pending node moves
    if (this.nodePositionDebounceTimer) {
      clearTimeout(this.nodePositionDebounceTimer);
      this.nodePositionDebounceTimer = null;
      this.pendingNodeMove = null;
    }

    // Cancel any pending node resizes
    if (this.nodeResizeDebounceTimer) {
      clearTimeout(this.nodeResizeDebounceTimer);
      this.nodeResizeDebounceTimer = null;
      this.pendingNodeResize = null;
    }

    const store = useHistoryStore.getState();
    store.pushEntry({
      actionType,
      description,
      content,
      metadata,
    });

    this.lastContent = content;
  }

  /**
   * Track a visual diagram change with intelligent detection
   */
  trackDiagramChange(
    content: string,
    metadata?: HistoryMetadata,
    hint?: 'position' | 'structure' | 'property' | 'resize'
  ) {
    // If hint suggests this is a position change, use debouncing
    if (hint === 'position') {
      this.trackNodeMove('unknown', content, metadata);
      return;
    }

    // If hint suggests this is a resize change, use debouncing with node-resize action type
    if (hint === 'resize') {
      this.trackNodeResize('unknown', content, metadata);
      return;
    }

    // Otherwise track as immediate change
    const description = hint === 'structure'
      ? 'Diagram structure change'
      : hint === 'property'
      ? 'Node property change'
      : 'Visual diagram change';

    this.trackAction('bulk-change', content, description, metadata);
  }

  /**
   * Track a node operation
   */
  trackNodeOperation(
    operation: 'add' | 'delete' | 'move' | 'update',
    nodeId: string,
    content: string,
    metadata?: HistoryMetadata
  ) {
    // For move operations, use debouncing
    if (operation === 'move') {
      this.trackNodeMove(nodeId, content, metadata);
      return;
    }

    const actionType: ActionType = `node-${operation}` as ActionType;
    const description = `${operation.charAt(0).toUpperCase() + operation.slice(1)} node ${nodeId}`;

    this.trackAction(actionType, content, description, metadata);
  }

  /**
   * Track node movement with debouncing
   */
  trackNodeMove(nodeId: string, content: string, metadata?: HistoryMetadata, debounceMs: number = 300) {
    const store = useHistoryStore.getState();

    // If this is the first move in a series, record the start time
    if (!this.nodePositionDebounceTimer) {
      this.nodePositionStartTime = Date.now();
    }

    // Clear existing timer
    if (this.nodePositionDebounceTimer) {
      clearTimeout(this.nodePositionDebounceTimer);
    }

    // Store pending move
    this.pendingNodeMove = { content, nodeId };

    // Set new timer
    this.nodePositionDebounceTimer = setTimeout(() => {
      if (this.pendingNodeMove) {
        store.pushEntry({
          actionType: 'node-move',
          description: `Move node ${nodeId}`,
          content: this.pendingNodeMove.content,
          metadata,
        });

        this.lastContent = this.pendingNodeMove.content;
        this.pendingNodeMove = null;
      }

      this.nodePositionDebounceTimer = null;
      this.nodePositionStartTime = 0;
    }, debounceMs);
  }

  /**
   * Track node resize with debouncing
   */
  trackNodeResize(nodeId: string, content: string, metadata?: HistoryMetadata, debounceMs: number = 300) {
    const store = useHistoryStore.getState();

    // If this is the first resize in a series, record the start time
    if (!this.nodeResizeDebounceTimer) {
      this.nodeResizeStartTime = Date.now();
    }

    // Clear existing timer
    if (this.nodeResizeDebounceTimer) {
      clearTimeout(this.nodeResizeDebounceTimer);
    }

    // Store pending resize
    this.pendingNodeResize = { content, nodeId };

    // Set new timer
    this.nodeResizeDebounceTimer = setTimeout(() => {
      if (this.pendingNodeResize) {
        store.pushEntry({
          actionType: 'node-resize',
          description: `Resize node ${nodeId}`,
          content: this.pendingNodeResize.content,
          metadata,
        });

        this.lastContent = this.pendingNodeResize.content;
        this.pendingNodeResize = null;
      }

      this.nodeResizeDebounceTimer = null;
      this.nodeResizeStartTime = 0;
    }, debounceMs);
  }

  /**
   * Track an edge operation
   */
  trackEdgeOperation(
    operation: 'add' | 'delete' | 'update',
    edgeId: string,
    content: string,
    metadata?: HistoryMetadata
  ) {
    const actionType: ActionType = `edge-${operation}` as ActionType;
    const description = `${operation.charAt(0).toUpperCase() + operation.slice(1)} transition ${edgeId}`;

    this.trackAction(actionType, content, description, metadata);
  }

  /**
   * Perform undo and return the content to restore along with action type
   */
  undo(): { content: string; actionType: ActionType } | null {
    const store = useHistoryStore.getState();
    const entry = store.undo();

    if (entry) {
      this.lastContent = entry.content;
      return { content: entry.content, actionType: entry.actionType };
    }

    return null;
  }

  /**
   * Perform redo and return the content to restore along with action type
   */
  redo(): { content: string; actionType: ActionType } | null {
    const store = useHistoryStore.getState();
    const entry = store.redo();

    if (entry) {
      this.lastContent = entry.content;
      return { content: entry.content, actionType: entry.actionType };
    }

    return null;
  }

  /**
   * Get undo/redo availability
   */
  canUndo(): boolean {
    return useHistoryStore.getState().canUndo();
  }

  canRedo(): boolean {
    return useHistoryStore.getState().canRedo();
  }

  /**
   * Get descriptions for UI
   */
  getUndoDescription(): string | null {
    return useHistoryStore.getState().getUndoDescription();
  }

  getRedoDescription(): string | null {
    return useHistoryStore.getState().getRedoDescription();
  }

  /**
   * Clear history
   */
  clear() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.nodePositionDebounceTimer) {
      clearTimeout(this.nodePositionDebounceTimer);
      this.nodePositionDebounceTimer = null;
    }

    if (this.nodeResizeDebounceTimer) {
      clearTimeout(this.nodeResizeDebounceTimer);
      this.nodeResizeDebounceTimer = null;
    }

    this.pendingTextChanges = [];
    this.pendingNodeMove = null;
    this.pendingNodeResize = null;
    this.lastContent = '';
    useHistoryStore.getState().clear();
  }

  /**
   * Enable/disable history tracking
   */
  setEnabled(enabled: boolean) {
    useHistoryStore.getState().setEnabled(enabled);
  }
}