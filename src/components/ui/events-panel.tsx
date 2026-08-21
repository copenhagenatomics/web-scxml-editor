'use client';

import React, { useRef, useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { useHostAPIStore } from '@/stores/host-api-store';
import type { EventEntry } from '@/types/host-api';
import { SearchableSelect } from './searchable-select';
import { EVENT_FALLBACK_VALUE } from '@/lib/utils/common-utils';
import { Panel, inputClass, FormActions, FooterAddButton, PanelEmptyState } from '@/components/ui/primitives';

const UNITS = ['V', 'A', 'l/min', '% rh', 'g/m3', 'Hz', 'rpm', 'Vdc', 'Vac', 'ppm', 'Ohm', 'bar', 'mbar', '°C', 's', 'g/day', 'on/off', 'state'];

interface EventsPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export function EventsPanel({ isVisible, onClose }: EventsPanelProps) {
  const events = useHostAPIStore(state => state.events);
  const setEvents = useHostAPIStore(state => state.setEvents);
  const showFeedback = useHostAPIStore(state => state.showFeedback);
  const fieldOriginalRef = useRef('');
  const [isAdding, setIsAdding] = useState<false | 'plain' | 'arg'>(false);
  const [newName, setNewName] = useState('');
  const [newDefaultValue, setNewDefaultValue] = useState('0');
  const [newMin, setNewMin] = useState('');
  const [newMax, setNewMax] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newHidden, setNewHidden] = useState(false);

  const update = (index: number, patch: Partial<EventEntry>) =>
    setEvents(events.map((e, i) => i === index ? { ...e, ...patch } : e));

  const handleDelete = (index: number) => {
    setEvents(events.filter((_, i) => i !== index));
    showFeedback('User action deleted.', 'info');
  };

  const handleConfirmAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const hasArgument = isAdding === 'arg';
    setEvents([...events, {
      name: trimmed,
      type: EVENT_FALLBACK_VALUE,
      hasArgument,
      defaultValue: hasArgument ? newDefaultValue : undefined,
      min: hasArgument ? parseLimit(newMin) : undefined,
      max: hasArgument ? parseLimit(newMax) : undefined,
      unit: hasArgument && newUnit.trim() ? newUnit.trim() : undefined,
      hidden: newHidden || undefined,
    }]);
    resetForm();
    showFeedback('User action added.', 'info');
  };

  const parseLimit = (s: string) => { const n = parseFloat(s.trim()); return isNaN(n) ? undefined : n; };

  const resetForm = () => {
    setNewName('');
    setNewDefaultValue('0');
    setNewMin('');
    setNewMax('');
    setNewUnit('');
    setNewHidden(false);
    setIsAdding(false);
  };

  const argInputClass = `min-w-0 ${inputClass}`;

  const trackFieldFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    fieldOriginalRef.current = e.target.value;
  };

  const notifyIfFieldChanged = (e: React.FocusEvent<HTMLInputElement>, message: string) => {
    if (e.target.value !== fieldOriginalRef.current) showFeedback(message, 'info');
  };

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirmAdd();
    if (e.key === 'Escape') resetForm();
  };

  if (!isVisible) return null;

  return (
    <Panel
      title='User Actions'
      onClose={onClose}
      widthClass='w-[380px]'
      footer={
        !isAdding ? (
          <div className='flex flex-col gap-1.5'>
            <FooterAddButton onClick={() => setIsAdding('plain')}>Add user action</FooterAddButton>
            <FooterAddButton onClick={() => setIsAdding('arg')}>Add user action with argument</FooterAddButton>
          </div>
        ) : undefined
      }
    >
      {events.length === 0 && !isAdding ? (
        <PanelEmptyState>
          <p>No user actions defined. Add a user action to create a web UI button in the operate page.</p>
          <p>User actions with an argument add a value input next to the button.</p>
        </PanelEmptyState>
      ) : (
        <ul className='divide-y divide-[var(--ui-border)]'>
          {events.map((event, index) => (
            <li key={index} className='px-3 py-2 hover:bg-muted group'>
              <div className='flex items-center gap-2'>
                <input
                  type='text'
                  value={event.name}
                  onFocus={trackFieldFocus}
                  onChange={e => update(index, { name: e.target.value })}
                  onBlur={e => notifyIfFieldChanged(e, 'User action renamed.')}
                  onKeyDown={blurOnEnter}
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  onClick={() => update(index, { hidden: !event.hidden || undefined })}
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    event.hidden
                      ? 'text-primary bg-primary-muted hover:bg-primary-muted'
                      : 'text-dimmed group-hover:text-muted hover:!text-default hover:bg-muted'
                  }`}
                  title={event.hidden ? 'Hidden from operators — click to make visible to operators' : 'Visible to operators — click to hide from operators'}
                >
                  {event.hidden ? <EyeOff className='h-3 w-3' /> : <Eye className='h-3 w-3' />}
                </button>
                <button
                  onClick={() => handleDelete(index)}
                  className='flex-shrink-0 p-1 rounded text-dimmed group-hover:text-muted hover:!text-error hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors'
                  title='Delete'
                >
                  <Trash2 className='h-3 w-3' />
                </button>
              </div>
              {event.hasArgument && (
                <div className='flex items-start gap-1.5 mt-1.5'>
                  <div className='flex-1 min-w-0'>
                    <label className='text-[10px] text-muted block mb-0.5'>Default</label>
                    <input
                      type='text'
                      value={event.defaultValue ?? '0'}
                      onFocus={trackFieldFocus}
                      onChange={e => update(index, { defaultValue: e.target.value })}
                      onBlur={e => notifyIfFieldChanged(e, 'Default value updated.')}
                      onKeyDown={blurOnEnter}
                      placeholder='default'
                      className={argInputClass}
                    />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <label className='text-[10px] text-muted block mb-0.5'>Min</label>
                    <input
                      type='number'
                      value={event.min ?? ''}
                      onFocus={trackFieldFocus}
                      onChange={e => update(index, { min: isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber })}
                      onBlur={e => notifyIfFieldChanged(e, 'Min updated.')}
                      onKeyDown={blurOnEnter}
                      placeholder='min'
                      className={argInputClass}
                    />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <label className='text-[10px] text-muted block mb-0.5'>Max</label>
                    <input
                      type='number'
                      value={event.max ?? ''}
                      onFocus={trackFieldFocus}
                      onChange={e => update(index, { max: isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber })}
                      onBlur={e => notifyIfFieldChanged(e, 'Max updated.')}
                      onKeyDown={blurOnEnter}
                      placeholder='max'
                      className={argInputClass}
                    />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <label className='text-[10px] text-muted block mb-0.5'>Unit</label>
                    <SearchableSelect
                      value={event.unit ?? ''}
                      options={UNITS}
                      onChange={v => {
                        update(index, { unit: v || undefined });
                        if (v !== (event.unit ?? '')) showFeedback('Unit updated.', 'info');
                      }}
                      placeholder='?'
                    />
                  </div>
                </div>
              )}
            </li>
          ))}

          {isAdding && (
            <li className='px-3 py-2 bg-primary-muted'>
              <div className='flex items-center gap-2'>
                <input
                  autoFocus
                  type='text'
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder='user action name'
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  type='button'
                  onClick={() => setNewHidden(h => !h)}
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    newHidden
                      ? 'text-primary bg-primary-muted hover:bg-primary-muted'
                      : 'text-dimmed hover:text-muted hover:bg-muted'
                  }`}
                  title={newHidden ? 'Hidden from operators — click to make visible to operators' : 'Visible to operators — click to hide from operators'}
                >
                  {newHidden ? <EyeOff className='h-3 w-3' /> : <Eye className='h-3 w-3' />}
                </button>
              </div>
              {isAdding === 'arg' && (
                <div className='flex items-start gap-1.5 mt-1.5'>
                  <div className='flex-1 min-w-0'>
                    <label className='text-[10px] text-muted block mb-0.5'>Default</label>
                    <input
                      type='text'
                      value={newDefaultValue}
                      onChange={e => setNewDefaultValue(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder='default'
                      className={inputClass}
                    />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <label className='text-[10px] text-muted block mb-0.5'>Min</label>
                    <input
                      type='text'
                      value={newMin}
                      onChange={e => setNewMin(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder='min'
                      className={inputClass}
                    />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <label className='text-[10px] text-muted block mb-0.5'>Max</label>
                    <input
                      type='text'
                      value={newMax}
                      onChange={e => setNewMax(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder='max'
                      className={inputClass}
                    />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <label className='text-[10px] text-muted block mb-0.5'>Unit</label>
                    <SearchableSelect
                      value={newUnit}
                      options={UNITS}
                      onChange={v => setNewUnit(v)}
                      placeholder='?'
                    />
                  </div>
                </div>
              )}
              <FormActions
                onApply={handleConfirmAdd}
                onDiscard={resetForm}
                applyDisabled={!newName.trim()}
                className='justify-end mt-1.5'
              />
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
