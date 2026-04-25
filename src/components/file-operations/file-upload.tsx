'use client';

import React, { useRef } from 'react';
import { Upload, FileText } from 'lucide-react';
import { validateFile, readFileAsText } from '@/lib/utils/file-utils';
import type { FileInfo } from '@/types/common';

interface FileUploadProps {
  onFileLoad: (fileInfo: FileInfo) => void;
  onError: (errors: string[]) => void;
  disabled?: boolean;
  accept?: string;
}

export function FileUpload({
  onFileLoad,
  onError,
  disabled = false,
  accept = '.scxml,.xml'
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    const validationErrors = validateFile(file);
    
    if (validationErrors.length > 0) {
      onError(validationErrors);
      return;
    }

    try {
      const content = await readFileAsText(file);
      const fileInfo: FileInfo = {
        name: file.name,
        size: file.size,
        lastModified: new Date(file.lastModified),
        content
      };
      
      onFileLoad(fileInfo);
    } catch (error) {
      onError([error instanceof Error ? error.message : 'Failed to read file']);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
      
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${disabled 
            ? 'border-gray-300 bg-gray-50 cursor-not-allowed' 
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }
        `}
      >
        <div className="flex flex-col items-center space-y-4">
          <div className={`p-3 rounded-full ${disabled ? 'bg-gray-200' : 'bg-blue-100'}`}>
            {disabled ? (
              <FileText className="h-8 w-8 text-gray-400" />
            ) : (
              <Upload className="h-8 w-8 text-blue-500" />
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className={`text-lg font-medium ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
              {disabled ? 'Upload disabled' : 'Upload SCXML file'}
            </h3>
            
            {!disabled && (
              <>
                <p className="text-sm text-gray-500">
                  Click to browse or drag and drop your SCXML file here
                </p>
                <p className="text-xs text-gray-400">
                  Supports .scxml and .xml files up to 10MB
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}