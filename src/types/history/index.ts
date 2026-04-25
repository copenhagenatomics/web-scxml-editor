export type ActionType =
  | 'text-edit'
  | 'node-add'
  | 'node-delete'
  | 'node-move'
  | 'node-resize'
  | 'node-update'
  | 'edge-add'
  | 'edge-delete'
  | 'edge-update'
  | 'bulk-change'
  | 'file-load';

export interface HistoryMetadata {
  cursorPosition?: number;
  selectionStart?: number;
  selectionEnd?: number;
  viewportState?: {
    x: number;
    y: number;
    zoom: number;
  };
  activeNodeId?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  actionType: ActionType;
  description: string;
  content: string; // Full SCXML content at this point
  metadata?: HistoryMetadata;
}

export interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
  maxSize: number;
  isEnabled: boolean;
}

export interface HistoryActions {
  pushEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  setEnabled: (enabled: boolean) => void;
  getUndoDescription: () => string | null;
  getRedoDescription: () => string | null;
}

export type HistoryStore = HistoryState & HistoryActions;