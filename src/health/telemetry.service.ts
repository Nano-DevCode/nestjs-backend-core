import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PDF_QUEUE } from '../pdf/pdf.constants';
import { LOGS_QUEUE } from '../logs/logs.constants';
import { NotificationGateway } from '../notifications/notifications.gateway';
import { VirusScanService } from '../files/services/virus-scan.service';
import type {
  SystemTelemetryDto,
  QueueMetricDetail,
  BullMqTelemetry,
  WebSocketsTelemetry,
  StorageTelemetry,
  SecurityTelemetry,
} from './dto/telemetry.dto';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectQueue(PDF_QUEUE) private readonly pdfQueue: Queue,
    @InjectQueue(LOGS_QUEUE) private readonly logsQueue: Queue,
    private readonly notificationGateway: NotificationGateway,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly virusScanService: VirusScanService,
  ) {}

  async getSystemTelemetry(): Promise<SystemTelemetryDto> {
    const websockets = this.getWebSocketsTelemetry();
    const [queues, storage, security] = await Promise.all([
      this.getQueuesTelemetry(),
      this.getStorageTelemetry(),
      this.getSecurityTelemetry(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      queues,
      websockets,
      storage,
      security,
    };
  }

  private async getQueuesTelemetry(): Promise<BullMqTelemetry> {
    try {
      const [pdfCounts, logsCounts] = await Promise.all([
        this.pdfQueue.getJobCounts('waiting', 'active', 'failed', 'completed'),
        this.logsQueue.getJobCounts('waiting', 'active', 'failed', 'completed'),
      ]);

      const calculateStatus = (
        failed: number,
        waiting: number,
      ): 'healthy' | 'degraded' | 'warning' => {
        if (failed > 10) return 'warning';
        if (waiting > 50 || failed > 0) return 'degraded';
        return 'healthy';
      };

      const pdf: QueueMetricDetail = {
        waiting: pdfCounts['waiting'] ?? 0,
        active: pdfCounts['active'] ?? 0,
        failed: pdfCounts['failed'] ?? 0,
        completed: pdfCounts['completed'] ?? 0,
        status: calculateStatus(
          pdfCounts['failed'] ?? 0,
          pdfCounts['waiting'] ?? 0,
        ),
      };

      const logs: QueueMetricDetail = {
        waiting: logsCounts['waiting'] ?? 0,
        active: logsCounts['active'] ?? 0,
        failed: logsCounts['failed'] ?? 0,
        completed: logsCounts['completed'] ?? 0,
        status: calculateStatus(
          logsCounts['failed'] ?? 0,
          logsCounts['waiting'] ?? 0,
        ),
      };

      const totalWaiting = pdf.waiting + logs.waiting;
      const totalActive = pdf.active + logs.active;
      const totalFailed = pdf.failed + logs.failed;
      const globalStatus =
        totalFailed > 10
          ? 'warning'
          : totalWaiting > 50
            ? 'degraded'
            : 'healthy';

      return {
        pdf,
        logs,
        totalWaiting,
        totalActive,
        totalFailed,
        status: globalStatus,
      };
    } catch (error) {
      this.logger.warn(
        `Error al consultar métricas BullMQ: ${(error as Error).message}`,
      );
      return {
        pdf: {
          waiting: 0,
          active: 0,
          failed: 0,
          completed: 0,
          status: 'healthy',
        },
        logs: {
          waiting: 0,
          active: 0,
          failed: 0,
          completed: 0,
          status: 'healthy',
        },
        totalWaiting: 0,
        totalActive: 0,
        totalFailed: 0,
        status: 'healthy',
      };
    }
  }

  private getWebSocketsTelemetry(): WebSocketsTelemetry {
    try {
      const connectedClients =
        this.notificationGateway.getConnectedSocketsCount();
      return {
        connectedClients,
        latencyMs: 1,
        status: connectedClients > 0 ? 'online' : 'idle',
      };
    } catch {
      return {
        connectedClients: 0,
        latencyMs: 0,
        status: 'offline',
      };
    }
  }

  private async getStorageTelemetry(): Promise<StorageTelemetry> {
    try {
      const aggregateResult = await this.prisma.storedFile.aggregate({
        _sum: { size: true },
        _count: true,
      });

      const totalFiles = aggregateResult._count ?? 0;
      const usedBytes = aggregateResult._sum?.size ?? 0;
      // Quota por defecto: 50 GB
      const totalBytes =
        Number(process.env['STORAGE_TOTAL_BYTES']) || 50 * 1024 * 1024 * 1024;
      const freeBytes = Math.max(0, totalBytes - usedBytes);
      const usedPercentage = Number(
        ((usedBytes / totalBytes) * 100).toFixed(1),
      );
      const clamAvStatus = this.virusScanService.getIsAvailable()
        ? 'active'
        : 'inactive';

      return {
        totalBytes,
        usedBytes,
        freeBytes,
        usedPercentage,
        totalFiles,
        clamAvStatus,
      };
    } catch (error) {
      this.logger.warn(
        `Error al consultar métricas de almacenamiento: ${(error as Error).message}`,
      );
      return {
        totalBytes: 50 * 1024 * 1024 * 1024,
        usedBytes: 0,
        freeBytes: 50 * 1024 * 1024 * 1024,
        usedPercentage: 0,
        totalFiles: 0,
        clamAvStatus: 'inactive',
      };
    }
  }

  private async getSecurityTelemetry(): Promise<SecurityTelemetry> {
    try {
      const now = new Date();
      const hourKey = `telemetry:throttled:429:${now.toISOString().slice(0, 13)}`;
      const throttledCountStr = await this.redis.get(hourKey);
      const throttledRequestsLastHour = parseInt(throttledCountStr || '0', 10);

      const rawBlockedIps = await this.redis.zrevrange(
        'telemetry:throttled:ips',
        0,
        9,
      );
      const blockedIps = Array.isArray(rawBlockedIps) ? rawBlockedIps : [];

      return {
        throttledRequestsLastHour,
        blockedIpsCount: blockedIps.length,
        blockedIps,
        firewallStatus: 'active',
      };
    } catch (error) {
      this.logger.warn(
        `Error al consultar métricas de seguridad: ${(error as Error).message}`,
      );
      return {
        throttledRequestsLastHour: 0,
        blockedIpsCount: 0,
        blockedIps: [],
        firewallStatus: 'warning',
      };
    }
  }
}
