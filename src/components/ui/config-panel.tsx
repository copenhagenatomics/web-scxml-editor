'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Trash2 } from 'lucide-react';
import { extractConfigFields, type ConfigField } from '@/lib/utils/datamodel-extractor';
import { mergeConfigEntries, type OverrideEntry } from '@/lib/utils/config-overrides';
import type { ConfigValue } from '@/types/host-api';
import { useHostAPIStore } from '@/stores/host-api-store';
import { Panel, inputClass, FormActions, FooterAddButton, PanelEmptyState } from '@/components/ui/primitives';

const CONF_TYPES: ConfigField['type'][] = ['int', 'double', 'bool', 'string'];

function TypeSelect({ value, onChange }: { value: ConfigField['type']; onChange: (t: ConfigField['type']) => void }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setStyle({ position: 'fixed', top: r.bottom + 4, right: window.innerWidth - r.right, zIndex: 9999 });
    }
    setOpen(o => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className='flex items-center gap-0.5 text-primary font-mono text-[10px] cursor-pointer hover:opacity-80 transition-opacity'
      >
        {value}
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={style}
          className='bg-elevated border border-default rounded-md shadow-xl overflow-hidden py-0.5'
        >
          {CONF_TYPES.map(t => (
            <button
              key={t}
              onClick={() => { onChange(t); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 font-mono text-[11px] transition-colors ${
                t === value ? 'bg-primary-muted text-primary font-medium' : 'text-default hover:bg-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

interface ConfigPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
  onAddField: (name: string, defaultValue: string) => void;
  onFieldChange: (name: string, newDefaultValue: string) => void;
  onTypeChange: (name: string, newType: ConfigField['type']) => void;
  onDeleteField: (name: string) => void;
  onEntriesChange?: (values: ConfigValue[]) => void;
}

export function ConfigPanel({ isVisible, onClose, scxmlContent, onAddField, onFieldChange, onTypeChange, onDeleteField, onEntriesChange }: ConfigPanelProps) {
  const configOverrides = useHostAPIStore(state => state.configOverrides);
  const configOverridesLoaded = useHostAPIStore(state => state.configOverridesLoaded);
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState('');
  const [newOverride, setNewOverride] = useState('');

  useEffect(() => {
    if (!configOverridesLoaded) return;
    const fields = extractConfigFields(scxmlContent);
    setEntries(prev => mergeConfigEntries(fields, configOverrides, prev));
  }, [scxmlContent, configOverrides, configOverridesLoaded]);

  useEffect(() => {
    onEntriesChange?.(entries.map(e => ({
      name: e.field.name,
      type: e.field.type,
      defaultValue: e.field.defaultValue,
      override: e.override,
    })));
  }, [entries, onEntriesChange]);

  const handleConfirmAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const override = newOverride.trim();
    // Optimistically seed the override into entries so mergeConfigEntries preserves it
    // via previous/localOverrideMap when it rebuilds after the SCXML update.
    if (override) {
      setEntries(prev => [...prev, { field: { name: trimmed, type: 'string' as const, defaultValue: newDefault.trim() }, override }]);
    }
    onAddField(trimmed, newDefault.trim());
    setNewName('');
    setNewDefault('');
    setNewOverride('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewName('');
    setNewDefault('');
    setNewOverride('');
    setIsAdding(false);
  };

  if (!isVisible) return null;

  return (
    <Panel
      title='Config Values'
      onClose={onClose}
      widthClass='w-[380px]'
      footer={
        !isAdding ? (
          <FooterAddButton onClick={() => setIsAdding(true)}>Add config</FooterAddButton>
        ) : undefined
      }
    >
      {entries.length === 0 && !isAdding ? (
        <PanelEmptyState>
          <p>No configurable fields found in this SCXML.</p>
          <p>
            Add a <code className='bg-muted px-1 rounded'>conf_</code> prefix to any{' '}
            <code className='bg-muted px-1 rounded'>&lt;data&gt;</code> field in the datamodel to make it
            configurable per deployment.
          </p>
          <p className='text-dimmed'>
            Example:{' '}
            <code className='bg-muted px-1 rounded'>&lt;data expr="0.5" id="conf_threshold"/&gt;</code>
          </p>
        </PanelEmptyState>
      ) : (
        <ul className='divide-y divide-[var(--ui-border)]'>
          {entries.map(({ field, override }) => (
            <li key={field.name} className='px-3 py-2 hover:bg-muted'>
              <div className='flex items-center justify-between gap-2 mb-1.5'>
                <span className='font-medium text-default text-xs truncate' title={field.name}>
                  {field.name}
                </span>
                <div className='flex items-center gap-1.5 shrink-0'>
                  <TypeSelect
                    value={field.type}
                    onChange={newType => {
                      setEntries(prev =>
                        prev.map(en =>
                          en.field.name === field.name ? { ...en, field: { ...en.field, type: newType } } : en,
                        ),
                      );
                      onTypeChange(field.name, newType);
                    }}
                  />
                  <button
                    onClick={() => onDeleteField(field.name)}
                    className='p-1 rounded text-dimmed hover:text-error hover:bg-muted transition-colors'
                    title='Delete config value'
                    aria-label='Delete config value'
                  >
                    <Trash2 className='h-3 w-3' />
                  </button>
                </div>
              </div>
              <div className='flex items-center gap-1.5'>
                <span className='text-[10px] text-dimmed whitespace-nowrap shrink-0'>Data Model</span>
                <input
                  type='text'
                  value={field.defaultValue}
                  onChange={e => {
                    const newVal = e.target.value;
                    setEntries(prev =>
                      prev.map(en =>
                        en.field.name === field.name
                          ? { ...en, field: { ...en.field, defaultValue: newVal } }
                          : en,
                      ),
                    );
                  }}
                  onBlur={e => onFieldChange(field.name, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <span className='text-[10px] text-dimmed whitespace-nowrap shrink-0'>IO.Conf</span>
                <input
                  type='text'
                  value={override}
                  placeholder='—'
                  onChange={e =>
                    setEntries(prev =>
                      prev.map(en =>
                        en.field.name === field.name ? { ...en, override: e.target.value } : en,
                      ),
                    )
                  }
                  className={`${inputClass} min-w-0 flex-1`}
                />
              </div>
            </li>
          ))}

          {isAdding && (
            <li className='px-3 py-2 bg-primary-muted'>
              <div className='flex items-center gap-1 mb-1.5'>
                <span className='text-dimmed text-[10px] shrink-0'>conf_</span>
                <input
                  autoFocus
                  type='text'
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmAdd();
                    if (e.key === 'Escape') handleCancelAdd();
                  }}
                  placeholder='field_name'
                  className={`${inputClass} flex-1`}
                />
              </div>
              <div className='flex items-center gap-1.5 mb-1.5'>
                <span className='text-[10px] text-dimmed whitespace-nowrap shrink-0'>Data Model</span>
                <input
                  type='text'
                  value={newDefault}
                  onChange={e => setNewDefault(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmAdd();
                    if (e.key === 'Escape') handleCancelAdd();
                  }}
                  placeholder='default'
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <span className='text-[10px] text-dimmed whitespace-nowrap shrink-0'>IO.Conf</span>
                <input
                  type='text'
                  value={newOverride}
                  onChange={e => setNewOverride(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmAdd();
                    if (e.key === 'Escape') handleCancelAdd();
                  }}
                  placeholder='—'
                  className={`${inputClass} min-w-0 flex-1`}
                />
              </div>
              <FormActions
                onApply={handleConfirmAdd}
                onDiscard={handleCancelAdd}
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
