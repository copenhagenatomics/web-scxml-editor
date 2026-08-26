import { create } from 'zustand';
import type { AssignActionRow, InternalEventActionRow } from '@/components/ui/state-actions-panel';

export type CopiedAction =
  | { kind: 'action'; row: AssignActionRow }
  | { kind: 'reaction'; row: InternalEventActionRow };

interface ActionClipboardState {
  copied: CopiedAction | null;
  copy: (item: CopiedAction) => void;
}

export const useActionClipboardStore = create<ActionClipboardState>((set) => ({
  copied: null,
  copy: (item) => set({ copied: item }),
}));
