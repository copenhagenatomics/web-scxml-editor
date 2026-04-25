/**
 * Visual Metadata Export Component
 *
 * Provides export options for SCXML with visual metadata control
 */

'use client';

import React from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';

interface VisualMetadataExportProps {
  /** SCXML content to export */
  scxmlContent: string;
  /** Base filename for download */
  filename?: string;
  /** Whether visual metadata is present in the content */
  hasVisualMetadata?: boolean;
  /** Called when export is complete */
  onExportComplete?: (exportType: 'with-metadata' | 'clean') => void;
}

export const VisualMetadataExport: React.FC<VisualMetadataExportProps> = ({
  scxmlContent,
  filename = 'document.scxml',
  hasVisualMetadata = false,
  onExportComplete,
}) => {
  const downloadFile = (
    content: string,
    fileName: string,
    exportType: 'with-metadata' | 'clean'
  ) => {
    const blob = new Blob([content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onExportComplete?.(exportType);
  };

  const handleExportWithMetadata = () => {
    downloadFile(scxmlContent, filename, 'with-metadata');
  };

  const handleExportClean = async () => {
    try {
      // Import utilities for fallback cleaning
      const { removeVisualMetadataFromXML } = await import(
        '@/lib/utils/visual-metadata-utils'
      );

      // First try the regex-based approach as fallback
      const regexCleanedContent = removeVisualMetadataFromXML(scxmlContent);

      try {
        // Try to parse with the full parser
        const { SCXMLParser } = await import('@/lib/parsers/scxml-parser');
        const parser = new SCXMLParser();

        const parseResult = parser.parse(scxmlContent);
        if (parseResult.success && parseResult.data) {
          // Use the parser's clean serialization if successful
          const cleanContent = parser.serialize(parseResult.data, false);
          const cleanFilename = filename.replace(
            /\.(scxml|xml)$/i,
            '-clean.$1'
          );
          downloadFile(cleanContent, cleanFilename, 'clean');
          return;
        } else {
          // Log parsing errors but continue with regex approach
          const errorMessages = parseResult.errors.map(
            (e) => `${e.message} (line: ${e.line || 'unknown'})`
          );
          console.warn(
            'Parser failed, using regex-based cleaning. Errors:',
            errorMessages.join('; ')
          );
        }
      } catch (parserError) {
        console.warn('Parser error, using regex-based cleaning:', parserError);
      }

      // Use regex-based cleaning as reliable fallback
      const cleanFilename = filename.replace(/\.(scxml|xml)$/i, '-clean.$1');
      downloadFile(regexCleanedContent, cleanFilename, 'clean');
    } catch (error) {
      console.error('Error creating clean export:', error);
      // Final fallback to original content
      const cleanFilename = filename.replace(/\.(scxml|xml)$/i, '-clean.$1');
      downloadFile(scxmlContent, cleanFilename, 'clean');
    }
  };

  if (!hasVisualMetadata) {
    // Single export button when no visual metadata is present
    return (
      <button
        onClick={handleExportWithMetadata}
        className='inline-flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-green-100 text-green-800 hover:bg-green-200 transition-colors'
        title='Download SCXML file'
      >
        <Download className='h-4 w-4' />
        <span>Download</span>
      </button>
    );
  }

  return (
    <div className='flex items-center space-x-2'>
      {/* Export with visual metadata */}
      <button
        onClick={handleExportWithMetadata}
        className='cursor-pointer inline-flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors'
        title='Download SCXML file with visual metadata (for Visual SCXML Editor)'
      >
        <Download className='h-4 w-4' />
        <span>With Visual Data</span>
      </button>

      {/* Export clean SCXML */}
      <button
        onClick={handleExportClean}
        className='cursor-pointer inline-flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-green-100 text-green-800 hover:bg-green-200 transition-colors'
        title='Download clean W3C-compliant SCXML (compatible with all processors)'
      >
        <Download className='h-4 w-4' />
        <span>Clean SCXML</span>
      </button>
    </div>
  );
};

export default VisualMetadataExport;
