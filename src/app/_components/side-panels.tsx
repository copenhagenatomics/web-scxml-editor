'use client';

import { useCallback } from 'react';
import { ChannelMappingPanel, ConfigPanel, EventsPanel, GithubPanel } from '@/components/ui';
import { updateConfigFieldExpr, updateConfigFieldType } from '@/lib/utils/datamodel-extractor';
import { useEditorStore } from '@/stores/editor-store';
import { usePanelStore } from '@/stores/panel-store';
import type { ConfigValue } from '@/types/host-api';

export interface SidePanelsProps {
  onEntriesChange: (values: ConfigValue[]) => void;
  onContentChange: (content: string) => void;
}

export function SidePanels({ onEntriesChange, onContentChange }: SidePanelsProps) {
  const { activePanel, setActivePanel } = usePanelStore();
  const content = useEditorStore(state => state.content);
  const handleClose = useCallback(() => setActivePanel(null), [setActivePanel]);

  return (
    <>
      <ConfigPanel
        isVisible={activePanel === 'config'}
        onClose={handleClose}
        scxmlContent={content}
        onEntriesChange={onEntriesChange}
        onFieldChange={(name, newValue) => {
          onContentChange(updateConfigFieldExpr(content, name, newValue));
        }}
        onTypeChange={(name, newType) => {
          onContentChange(updateConfigFieldType(content, name, newType));
        }}
        onAddField={(name, defaultValue) => {
          const node = `\n    <data id="conf_${name}" expr="${defaultValue}" confType="string"/>`;
          const next = content.includes('</datamodel>')
            ? content.replace('</datamodel>', `${node}\n  </datamodel>`)
            : content.replace('</scxml>', `\n  <datamodel>${node}\n  </datamodel>\n</scxml>`);
          onContentChange(next);
        }}
      />
      <ChannelMappingPanel
        isVisible={activePanel === 'channelMapping'}
        onClose={handleClose}
        scxmlContent={content}
      />
      <EventsPanel
        isVisible={activePanel === 'events'}
        onClose={handleClose}
      />
      <GithubPanel
        isVisible={activePanel === 'github'}
        onClose={handleClose}
      />
    </>
  );
}
