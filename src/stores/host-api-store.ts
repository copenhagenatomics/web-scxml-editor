import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { CommandOptions, FeedbackItem, RegisteredCommand } from '@/types/host-api';

interface HostAPIState {
  commands: RegisteredCommand[];
  isReady: boolean;
  readyCallbacks: (() => void)[];
  feedbackQueue: FeedbackItem[];
}

interface HostAPIActions {
  markReady: () => void;
  onReady: (callback: () => void) => void;
  registerCommand: (options: CommandOptions) => void;
  executeCommand: (id: string) => Promise<void>;
  showFeedback: (message: string, level?: FeedbackItem['level']) => void;
  dismissFeedback: (id: string) => void;
}

export const useHostAPIStore = create<HostAPIState & HostAPIActions>((set, get) => ({
  commands: [],
  isReady: false,
  readyCallbacks: [],
  feedbackQueue: [],

  markReady: () => {
    const { readyCallbacks } = get();
    set({ isReady: true, readyCallbacks: [] });
    readyCallbacks.forEach(cb => cb());
  },

  onReady: (callback: () => void) => {
    if (get().isReady) {
      callback();
    } else {
      set(state => ({ readyCallbacks: [...state.readyCallbacks, callback] }));
    }
  },

  registerCommand: (options: CommandOptions) => {
    const { commands } = get();
    const exists = commands.some(c => c.id === options.id);
    if (exists) {
      console.warn(`Command with id "${options.id}" already exists, replacing.`);
    }
    const command: RegisteredCommand = { ...options, isExecuting: false };
    const updated = exists
      ? commands.map(c => c.id === options.id ? command : c)
      : [...commands, command];
    set({ commands: updated.sort((a, b) => a.order - b.order) });
  },

  executeCommand: async (id: string) => {
    const { commands, showFeedback } = get();
    const command = commands.find(c => c.id === id);
    if (!command) return;

    set(state => ({
      commands: state.commands.map(c =>
        c.id === id ? { ...c, isExecuting: true } : c
      ),
    }));

    try {
      await command.run();
    } catch (error) {
      console.error(`Command "${id}" failed:`, error);
      showFeedback(`Command failed: ${(error as Error).message}`, 'error');
    } finally {
      set(state => ({
        commands: state.commands.map(c =>
          c.id === id ? { ...c, isExecuting: false } : c
        ),
      }));
    }
  },

  showFeedback: (message: string, level: FeedbackItem['level'] = 'info') => {
    const item: FeedbackItem = { id: uuidv4(), message, level };
    set(state => ({ feedbackQueue: [...state.feedbackQueue, item] }));
    setTimeout(() => get().dismissFeedback(item.id), 4000);
  },

  dismissFeedback: (id: string) => {
    set(state => ({
      feedbackQueue: state.feedbackQueue.filter(f => f.id !== id),
    }));
  },
}));
