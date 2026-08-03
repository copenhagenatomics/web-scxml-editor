import { create } from 'zustand';
import type { ValidationError, FileInfo, EditorState } from '@/types/common';
import type { InitialChildInfo } from '@/lib/utils/hierarchy-initial-info';

// Hierarchy navigation state
export interface HierarchyState {
  currentPath: string[];        // Path from root to current level ['stateB', 'stateB2']
  currentParentId: string | null;  // ID of current container we're inside
  navigationHistory: string[][];   // Stack for back navigation
  visibleNodes: Set<string>;      // IDs of nodes to show at current level
}

interface EditorStore extends EditorState {
  fileInfo: FileInfo | null;

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
  setContent: (content: string) => void;
  setErrors: (errors: ValidationError[]) => void;
  setFileInfo: (fileInfo: FileInfo | null) => void;
  markDirty: () => void;
  markClean: () => void;
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
  hierarchyState: initialHierarchyState,
  initialChildByParent: new Map(),
  focusTarget: null,

  setContent: (content: string) => {
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
      content: fileInfo?.content || '',
      isDirty: false,
      errors: []
    });
  },

  markDirty: () => {
    set({ isDirty: true });
  },

  markClean: () => {
    set({ isDirty: false });
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