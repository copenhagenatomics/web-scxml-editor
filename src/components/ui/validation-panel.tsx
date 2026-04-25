'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';
import type { ValidationError } from '@/types/common';

interface ValidationPanelProps {
  errors: ValidationError[];
  isVisible: boolean;
  onClose: () => void;
  onErrorClick?: (error: ValidationError) => void;
}

export function ValidationPanel({
  errors,
  isVisible,
  onClose,
  onErrorClick,
}: ValidationPanelProps) {
  if (!isVisible) return null;

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;

  // Sort errors first, then warnings
  const sortedErrors = [...errors].sort((a, b) => {
    if (a.severity === 'error' && b.severity === 'warning') return -1;
    if (a.severity === 'warning' && b.severity === 'error') return 1;
    return 0;
  });

  return (
    <div className='bg-white border rounded-lg shadow-sm'>
      <div className='flex items-center justify-between p-4 border-b'>
        <h3 className='font-medium text-gray-900'>Validation Results</h3>
        <button
          onClick={onClose}
          className='text-gray-400 hover:text-gray-600 transition-colors'
        >
          <X className='h-5 w-5' />
        </button>
      </div>

      <div className='p-4'>
        {errors.length === 0 ? (
          <div className='flex items-center text-green-600'>
            <CheckCircle className='h-5 w-5 mr-2' />
            <span>No validation issues found</span>
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='flex items-center space-x-4 text-sm'>
              {errorCount > 0 && (
                <div className='flex items-center text-red-600'>
                  <AlertCircle className='h-4 w-4 mr-1' />
                  <span>
                    {errorCount} error{errorCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {warningCount > 0 && (
                <div className='flex items-center text-yellow-600'>
                  <AlertTriangle className='h-4 w-4 mr-1' />
                  <span>
                    {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>

            <div className='space-y-2 max-h-96 overflow-y-auto'>
              {sortedErrors.map((error, index) => (
                <ValidationErrorItem
                  key={index}
                  error={error}
                  onClick={onErrorClick}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ValidationErrorItemProps {
  error: ValidationError;
  onClick?: (error: ValidationError) => void;
}

function ValidationErrorItem({ error, onClick }: ValidationErrorItemProps) {
  const isError = error.severity === 'error';
  const hasLocation = error.line && error.column;
  const isClickable = onClick && hasLocation;

  return (
    <div
      className={`p-3 rounded-md border ${
        isError ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
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
          <p
            className={`text-sm font-medium break-words ${
              isError ? 'text-red-800' : 'text-yellow-800'
            }`}
          >
            {error.message}
          </p>

          {(error.line || error.column) && (
            <p
              className={`text-xs mt-1 flex items-center ${
                isError ? 'text-red-600' : 'text-yellow-600'
              }`}
            >
              <span>
                Line {error.line || '?'}, Column {error.column || '?'}
              </span>
              {isClickable && (
                <span
                  className={`ml-2 text-xs ${
                    isError ? 'text-red-500' : 'text-yellow-500'
                  }`}
                >
                  (click to navigate)
                </span>
              )}
            </p>
          )}

          {error.code && (
            <p
              className={`text-xs mt-1 font-mono ${
                isError ? 'text-red-500' : 'text-yellow-500'
              }`}
            >
              Code: {error.code}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
