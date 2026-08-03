'use client';

import { XMLEditor, type XMLEditorRef } from '@/components/editor';
import { ValidationPanel } from '@/components/ui';
import { useIsDark } from '@/lib/theme/use-is-dark';
import { useEditorStore } from '@/stores/editor-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { usePanelStore } from '@/stores/panel-store';
import type { ValidationError } from '@/types/common';
import type { ConfigValue } from '@/types/host-api';
import { SidePanels } from './side-panels';

export interface CodeEditorPaneProps {
  editorRef: React.RefObject<XMLEditorRef | null>;
  onContentChange: (content: string) => void;
  onErrorClick: (error: ValidationError) => void;
  validationPanelTab: 'validation' | 'host-alerts';
  onValidationTabChange: (tab: 'validation' | 'host-alerts') => void;
  onValidationClose: () => void;
  onEntriesChange: (values: ConfigValue[]) => void;
  onEditorMount?: () => void;
}

export function CodeEditorPane({
  editorRef,
  onContentChange,
  onErrorClick,
  validationPanelTab,
  onValidationTabChange,
  onValidationClose,
  onEntriesChange,
  onEditorMount,
}: CodeEditorPaneProps) {
  const { content, errors } = useEditorStore();
  const { activePanel } = usePanelStore();
  const hostErrors = useHostAPIStore(state => state.hostErrors);
  const dismissHostError = useHostAPIStore(state => state.dismissHostError);
  const clearHostErrors = useHostAPIStore(state => state.clearHostErrors);
  const isDark = useIsDark();

  return (
    <div className='flex gap-4 h-full overflow-hidden'>
      <div className='flex-1 min-w-0 h-full'>
        <XMLEditor
          ref={editorRef}
          value={content}
          onChange={onContentChange}
          errors={errors}
          height='100%'
          theme={isDark ? 'dark' : 'light'}
          onMount={onEditorMount}
        />
      </div>
      <div className='shrink-0 h-full'>
        <ValidationPanel
          errors={errors}
          hostErrors={hostErrors}
          isVisible={activePanel === 'validation'}
          activeTab={validationPanelTab}
          onClose={onValidationClose}
          onTabChange={onValidationTabChange}
          onErrorClick={onErrorClick}
          onDismissHostError={dismissHostError}
          onClearHostErrors={clearHostErrors}
        />
        <SidePanels onEntriesChange={onEntriesChange} onContentChange={onContentChange} />
      </div>
    </div>
  );
}
