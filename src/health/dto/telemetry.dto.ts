export interface QueueMetricDetail {
  waiting: number;
  active: number;
  failed: number;
  completed: number;
  status: 'healthy' | 'degraded' | 'warning';
}

export interface BullMqTelemetry {
  pdf: QueueMetricDetail;
  logs: QueueMetricDetail;
  totalWaiting: number;
  totalActive: number;
  totalFailed: number;
  status: 'healthy' | 'degraded' | 'warning';
}

export interface WebSocketsTelemetry {
  connectedClients: number;
  latencyMs: number;
  status: 'online' | 'idle' | 'offline';
}

export interface StorageTelemetry {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercentage: number;
  totalFiles: number;
  clamAvStatus: 'active' | 'inactive';
}

export interface SecurityTelemetry {
  throttledRequestsLastHour: number;
  blockedIpsCount: number;
  blockedIps: string[];
  firewallStatus: 'active' | 'warning';
}

export interface SystemTelemetryDto {
  timestamp: string;
  uptimeSeconds: number;
  queues: BullMqTelemetry;
  websockets: WebSocketsTelemetry;
  storage: StorageTelemetry;
  security: SecurityTelemetry;
}
