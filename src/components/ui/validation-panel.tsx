'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import type { ValidationError } from '@/types/common';
import type { HostErrorItem } from '@/types/host-api';

interface ValidationPanelProps {
  errors: ValidationError[];
  hostErrors: HostErrorItem[];
  isVisible: boolean;
  activeTab: 'validation' | 'host-alerts';
  onClose: () => void;
  onTabChange: (tab: 'validation' | 'host-alerts') => void;
  onErrorClick?: (error: ValidationError) => void;
  onDismissHostError: (id: string) => void;
  onClearHostErrors: () => void;
  supportsStateHighlight?: boolean;
}

export function ValidationPanel({
  errors,
  hostErrors,
  isVisible,
  activeTab,
  onClose,
  onTabChange,
  onErrorClick,
  onDismissHostError,
  onClearHostErrors,
  supportsStateHighlight,
}: ValidationPanelProps) {
  if (!isVisible) return null;

  const hostCount = hostErrors.length;
  const showTabs = hostCount > 0;

  return (
    <div className='w-80 bg-elevated border border-default rounded-lg shadow-sm h-full flex flex-col'>
      <div className='flex items-center justify-between px-4 pt-4 pb-0'>
        <h3 className='font-medium text-default'>Errors</h3>
        <button
          onClick={onClose}
          className='text-dimmed hover:text-default transition-colors'
        >
          <X className='h-5 w-5' />
        </button>
      </div>

      {showTabs && (
        <div role='tablist' className='flex border-b border-default mt-3'>
          <button
            role='tab'
            aria-selected={activeTab === 'validation'}
            aria-label='Validation tab'
            onClick={() => onTabChange('validation')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'validation'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-default'
            }`}
          >
            Validation ({errors.length})
          </button>
          <button
            role='tab'
            aria-selected={activeTab === 'host-alerts'}
            aria-label='Host Alerts tab'
            onClick={() => onTabChange('host-alerts')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'host-alerts'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-default'
            }`}
          >
            Host Alerts ({hostCount})
          </button>
        </div>
      )}

      <div className='p-4 flex-1 overflow-y-auto scrollbar-thin'>
        {!showTabs || activeTab === 'validation' ? (
          <ValidationTab errors={errors} onErrorClick={onErrorClick} supportsStateHighlight={supportsStateHighlight} />
        ) : (
          <HostAlertsTab
            hostErrors={hostErrors}
            onDismiss={onDismissHostError}
            onClearAll={onClearHostErrors}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation tab
// ---------------------------------------------------------------------------

interface ValidationTabProps {
  errors: ValidationError[];
  onErrorClick?: (error: ValidationError) => void;
  supportsStateHighlight?: boolean;
}

function ValidationTab({ errors, onErrorClick, supportsStateHighlight }: ValidationTabProps) {
  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;
  const sortedErrors = [...errors].sort((a, b) => {
    if (a.severity === 'error' && b.severity === 'warning') return -1;
    if (a.severity === 'warning' && b.severity === 'error') return 1;
    return 0;
  });

  if (errors.length === 0) {
    return (
      <div className='flex items-center text-success'>
        <CheckCircle className='h-5 w-5 mr-2' />
        <span>No validation issues found</span>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center space-x-4 text-sm'>
        {errorCount > 0 && (
          <div className='flex items-center text-error'>
            <AlertCircle className='h-4 w-4 mr-1' />
            <span>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        {warningCount > 0 && (
          <div className='flex items-center text-warning'>
            <AlertTriangle className='h-4 w-4 mr-1' />
            <span>{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      <div className='space-y-2'>
        {sortedErrors.map((error, index) => (
          <ValidationErrorItem key={index} error={error} onClick={onErrorClick} supportsStateHighlight={supportsStateHighlight} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Host Alerts tab
// ---------------------------------------------------------------------------

interface HostAlertsTabProps {
  hostErrors: HostErrorItem[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

function HostAlertsTab({ hostErrors, onDismiss, onClearAll }: HostAlertsTabProps) {
  if (hostErrors.length === 0) {
    return (
      <div className='flex items-center text-success'>
        <CheckCircle className='h-5 w-5 mr-2' />
        <span>No host alerts</span>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex justify-end'>
        <button
          onClick={onClearAll}
          aria-label='Clear all host alerts'
          className='text-xs text-muted hover:text-default transition-colors'
        >
          Clear all
        </button>
      </div>
      <div className='space-y-2'>
        {hostErrors.map(item => (
          <HostErrorCard key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HostErrorCard
// ---------------------------------------------------------------------------

interface HostErrorCardProps {
  item: HostErrorItem;
  onDismiss: (id: string) => void;
}

function HostErrorCard({ item, onDismiss }: HostErrorCardProps) {
  const isError = item.level === 'error';
  const isWarning = item.level === 'warning';

  const containerClass = isError
    ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
    : isWarning
      ? 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-900'
      : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900';

  const textClass = isError ? 'text-red-800 dark:text-red-300' : isWarning ? 'text-yellow-800 dark:text-yellow-300' : 'text-blue-800 dark:text-blue-300';
  const iconClass = isError ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-blue-400';
  const Icon = isError ? AlertCircle : isWarning ? AlertTriangle : Info;

  return (
    <div className={`p-3 rounded-md border ${containerClass} flex items-start overflow-hidden`}>
      <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconClass}`} />
      <div className='ml-3 min-w-0 flex-1'>
        <p className={`text-sm font-medium whitespace-pre-wrap break-all ${textClass}`}>
          {item.message}
        </p>
      </div>
      <button
        onClick={() => onDismiss(item.id)}
        className='ml-2 flex-shrink-0 text-dimmed hover:text-default transition-colors'
        aria-label='Dismiss'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ValidationErrorItem (unchanged from original)
// ---------------------------------------------------------------------------

interface ValidationErrorItemProps {
  error: ValidationError;
  onClick?: (error: ValidationError) => void;
  supportsStateHighlight?: boolean;
}

function ValidationErrorItem({ error, onClick, supportsStateHighlight }: ValidationErrorItemProps) {
  const isError = error.severity === 'error';
  const hasLocation = Boolean(error.line && error.column);
  const canHighlightState = Boolean(supportsStateHighlight && error.stateId);
  const isClickable = onClick && (hasLocation || canHighlightState);

  return (
    <div
      className={`p-3 rounded-md border ${
        isError ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900' : 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-900'
      } ${
        isClickable
          ? 'cursor-pointer hover:shadow-md transition-shadow hover:bg-opacity-80'
          : ''
      }`}
      onClick={isClickable ? () => onClick(error) : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(error);
              }
            }
          : undefined
      }
    >
      <div className='flex items-start'>
        <div className='flex-shrink-0'>
          {isError ? (
            <AlertCircle className='h-5 w-5 text-red-400' />
          ) : (
            <AlertTriangle className='h-5 w-5 text-yellow-400' />
          )}
        </div>
        <div className='ml-3 flex-1 min-w-0'>
          <p className={`text-sm font-medium break-words ${isError ? 'text-red-800 dark:text-red-300' : 'text-yellow-800 dark:text-yellow-300'}`}>
            {error.message}
          </p>
          {(hasLocation || isClickable) && (
            <p className={`text-xs mt-1 flex items-center ${isError ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
              {hasLocation && (
                <span>Line {error.line || '?'}, Column {error.column || '?'}</span>
              )}
              {isClickable && (
                <span className={`${hasLocation ? 'ml-2 ' : ''}text-xs ${isError ? 'text-red-500' : 'text-yellow-500'}`}>
                  {canHighlightState ? '(click to highlight)' : '(click to navigate)'}
                </span>
              )}
            </p>
          )}
          {error.code && (
            <p className={`text-xs mt-1 font-mono ${isError ? 'text-red-500' : 'text-yellow-500'}`}>
              Code: {error.code}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
