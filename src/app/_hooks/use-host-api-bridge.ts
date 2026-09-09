'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { HistoryManager } from '@/lib/history/history-manager';
import { annotateLegacyConfTypes, extractUnresolvedChannelRefs } from '@/lib/utils/datamodel-extractor';
import { EVENT_FALLBACK_VALUE } from '@/lib/utils/common-utils';
import { useEditorStore } from '@/stores/editor-store';
import { usePanelStore } from '@/stores/panel-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import type { ChannelInfo, ChannelMapping, ConfigOverride, ConfigValue, EventEntry, FeedbackItem, ScxmlEditorAPI } from '@/types/host-api';

export function useHostAPIBridge() {
  const { setContent, setErrors, navigateToRoot } = useEditorStore();
  const { togglePanel } = usePanelStore();
  const { markReady, onReady, registerCommand, showFeedback, showErrors } = useHostAPIStore();
  const historyManager = useMemo(() => HistoryManager.getInstance(), []);

  // Anything the host reports via showFeedback('error') is operational error detail
  // (e.g. program-generation/apply failures) meant for a developer to inspect, not toast
  // copy — the full text goes to the persistent Error Panel, the toast stays short.
  // This repo's own showFeedback('error') calls (GitHub push/pull, panel saves, etc.) are
  // already short, curated strings and call the store directly, so they never pass through here.
  const hostShowFeedback = useCallback((message: string, level?: FeedbackItem['level']) => {
    if (level === 'error') {
      showErrors([{ message, level: 'error' }]);
      showFeedback('Failed generating program. See Error Panel for details.', 'error');
    } else {
      showFeedback(message, level);
    }
  }, [showFeedback, showErrors]);

  const content = useEditorStore(state => state.content);
  const storeChannelMappings = useHostAPIStore(state => state.channelMappings);
  const storeEvents = useHostAPIStore(state => state.events);

  // Mutable refs for stable access inside host API callbacks (avoid stale closures)
  const contentRef = useRef(content);
  const configValuesRef = useRef<ConfigValue[]>([]);
  const channelMappingsRef = useRef<ChannelMapping[]>([]);
  const eventsRef = useRef<EventEntry[]>([]);

  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { channelMappingsRef.current = storeChannelMappings; }, [storeChannelMappings]);
  useEffect(() => { eventsRef.current = storeEvents; }, [storeEvents]);

  const handleEntriesChange = useCallback((values: ConfigValue[]) => {
    configValuesRef.current = values;
  }, []);

  // Wire up the host API on mount
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = window.ScxmlEditorAPI as any;

    const realApi: ScxmlEditorAPI = {
      onReady,
      loadScxml: (xml: string) => {
        const annotated = annotateLegacyConfTypes(xml);
        setContent(annotated);
        setErrors([]);
        historyManager.initialize(annotated, 'Loaded from host');
        navigateToRoot();
      },
      getScxml: () => contentRef.current,
      getConfigValues: () => configValuesRef.current,
      setConfigValues: (values: ConfigOverride[]) => useHostAPIStore.getState().setConfigOverrides(values),
      registerCommand,
      showFeedback: hostShowFeedback,
      setChannels: (channels: ChannelInfo[]) => useHostAPIStore.getState().setChannels(channels),
      toggleConfigPanel: () => togglePanel('config'),
      getChannelMappings: () => {
        const channelNames = useHostAPIStore.getState().channels.map(c => c.name);
        const activeRefs = new Set(extractUnresolvedChannelRefs(contentRef.current, channelNames));
        return channelMappingsRef.current.filter(m => activeRefs.has(m.scxmlRef));
      },
      setChannelMappings: (mappings) => useHostAPIStore.getState().setChannelMappings(mappings),
      toggleChannelMappingPanel: () => togglePanel('channelMapping'),
      setEvents: (events: EventEntry[]) => useHostAPIStore.getState().setEvents(
        events.map(e => ({ ...e, type: e.type ?? EVENT_FALLBACK_VALUE }))
      ),
      getEvents: () => eventsRef.current,
      toggleEventsPanel: () => togglePanel('events'),
      setActiveTab: (tab) => useHostAPIStore.getState().setRequestedTab(tab),
      showErrors: (errors) => useHostAPIStore.getState().showErrors(errors),
      clearErrors: () => useHostAPIStore.getState().clearHostErrors(),
    };

    if (stub?._q) {
      // Upgrade the stub object in place so any host reference already captured
      // (e.g. `var api = iframe.contentWindow.ScxmlEditorAPI` in a load handler)
      // automatically gets the real methods without needing to re-read the property.
      type QueuedOp =
        | { type: 'feedback'; message: string; level?: FeedbackItem['level'] }
        | { type: 'showErrors'; errors: Array<{ message: string; level?: string }> }
        | { type: 'clearErrors' };
      const queue = stub._q as {
        ready: (() => void)[];
        commands: any[];
        ops: QueuedOp[];
        channels?: ChannelInfo[];
        channelMappings?: ChannelMapping[];
        events?: EventEntry[];
      };
      Object.assign(stub, realApi);
      delete stub._q;
      queue.ready.forEach(cb => onReady(cb));
      queue.commands.forEach(o => registerCommand(o));
      if (queue.channels) useHostAPIStore.getState().setChannels(queue.channels);
      if (queue.channelMappings) useHostAPIStore.getState().setChannelMappings(queue.channelMappings);
      if (queue.events) useHostAPIStore.getState().setEvents(
        queue.events.map(e => ({ ...e, type: e.type ?? EVENT_FALLBACK_VALUE }))
      );
      // Replayed in original call order so a host's clearErrors() <-> error-feedback
      // interleaving lands the same way it would have if the host API had been ready
      // immediately (see use-host-api-bridge.test.ts ordering tests).
      queue.ops.forEach(op => {
        if (op.type === 'feedback') hostShowFeedback(op.message, op.level);
        else if (op.type === 'showErrors') useHostAPIStore.getState().showErrors(
          op.errors as Array<{ message: string; level?: 'info' | 'warning' | 'error' }>
        );
        else if (op.type === 'clearErrors') useHostAPIStore.getState().clearHostErrors();
      });
    } else {
      window.ScxmlEditorAPI = realApi;
    }
    // Fire onReady callbacks now — before TwoTabLayout renders (which waits for the
    // async auto-load fetch). This lets the host's onReady callback set requestedTab
    // so TwoTabLayout can read it via its useState lazy initializer on first render.
    markReady();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { handleEntriesChange };
}
