import { create } from 'zustand';
import type { StateElement } from '@/types/scxml';

interface StateClipboardState {
  copied: StateElement[] | null;
  copy: (states: StateElement[]) => void;
}

export const useStateClipboardStore = create<StateClipboardState>((set) => ({
  copied: null,
  copy: (states) => set({ copied: states }),
}));
