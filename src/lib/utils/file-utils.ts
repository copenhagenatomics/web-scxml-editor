import type { FileInfo } from '@/types/common';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = ['.scxml', '.xml'];

export function validateFile(file: File): string[] {
  const errors: string[] = [];

  // Check if file exists and is not empty
  if (!file) {
    errors.push('No file selected');
    return errors;
  }

  if (file.size === 0) {
    errors.push('File is empty');
    return errors;
  }

  // File size validation
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size ${formatFileSize(file.size)} exceeds maximum allowed size of ${formatFileSize(MAX_FILE_SIZE)}`);
  }

  // File extension validation
  const fileExtension = getFileExtension(file.name);
  if (!fileExtension) {
    errors.push('File must have an extension');
  } else if (!ALLOWED_FILE_TYPES.includes(fileExtension)) {
    errors.push(`File type ${fileExtension} is not supported. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`);
  }

  // MIME type validation (additional check)
  const allowedMimeTypes = [
    'text/xml',
    'application/xml', 
    'text/plain',
    'application/octet-stream' // Some browsers use this for .scxml files
  ];
  
  if (file.type && !allowedMimeTypes.includes(file.type)) {
    errors.push(`File MIME type ${file.type} is not supported. Expected XML content.`);
  }

  // File name validation
  if (!/^[a-zA-Z0-9\-_.]+$/.test(file.name)) {
    errors.push('File name contains invalid characters. Use only letters, numbers, hyphens, dots, and underscores.');
  }

  return errors;
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(lastDot).toLowerCase() : '';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const content = reader.result;
        
        // Perform content validation
        const contentErrors = validateFileContent(content, file.name);
        if (contentErrors.length > 0) {
          reject(new Error(`Content validation failed: ${contentErrors.join(', ')}`));
          return;
        }
        
        resolve(content);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };
    
    // Try reading as UTF-8 first
    reader.readAsText(file, 'UTF-8');
  });
}

export function validateFileContent(content: string, filename?: string): string[] {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    errors.push('File content is empty');
    return errors;
  }

  // Check for binary content or unusual characters
  if (/[\x00-\x08\x0E-\x1F\x7F]/.test(content)) {
    errors.push('File appears to contain binary content. Please ensure it is a text-based XML file.');
  }

  // Basic XML structure check
  if (!content.trim().startsWith('<')) {
    errors.push('File does not appear to be valid XML (must start with <)');
  }

  if (!content.includes('>')) {
    errors.push('File does not appear to be valid XML (no closing angle brackets found)');
  }

  // Check for SCXML specific content if it's an SCXML file
  if (filename && getFileExtension(filename) === '.scxml') {
    if (!content.includes('<scxml')) {
      errors.push('SCXML file must contain a <scxml> root element');
    }
    
    // Check for SCXML namespace
    if (!content.includes('http://www.w3.org/2005/07/scxml')) {
      errors.push('SCXML file should include the SCXML namespace (http://www.w3.org/2005/07/scxml)');
    }
  }

  // Check encoding declaration (should be UTF-8 or UTF-16)
  if (content.includes('encoding=')) {
    const encodingMatch = content.match(/encoding=["']([^"']+)["']/i);
    if (encodingMatch) {
      const encoding = encodingMatch[1].toLowerCase();
      if (!['utf-8', 'utf-16', 'iso-8859-1'].includes(encoding)) {
        errors.push(`Unsupported encoding '${encodingMatch[1]}'. Recommended: UTF-8`);
      }
    }
  }

  // Check for reasonable file size vs content ratio (detect potential corruption)
  if (content.length < 10) {
    errors.push('File content is too short to be a valid XML document');
  }

  // Basic well-formedness checks
  const openTags = (content.match(/</g) || []).length;
  const closeTags = (content.match(/>/g) || []).length;
  if (openTags !== closeTags && Math.abs(openTags - closeTags) > 5) {
    errors.push('XML structure appears malformed (mismatched angle brackets)');
  }

  return errors;
}

export function downloadFile(content: string, filename: string, mimeType = 'application/xml'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function createFileInfo(file: File, content: string): FileInfo {
  return {
    name: file.name,
    size: file.size,
    lastModified: new Date(file.lastModified),
    content
  };
}

export function detectFileEncoding(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (reader.result && reader.result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(reader.result);
        
        // Check for BOM (Byte Order Mark)
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
          resolve('UTF-8 with BOM');
          return;
        }
        
        if (bytes.length >= 2) {
          // UTF-16 LE
          if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
            resolve('UTF-16LE');
            return;
          }
          // UTF-16 BE
          if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
            resolve('UTF-16BE');
            return;
          }
        }
        
        // Check for high-bit characters (might indicate non-UTF-8)
        const hasHighBits = bytes.some(byte => byte > 127);
        if (hasHighBits) {
          resolve('Unknown (contains non-ASCII characters)');
        } else {
          resolve('UTF-8 (ASCII compatible)');
        }
      } else {
        resolve('Unknown');
      }
    };
    
    reader.onerror = () => resolve('Unknown');
    
    // Read first 1KB to detect encoding
    const blob = file.slice(0, 1024);
    reader.readAsArrayBuffer(blob);
  });
}

export function isValidFileName(filename: string): boolean {
  // Check for valid filename (no path separators, reserved names, etc.)
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
  const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  
  return !invalidChars.test(filename) && 
         !reservedNames.test(filename.replace(/\.[^.]*$/, '')) &&
         filename.length > 0 && 
         filename.length <= 255;
}

export function sanitizeFileName(filename: string): string {
  // Remove invalid characters and replace with underscore
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.{2,}/g, '.') // Replace multiple dots with single dot
    .substring(0, 255) // Limit length
    .replace(/^\./, '_') // Don't start with dot
    .replace(/\.$/, '_'); // Don't end with dot
}