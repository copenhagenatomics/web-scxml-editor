'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Tip {
  content: React.ReactNode;
  tab?: 'code' | 'visual' | 'both';
}

interface InlineTipsCarouselProps {
  tips: Tip[];
  activeTab?: 'code' | 'visual';
  autoAdvance?: boolean;
  autoAdvanceInterval?: number;
}

export const InlineTipsCarousel: React.FC<InlineTipsCarouselProps> = ({
  tips,
  activeTab,
  autoAdvance = true,
  autoAdvanceInterval = 5000,
}) => {
  // Filter tips based on active tab
  const filteredTips = tips.filter(
    (tip) => !tip.tab || tip.tab === 'both' || tip.tab === activeTab
  );

  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset to first tip when filtered tips change
  useEffect(() => {
    setCurrentIndex(0);
  }, [filteredTips.length]);

  // Auto-advance functionality
  useEffect(() => {
    if (!autoAdvance || filteredTips.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % filteredTips.length);
    }, autoAdvanceInterval);

    return () => clearInterval(timer);
  }, [autoAdvance, autoAdvanceInterval, filteredTips.length]);

  const goToPrevious = () => {
    setCurrentIndex(
      (prev) => (prev - 1 + filteredTips.length) % filteredTips.length
    );
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % filteredTips.length);
  };

  if (filteredTips.length === 0) return null;

  const currentTip = filteredTips[currentIndex];

  return (
    <div className='flex items-center space-x-2 text-xs text-gray-500'>
      {/* Previous Button */}
      {filteredTips.length > 1 && (
        <button
          onClick={goToPrevious}
          className='p-0.5 hover:bg-gray-200 rounded transition-colors'
          aria-label='Previous tip'
        >
          <ChevronLeft className='h-3 w-3' />
        </button>
      )}

      {/* Tip Content */}
      <div className='flex items-center space-x-1 min-w-0'>
        <span className='font-medium'>💡 Tip:</span>
        <span className='truncate'>{currentTip?.content}</span>
      </div>

      {/* Indicators (dots) */}
      {filteredTips.length > 1 && (
        <div className='flex gap-1'>
          <div className='text-blue-500'>
            {currentIndex + 1} of {filteredTips.length}{' '}
          </div>
        </div>
      )}

      {/* Next Button */}
      {filteredTips.length > 1 && (
        <button
          onClick={goToNext}
          className='p-0.5 hover:bg-gray-200 rounded transition-colors'
          aria-label='Next tip'
        >
          <ChevronRight className='h-3 w-3' />
        </button>
      )}
    </div>
  );
};
