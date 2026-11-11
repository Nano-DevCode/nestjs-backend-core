import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LOGS_QUEUE } from '../logs.constants';
import type { CreateLogItemDto } from '../dto/create-log.dto';
import type { Prisma } from '../../../prisma/generated/prisma/client';

export interface LogsBatchJobPayload {
  logs: CreateLogItemDto[];
}

@Processor(LOGS_QUEUE)
export class LogsProcessor extends WorkerHost {
  private readonly logger = new Logger(LogsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<LogsBatchJobPayload, void, string>): Promise<void> {
    const logs = job.data?.logs;
    if (!logs || logs.length === 0) {
      return;
    }

    try {
      const recordsToInsert: Prisma.SystemLogCreateManyInput[] = logs.map(
        (item) => ({
          source: item.source,
          level: item.level,
          context: item.context,
          message: item.message,
          stackTrace: item.stackTrace ?? null,
          metadata: (item.metadata as Prisma.InputJsonValue) ?? undefined,
          userId: item.userId ?? null,
        }),
      );

      const result = await this.prisma.systemLog.createMany({
        data: recordsToInsert,
      });

      this.logger.debug(
        `[LogsProcessor] Lote procesado e insertado: ${result.count} registros (Job ID: ${job.id})`,
      );
    } catch (error) {
      this.logger.error(
        `[LogsProcessor] Error al insertar lote de logs en PostgreSQL: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error; // Permite a BullMQ reintentar según la estrategia configurada
    }
  }
}
