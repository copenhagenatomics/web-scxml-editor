export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
  /** Optional end of the offending source range (1-based, exclusive column). */
  endLine?: number;
  endColumn?: number;
  severity: 'error' | 'warning';
  code?: string;
  stateId?: string;
  targetStateId?: string;
  /** A one-click fix the Validation panel offers as a button (see applyValidationFix). */
  fix?: ValidationFix;
}

/**
 * A document change that resolves a validation problem. Plain data rather than a callback, so
 * errors stay serializable: 'add-data' declares `<data id={dataId} expr={expr}>`, and
 * 'set-data-expr' changes an existing `<data id={dataId}>`'s expr.
 */
export interface ValidationFix {
  label: string;
  kind: 'add-data' | 'set-data-expr';
  dataId: string;
  expr: string;
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