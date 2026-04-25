import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { HistoryStore, HistoryEntry } from '@/types/history';

const DEFAULT_MAX_HISTORY_SIZE = 50;

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  // State
  entries: [],
  currentIndex: -1,
  maxSize: DEFAULT_MAX_HISTORY_SIZE,
  isEnabled: true,

  // Actions
  pushEntry: (entry) => {
    const state = get();
    if (!state.isEnabled) return;

    // Create new entry with generated ID and timestamp
    const newEntry: HistoryEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    // Get entries up to current index (remove any redo entries)
    const newEntries = state.entries.slice(0, state.currentIndex + 1);

    // Add new entry
    newEntries.push(newEntry);

    // Trim to max size if needed
    while (newEntries.length > state.maxSize) {
      newEntries.shift();
    }

    set({
      entries: newEntries,
      currentIndex: newEntries.length - 1,
    });
  },

  undo: () => {
    const state = get();
    if (!state.canUndo()) return null;

    // Get the entry we're currently at (the one being undone)
    const currentEntry = state.entries[state.currentIndex];

    const newIndex = state.currentIndex - 1;
    set({ currentIndex: newIndex });

    // Return the entry we're undoing TO (for content)
    // but with the actionType from the entry we're undoing (for tracking what changed)
    const targetEntry = state.entries[newIndex];
    return {
      ...targetEntry,
      actionType: currentEntry.actionType, // Action type of what we're undoing
    };
  },

  redo: () => {
    const state = get();
    if (!state.canRedo()) return null;

    const newIndex = state.currentIndex + 1;

    // Get the entry we're redoing (the one we're going to)
    const redoEntry = state.entries[newIndex];

    set({ currentIndex: newIndex });

    // Return the entry with its own actionType (what we're redoing)
    return redoEntry;
  },

  canUndo: () => {
    const state = get();
    return state.currentIndex > 0;
  },

  canRedo: () => {
    const state = get();
    return state.currentIndex < state.entries.length - 1;
  },

  clear: () => {
    set({
      entries: [],
      currentIndex: -1,
    });
  },

  setEnabled: (enabled) => {
    set({ isEnabled: enabled });
  },

  getUndoDescription: () => {
    const state = get();
    if (!state.canUndo()) return null;

    // The current entry is what we would undo
    const currentEntry = state.entries[state.currentIndex];
    return currentEntry ? `Undo ${currentEntry.description}` : null;
  },

  getRedoDescription: () => {
    const state = get();
    if (!state.canRedo()) return null;

    // The next entry is what we would redo
    const nextEntry = state.entries[state.currentIndex + 1];
    return nextEntry ? `Redo ${nextEntry.description}` : null;
  },
}));
