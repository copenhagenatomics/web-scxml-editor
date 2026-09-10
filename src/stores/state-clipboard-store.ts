import { create } from 'zustand';
import type { StateElement } from '@/types/scxml';

interface StateClipboardState {
  copied: StateElement[] | null;
  // Ids (as they were at copy time, before paste assigns fresh ones) of the
  // top-level copied states that were themselves marked Initial by their
  // source parent — "Initial" is a property of the parent's own attribute,
  // not of the state element being cloned, so it has to be captured
  // separately here for paste to be able to carry it over. See
  // handlePasteClipboard in visual-diagram.tsx.
  copiedInitialIds: Set<string>;
  copy: (states: StateElement[], initialIds?: Set<string>) => void;
}

export const useStateClipboardStore = create<StateClipboardState>((set) => ({
  copied: null,
  copiedInitialIds: new Set(),
  copy: (states, initialIds = new Set()) => set({ copied: states, copiedInitialIds: initialIds }),
}));
