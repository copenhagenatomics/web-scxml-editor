'use client';

import { VisualDiagram, type DiagramChangeType } from '@/components/diagram';
import { useEditorStore } from '@/stores/editor-store';
import type { ActionType } from '@/types/history';
import type { ConfigValue } from '@/types/host-api';
import { SidePanels } from './side-panels';

export type { DiagramChangeType };

export interface VisualEditorPaneProps {
  onSCXMLChange: (content: string, changeType?: DiagramChangeType) => void;
  isUpdatingFromHistory: boolean;
  historyActionType: ActionType | undefined;
  onEntriesChange: (values: ConfigValue[]) => void;
  onContentChange: (content: string) => void;
}

export function VisualEditorPane({
  onSCXMLChange,
  isUpdatingFromHistory,
  historyActionType,
  onEntriesChange,
  onContentChange,
}: VisualEditorPaneProps) {
  const content = useEditorStore(state => state.content);

  return (
    <div className='h-full relative'>
      <VisualDiagram
        scxmlContent={content}
        onSCXMLChange={onSCXMLChange}
        isUpdatingFromHistory={isUpdatingFromHistory}
        historyActionType={historyActionType}
      />
      <div className='absolute right-0 top-0 h-full flex pointer-events-none z-20'>
        <div className='pointer-events-auto h-full flex'>
          <SidePanels onEntriesChange={onEntriesChange} onContentChange={onContentChange} />
        </div>
      </div>
    </div>
  );
}
