'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import { extractDatamodelVariables, extractUnresolvedChannelRefs } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Panel, inputClass, FormActions, FooterAddButton, PanelEmptyState } from '@/components/ui/primitives';

interface ChannelMappingPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
}

export function ChannelMappingPanel({ isVisible, onClose, scxmlContent }: ChannelMappingPanelProps) {
  const channels = useHostAPIStore(state => state.channels);
  const channelMappings = useHostAPIStore(state => state.channelMappings);
  const updateChannelMapping = useHostAPIStore(state => state.updateChannelMapping);

  const [isAdding, setIsAdding] = useState(false);
  const [newRef, setNewRef] = useState('');
  const [newChannel, setNewChannel] = useState('');

  const channelNames = useMemo(() => channels.map(c => c.name), [channels]);

  const unresolvedRefs = useMemo(() => extractUnresolvedChannelRefs(scxmlContent, channelNames), [scxmlContent, channelNames]);

  const availableOptions = useMemo(() => {
    const datamodelVars = extractDatamodelVariables(scxmlContent).filter(v => !v.startsWith('this_'));
    return Array.from(new Set([...channelNames, ...datamodelVars])).sort();
  }, [scxmlContent, channelNames]);

  const manualRows = useMemo(
    () => channelMappings
      .filter(m => !unresolvedRefs.includes(m.scxmlRef))
      .sort((a, b) => a.scxmlRef.localeCompare(b.scxmlRef)),
    [channelMappings, unresolvedRefs],
  );

  const existingRefs = useMemo(
    () => new Set([...unresolvedRefs, ...channelMappings.map(m => m.scxmlRef)]),
    [unresolvedRefs, channelMappings],
  );

  const mappedByRef = useMemo(
    () => Object.fromEntries(channelMappings.map(m => [m.scxmlRef, m.mappedChannel])),
    [channelMappings],
  );

  // Matches validateChannelMappings: only flagged once the host has supplied channels to choose from.
  const unmappedRefs = useMemo(
    () => (channels.length === 0 ? [] : unresolvedRefs.filter(ref => !mappedByRef[ref])),
    [channels.length, unresolvedRefs, mappedByRef],
  );
  const unmappedSet = useMemo(() => new Set(unmappedRefs), [unmappedRefs]);

  const handleConfirmAdd = () => {
    const trimmed = newRef.trim();
    if (!trimmed || existingRefs.has(trimmed) || !newChannel) return;
    updateChannelMapping(trimmed, newChannel);
    setNewRef('');
    setNewChannel('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewRef('');
    setNewChannel('');
    setIsAdding(false);
  };

  useEffect(() => {
    if (!isVisible) {
      setNewRef('');
      setNewChannel('');
      setIsAdding(false);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const isEmpty = unresolvedRefs.length === 0 && manualRows.length === 0;

  return (
    <Panel
      title='Channel Mapping'
      onClose={onClose}
      widthClass='w-[380px]'
      footer={
        !isAdding ? (
          <FooterAddButton onClick={() => setIsAdding(true)}>Add mapping</FooterAddButton>
        ) : undefined
      }
    >
      {unmappedRefs.length > 0 && (
        <div role='status' className='flex items-center gap-2 px-3 py-2 text-xs text-warning bg-[var(--ui-warning)]/10 border-b border-[var(--ui-border)]'>
          <TriangleAlert className='h-3.5 w-3.5 shrink-0' />
          <span>
            {unmappedRefs.length === 1 ? '1 channel isn\'t' : `${unmappedRefs.length} channels aren't`} mapped yet.
          </span>
        </div>
      )}
      {isEmpty && !isAdding ? (
        <PanelEmptyState>
          <p>No unresolved channel references found in this SCXML.</p>
          <p>
            Channel references are variable names used in conditions or expressions that are not
            declared in the{' '}
            <code className='bg-muted px-1 rounded'>&lt;datamodel&gt;</code> and do not use
            the <code className='bg-muted px-1 rounded'>this_</code> or{' '}
            <code className='bg-muted px-1 rounded'>conf_</code> prefixes.
          </p>
        </PanelEmptyState>
      ) : (
        <ul className='divide-y divide-[var(--ui-border)]'>
          {unresolvedRefs.map(ref => (
            <li key={ref} className='px-3 py-2 hover:bg-muted'>
              <div className='flex items-center gap-2'>
                <span className='flex items-center gap-1.5 flex-1 min-w-0'>
                  {unmappedSet.has(ref) && (
                    <TriangleAlert className='h-3 w-3 shrink-0 text-warning' aria-label='Not mapped' />
                  )}
                  <span className='font-mono text-default text-xs truncate' title={unmappedSet.has(ref) ? `${ref} isn't mapped to a channel` : ref}>{ref}</span>
                </span>
                {availableOptions.length === 0 ? (
                  <span className='text-dimmed italic text-xs shrink-0'>No channels available</span>
                ) : (
                  <div className='flex-1 min-w-0'>
                    <SearchableSelect
                      value={mappedByRef[ref] ?? ''}
                      options={availableOptions}
                      onChange={v => updateChannelMapping(ref, v)}
                      warning={unmappedSet.has(ref)}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}

          {manualRows.map(({ scxmlRef }) => (
            <li key={scxmlRef} className='px-3 py-2 hover:bg-muted'>
              <div className='flex items-center gap-2'>
                <input
                  type='text'
                  defaultValue={scxmlRef}
                  onBlur={e => {
                    const next = e.target.value.trim();
                    if (next && next !== scxmlRef) {
                      updateChannelMapping(next, mappedByRef[scxmlRef] ?? '');
                      updateChannelMapping(scxmlRef, '');
                    } else {
                      e.target.value = scxmlRef;
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') { e.currentTarget.value = scxmlRef; e.currentTarget.blur(); }
                  }}
                  className={`${inputClass} flex-1 min-w-0 font-mono`}
                />
                {availableOptions.length === 0 ? (
                  <span className='text-dimmed italic text-xs shrink-0'>No channels available</span>
                ) : (
                  <div className='flex-1 min-w-0'>
                    <SearchableSelect
                      value={mappedByRef[scxmlRef] ?? ''}
                      options={availableOptions}
                      onChange={v => updateChannelMapping(scxmlRef, v)}
                    />
                  </div>
                )}
                <button
                  onClick={() => updateChannelMapping(scxmlRef, '')}
                  className='shrink-0 p-1 rounded text-dimmed hover:text-error hover:bg-muted transition-colors'
                  title='Remove mapping'
                  aria-label='Remove mapping'
                >
                  <Trash2 className='h-3 w-3' />
                </button>
              </div>
            </li>
          ))}

          {isAdding && (
            <li className='px-3 py-2 bg-primary-muted'>
              <div className='flex items-center gap-2 mb-1.5'>
                <input
                  autoFocus
                  type='text'
                  value={newRef}
                  onChange={e => setNewRef(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmAdd();
                    if (e.key === 'Escape') handleCancelAdd();
                  }}
                  placeholder='ref_name'
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <div className='flex-1 min-w-0'>
                  <SearchableSelect
                    value={newChannel}
                    options={availableOptions}
                    onChange={setNewChannel}
                  />
                </div>
              </div>
              <FormActions
                onApply={handleConfirmAdd}
                onDiscard={handleCancelAdd}
                applyDisabled={!newRef.trim() || existingRefs.has(newRef.trim()) || !newChannel}
                className='justify-end mt-1.5'
              />
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
