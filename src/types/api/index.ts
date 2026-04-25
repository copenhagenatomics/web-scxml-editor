export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface FileUploadRequest {
  file: File;
}

export interface FileUploadResponse {
  id: string;
  name: string;
  size: number;
  content: string;
}

export interface ValidationRequest {
  content: string;
  strict?: boolean;
}

export interface ValidationResponse {
  valid: boolean;
  errors: Array<{
    message: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning';
  }>;
}