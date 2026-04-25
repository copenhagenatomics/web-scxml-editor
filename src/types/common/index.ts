export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  code?: string;
}

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  errors: ValidationError[];
}

export interface FileInfo {
  name: string;
  size: number;
  lastModified: Date;
  content: string;
}

export interface EditorState {
  content: string;
  isDirty: boolean;
  errors: ValidationError[];
}

export interface AppConfig {
  maxFileSize: number;
  allowedFileTypes: string[];
  autoSave: boolean;
  theme: 'light' | 'dark' | 'system';
}