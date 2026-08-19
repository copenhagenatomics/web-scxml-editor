'use client';

import React from 'react';
import { useHostAPIStore } from '@/stores/host-api-store';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { BADGE_COLORS, getVariableType } from '@/lib';
import { Panel } from '@/components/ui/primitives/panel';
import {
  parseAfterSyntax,
  isTimeEventName,
  generateTimeEventName,
  findTimeEventToken,
  resolveTimeEventDisplay,
} from '@/lib/utils/time-transition';

type Suggestion = { label: string; kind: 'channel' | 'event' | 'variable' | 'new-channel' | 'mapped-channel' | 'operator' };

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '&&', '||'];
const OPERATOR_SET = new Set([...OPERATORS, '!']);
const MAX_TEXTAREA_HEIGHT = 200;

export interface TransitionApplyArgs {
  newValue: string;
  editingField: 'event' | 'cond' | 'none';
  delay: { type: 'delay' | 'delayexpr'; value: string } | null;
  cancelSendId: string | null;
  originalEventName: string | undefined;
  originalCancelSendId: string | undefined;
}

export type TransitionApplyResult = { blocked: boolean; reason?: string } | void;

interface TransitionPanelProps {
  edgeId: string;
  source: string;
  target: string;
  event?: string;
  cond?: string;
  scxmlContent: string;
  entryActions?: string[];
  exitActions?: string[];
  onApply: (args: TransitionApplyArgs) => TransitionApplyResult;
  onNewChannel?: (
    channelName: string,
    source: string,
    target: string,
    originalEvent: string | undefined,
    originalCond: string | undefined,
    editingField: 'event' | 'cond',
    edgeId: string
  ) => void;
  onClose: () => void;
}

export const TransitionPanel: React.FC<TransitionPanelProps> = ({
  edgeId,
  source,
  target,
  event,
  cond,
  scxmlContent,
  entryActions,
  onApply,
  onNewChannel,
  onClose,
}) => {
  // ── event/cond search state ──
  // For time events the stored event name (e.g. Idle_t_0_timeEvent_0) is invisible to the user;
  // we reconstruct the "after X" display string from the source state's send action. event may
  // be a comma-merged list (event-merge can pair a time event with a plain event sharing the
  // same target/cond/actions), so each token is resolved independently.
  const initRawValue = (() => {
    if (!event) return cond ?? '';
    return resolveTimeEventDisplay(event, (token) =>
      (entryActions ?? []).find((a) => a.startsWith(`send|${token}|`))
    );
  })();

  // Pure single time-transition (no comma) keeps the dedicated "after X" flow (initSelectionMode
  // 'undecided'); a merged list containing a time-event token alongside other events is edited
  // as a plain comma event list instead, since its raw text already shows "after X, other-event".
  const initSelectionMode = (() => {
    if (event && !event.includes(',') && isTimeEventName(event)) return 'undecided' as const;
    if (event) return 'event' as const;
    if (cond) return 'cond' as const;
    return 'undecided' as const;
  })();

  const [selectionMode, setSelectionMode] = React.useState<'undecided' | 'event' | 'cond'>(initSelectionMode);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [rawValue, setRawValue] = React.useState(initRawValue);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [isOpen, setIsOpen] = React.useState(false);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Delays onClose() after a successful apply so the panel doesn't vanish on the same tick as
  // the keypress — gives the confirmation toast a moment to register before the panel closes.
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Remembers the auto-generated _t_ event name after the first save so rapid double-clicks
  // reuse the same name instead of incrementing the index again before the prop updates.
  const appliedTimeEventRef = React.useRef<string | null>(null);

  // ── originalCancelSendId — only track the cancel that belongs to THIS transition's event.
  // Searching for any cancel| in exitActions is wrong when a source state has multiple time
  // transitions: it would grab a sibling's cancel and incorrectly remove it on save.
  // For the after-X flow the cancel sendid always equals the (possibly merged-out) time-event token.
  const initCancelId = findTimeEventToken(event) ?? '';

  const editingField: 'event' | 'cond' = selectionMode === 'event' ? 'event' : 'cond';

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const channels = useHostAPIStore((state) => state.channels);
  const channelMappings = useHostAPIStore((state) => state.channelMappings);
  const events = useHostAPIStore((state) => state.events);
  const showFeedback = useHostAPIStore((state) => state.showFeedback);

  // ── main search suggestions ──
  const suggestions: Suggestion[] = React.useMemo(() => {
    const vars = extractDatamodelVariables(scxmlContent);
    const channelSet = new Set(channels.map((c) => c.name));
    const scxmlRefSet = new Set(channelMappings.map((m) => m.scxmlRef));
    const eventNames = events.map((e) => e.name);
    const eventSet = new Set(eventNames);
    const kindOf = (item: string): Suggestion['kind'] =>
      channelSet.has(item) ? 'channel' : scxmlRefSet.has(item) ? 'mapped-channel' : eventSet.has(item) ? 'event' : 'variable';

    // Suppress suggestions when user is typing an "after X" time transition
    if (rawValue.trimStart().startsWith('after')) return [];

    if (selectionMode === 'event') {
      // Merged transitions carry a comma-separated event list; only match/suggest against
      // the last (currently-being-typed) segment, not the whole field.
      const endsWithSeparator = /,\s*$/.test(rawValue);
      const segments = rawValue.split(',');
      const lastSegment = endsWithSeparator ? '' : (segments[segments.length - 1] ?? '').trim();
      const prefix = lastSegment.toLowerCase();
      return eventNames
        .filter((n) => n.toLowerCase().includes(prefix))
        .map((n) => ({ label: n, kind: 'event' as const }));
    }

    if (selectionMode === 'undecided') {
      const allNames = Array.from(new Set([...Array.from(vars), ...channels.map((c) => c.name), ...channelMappings.map((m) => m.scxmlRef), ...eventNames]));
      const filtered = allNames.filter((i) => i.toLowerCase().includes(rawValue.toLowerCase()));
      if (filtered.length === 0 && rawValue.startsWith('this_')) return [{ label: rawValue, kind: 'new-channel' }];
      return filtered.map((i) => ({ label: i, kind: kindOf(i) }));
    }

    // cond mode
    const allNames = Array.from(new Set([...Array.from(vars), ...channels.map((c) => c.name), ...channelMappings.map((m) => m.scxmlRef)]));
    const condKindOf = (i: string): Suggestion['kind'] => channelSet.has(i) ? 'channel' : scxmlRefSet.has(i) ? 'mapped-channel' : 'variable';
    const endsWithSpace = rawValue.endsWith(' ');
    const tokens = rawValue.trimEnd().split(/\s+/);
    const lastToken = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
    const prevToken = endsWithSpace ? (tokens[tokens.length - 1] ?? '') : (tokens[tokens.length - 2] ?? '');
    if (endsWithSpace) {
      if (OPERATOR_SET.has(prevToken)) return allNames.map((i) => ({ label: i, kind: condKindOf(i) }));
      return OPERATORS.map((op) => ({ label: op, kind: 'operator' as const }));
    }
    const filtered = allNames.filter((i) => i.toLowerCase().includes(lastToken.toLowerCase()));
    if (filtered.length === 0 && lastToken.startsWith('this_')) return [{ label: lastToken, kind: 'new-channel' }];
    return filtered.map((i) => ({ label: i, kind: condKindOf(i) }));
  }, [rawValue, channels, channelMappings, events, scxmlContent, selectionMode]);

  const buildCondValue = (label: string) => {
    const endsWithSpace = rawValue.endsWith(' ');
    if (endsWithSpace) return rawValue + label;
    const tokens = rawValue.split(/\s+/);
    tokens[tokens.length - 1] = label;
    return tokens.join(' ');
  };

  // Merged transitions carry a comma-separated event list. Appends a new event after a
  // trailing comma, or replaces the segment currently being typed — never the whole field.
  const buildEventValue = (label: string) => {
    const endsWithSeparator = /,\s*$/.test(rawValue);
    const parts = rawValue.split(',').map((p) => p.trim()).filter((p) => p !== '');
    if (endsWithSeparator) return [...parts, label].join(', ');
    if (parts.length === 0) return label;
    parts[parts.length - 1] = label;
    return parts.join(', ');
  };

  const acceptSuggestion = (s: Suggestion) => {
    if (selectionMode === 'undecided') {
      setSelectionMode(s.kind === 'event' ? 'event' : 'cond');
      setRawValue(s.label);
    } else if (selectionMode === 'cond') {
      setRawValue(buildCondValue(s.label));
    } else if (selectionMode === 'event') {
      setRawValue(buildEventValue(s.label));
    } else {
      setRawValue(s.label);
    }
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const reportApplyResult = (result: TransitionApplyResult) => {
    if (result && result.blocked) {
      setApplyError(result.reason ?? 'This change is not allowed.');
      return;
    }
    setApplyError(null);
    showFeedback('Transition updated.', 'info');
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => onClose(), 400);
  };

  const handleApply = () => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      const result = onApply({
        newValue: '',
        editingField: 'none',
        delay: null,
        cancelSendId: null,
        originalEventName: event,
        originalCancelSendId: initCancelId || undefined,
      });
      reportApplyResult(result);
      return;
    }

    const timeParsed = parseAfterSyntax(trimmed);

    if (timeParsed) {
      // Preserve existing _t_ event name (prop), or the one we already generated this session,
      // or generate a fresh one. The ref prevents a rapid double-click from incrementing the
      // index a second time before the parent re-renders with the updated event prop.
      const existingName = findTimeEventToken(event) ?? appliedTimeEventRef.current;
      const eventName = existingName ?? generateTimeEventName(source, scxmlContent);
      appliedTimeEventRef.current = eventName;
      const timeResult = onApply({
        newValue: eventName,
        editingField: 'event',
        delay: timeParsed,
        cancelSendId: eventName,
        originalEventName: event,
        originalCancelSendId: initCancelId || undefined,
      });
      reportApplyResult(timeResult);
      return;
    }

    // Merged event list containing exactly one "after X" segment alongside plain event(s) —
    // event-merge can pair a time event with a plain event sharing target/cond/actions. The
    // "after X" segment maps back onto the underlying _t_ event name; other segments pass through
    // as literal event names, rejoined in place so the merged @_event list round-trips correctly.
    const segments = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    const afterMatches = segments
      .map((s, index) => ({ index, parsed: parseAfterSyntax(s) }))
      .filter((m): m is { index: number; parsed: { type: 'delay' | 'delayexpr'; value: string } } => m.parsed !== null);

    if (segments.length > 1 && afterMatches.length === 1) {
      const { index: afterIndex, parsed } = afterMatches[0];
      const existingName = findTimeEventToken(event) ?? appliedTimeEventRef.current;
      const eventName = existingName ?? generateTimeEventName(source, scxmlContent);
      appliedTimeEventRef.current = eventName;
      const newValue = segments.map((s, i) => (i === afterIndex ? eventName : s)).join(', ');
      const timeResult = onApply({
        newValue,
        editingField: 'event',
        delay: parsed,
        cancelSendId: eventName,
        originalEventName: event,
        originalCancelSendId: initCancelId || undefined,
      });
      reportApplyResult(timeResult);
      return;
    }

    if (segments.length > 1 && afterMatches.length > 1) {
      setApplyError('Only one time transition ("after X") is allowed per merged event list.');
      return;
    }

    // Regular event or condition
    const resolvedField: 'event' | 'cond' =
      selectionMode !== 'undecided' ? editingField :
      events.some((e) => e.name === trimmed) ? 'event' : 'cond';

    const isNewChannel = suggestions.length === 1 && suggestions[0].kind === 'new-channel';
    if (isNewChannel && onNewChannel) {
      onNewChannel(trimmed, source, target, event, cond, resolvedField, edgeId);
      return;
    }

    const result = onApply({
      newValue: trimmed,
      editingField: resolvedField,
      delay: null,
      cancelSendId: null,
      originalEventName: event,
      originalCancelSendId: initCancelId || undefined,
    });
    reportApplyResult(result);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const showSuggestions = isOpen && suggestions.length > 0;
    if (showSuggestions) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((p) => p < suggestions.length - 1 ? p + 1 : 0); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((p) => p > 0 ? p - 1 : suggestions.length - 1); return; }
      if (e.key === 'Tab' && activeIndex >= 0) { e.preventDefault(); acceptSuggestion(suggestions[activeIndex]); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) acceptSuggestion(suggestions[activeIndex]);
        else if (suggestions[0]?.kind === 'new-channel') acceptSuggestion(suggestions[0]);
        else handleApply();
        return;
      }
      if (e.key === 'Escape') { setIsOpen(false); setActiveIndex(-1); return; }
    }
    // Prevent inserting a newline — Enter always submits/accepts, never breaks the line.
    if (e.key === 'Enter') { e.preventDefault(); handleApply(); return; }
    if (e.key === 'Escape') { onClose(); return; }
  };

  const hintMessage = React.useMemo(() => {
    if (!isOpen || rawValue.length === 0) return null;
    // Guide user if they've started typing "after" but the format isn't complete yet
    if (rawValue.trimStart().startsWith('after') && parseAfterSyntax(rawValue.trim()) === null) {
      return 'Time transition format: after 2s  ·  after 714ms  ·  after (expression) s';
    }
    if (selectionMode === 'event' || suggestions.length > 0) return null;
    return 'No match — type "this_" to create a new channel, or "after Xs" for a time transition';
  }, [isOpen, rawValue, selectionMode, suggestions]);

  const showSuggestions = isOpen && suggestions.length > 0;
  const showDropdown = showSuggestions || hintMessage !== null;

  const displayValue = activeIndex >= 0 && suggestions[activeIndex]
    ? editingField === 'cond' ? buildCondValue(suggestions[activeIndex].label)
      : editingField === 'event' ? buildEventValue(suggestions[activeIndex].label)
      : suggestions[activeIndex].label
    : rawValue;

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea to fit its content, growing vertically up to a cap —
  // beyond that it scrolls internally instead of pushing the Save/Cancel footer off-panel.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // box-sizing: border-box means the height we set includes the border, but scrollHeight
    // doesn't — without adding it back, content is always ~border-width short of fitting,
    // leaving a permanent 1-2px overflow that keeps the scrollbar visible even for one line.
    const { borderTopWidth, borderBottomWidth } = getComputedStyle(el);
    const borderAdjustment = parseFloat(borderTopWidth) + parseFloat(borderBottomWidth);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + borderAdjustment, MAX_TEXTAREA_HEIGHT)}px`;
  }, [displayValue]);

  const renderBadge = (s: Suggestion) => {
    if (s.kind === 'mapped-channel') {
      const mappedChannelName = channelMappings.find((m) => m.scxmlRef === s.label)?.mappedChannel;
      const type = channels.find((c) => c.name === mappedChannelName)?.type;
      return type ? (
        <span className='text-xs px-1 py-0.5 rounded font-mono text-black' style={{ backgroundColor: BADGE_COLORS[type] }}>{type}</span>
      ) : null;
    }
    if (s.kind !== 'channel' && s.kind !== 'event' && s.kind !== 'variable') return null;
    const type = s.kind === 'variable'
      ? getVariableType(s.label)
      : channels.find((c) => c.name === s.label)?.type ?? events.find((ev) => ev.name === s.label)?.type;
    return type ? (
      <span className='text-xs px-1 py-0.5 rounded font-mono text-black' style={{ backgroundColor: BADGE_COLORS[type] }}>{type}</span>
    ) : null;
  };

  const footer = (
    <div className='flex gap-2'>
      <button onClick={handleApply} className='px-3 py-1.5 text-xs font-semibold bg-primary text-primary-fg rounded-md hover:opacity-90 transition-opacity'>Save</button>
      <button onClick={onClose} className='px-3 py-1.5 text-xs border border-default text-muted rounded-md hover:text-default transition-colors'>Cancel</button>
    </div>
  );

  return (
    <Panel title='Transition' onClose={onClose} footer={footer}>
      {/* source → target */}
      <div className='flex items-center gap-1.5 px-3 py-1.5 border-b border-default text-[10px] text-muted'>
        <span className='border border-default rounded px-1.5 py-0.5 text-default'>{source}</span>
        <span>→</span>
        <span className='border border-default rounded px-1.5 py-0.5 text-default'>{target}</span>
      </div>

      <div className='px-3 py-2.5'>
        <div className='relative'>
          <textarea
            ref={textareaRef}
            rows={1}
            value={displayValue}
            onChange={(e) => {
              const v = e.target.value;
              setRawValue(v);
              if (v === '') setSelectionMode('undecided');
              setIsOpen(true);
              setActiveIndex(-1);
              setApplyError(null);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => { blurTimerRef.current = setTimeout(() => setIsOpen(false), 100); }}
            onKeyDown={handleKeyDown}
            placeholder={selectionMode === 'event' ? 'Enter event' : selectionMode === 'cond' ? 'Enter condition' : 'Search events, channels, or type "after Xs"...'}
            className='w-full px-3 py-1.5 text-sm text-default bg-elevated border border-default rounded-md placeholder:text-dimmed focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none overflow-y-auto scrollbar-thin'
          />
          {showDropdown && (
            <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-elevated border border-default rounded-md shadow-lg max-h-48 overflow-y-auto'>
              {hintMessage && (
                <div className='px-3 py-2 text-xs text-dimmed italic select-none'>{hintMessage}</div>
              )}
              {suggestions.map((s, i) => (
                <div key={s.label} onMouseDown={() => acceptSuggestion(s)}
                  className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                    s.kind === 'new-channel' ? 'bg-amber-50 text-amber-800 border-l-2 border-amber-400'
                    : i === activeIndex ? 'bg-primary text-primary-fg' : 'hover:bg-primary-muted text-default'}`}>
                  {s.kind === 'new-channel' && <span className='text-xs text-amber-600'>(new channel)</span>}
                  {renderBadge(s)}
                  <span>{s.label}</span>
                  {s.kind === 'mapped-channel' && (
                    <span className='text-xs text-muted ml-1'>→ {channelMappings.find((m) => m.scxmlRef === s.label)?.mappedChannel}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {applyError && (
          <p className='mt-1.5 text-xs text-error'>{applyError}</p>
        )}
      </div>

    </Panel>
  );
};
