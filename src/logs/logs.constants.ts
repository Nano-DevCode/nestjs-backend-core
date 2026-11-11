export const LOGS_QUEUE = 'logs-queue';

export const LOGS_CONFIG = {
  BATCH_SIZE: 25,
  FLUSH_INTERVAL_MS: 500,
  RETENTION_DAYS: 30,
} as const;

export const LOG_JOB_NAMES = {
  BATCH_INSERT: 'insert-logs-batch',
} as const;
