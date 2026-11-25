'use client';

import { useEffect } from 'react';
import { validateScxmlContent } from '@/lib';
import { useEditorStore } from '@/stores/editor-store';
import { getChannelMappingContext, useHostAPIStore } from '@/stores/host-api-store';

export function useContentValidation() {
  const { content, setErrors } = useEditorStore();
  // Re-run when the host's channels or the user's mappings change, not only the content,
  // so the unmapped-channel warnings follow the Channel Mapping panel.
  const channels = useHostAPIStore(state => state.channels);
  const channelMappings = useHostAPIStore(state => state.channelMappings);

  useEffect(() => {
    const timer = setTimeout(() => setErrors(validateScxmlContent(content, getChannelMappingContext())), 500);
    return () => clearTimeout(timer);
  }, [content, channels, channelMappings, setErrors]);
}
