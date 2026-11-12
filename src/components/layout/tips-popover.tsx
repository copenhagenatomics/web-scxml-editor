'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { Panel } from '@/components/ui/primitives';

export interface Tip {
  content: React.ReactNode;
  tab?: 'code' | 'visual' | 'both';
}

export function filterTipsForTab(tips: Tip[], activeTab: 'code' | 'visual'): Tip[] {
  return tips.filter((tip) => !tip.tab || tip.tab === 'both' || tip.tab === activeTab);
}

interface TipsPopoverProps {
  tips: Tip[];
  activeTab: 'code' | 'visual';
}

/**
 * Toolbar 💡 button that opens a small popover showing one tip at a time (issue #93).
 * Replaced the always-visible, auto-rotating inline tips strip, which took most of the
 * toolbar's free space. Tips are filtered to the active tab, never rotate on their own,
 * and the popover closes on outside click, Esc, or its ✕.
 */
export function TipsPopover({ tips, activeTab }: TipsPopoverProps) {
  const filteredTips = filterTipsForTab(tips, activeTab);
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // A different tab has a different tip list — start from its first tip.
  useEffect(() => {
    setIndex(0);
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    // Capture phase: the ReactFlow canvas stops propagation of its own mousedown
    // handling, so a bubble-phase listener would never see clicks on the diagram.
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (filteredTips.length === 0) return null;

  const count = filteredTips.length;
  const current = Math.min(index, count - 1);
  const goToPrevious = () => setIndex((i) => (Math.min(i, count - 1) - 1 + count) % count);
  const goToNext = () => setIndex((i) => (Math.min(i, count - 1) + 1) % count);

  return (
    <div className='relative' ref={containerRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        title='Tips'
        aria-label='Tips'
        aria-expanded={isOpen}
        aria-haspopup='dialog'
        className={`p-2 rounded-md transition-colors ${
          isOpen ? 'bg-muted text-default' : 'text-muted hover:bg-muted hover:text-default'
        }`}
      >
        <Lightbulb className='h-4 w-4' />
      </button>

      {isOpen && (
        <div role='dialog' aria-label='Tips' className='absolute right-0 top-full mt-1 z-50'>
          <Panel
            title={count > 1 ? `Tip ${current + 1} of ${count}` : 'Tip'}
            onClose={() => setIsOpen(false)}
            widthClass='w-72'
            footer={
              count > 1 ? (
                <div className='flex justify-end gap-1'>
                  <button
                    onClick={goToPrevious}
                    aria-label='Previous tip'
                    className='p-1 rounded text-muted hover:bg-elevated hover:text-default transition-colors'
                  >
                    <ChevronLeft className='h-4 w-4' />
                  </button>
                  <button
                    onClick={goToNext}
                    aria-label='Next tip'
                    className='p-1 rounded text-muted hover:bg-elevated hover:text-default transition-colors'
                  >
                    <ChevronRight className='h-4 w-4' />
                  </button>
                </div>
              ) : undefined
            }
          >
            <div className='px-3 py-3 text-sm text-default leading-relaxed'>
              {filteredTips[current].content}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
