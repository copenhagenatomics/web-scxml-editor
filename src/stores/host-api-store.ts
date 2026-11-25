import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { validateScxmlContent } from '@/lib/validators/validate-content';
import type { ChannelMappingContext } from '@/lib/validators/channel-mapping-validator';
import { useEditorStore } from './editor-store';
import type { ChannelInfo, ChannelMapping, CommandOptions, ConfigOverride, EventEntry, FeedbackItem, HostErrorItem, RegisteredCommand } from '@/types/host-api';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The host state validateScxmlContent needs for its unmapped-channel warnings. */
export function getChannelMappingContext(): ChannelMappingContext {
  const { channels, channelMappings } = useHostAPIStore.getState();
  return { channels: channels.map(c => c.name), channelMappings };
}

/**
 * Re-validates the current content (the live result is debounced, so it can be stale right after
 * an edit) and publishes it to the editor store so the Validation panel shows what blocked the
 * command. Returns the toast text when the command must not run, otherwise null. Only the editor's
 * own validation counts; Host Alerts are the host's report and never block.
 */
function findBlockingIssues(mode: NonNullable<CommandOptions['requiresValidScxml']>, label: string): string | null {
  const issues = validateScxmlContent(useEditorStore.getState().content, getChannelMappingContext());
  useEditorStore.getState().setErrors(issues);
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = mode === 'errors-and-warnings' ? issues.length - errorCount : 0;
  if (errorCount + warningCount === 0) return null;
  const parts = [
    errorCount > 0 ? plural(errorCount, 'error') : null,
    warningCount > 0 ? plural(warningCount, 'warning') : null,
  ].filter(Boolean);
  return `Fix ${parts.join(' and ')} before ${label}.`;
}

interface HostAPIState {
  commands: RegisteredCommand[];
  isReady: boolean;
  readyCallbacks: (() => void)[];
  feedbackQueue: FeedbackItem[];
  channels: ChannelInfo[];
  channelMappings: ChannelMapping[];
  events: EventEntry[];
  configOverrides: ConfigOverride[];
  configOverridesLoaded: boolean;
  requestedTab: 'code' | 'visual' | null;
  hostErrors: HostErrorItem[];
  requestedValidationTab: 'validation' | 'host-alerts' | null;
}

interface HostAPIActions {
  markReady: () => void;
  onReady: (callback: () => void) => void;
  registerCommand: (options: CommandOptions) => void;
  executeCommand: (id: string) => Promise<void>;
  /** Toast; auto-dismissed after `durationMs` (default 4000) — pass longer for messages users must read. */
  showFeedback: (message: string, level?: FeedbackItem['level'], options?: { durationMs?: number }) => void;
  dismissFeedback: (id: string) => void;
  setChannels: (channels: ChannelInfo[]) => void;
  setChannelMappings: (mappings: ChannelMapping[]) => void;
  updateChannelMapping: (scxmlRef: string, mappedChannel: string) => void;
  setEvents: (events: EventEntry[]) => void;
  setConfigOverrides: (values: ConfigOverride[]) => void;
  setRequestedTab: (tab: 'code' | 'visual' | null) => void;
  showErrors: (errors: Array<{ message: string; level?: HostErrorItem['level'] }>) => void;
  dismissHostError: (id: string) => void;
  clearHostErrors: () => void;
  setRequestedValidationTab: (tab: 'validation' | 'host-alerts' | null) => void;
}

export const useHostAPIStore = create<HostAPIState & HostAPIActions>((set, get) => ({
  commands: [],
  isReady: false,
  readyCallbacks: [],
  feedbackQueue: [],
  channels: [],
  channelMappings: [],
  events: [],
  configOverrides: [],
  configOverridesLoaded: false,
  requestedTab: null,
  hostErrors: [],
  requestedValidationTab: null,

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
    const { commands, showFeedback, showErrors } = get();
    const command = commands.find(c => c.id === id);
    if (!command) return;

    if (command.requiresValidScxml) {
      const blockedMessage = findBlockingIssues(command.requiresValidScxml, command.label);
      if (blockedMessage) {
        set({ requestedValidationTab: 'validation' });
        showFeedback(blockedMessage, 'warning');
        return;
      }
    }

    set(state => ({
      commands: state.commands.map(c =>
        c.id === id ? { ...c, isExecuting: true } : c
      ),
    }));

    try {
      await command.run();
    } catch (error) {
      console.error(`Command "${id}" failed:`, error);
      const message = error instanceof Error ? error.message : String(error);
      showErrors([{ message, level: 'error' }]);
      showFeedback(`${command.label} failed. See Error Panel for details.`, 'error');
    } finally {
      set(state => ({
        commands: state.commands.map(c =>
          c.id === id ? { ...c, isExecuting: false } : c
        ),
      }));
    }
  },

  showFeedback: (message: string, level: FeedbackItem['level'] = 'info', options?: { durationMs?: number }) => {
    const item: FeedbackItem = { id: uuidv4(), message, level };
    set(state => ({ feedbackQueue: [...state.feedbackQueue, item] }));
    setTimeout(() => get().dismissFeedback(item.id), options?.durationMs ?? 4000);
  },

  dismissFeedback: (id: string) => {
    set(state => ({
      feedbackQueue: state.feedbackQueue.filter(f => f.id !== id),
    }));
  },

  setChannels: (channels: ChannelInfo[]) => set({ channels }),

  setChannelMappings: (mappings: ChannelMapping[]) => set({ channelMappings: mappings }),

  setEvents: (events: EventEntry[]) => set({ events }),

  setConfigOverrides: (values: ConfigOverride[]) => set({ configOverrides: values, configOverridesLoaded: true }),

  setRequestedTab: (tab) => set({ requestedTab: tab }),

  updateChannelMapping: (scxmlRef: string, mappedChannel: string) =>
    set(state => {
      if (!mappedChannel) {
        return { channelMappings: state.channelMappings.filter(m => m.scxmlRef !== scxmlRef) };
      }
      const exists = state.channelMappings.some(m => m.scxmlRef === scxmlRef);
      if (exists) {
        return { channelMappings: state.channelMappings.map(m => m.scxmlRef === scxmlRef ? { scxmlRef, mappedChannel } : m) };
      }
      return { channelMappings: [...state.channelMappings, { scxmlRef, mappedChannel }] };
    }),

  showErrors: (errors) => {
    const items: HostErrorItem[] = errors.map(e => ({
      id: uuidv4(),
      message: e.message,
      level: e.level ?? 'error',
    }));
    set(state => ({
      hostErrors: [...state.hostErrors, ...items],
      requestedValidationTab: 'host-alerts',
    }));
  },

  dismissHostError: (id: string) => {
    set(state => ({
      hostErrors: state.hostErrors.filter(e => e.id !== id),
    }));
  },

  clearHostErrors: () => set({ hostErrors: [], requestedValidationTab: null }),

  setRequestedValidationTab: (tab) => set({ requestedValidationTab: tab }),
}));
