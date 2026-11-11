import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LOGS_QUEUE, LOGS_CONFIG, LOG_JOB_NAMES } from './logs.constants';
import { CreateLogItemDto, ClientLogDto } from './dto/create-log.dto';
import type { LogQueryDto } from './dto/log-query.dto';
import { sanitizeMetadata } from './utils/sanitize-metadata.util';
import {
  LogSource,
  LogLevel,
  type Prisma,
} from '../../prisma/generated/prisma/client';

export interface LogStatsResponse {
  totalErrors24h: number;
  sourceDistribution: {
    backend: number;
    frontend: number;
  };
  levelDistribution: {
    info: number;
    warn: number;
    error: number;
    fatal: number;
  };
  topFailingContexts: Array<{ context: string; count: number }>;
}

@Injectable()
export class LogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogsService.name);
  private buffer: CreateLogItemDto[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(LOGS_QUEUE) private readonly logsQueue: Queue,
  ) {}

  onModuleInit(): void {
    // Iniciar el temporizador periódico para vaciar el micro-lote en memoria
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, LOGS_CONFIG.FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Vaciar logs remanentes en el apagado de la aplicación
    await this.flush();
  }

  /**
   * Encola un log general sanitizando sus metadatos antes de acumularlo
   */
  enqueue(item: CreateLogItemDto): void {
    const sanitizedItem: CreateLogItemDto = {
      ...item,
      metadata: item.metadata
        ? (sanitizeMetadata(item.metadata) as Record<string, unknown>)
        : undefined,
    };

    this.buffer.push(sanitizedItem);

    // Si alcanzamos el tamaño límite del lote, vaciar inmediatamente a la cola
    if (this.buffer.length >= LOGS_CONFIG.BATCH_SIZE) {
      void this.flush();
    }
  }

  /**
   * Encola un reporte de error proveniente del cliente frontend
   */
  enqueueClientLog(dto: ClientLogDto, fallbackUserId?: string): void {
    this.enqueue({
      source: LogSource.FRONTEND,
      level: dto.level || LogLevel.ERROR,
      context: dto.context,
      message: dto.message,
      stackTrace: dto.stackTrace,
      metadata: dto.metadata,
      userId: dto.userId || fallbackUserId,
    });
  }

  /**
   * Encola un reporte generado internamente en el backend
   */
  enqueueBackendLog(params: {
    level: LogLevel;
    context: string;
    message: string;
    stackTrace?: string;
    metadata?: Record<string, unknown>;
    userId?: string;
  }): void {
    this.enqueue({
      source: LogSource.BACKEND,
      level: params.level,
      context: params.context,
      message: params.message,
      stackTrace: params.stackTrace,
      metadata: params.metadata,
      userId: params.userId,
    });
  }

  /**
   * Transfiere el lote de memoria hacia BullMQ para persistencia asíncrona
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const batch = [...this.buffer];
    this.buffer = [];

    try {
      await this.logsQueue.add(
        LOG_JOB_NAMES.BATCH_INSERT,
        { logs: batch },
        {
          removeOnComplete: true,
          removeOnFail: 100,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `[LogsService] Error al despachar lote a BullMQ (${batch.length} logs): ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Obtiene logs paginados y filtrados para el panel de administración
   */
  async getLogs(query: LogQueryDto) {
    const {
      page = 1,
      limit = 20,
      source,
      level,
      context,
      search,
      startDate,
      endDate,
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.SystemLogWhereInput = {};

    if (source) {
      where.source = source;
    }

    if (level) {
      where.level = level;
    }

    if (context) {
      where.context = { contains: context, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { message: { contains: search, mode: 'insensitive' } },
        { context: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.systemLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Calcula estadísticas y métricas agregadas de las últimas 24 horas
   */
  async getStats(): Promise<LogStatsResponse> {
    const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs24h = await this.prisma.systemLog.findMany({
      where: {
        createdAt: { gte: past24Hours },
      },
      select: {
        source: true,
        level: true,
        context: true,
      },
    });

    let totalErrors24h = 0;
    const sourceDistribution = { backend: 0, frontend: 0 };
    const levelDistribution = { info: 0, warn: 0, error: 0, fatal: 0 };
    const contextErrorCountMap: Record<string, number> = {};

    for (const log of logs24h) {
      // Distribución de fuentes
      if (log.source === LogSource.BACKEND) {
        sourceDistribution.backend++;
      } else if (log.source === LogSource.FRONTEND) {
        sourceDistribution.frontend++;
      }

      // Distribución de niveles
      if (log.level === LogLevel.INFO) {
        levelDistribution.info++;
      } else if (log.level === LogLevel.WARN) {
        levelDistribution.warn++;
      } else if (log.level === LogLevel.ERROR) {
        levelDistribution.error++;
        totalErrors24h++;
        contextErrorCountMap[log.context] =
          (contextErrorCountMap[log.context] || 0) + 1;
      } else if (log.level === LogLevel.FATAL) {
        levelDistribution.fatal++;
        totalErrors24h++;
        contextErrorCountMap[log.context] =
          (contextErrorCountMap[log.context] || 0) + 1;
      }
    }

    const topFailingContexts = Object.entries(contextErrorCountMap)
      .map(([context, count]) => ({ context, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalErrors24h,
      sourceDistribution,
      levelDistribution,
      topFailingContexts,
    };
  }

  /**
   * Purga automática programada de logs con más de 30 días de antigüedad
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOldLogs(): Promise<{ deletedCount: number }> {
    this.logger.log(
      `[LogsService] Iniciando tarea de purga de logs antiguos (> ${LOGS_CONFIG.RETENTION_DAYS} días)...`,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LOGS_CONFIG.RETENTION_DAYS);

    try {
      const result = await this.prisma.systemLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      this.logger.log(
        `[LogsService] Purga completada. Logs eliminados: ${result.count}`,
      );
      return { deletedCount: result.count };
    } catch (error) {
      this.logger.error(
        `[LogsService] Error durante la purga de logs: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return { deletedCount: 0 };
    }
  }
}
