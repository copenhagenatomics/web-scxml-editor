// src/types/host-api.ts

export interface FeedbackItem {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface CommandOptions {
  id: string;
  label: string;
  tooltip?: string;
  icon?: string;          // Lucide icon name (reserved for future use)
  order: number;          // Lower = further left in toolbar
  run: () => void | Promise<void>;
}

export interface RegisteredCommand extends CommandOptions {
  isExecuting: boolean;
}

export interface ScxmlEditorAPI {
  onReady: (callback: () => void) => void;
  /**
   * Loads SCXML into the editor.
   * Side effects: initializes undo/redo history, resets hierarchy navigation to root.
   */
  loadScxml: (content: string) => void;
  getScxml: () => string;
  registerCommand: (options: CommandOptions) => void;
  showFeedback: (message: string, level?: FeedbackItem['level']) => void;
}

declare global {
  interface Window {
    ScxmlEditorAPI: ScxmlEditorAPI;
  }
}
