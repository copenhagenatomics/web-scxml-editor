'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Warning outline, e.g. a required choice that is still empty. */
  warning?: boolean;
}

export function SearchableSelect({ value, options, onChange, placeholder = '—', warning = false }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => options.filter(o => o.toLowerCase().includes(search.toLowerCase())),
    [options, search],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !buttonRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dropW = Math.max(rect.width, 220);
      const dropH = 240;

      // Flip above if insufficient space below
      const spaceBelow = vh - rect.bottom;
      const top = spaceBelow >= dropH || spaceBelow >= rect.top
        ? rect.bottom + 4
        : rect.top - dropH - 4;

      // Clamp horizontally so dropdown never overflows the right edge
      const left = rect.left + dropW > vw - 8
        ? Math.max(8, rect.right - dropW)
        : rect.left;

      setDropdownStyle({
        position: 'fixed',
        top: Math.max(8, top),
        left,
        width: dropW,
        zIndex: 9999,
      });
    }
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => (isOpen ? (setIsOpen(false), setSearch('')) : handleOpen())}
        aria-invalid={warning || undefined}
        className={`w-full border ${warning ? 'border-[var(--ui-warning)]' : 'border-default'} rounded-md px-2.5 py-1.5 text-xs bg-elevated flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary hover:border-primary transition-colors`}
      >
        <span className={`truncate ${value ? 'text-default' : 'text-dimmed'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-dimmed flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className='bg-elevated border border-default rounded-lg shadow-xl overflow-hidden'
          >
            <div className='flex items-center gap-2 px-2.5 py-2 border-b border-default bg-muted/80'>
              <Search className='h-3.5 w-3.5 text-dimmed flex-shrink-0' />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder='Search...'
                className='flex-1 text-xs text-default focus:outline-none bg-transparent placeholder:text-dimmed'
              />
            </div>
            <div className='max-h-52 overflow-y-auto'>
              <button
                onClick={() => handleSelect('')}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  !value ? 'bg-primary-muted text-primary' : 'text-dimmed hover:bg-muted'
                }`}
              >
                —
              </button>
              {filtered.map(option => (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    value === option
                      ? 'bg-primary-muted text-primary font-medium'
                      : 'text-default hover:bg-muted'
                  }`}
                >
                  {option}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className='px-3 py-3 text-xs text-dimmed text-center'>No matches</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
