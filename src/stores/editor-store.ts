import { create } from 'zustand';
import type { ValidationError, FileInfo, EditorState } from '@/types/common';
import type { InitialChildInfo } from '@/lib/utils/hierarchy-initial-info';

// No-parallel build: content is stored exactly as given. The automatic
// wrapping of 2+ Initial-State work trees into a <parallel>
// (normalizeParallelGroups) is deliberately not run here, so several Initial
// States at one level stay ordinary siblings (initial="A B").

// Hierarchy navigation state
export interface HierarchyState {
  currentPath: string[];        // Path from root to current level ['stateB', 'stateB2']
  currentParentId: string | null;  // ID of current container we're inside
  navigationHistory: string[][];   // Stack for back navigation
  visibleNodes: Set<string>;      // IDs of nodes to show at current level
}

interface EditorStore extends EditorState {
  fileInfo: FileInfo | null;
  // Incremented by every setFileInfo() call (a document load: upload, create-new,
  // GitHub pull, host loadScxml) — but not by markSaved(), which only moves the
  // dirty-tracking baseline. Lets the draft autosave tell "a new document was
  // loaded" apart from "the current one was saved".
  loadGeneration: number;

  // Hierarchy navigation state
  hierarchyState: HierarchyState;
  // Initial child(ren) info per parent state id, keyed for the hierarchy
  // index panel's hover tooltip (HIERARCHY_ROOT_KEY for top-level).
  initialChildByParent: Map<string, InitialChildInfo[]>;
  // Cross-component request to navigate the diagram to and highlight a
  // specific state (e.g. from clicking a validation error while on the
  // Visual tab). Consumed and cleared by VisualDiagram.
  focusTarget: { stateId: string; targetStateId?: string } | null;

  // Actions
  setContent: (content: string, options?: { immediate?: boolean }) => void;
  setErrors: (errors: ValidationError[]) => void;
  setFileInfo: (fileInfo: FileInfo | null) => void;
  markDirty: () => void;
  markClean: () => void;
  // Make the current content the new dirty-tracking baseline (e.g. after a
  // successful GitHub push), without counting as a document load.
  markSaved: () => void;
  reset: () => void;

  // Hierarchy navigation actions
  navigateIntoState: (stateId: string) => void;
  navigateUp: () => void;
  navigateToRoot: () => void;
  setVisibleNodes: (nodes: Set<string>) => void;
  setInitialChildByParent: (map: Map<string, InitialChildInfo[]>) => void;
  setFocusTarget: (target: { stateId: string; targetStateId?: string } | null) => void;
}

const initialState: EditorState = {
  content: '',
  isDirty: false,
  errors: []
};

const initialHierarchyState: HierarchyState = {
  currentPath: [],
  currentParentId: null,
  navigationHistory: [],
  visibleNodes: new Set(),
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...initialState,
  fileInfo: null,
  loadGeneration: 0,
  hierarchyState: initialHierarchyState,
  initialChildByParent: new Map(),
  focusTarget: null,

  // `immediate` is kept for callers (page.tsx's typing debounce); with no
  // normalization step it no longer changes what is stored.
  setContent: (content: string, _options?: { immediate?: boolean }) => {
    set({
      content,
      isDirty: content !== (get().fileInfo?.content || '')
    });
  },

  setErrors: (errors: ValidationError[]) => {
    set({ errors });
  },

  setFileInfo: (fileInfo: FileInfo | null) => {
    set({
      fileInfo,
      content: fileInfo ? fileInfo.content : '',
      isDirty: false,
      errors: [],
      loadGeneration: get().loadGeneration + 1,
    });
  },

  markDirty: () => {
    set({ isDirty: true });
  },

  markClean: () => {
    set({ isDirty: false });
  },

  markSaved: () => {
    const { content, fileInfo } = get();
    if (!fileInfo) {
      set({ isDirty: false });
      return;
    }
    set({
      fileInfo: { ...fileInfo, content, size: content.length },
      isDirty: false,
    });
  },

  reset: () => {
    set({
      ...initialState,
      fileInfo: null,
      hierarchyState: initialHierarchyState,
      initialChildByParent: new Map(),
      focusTarget: null,
    });
  },

  // Hierarchy navigation implementations
  navigateIntoState: (stateId: string) => {
    const currentState = get().hierarchyState;
    const newPath = [...currentState.currentPath, stateId];
    const newHistory = [...currentState.navigationHistory, currentState.currentPath];

    set({
      hierarchyState: {
        ...currentState,
        currentPath: newPath,
        currentParentId: stateId,
        navigationHistory: newHistory,
        visibleNodes: new Set(), // Will be populated by the diagram
      }
    });
  },

  navigateUp: () => {
    const currentState = get().hierarchyState;
    if (currentState.currentPath.length === 0) return;

    const newPath = currentState.currentPath.slice(0, -1);
    const newParentId = newPath.length > 0 ? newPath[newPath.length - 1] : null;
    const newHistory = [...currentState.navigationHistory, currentState.currentPath];

    set({
      hierarchyState: {
        ...currentState,
        currentPath: newPath,
        currentParentId: newParentId,
        navigationHistory: newHistory,
        visibleNodes: new Set(), // Will be populated by the diagram
      }
    });
  },

  navigateToRoot: () => {
    const currentState = get().hierarchyState;
    const newHistory = currentState.currentPath.length > 0
      ? [...currentState.navigationHistory, currentState.currentPath]
      : currentState.navigationHistory;

    set({
      hierarchyState: {
        currentPath: [],
        currentParentId: null,
        navigationHistory: newHistory,
        visibleNodes: new Set(), // Will be populated by the diagram
      }
    });
  },

  setVisibleNodes: (nodes: Set<string>) => {
    set({
      hierarchyState: {
        ...get().hierarchyState,
        visibleNodes: nodes
      }
    });
  },

  setInitialChildByParent: (map: Map<string, InitialChildInfo[]>) => {
    set({ initialChildByParent: map });
  },

  setFocusTarget: (target) => {
    set({ focusTarget: target });
  },
}));