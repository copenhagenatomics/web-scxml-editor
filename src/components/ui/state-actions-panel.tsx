'use client';

import { BADGE_COLORS, EVENT_FALLBACK_VALUE, getVariableType } from '@/lib';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { Plus, X } from 'lucide-react';
import React from 'react';
import { Panel, inputClass, FormActions, PanelEmptyState } from '@/components/ui/primitives';

interface AssignActionRow { type: 'assign'; location: string; expr: string; }
interface SendActionRow   { type: 'send'; event: string; delayType: 'delay' | 'delayexpr'; delayValue: string; }
interface CancelActionRow { type: 'cancel'; sendid: string; }
type ActionRow = AssignActionRow | SendActionRow | CancelActionRow;

interface InternalEventActionRow {
  event: string;
  location: string;
  expr: string;
  type: 'internal' | 'external';
}

type Tab = 'onentry' | 'onexit' | 'reactions';
type FormMode = 'idle' | 'editing' | 'adding';
type Suggestion = { label: string; kind: 'channel' | 'variable' };

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
}

function toStrings(rows: ActionRow[]): string[] {
  return rows.map((r): string | undefined => {
    if (r.type === 'assign') return (r.location && r.expr) ? `assign|${r.location}|${r.expr}` : undefined;
    if (r.type === 'send') return `send|${r.event}|${r.delayType}|${r.delayValue}`;
    if (r.type === 'cancel') return `cancel|${r.sendid}`;
  }).filter((s): s is string => s !== undefined);
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
}: StateActionsPanelProps) {
  const [activeTab, setActiveTab] = React.useState<Tab>('onentry');
  const [localEntry, setLocalEntry] = React.useState<ActionRow[]>(initialEntry);
  const [localExit, setLocalExit] = React.useState<ActionRow[]>(initialExit);
  const [localReactions, setLocalReactions] = React.useState<InternalEventActionRow[]>(initialReactions);

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

  const channels = useHostAPIStore((s) => s.channels);
  const showFeedback = useHostAPIStore((s) => s.showFeedback);
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
  }, []);

  // Reset local lists and form when the selected state changes
  React.useEffect(() => {
    setLocalEntry(initialEntry);
    setLocalExit(initialExit);
    setLocalReactions(initialReactions);
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId]);

  // Cleanup blur timer on unmount
  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
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
    return [...vars, ...chans];
  }, [formLocation, dataVars, channels, formMode]);

  const showSuggestions = isOpen && suggestions.length > 0;

  const selectSuggestion = (s: Suggestion) => {
    setFormLocation(s.label);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleApply = () => {
    if (formMode === 'idle') return;

    if (activeTab === 'reactions') {
      const newRow: InternalEventActionRow = { event: formEvent, location: formLocation, expr: formExpr, type: formReactionType };
      const updatedList: InternalEventActionRow[] =
        formMode === 'adding'
          ? [...localReactions, newRow]
          : localReactions.map((r, i) => (i === editingRowIndex ? newRow : r));
      setLocalReactions(updatedList);
      onApplyReactions(updatedList);
      resetForm();
      showFeedback('Reaction saved.', 'info');
      return;
    }

    const newRow: AssignActionRow = { type: 'assign', location: formLocation, expr: formExpr };

    const updatedList: ActionRow[] = formMode === 'adding'
      ? [...currentList, newRow]
      : currentList.map((r, i) => (i === editingRowIndex ? newRow : r));

    if (activeTab === 'onentry') {
      setLocalEntry(updatedList);
      onApply(toStrings(updatedList), toStrings(localExit));
    } else {
      setLocalExit(updatedList);
      onApply(toStrings(localEntry), toStrings(updatedList));
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
      if ((e.key === 'Tab' || e.key === 'Enter') && activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
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

  const isApplyDisabled =
    (activeTab === 'reactions' && (!formEvent || !formLocation || !formExpr)) ||
    (activeTab !== 'reactions' && (!formLocation || !formExpr));

  // Inline form shared between expanded rows and the new-action form
  const inlineForm = (
    <div className='bg-primary-muted rounded p-2 space-y-1.5'>
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
                  i === activeIndex
                    ? 'bg-primary text-primary-fg'
                    : 'hover:bg-primary-muted text-default'
                }`}
              >
                <span
                  className='text-xs px-1 rounded font-mono text-black'
                  style={{
                    backgroundColor: BADGE_COLORS[
                      s.kind === 'variable'
                        ? getVariableType(s.label)
                        : channels.find((c) => c.name === s.label)?.type ?? EVENT_FALLBACK_VALUE
                    ],
                  }}
                >
                  {s.kind === 'variable'
                    ? getVariableType(s.label)
                    : channels.find((c) => c.name === s.label)?.type ?? EVENT_FALLBACK_VALUE}
                </span>
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className='text-[10px] text-muted block mb-0.5'>Expression</label>
        <input
          type='text'
          value={formExpr}
          onChange={(e) => setFormExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApply();
            if (e.key === 'Escape') resetForm();
          }}
          placeholder='expression'
          className={inputClass}
        />
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
    <Panel title='State Actions' onClose={onClose} widthClass='w-[380px]'>
      <div className='flex flex-col h-full'>
        {/* Sub-header: stateId + add button */}
        <div className='flex items-center justify-between px-3 py-1.5 border-b border-default bg-muted flex-shrink-0'>
          <p className='text-xs text-primary'>{stateId}</p>
          <button
            onClick={handleAddClick}
            title='Add action'
            className='text-dimmed hover:text-primary p-0.5 rounded hover:bg-primary-muted transition-colors'
          >
            <Plus className='h-4 w-4' />
          </button>
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
            {localReactions.map((row, index) =>
              formMode === 'editing' && editingRowIndex === index ? (
                <div key={index}>{inlineForm}</div>
              ) : (
                <div
                  key={index}
                  onClick={() => handleReactionsRowClick(row, index)}
                  className='flex items-start justify-between px-2 py-1.5 rounded text-xs cursor-pointer group hover:bg-muted'
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(index);
                    }}
                    className='ml-2 mt-0.5 flex-shrink-0 text-dimmed hover:text-error opacity-0 group-hover:opacity-100 transition-opacity'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              )
            )}
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
        ) : (
          <>
            {currentList.length === 0 && formMode !== 'adding' && (
              <PanelEmptyState><p>No actions yet.</p></PanelEmptyState>
            )}

            {currentList.map((row, index) =>
              formMode === 'editing' && editingRowIndex === index ? (
                <div key={index}>{inlineForm}</div>
              ) : (
                <div
                  key={index}
                  onClick={() => handleRowClick(row, index)}
                  className='flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer group hover:bg-muted'
                >
                  {row.type === 'assign' && (
                    <span className='font-mono truncate text-default'>
                      <span className='text-primary'>{row.location || '…'}</span>
                      <span className='text-dimmed'> = </span>
                      <span className='text-default'>{row.expr || '…'}</span>
                    </span>
                  )}
                  {row.type === 'send' && (
                    <span className='font-mono text-default flex flex-col min-w-0'>
                      <span className='text-primary truncate'>{row.event || '…'}</span>
                      <span className='text-dimmed text-[10px]'>{row.delayType}: {row.delayValue || '…'}</span>
                    </span>
                  )}
                  {row.type === 'cancel' && (
                    <span className='font-mono truncate text-default'>
                      <span className='text-dimmed'>cancel: </span>
                      <span className='text-primary'>{row.sendid || '…'}</span>
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(index);
                    }}
                    className='ml-2 flex-shrink-0 text-dimmed hover:text-error opacity-0 group-hover:opacity-100 transition-opacity'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              ),
            )}

            {/* New action form appended at bottom when adding */}
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
        )}
      </div>
    </div>
  </Panel>
  );
}
