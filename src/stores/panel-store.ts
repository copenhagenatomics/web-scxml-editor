import { create } from 'zustand';

export type PanelId = 'config' | 'channelMapping' | 'events' | 'validation' | 'transition' | 'stateActions' | 'github';

interface PanelStore {
  activePanel: PanelId | null;
  setActivePanel: (panel: PanelId | null) => void;
  togglePanel: (panel: PanelId) => void;
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  activePanel: null,
  // Deferred via microtask so this never notifies subscribers synchronously
  // inside whatever call stack invoked it (e.g. a functional state-updater
  // elsewhere in the tree). A synchronous set() there trips React's "Cannot
  // update a component while rendering a different component" warning no
  // matter which call site triggers it — deferring here fixes every caller
  // at once instead of auditing each one.
  setActivePanel: (panel) => queueMicrotask(() => set({ activePanel: panel })),
  togglePanel: (panel) =>
    queueMicrotask(() => set({ activePanel: get().activePanel === panel ? null : panel })),
}));
