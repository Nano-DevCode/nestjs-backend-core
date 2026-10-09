import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EXPORTS_QUEUE } from '../exports.constants';
import { ExportsService } from '../exports.service';
import { S3StorageService } from '../../files/services/s3-storage.service';
import { NotificationGateway } from '../../notifications/notifications.gateway';
import type { ExportRequestPayload, ExportResult } from '../exports.interfaces';
import { DEFAULT_BUCKET } from '../../files/files.constants';

@Processor(EXPORTS_QUEUE)
export class ExportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportsProcessor.name);

  constructor(
    private readonly exportsService: ExportsService,
    private readonly s3StorageService: S3StorageService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(
    job: Job<ExportRequestPayload, ExportResult, string>,
  ): Promise<ExportResult> {
    const { exportId, userId, title, format, datasetType, columns, filters, records } =
      job.data;

    this.logger.log(
      `[ExportsProcessor] Procesando exportación '${exportId}' (Formato: ${format}, Dataset: ${datasetType})`,
    );

    try {
      // 1. Notificar inicio de procesamiento
      await this.exportsService.updateExportStatus(exportId, {
        status: 'processing',
        progressPercentage: 25,
      });

      // 2. Obtener el conjunto de datos (desde el payload o desde la base de datos)
      let dataToExport: Record<string, unknown>[] = [];
      if (records && Array.isArray(records) && records.length > 0) {
        dataToExport = records;
      } else {
        dataToExport = await this.exportsService.fetchDataset(datasetType, filters);
      }

      await this.exportsService.updateExportStatus(exportId, {
        progressPercentage: 60,
      });

      // 3. Serializar al formato solicitado
      let fileContent: string;
      let mimeType: string;

      if (format === 'json') {
        fileContent = JSON.stringify(dataToExport, null, 2);
        mimeType = 'application/json';
      } else if (format === 'tsv') {
        fileContent = this.exportsService.formatDatasetAsCsv(
          dataToExport,
          columns,
          '\t',
        );
        mimeType = 'text/tab-separated-values';
      } else {
        // Por defecto CSV
        fileContent = this.exportsService.formatDatasetAsCsv(
          dataToExport,
          columns,
          ',',
        );
        mimeType = 'text/csv';
      }

      const buffer = Buffer.from(fileContent, 'utf-8');
      const fileKey = `exports/${userId}/${exportId}.${format}`;
      const fileName = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${exportId.slice(0, 8)}.${format}`;

      // 4. Subir archivo a almacenamiento S3 / SeaweedFS
      await this.s3StorageService.uploadFile(
        DEFAULT_BUCKET,
        fileKey,
        buffer,
        mimeType,
      );

      const fileUrl = this.s3StorageService.getFileUrl(DEFAULT_BUCKET, fileKey);
      const completedAt = new Date().toISOString();

      // 5. Actualizar estado a completado
      await this.exportsService.updateExportStatus(exportId, {
        status: 'completed',
        progressPercentage: 100,
        recordCount: dataToExport.length,
        fileUrl,
      });

      const exportResult: ExportResult = {
        exportId,
        fileName,
        fileKey,
        fileUrl,
        recordCount: dataToExport.length,
        fileSizeBytes: buffer.length,
        format,
        completedAt,
      };

      // 6. Notificar al usuario en tiempo real vía WebSocket
      this.notificationGateway.sendToUser(userId, {
        type: 'EXPORT_READY',
        exportId,
        title,
        fileName,
        fileUrl,
        format,
        recordCount: dataToExport.length,
        completedAt,
      });

      this.logger.log(
        `[ExportsProcessor] Exportación '${exportId}' completada: ${dataToExport.length} registros subidos a S3 (${fileKey}) y notificados por WebSocket`,
      );

      return exportResult;
    } catch (error) {
      const errorMsg = (error as Error).message;
      this.logger.error(
        `[ExportsProcessor] Error al procesar exportación '${exportId}': ${errorMsg}`,
        (error as Error).stack,
      );

      await this.exportsService.updateExportStatus(exportId, {
        status: 'failed',
        error: errorMsg,
      });

      // Notificar fallo en tiempo real
      this.notificationGateway.sendToUser(userId, {
        type: 'EXPORT_FAILED',
        exportId,
        title,
        error: errorMsg,
      });

      throw error;
    }
  }
}

