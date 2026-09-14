import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PDF_QUEUE } from '../pdf.constants';
import { PdfGeneratorService } from '../services/pdf-generator.service';
import { S3StorageService } from '../../files/services/s3-storage.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DEFAULT_BUCKET } from '../../files/files.constants';

export interface PdfJobPayload {
  templateName: string;
  data: Record<string, any> | Record<string, any>[];
  filename?: string;
  userId: string;
}

@Processor(PDF_QUEUE)
export class PdfGeneratorProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfGeneratorProcessor.name);

  constructor(
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly s3StorageService: S3StorageService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<PdfJobPayload, void, string>): Promise<void> {
    this.logger.log(
      `[PdfGeneratorProcessor] Iniciando generación de PDF para trabajo ID: ${job.id} [${job.name}]`,
    );

    try {
      const { templateName, data, filename, userId } = job.data;

      // 1. Generar el buffer del documento PDF aplicando la plantilla
      const pdfBuffer = await this.pdfGeneratorService.generatePdf(
        templateName,
        data,
      );

      // 2. Definir ruta y subir directamente a SeaweedFS/S3 local
      const safeBaseName = filename
        ? filename.replace(/[^a-zA-Z0-9_-]/g, '_')
        : `${templateName}_${job.id}`;
      const fileKey = `documents/${userId}/${job.id}_${safeBaseName}.pdf`;

      const uploadUrl = await this.s3StorageService.uploadFile(
        DEFAULT_BUCKET,
        fileKey,
        pdfBuffer,
        'application/pdf',
      );

      this.logger.log(
        `[PdfGeneratorProcessor] PDF subido exitosamente a SeaweedFS: ${fileKey} (${pdfBuffer.length} bytes)`,
      );

      // 3. Despachar notificación interna en tiempo real al usuario (WebSocket + SSE + DB)
      await this.notificationsService.createNotification({
        userId,
        title: 'Documento PDF listo para descarga',
        body: `Tu documento "${safeBaseName}.pdf" ha sido generado exitosamente.`,
        type: 'DOCUMENT_READY',
        data: {
          jobId: job.id,
          fileKey,
          uploadUrl,
          templateName,
          sizeBytes: pdfBuffer.length,
        },
      });

      this.logger.log(
        `[PdfGeneratorProcessor] Notificación interna emitida al usuario: ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `[PdfGeneratorProcessor] Error generando o persistiendo PDF para trabajo ${job.id}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
