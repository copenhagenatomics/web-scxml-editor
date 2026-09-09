// src/types/host-api.ts

export interface FeedbackItem {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}

/** Persistent host-pushed error shown in the ValidationPanel Host Alerts tab. Unlike FeedbackItem (transient toast), these remain until explicitly dismissed by the user or cleared via clearErrors(). */
export interface HostErrorItem {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface CommandOptions {
  id: string;
  label: string;
  tooltip?: string;
  icon?: string;
  order: number;
  /** Where to render the command. 'toolbar' (default) renders it as its own toolbar button; 'menu' renders it inside the "More options" (⋮) dropdown, alongside Upload/Clean SCXML/Download. */
  placement?: 'toolbar' | 'menu';
  run: () => void | Promise<void>;
}

export interface RegisteredCommand extends CommandOptions {
  isExecuting: boolean;
}

export interface ConfigValue {
  name: string;
  type: 'string' | 'double' | 'bool' | 'int';
  defaultValue: string;
  override: string;
}

export interface ConfigOverride {
  name: string;
  override: string;
}

export interface ChannelMapping {
  scxmlRef: string;
  mappedChannel: string;
}

export interface ChannelInfo {
  name: string;
  type: 'ch' | 'in' | 'out' | 'st' | 'cf' | 'th' | 'dm';
}

export interface EventEntry {
  name: string;
  type: string;
  hasArgument: boolean;
  defaultValue?: string;
  min?: number;
  max?: number;
  unit?: string;
  hidden?: boolean;
}

export interface ScxmlEditorAPI {
  onReady: (callback: () => void) => void;
  loadScxml: (content: string) => void;
  getScxml: () => string;
  getConfigValues: () => ConfigValue[];
  setConfigValues: (values: ConfigOverride[]) => void;
  registerCommand: (options: CommandOptions) => void;
  showFeedback: (message: string, level?: FeedbackItem['level']) => void;
  setChannels: (channels: ChannelInfo[]) => void;
  toggleConfigPanel: () => void;
  getChannelMappings: () => ChannelMapping[];
  setChannelMappings: (mappings: ChannelMapping[]) => void;
  toggleChannelMappingPanel: () => void;
  setActiveTab: (tab: 'code' | 'visual') => void;
  setEvents: (events: EventEntry[]) => void;
  getEvents: () => EventEntry[];
  toggleEventsPanel: () => void;
  /** Push one or more persistent errors into the Host Alerts tab. Panel opens automatically. */
  showErrors: (errors: Array<{ message: string; level?: 'info' | 'warning' | 'error' }>) => void;
  /** Remove all host errors from the Host Alerts tab. */
  clearErrors: () => void;
}

declare global {
  interface Window {
    ScxmlEditorAPI: ScxmlEditorAPI;
  }
}
