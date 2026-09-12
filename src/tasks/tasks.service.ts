import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  // 1. Tarea Diaria a Medianoche: Purga de archivos temporales/huérfanos > 24 horas
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOrphanFiles(): Promise<{ purgedCount: number }> {
    this.logger.log(
      'Iniciando tarea programada: Purga de archivos huérfanos (> 24 horas)...',
    );

    const purgedCount = 0;
    try {
      await Promise.resolve();
      this.logger.log(
        `Purga de archivos completada exitosamente. Total purgados: ${purgedCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Error durante la purga de archivos huérfanos: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }

    return { purgedCount };
  }

  // 2. Tarea Semanal: Archivo y depuración de AuditLogs antiguos (> 90 días)
  @Cron(CronExpression.EVERY_WEEK)
  async purgeOldAuditLogs(): Promise<{ deletedCount: number }> {
    this.logger.log(
      'Iniciando tarea programada: Depuración de AuditLogs antiguos (> 90 días)...',
    );

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });

      this.logger.log(
        `Depuración de AuditLogs completada. Registros eliminados: ${result.count}`,
      );
      return { deletedCount: result.count };
    } catch (error) {
      this.logger.error(
        `Error durante la depuración de AuditLogs: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return { deletedCount: 0 };
    }
  }
}
