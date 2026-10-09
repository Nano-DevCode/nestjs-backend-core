export type ExportFormat = 'csv' | 'json' | 'tsv';
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ExportRequestPayload {
  exportId: string;
  userId: string;
  title: string;
  format: ExportFormat;
  datasetType: string;
  records?: Record<string, unknown>[];
  columns?: string[];
  filters?: Record<string, unknown>;
  requestedAt: string;
}

export interface ExportResult {
  exportId: string;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  recordCount: number;
  fileSizeBytes: number;
  format: ExportFormat;
  completedAt: string;
}

export interface ExportStatusRecord {
  exportId: string;
  userId: string;
  title: string;
  format: ExportFormat;
  status: ExportStatus;
  progressPercentage?: number;
  recordCount?: number;
  fileUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

