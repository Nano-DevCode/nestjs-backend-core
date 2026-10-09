import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PrismaService } from '../prisma/prisma.service';
import { EXPORTS_QUEUE, EXPORT_STATUS_PREFIX } from './exports.constants';
import type {
  ExportFormat,
  ExportRequestPayload,
  ExportStatus,
  ExportStatusRecord,
} from './exports.interfaces';
import type { CreateExportRequestDto } from './dto/create-export-request.dto';

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    @InjectQueue(EXPORTS_QUEUE) private readonly exportsQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Encola una solicitud asíncrona de exportación masiva.
   */
  async requestExport(
    userId: string,
    dto: CreateExportRequestDto,
  ): Promise<{ exportId: string; status: ExportStatus; queueJobId?: string }> {
    const exportId = crypto.randomUUID();
    const title = dto.title || `Exportación-${new Date().toISOString().slice(0, 10)}`;
    const format: ExportFormat = dto.format || 'csv';
    const datasetType = dto.datasetType || 'custom';
    const now = new Date().toISOString();

    const statusRecord: ExportStatusRecord = {
      exportId,
      userId,
      title,
      format,
      status: 'pending',
      progressPercentage: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Guardar estado inicial en Redis con expiración de 24 horas
    await this.redis.set(
      `${EXPORT_STATUS_PREFIX}${exportId}`,
      JSON.stringify(statusRecord),
      'EX',
      86400,
    );

    const payload: ExportRequestPayload = {
      exportId,
      userId,
      title,
      format,
      datasetType,
      records: dto.records,
      columns: dto.columns,
      filters: dto.filters,
      requestedAt: now,
    };

    const job = await this.exportsQueue.add(`export-${format}-${datasetType}`, payload, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(
      `Exportación solicitada: ID=${exportId}, Formato=${format}, Dataset=${datasetType}, Usuario=${userId}, JobID=${job.id}`,
    );

    return {
      exportId,
      status: 'pending',
      queueJobId: job.id,
    };
  }

  /**
   * Consulta el estado de una exportación.
   */
  async getExportStatus(exportId: string): Promise<ExportStatusRecord | null> {
    const raw = await this.redis.get(`${EXPORT_STATUS_PREFIX}${exportId}`);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as ExportStatusRecord;
    } catch {
      return null;
    }
  }

  /**
   * Actualiza el estado de una exportación en Redis.
   */
  async updateExportStatus(
    exportId: string,
    update: Partial<ExportStatusRecord>,
  ): Promise<void> {
    const current = await this.getExportStatus(exportId);
    if (!current) {
      return;
    }

    const updated: ExportStatusRecord = {
      ...current,
      ...update,
      updatedAt: new Date().toISOString(),
    };

    await this.redis.set(
      `${EXPORT_STATUS_PREFIX}${exportId}`,
      JSON.stringify(updated),
      'EX',
      86400,
    );
  }

  /**
   * Recupera datos del dataset según la entidad solicitada.
   */
  async fetchDataset(
    datasetType: string,
    _filters?: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    switch (datasetType.toLowerCase()) {
      case 'users':
      case 'usuarios': {
        const users = await this.prisma.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          take: 10000,
          orderBy: { createdAt: 'desc' },
        });
        return users as unknown as Record<string, unknown>[];
      }

      case 'audit_logs':
      case 'audit': {
        const logs = await this.prisma.auditLog.findMany({
          take: 10000,
          orderBy: { createdAt: 'desc' },
        });
        return logs as unknown as Record<string, unknown>[];
      }

      case 'system_logs':
      case 'logs': {
        const sysLogs = await this.prisma.systemLog.findMany({
          take: 10000,
          orderBy: { createdAt: 'desc' },
        });
        return sysLogs as unknown as Record<string, unknown>[];
      }

      default:
        return [];
    }
  }

  /**
   * Convierte un arreglo de objetos a formato CSV/TSV cumpliendo el estándar RFC-4180.
   */
  formatDatasetAsCsv(
    records: Record<string, unknown>[],
    columns?: string[],
    delimiter = ',',
  ): string {
    if (records.length === 0) {
      return '';
    }

    // Determinar las cabeceras/columnas
    const headers =
      columns && columns.length > 0
        ? columns
        : Array.from(
            new Set(
              records.flatMap((r) => Object.keys(r)),
            ),
          );

    const escapeValue = (val: unknown): string => {
      if (val === null || val === undefined) {
        return '';
      }
      let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      // Si contiene comillas, saltos de línea o el delimitador, se encierra entre comillas dobles y se escapan
      if (
        str.includes(delimiter) ||
        str.includes('"') ||
        str.includes('\n') ||
        str.includes('\r')
      ) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = headers.map((h) => escapeValue(h)).join(delimiter);
    const rowLines = records.map((record) =>
      headers.map((h) => escapeValue(record[h])).join(delimiter),
    );

    return [headerLine, ...rowLines].join('\r\n');
  }
}

