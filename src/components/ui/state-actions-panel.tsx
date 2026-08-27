'use client';

import { BADGE_COLORS, EVENT_FALLBACK_VALUE, getVariableType } from '@/lib';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { useActionClipboardStore } from '@/stores/action-clipboard-store';
import { ClipboardPaste, Copy, GripVertical, Plus, X } from 'lucide-react';
import React from 'react';
import { Panel, inputClass, FormActions, PanelEmptyState } from '@/components/ui/primitives';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';
import { reorderByDragEvent } from '@/lib/utils/reorder-by-drag-event';
import {
  getExpressionSuggestions,
  applyExpressionSuggestion,
  type ExpressionSuggestion,
} from '@/lib/utils/expression-autocomplete';
import { getCaretCoordinates } from '@/lib/utils/textarea-caret';
import type { ChannelInfo, ChannelMapping } from '@/types/host-api';

export interface AssignActionRow { type: 'assign'; location: string; expr: string; }
interface SendActionRow   { type: 'send'; event: string; delayType: 'delay' | 'delayexpr'; delayValue: string; }
interface CancelActionRow { type: 'cancel'; sendid: string; }
type ActionRow = AssignActionRow | SendActionRow | CancelActionRow;

export interface InternalEventActionRow {
  event: string;
  location: string;
  expr: string;
  type: 'internal' | 'external';
}

type Tab = 'onentry' | 'onexit' | 'reactions';
type FormMode = 'idle' | 'editing' | 'adding';
type Suggestion = { label: string; kind: 'channel' | 'variable' | 'new-channel' };

interface StateActionsPanelProps {
  isVisible: boolean;
  onClose: () => void;
  stateId: string;
  entryActions: ActionRow[];
  exitActions: ActionRow[];
  internalEventActions: InternalEventActionRow[];
  scxmlContent: string;
  stateType: 'simple' | 'compound' | 'parallel' | 'final';
  isInitial: boolean;
  canMarkInitial: boolean;
  onToggleInitial: () => void;
  onApply: (entryActions: string[], exitActions: string[]) => void;
  onApplyReactions: (actions: InternalEventActionRow[]) => void;
  onNewChannel?: (
    channelName: string,
    apply:
      | { kind: 'actions'; entryActions: string[]; exitActions: string[] }
      | { kind: 'reactions'; actions: InternalEventActionRow[] }
  ) => void;
}

function toStrings(rows: ActionRow[]): string[] {
  return rows.map((r): string | undefined => {
    if (r.type === 'assign') return (r.location && r.expr) ? `assign|${r.location}|${r.expr}` : undefined;
    if (r.type === 'send') return `send|${r.event}|${r.delayType}|${r.delayValue}`;
    if (r.type === 'cancel') return `cancel|${r.sendid}`;
  }).filter((s): s is string => s !== undefined);
}

// Rows have no persistent identity in the SCXML source (they're plain
// tuples). We attach a client-only `_rowId` so React and dnd-kit can track
// each row's identity across a reorder instead of recycling identity by
// array index — index-as-id caused the dragged row to visually snap back to
// its old position before jumping to the new one, since dnd-kit had no way
// to tell that "slot 0" now holds a different row.
type WithRowId<T> = T & { _rowId: string };

function withRowIds<T>(rows: T[]): WithRowId<T>[] {
  return rows.map((row) => ({ ...row, _rowId: uuidv4() }));
}

interface SortableActionRowProps {
  id: string;
  index: number;
  disabled: boolean;
  align?: 'center' | 'start';
  onClick: () => void;
  onCopy?: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

function SortableActionRow({
  id,
  index,
  disabled,
  align = 'center',
  onClick,
  onCopy,
  onDelete,
  children,
}: SortableActionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex ${align === 'start' ? 'items-start' : 'items-center'} justify-between px-2 py-1.5 rounded text-xs cursor-pointer group hover:bg-muted`}
    >
      <div className={`flex ${align === 'start' ? 'items-start' : 'items-center'} gap-1.5 min-w-0 flex-1`}>
        <button
          type='button'
          aria-label='Reorder action'
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
          className={`flex-shrink-0 ${
            disabled
              ? 'text-dimmed opacity-30 cursor-not-allowed'
              : 'text-dimmed hover:text-default cursor-grab active:cursor-grabbing'
          }`}
        >
          <GripVertical className='h-3 w-3' />
        </button>
        <span
          data-testid='action-order-badge'
          className='text-[10px] text-dimmed font-mono flex-shrink-0 w-4 text-right'
        >
          {index + 1}
        </span>
        <div className='min-w-0 flex-1'>{children}</div>
      </div>
      <div
        className={`ml-2 flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${
          align === 'start' ? 'mt-0.5' : ''
        }`}
      >
        {onCopy && (
          <button
            type='button'
            title='Copy action'
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className='text-dimmed hover:text-primary'
          >
            <Copy className='h-3 w-3' />
          </button>
        )}
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className='text-dimmed hover:text-error'
        >
          <X className='h-3 w-3' />
        </button>
      </div>
    </div>
  );
}

interface ExpressionSuggestionDropdownProps {
  textareaEl: HTMLTextAreaElement | null;
  cursorPos: number;
  suggestions: ExpressionSuggestion[];
  activeIndex: number;
  channels: ChannelInfo[];
  channelMappings: ChannelMapping[];
  onSelect: (s: ExpressionSuggestion) => void;
}

function ExpressionSuggestionDropdown({
  textareaEl,
  cursorPos,
  suggestions,
  activeIndex,
  channels,
  channelMappings,
  onSelect,
}: ExpressionSuggestionDropdownProps) {
  const caret = textareaEl ? getCaretCoordinates(textareaEl, cursorPos) : null;

  // Assumed dropdown width for clamping, matching the max-w set on the
  // dropdown's own class below — keeps it from overflowing the panel's
  // right edge when the caret is near the end of a long line.
  const DROPDOWN_WIDTH = 200;
  const containerWidth = textareaEl?.clientWidth ?? 0;
  const clampedLeft = caret ? Math.max(0, Math.min(caret.left, containerWidth - DROPDOWN_WIDTH)) : 0;

  const positionStyle: React.CSSProperties = caret
    ? { top: caret.top + caret.height + 4, left: clampedLeft }
    : {};
  const positionClassName = caret
    ? 'absolute z-50 bg-elevated border border-default rounded shadow-lg max-h-36 w-[200px] overflow-y-auto'
    : 'absolute top-full left-0 right-0 mt-1 z-50 bg-elevated border border-default rounded shadow-lg max-h-36 overflow-y-auto';

  const renderBadge = (s: ExpressionSuggestion) => {
    if (s.kind === 'operator' || s.kind === 'new-channel') return null;
    const type =
      s.kind === 'variable'
        ? getVariableType(s.label)
        : s.kind === 'channel'
          ? channels.find((c) => c.name === s.label)?.type
          : channels.find((c) => c.name === channelMappings.find((m) => m.scxmlRef === s.label)?.mappedChannel)?.type;
    if (!type) return null;
    return (
      <span
        className='text-xs px-1 rounded font-mono text-black'
        style={{ backgroundColor: BADGE_COLORS[type] }}
      >
        {type}
      </span>
    );
  };

  return (
    <div className={positionClassName} style={positionStyle}>
      {suggestions.map((s, i) => (
        <div
          key={`${s.kind}-${s.label}`}
          onMouseDown={() => onSelect(s)}
          className={`px-2 py-1 text-xs cursor-pointer flex items-center gap-2 ${
            s.kind === 'new-channel'
              ? 'bg-amber-50 text-amber-800 border-l-2 border-amber-400'
              : i === activeIndex
                ? 'bg-primary text-primary-fg'
                : 'hover:bg-primary-muted text-default'
          }`}
        >
          {s.kind === 'new-channel' && <span className='text-xs text-amber-600'>(new channel)</span>}
          {renderBadge(s)}
          <span>{s.label}</span>
          {s.kind === 'mapped-channel' && (
            <span className='text-xs text-muted ml-1'>→ {channelMappings.find((m) => m.scxmlRef === s.label)?.mappedChannel}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function StateActionsPanel({
  isVisible,
  onClose,
  stateId,
  entryActions: initialEntry,
  exitActions: initialExit,
  internalEventActions: initialReactions,
  scxmlContent,
  stateType,
  isInitial,
  canMarkInitial,
  onToggleInitial,
  onApply,
  onApplyReactions,
  onNewChannel,
}: StateActionsPanelProps) {
  const [activeTab, setActiveTab] = React.useState<Tab>('onentry');
  const [localEntry, setLocalEntry] = React.useState<WithRowId<ActionRow>[]>(() => withRowIds(initialEntry));
  const [localExit, setLocalExit] = React.useState<WithRowId<ActionRow>[]>(() => withRowIds(initialExit));
  const [localReactions, setLocalReactions] = React.useState<WithRowId<InternalEventActionRow>[]>(() => withRowIds(initialReactions));

  // Form state
  const [formMode, setFormMode] = React.useState<FormMode>('idle');
  const [editingRowIndex, setEditingRowIndex] = React.useState<number | null>(null);
  const [formEvent, setFormEvent] = React.useState('');
  const [formLocation, setFormLocation] = React.useState('');
  const [formExpr, setFormExpr] = React.useState('');
  const [formReactionType, setFormReactionType] = React.useState<'internal' | 'external'>('internal');

  // Autocomplete state — location field
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autocomplete state — expression field (independent of the location
  // field's: different token model — multi-token expression vs. a single
  // identifier — and its own cursor position to track).
  const [isExprOpen, setIsExprOpen] = React.useState(false);
  const [exprActiveIndex, setExprActiveIndex] = React.useState(-1);
  const [exprCursorPos, setExprCursorPos] = React.useState(0);
  const exprBlurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const exprTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const formRef = React.useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const channels = useHostAPIStore((s) => s.channels);
  const channelMappings = useHostAPIStore((s) => s.channelMappings);
  const showFeedback = useHostAPIStore((s) => s.showFeedback);
  const copied = useActionClipboardStore((s) => s.copied);
  const canPaste = copied !== null && copied.kind === (activeTab === 'reactions' ? 'reaction' : 'action');
  const dataVars = React.useMemo(
    () => extractDatamodelVariables(scxmlContent),
    [scxmlContent],
  );

  const currentList = activeTab === 'onentry' ? localEntry : localExit;

  const resetForm = React.useCallback(() => {
    setFormMode('idle');
    setEditingRowIndex(null);
    setFormEvent('');
    setFormLocation('');
    setFormExpr('');
    setFormReactionType('internal');
    setIsOpen(false);
    setActiveIndex(-1);
    setIsExprOpen(false);
    setExprActiveIndex(-1);
  }, []);

  // Reset local lists and form when the selected state changes
  React.useEffect(() => {
    setLocalEntry(withRowIds(initialEntry));
    setLocalExit(withRowIds(initialExit));
    setLocalReactions(withRowIds(initialReactions));
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId]);

  // Cleanup blur timer on unmount
  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      if (exprBlurTimerRef.current) clearTimeout(exprBlurTimerRef.current);
    };
  }, []);

  const suggestions: Suggestion[] = React.useMemo(() => {
    if (formMode === 'idle') return [];
    const prefix = formLocation.toLowerCase();
    const channelSet = new Set(channels.map((c) => c.name));
    const vars = dataVars
      .filter((v) => !channelSet.has(v) && v.toLowerCase().includes(prefix))
      .map((v): Suggestion => ({ label: v, kind: 'variable' }));
    const chans = channels
      .filter((c) => c.name.toLowerCase().includes(prefix))
      .map((c): Suggestion => ({ label: c.name, kind: 'channel' }));
    const combined = [...vars, ...chans];
    if (combined.length === 0 && formLocation.startsWith('this_')) {
      return [{ label: formLocation, kind: 'new-channel' }];
    }
    return combined;
  }, [formLocation, dataVars, channels, formMode]);

  const showSuggestions = isOpen && suggestions.length > 0;

  const selectSuggestion = (s: Suggestion) => {
    setFormLocation(s.label);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const exprSuggestionResult = React.useMemo(() => {
    if (formMode === 'idle') return { suggestions: [] as ExpressionSuggestion[], tokenStart: 0, tokenEnd: 0 };
    return getExpressionSuggestions(formExpr, exprCursorPos, {
      variables: dataVars,
      channels,
      channelMappings,
    });
  }, [formExpr, exprCursorPos, dataVars, channels, channelMappings, formMode]);

  const exprSuggestions = exprSuggestionResult.suggestions;
  const showExprSuggestions = isExprOpen && exprSuggestions.length > 0;

  // Live preview while arrow-cycling the dropdown, matching the Location
  // field's existing preview-swap pattern — splices the highlighted
  // suggestion into its token range without committing to formExpr/state
  // until Tab/Enter actually accepts it.
  const exprDisplayValue =
    exprActiveIndex >= 0 && exprSuggestions[exprActiveIndex]
      ? applyExpressionSuggestion(
          formExpr,
          exprSuggestionResult.tokenStart,
          exprSuggestionResult.tokenEnd,
          exprSuggestions[exprActiveIndex].label
        ).newText
      : formExpr;

  const selectExprSuggestion = (s: ExpressionSuggestion) => {
    const { newText, newCursorPos } = applyExpressionSuggestion(
      formExpr,
      exprSuggestionResult.tokenStart,
      exprSuggestionResult.tokenEnd,
      s.label
    );
    setFormExpr(newText);
    setIsExprOpen(false);
    setExprActiveIndex(-1);
    requestAnimationFrame(() => {
      exprTextareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      exprTextareaRef.current?.focus();
    });

    // The channel just needs to exist as a <data> element for the expression
    // to reference it — the assign row itself (location/expr) isn't
    // committed until Apply, so we pass the *current*, unmodified action
    // lists here rather than anything from the in-progress form. This makes
    // the parent's list-update step a no-op re-write while still running its
    // AddDataCommand step to register the channel.
    if (s.kind === 'new-channel' && onNewChannel) {
      if (activeTab === 'reactions') {
        onNewChannel(s.label, {
          kind: 'reactions',
          actions: localReactions.map(({ _rowId, ...rest }) => rest),
        });
      } else {
        onNewChannel(s.label, {
          kind: 'actions',
          entryActions: toStrings(localEntry),
          exitActions: toStrings(localExit),
        });
      }
    }
  };

  const handleApply = () => {
    if (formMode === 'idle') return;
    const isNewChannel = suggestions.length === 1 && suggestions[0].kind === 'new-channel';

    if (activeTab === 'reactions') {
      const rowId = formMode === 'editing' && editingRowIndex !== null
        ? localReactions[editingRowIndex]._rowId
        : uuidv4();
      const newRow: WithRowId<InternalEventActionRow> = {
        _rowId: rowId,
        event: formEvent,
        location: formLocation,
        expr: formExpr,
        type: formReactionType,
      };
      const updatedList: WithRowId<InternalEventActionRow>[] =
        formMode === 'adding'
          ? [...localReactions, newRow]
          : localReactions.map((r, i) => (i === editingRowIndex ? newRow : r));
      setLocalReactions(updatedList);
      if (isNewChannel && onNewChannel) {
        onNewChannel(formLocation, { kind: 'reactions', actions: updatedList });
      } else {
        onApplyReactions(updatedList);
      }
      resetForm();
      showFeedback('Reaction saved.', 'info');
      return;
    }

    const rowId = formMode === 'editing' && editingRowIndex !== null
      ? currentList[editingRowIndex]._rowId
      : uuidv4();
    const newRow: WithRowId<AssignActionRow> = { _rowId: rowId, type: 'assign', location: formLocation, expr: formExpr };

    const updatedList: WithRowId<ActionRow>[] = formMode === 'adding'
      ? [...currentList, newRow]
      : currentList.map((r, i) => (i === editingRowIndex ? newRow : r));

    if (activeTab === 'onentry') {
      setLocalEntry(updatedList);
      if (isNewChannel && onNewChannel) {
        onNewChannel(formLocation, { kind: 'actions', entryActions: toStrings(updatedList), exitActions: toStrings(localExit) });
      } else {
        onApply(toStrings(updatedList), toStrings(localExit));
      }
    } else {
      setLocalExit(updatedList);
      if (isNewChannel && onNewChannel) {
        onNewChannel(formLocation, { kind: 'actions', entryActions: toStrings(localEntry), exitActions: toStrings(updatedList) });
      } else {
        onApply(toStrings(localEntry), toStrings(updatedList));
      }
    }

    resetForm();
    showFeedback('Action saved.', 'info');
  };

  const handleDelete = (index: number) => {
    if (formMode === 'editing' && editingRowIndex === index) resetForm();

    if (activeTab === 'reactions') {
      const updated = localReactions.filter((_, i) => i !== index);
      setLocalReactions(updated);
      onApplyReactions(updated);
      return;
    }

    const updated = currentList.filter((_, i) => i !== index);
    if (activeTab === 'onentry') {
      setLocalEntry(updated);
      onApply(toStrings(updated), toStrings(localExit));
    } else {
      setLocalExit(updated);
      onApply(toStrings(localEntry), toStrings(updated));
    }
  };

  const handleCopyRow = (row: ActionRow) => {
    if (row.type !== 'assign') return;
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: row.location, expr: row.expr },
    });
    showFeedback('Action copied.', 'info');
  };

  const handleCopyReaction = (row: InternalEventActionRow) => {
    useActionClipboardStore.getState().copy({
      kind: 'reaction',
      row: { event: row.event, location: row.location, expr: row.expr, type: row.type },
    });
    showFeedback('Action copied.', 'info');
  };

  const handlePaste = () => {
    if (!copied) return;

    if (activeTab === 'reactions') {
      if (copied.kind !== 'reaction') return;
      const newRow: WithRowId<InternalEventActionRow> = { ...copied.row, _rowId: uuidv4() };
      const updated = [...localReactions, newRow];
      setLocalReactions(updated);
      onApplyReactions(updated);
      showFeedback('Action pasted.', 'info');
      return;
    }

    if (copied.kind !== 'action') return;
    const newRow: WithRowId<ActionRow> = { ...copied.row, _rowId: uuidv4() };
    const updated = [...currentList, newRow];
    if (activeTab === 'onentry') {
      setLocalEntry(updated);
      onApply(toStrings(updated), toStrings(localExit));
    } else {
      setLocalExit(updated);
      onApply(toStrings(localEntry), toStrings(updated));
    }
    showFeedback('Action pasted.', 'info');
  };

  const handleActionsDragEnd = (event: DragEndEvent) => {
    const reordered = reorderByDragEvent(currentList, (r) => r._rowId, event.active.id, event.over?.id);
    if (reordered === currentList) return;

    if (activeTab === 'onentry') {
      setLocalEntry(reordered);
      onApply(toStrings(reordered), toStrings(localExit));
    } else {
      setLocalExit(reordered);
      onApply(toStrings(localEntry), toStrings(reordered));
    }
  };

  const handleReactionsDragEnd = (event: DragEndEvent) => {
    const reordered = reorderByDragEvent(localReactions, (r) => r._rowId, event.active.id, event.over?.id);
    if (reordered === localReactions) return;

    setLocalReactions(reordered);
    onApplyReactions(reordered);
  };

  const handleRowClick = (row: ActionRow, index: number) => {
    if (row.type !== 'assign') return;
    setFormMode('editing');
    setEditingRowIndex(index);
    setFormLocation(row.location);
    setFormExpr(row.expr);
    setFormEvent('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleReactionsRowClick = (row: InternalEventActionRow, index: number) => {
    setFormMode('editing');
    setEditingRowIndex(index);
    setFormEvent(row.event);
    setFormLocation(row.location);
    setFormExpr(row.expr);
    setFormReactionType(row.type);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleAddClick = () => {
    setFormMode('adding');
    setEditingRowIndex(null);
    setFormEvent(activeTab === 'reactions' ? 'vector' : '');
    setFormLocation('');
    setFormExpr('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((p) => (p < suggestions.length - 1 ? p + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((p) => (p > 0 ? p - 1 : suggestions.length - 1));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex >= 0 ? activeIndex : 0]);
        return;
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }
    }
    if (e.key === 'Enter') handleApply();
    if (e.key === 'Escape') resetForm();
  };

  // Discard an in-progress add/edit when the user clicks anywhere in the
  // panel outside the inline form itself (e.g. another tab's blank area,
  // the sub-header, or empty list space) — mirrors clicking Discard.
  const handlePanelMouseDown = (e: React.MouseEvent) => {
    if (formMode === 'idle') return;
    if (formRef.current && !formRef.current.contains(e.target as Node)) {
      resetForm();
    }
  };

  const isApplyDisabled =
    (activeTab === 'reactions' && (!formEvent || !formLocation || !formExpr)) ||
    (activeTab !== 'reactions' && (!formLocation || !formExpr));

  // Inline form shared between expanded rows and the new-action form
  const inlineForm = (
    <div ref={formRef} className='bg-primary-muted rounded p-2 space-y-1.5'>
      {/* reactions: event field + type toggle */}
      {activeTab === 'reactions' && (
        <>
          <div>
            <label className='text-[10px] text-muted block mb-0.5'>Event</label>
            <input
              type='text'
              value={formEvent}
              onChange={(e) => setFormEvent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApply();
                if (e.key === 'Escape') resetForm();
              }}
              placeholder='vector'
              className={inputClass}
            />
          </div>
          <div>
            <label className='text-[10px] text-muted block mb-0.5'>Type</label>
            <div className='flex gap-1'>
              {(['internal', 'external'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFormReactionType(t)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    formReactionType === t
                      ? 'border-primary bg-primary text-primary-fg'
                      : 'border-default text-muted hover:border-primary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* assign fields (also used by reactions tab for location + expr) */}
      <div className='relative'>
        <label className='text-[10px] text-muted block mb-0.5'>Location</label>
        <input
          autoFocus
          type='text'
          value={activeIndex >= 0 ? suggestions[activeIndex].label : formLocation}
          onChange={(e) => {
            setFormLocation(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setIsOpen(false), 100);
          }}
          onKeyDown={handleLocationKeyDown}
          placeholder='variable or channel'
          className={inputClass}
        />
        {showSuggestions && (
          <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-elevated border border-default rounded shadow-lg max-h-36 overflow-y-auto'>
            {suggestions.map((s, i) => (
              <div
                key={s.label}
                onMouseDown={() => selectSuggestion(s)}
                className={`px-2 py-1 text-xs cursor-pointer flex items-center gap-2 ${
                  s.kind === 'new-channel'
                    ? 'bg-amber-50 text-amber-800 border-l-2 border-amber-400'
                    : i === activeIndex
                      ? 'bg-primary text-primary-fg'
                      : 'hover:bg-primary-muted text-default'
                }`}
              >
                {s.kind === 'new-channel' && <span className='text-xs text-amber-600'>(new channel)</span>}
                {s.kind !== 'new-channel' && (
                  <span
                    className='text-xs px-1 rounded font-mono text-black'
                    style={{
                      backgroundColor: BADGE_COLORS[
                        s.kind === 'channel'
                          ? (channels.find((c) => c.name === s.label)?.type ?? EVENT_FALLBACK_VALUE)
                          : getVariableType(s.label)
                      ],
                    }}
                  >
                    {s.kind === 'channel'
                      ? (channels.find((c) => c.name === s.label)?.type ?? EVENT_FALLBACK_VALUE)
                      : getVariableType(s.label)}
                  </span>
                )}
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className='relative'>
        <label className='text-[10px] text-muted block mb-0.5'>Expression</label>
        <textarea
          ref={exprTextareaRef}
          value={exprDisplayValue}
          onChange={(e) => {
            setFormExpr(e.target.value);
            setExprCursorPos(e.target.selectionStart ?? e.target.value.length);
            setIsExprOpen(true);
            setExprActiveIndex(-1);
          }}
          onSelect={(e) => {
            // Fires on any caret/selection change — arrow-left/right, Home/End,
            // clicking elsewhere in the text — not just typing (onChange).
            // Without this, exprCursorPos goes stale once the user moves the
            // caret without editing, and the suggestion dropdown detaches from
            // where the caret actually is until the next keystroke self-corrects it.
            setExprCursorPos(e.currentTarget.selectionStart ?? 0);
          }}
          onBlur={() => {
            exprBlurTimerRef.current = setTimeout(() => setIsExprOpen(false), 100);
          }}
          onKeyDown={(e) => {
            if (showExprSuggestions) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setExprActiveIndex((p) => (p < exprSuggestions.length - 1 ? p + 1 : 0));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setExprActiveIndex((p) => (p > 0 ? p - 1 : exprSuggestions.length - 1));
                return;
              }
              if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                selectExprSuggestion(exprSuggestions[exprActiveIndex >= 0 ? exprActiveIndex : 0]);
                return;
              }
              if (e.key === 'Escape') {
                setIsExprOpen(false);
                setExprActiveIndex(-1);
                return;
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleApply();
            }
            if (e.key === 'Escape') resetForm();
          }}
          placeholder='expression'
          rows={3}
          className={`${inputClass} resize-y font-mono`}
        />
        {showExprSuggestions && (
          <ExpressionSuggestionDropdown
            textareaEl={exprTextareaRef.current}
            cursorPos={exprCursorPos}
            suggestions={exprSuggestions}
            activeIndex={exprActiveIndex}
            channels={channels}
            channelMappings={channelMappings}
            onSelect={selectExprSuggestion}
          />
        )}
      </div>

      <FormActions
        onApply={handleApply}
        onDiscard={resetForm}
        applyDisabled={isApplyDisabled}
        className='justify-end'
      />
    </div>
  );

  if (!isVisible) return null;

  return (
    <Panel title='State Actions' onClose={onClose} widthClass='w-[520px]'>
      <div className='flex flex-col h-full' onMouseDown={handlePanelMouseDown}>
        {/* Sub-header: stateId + add button */}
        <div className='flex items-center justify-between px-3 py-1.5 border-b border-default bg-muted flex-shrink-0'>
          <p className='text-xs text-primary'>{stateId}</p>
          <div className='flex items-center gap-1'>
            <button
              onClick={handlePaste}
              disabled={!canPaste}
              title={canPaste ? 'Paste action' : 'Copy an action first'}
              className={`p-0.5 rounded transition-colors ${
                canPaste
                  ? 'text-dimmed hover:text-primary hover:bg-primary-muted'
                  : 'text-dimmed opacity-30 cursor-not-allowed'
              }`}
            >
              <ClipboardPaste className='h-4 w-4' />
            </button>
            <button
              onClick={handleAddClick}
              title='Add action'
              className='text-dimmed hover:text-primary p-0.5 rounded hover:bg-primary-muted transition-colors'
            >
              <Plus className='h-4 w-4' />
            </button>
          </div>
        </div>

        {/* Initial State toggle — only markable for simple/compound states.
            Unmarking is always allowed; only marking can be blocked (it would
            merge two Initial State groups). */}
        {(stateType === 'simple' || stateType === 'compound') && (() => {
          const disabled = !isInitial && !canMarkInitial;
          const title = !isInitial && !canMarkInitial
            ? 'This state is already connected (directly or indirectly) to another Initial State — marking it would merge two Initial State groups'
            : undefined;

          return (
            <div className='flex items-center px-3 py-1 border-b border-default bg-muted flex-shrink-0'>
              <label
                className={`flex items-center gap-1.5 text-[10px] ${
                  disabled ? 'text-dimmed cursor-not-allowed' : 'text-muted cursor-pointer'
                }`}
                title={title}
              >
                <input
                  type='checkbox'
                  checked={isInitial}
                  disabled={disabled}
                  onChange={onToggleInitial}
                  className='h-3 w-3'
                />
                Initial State
              </label>
            </div>
          );
        })()}

        {/* Tabs */}
        <div className='flex border-b border-default flex-shrink-0'>
          {(['onentry', 'onexit', 'reactions'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                resetForm();
              }}
              className={`flex-1 py-1.5 text-[10px] font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-b-2 border-primary text-primary bg-primary-muted'
                  : 'text-muted hover:text-default'
              }`}
            >
              {tab === 'reactions'
              ? `event reactions (${localReactions.length})`
              : `${tab} (${(tab === 'onentry' ? localEntry : localExit).length})`}
            </button>
          ))}
        </div>

      {/* Action list — scrolls independently */}
      <div className='flex-1 overflow-y-auto p-2 space-y-1'>
        {activeTab === 'reactions' ? (
          <>
            {localReactions.length === 0 && formMode !== 'adding' && (
              <PanelEmptyState><p>No reactions yet.</p></PanelEmptyState>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReactionsDragEnd}>
              <SortableContext
                items={localReactions.map((r) => r._rowId)}
                strategy={verticalListSortingStrategy}
              >
                {localReactions.map((row, index) =>
                  formMode === 'editing' && editingRowIndex === index ? (
                    <div key={row._rowId}>{inlineForm}</div>
                  ) : (
                    <SortableActionRow
                      key={row._rowId}
                      id={row._rowId}
                      index={index}
                      disabled={formMode !== 'idle'}
                      align='start'
                      onClick={() => handleReactionsRowClick(row, index)}
                      onCopy={() => handleCopyReaction(row)}
                      onDelete={() => handleDelete(index)}
                    >
                      <div className='flex flex-col min-w-0'>
                        <div className='flex items-center gap-1'>
                          <span className='text-primary text-[10px] font-medium'>{row.event}</span>
                          <span className='text-[9px] px-1 rounded border border-default text-dimmed'>{row.type}</span>
                        </div>
                        <span className='font-mono text-xs text-default pl-2 break-all'>
                          <span className='text-default'>{row.location || '…'}</span>
                          <span className='text-default'> = </span>
                          <span className='text-muted'>{row.expr || '…'}</span>
                        </span>
                      </div>
                    </SortableActionRow>
                  )
                )}
              </SortableContext>
            </DndContext>
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
        ) : (
          <>
            {currentList.length === 0 && formMode !== 'adding' && (
              <PanelEmptyState><p>No actions yet.</p></PanelEmptyState>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActionsDragEnd}>
              <SortableContext
                items={currentList.map((r) => r._rowId)}
                strategy={verticalListSortingStrategy}
              >
                {currentList.map((row, index) =>
                  formMode === 'editing' && editingRowIndex === index ? (
                    <div key={row._rowId}>{inlineForm}</div>
                  ) : (
                    <SortableActionRow
                      key={row._rowId}
                      id={row._rowId}
                      index={index}
                      disabled={formMode !== 'idle'}
                      align='start'
                      onClick={() => handleRowClick(row, index)}
                      onCopy={row.type === 'assign' ? () => handleCopyRow(row) : undefined}
                      onDelete={() => handleDelete(index)}
                    >
                      {row.type === 'assign' && (
                        <span className='block font-mono break-all text-default'>
                          <span className='text-primary'>{row.location || '…'}</span>
                          <span className='text-dimmed'> = </span>
                          <span className='text-default'>{row.expr || '…'}</span>
                        </span>
                      )}
                      {row.type === 'send' && (
                        <span className='font-mono text-default flex flex-col min-w-0'>
                          <span className='text-primary break-all'>{row.event || '…'}</span>
                          <span className='text-dimmed text-[10px]'>{row.delayType}: {row.delayValue || '…'}</span>
                        </span>
                      )}
                      {row.type === 'cancel' && (
                        <span className='block font-mono break-all text-default'>
                          <span className='text-dimmed'>cancel: </span>
                          <span className='text-primary'>{row.sendid || '…'}</span>
                        </span>
                      )}
                    </SortableActionRow>
                  ),
                )}
              </SortableContext>
            </DndContext>

            {/* New action form appended at bottom when adding */}
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
        )}
      </div>
    </div>
  </Panel>
  );
}
