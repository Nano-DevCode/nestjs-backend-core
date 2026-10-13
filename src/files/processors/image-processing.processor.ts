import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { IMAGE_PROCESSING_QUEUE, DEFAULT_BUCKET } from '../files.constants';
import { S3StorageService } from '../services/s3-storage.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type {
  ImageProcessingJobPayload,
  ImageProcessingResult,
  ImageVariantResult,
} from '../interfaces/image-job.interface';

@Processor(IMAGE_PROCESSING_QUEUE)
export class ImageProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessingProcessor.name);

  constructor(
    private readonly s3StorageService: S3StorageService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(
    job: Job<ImageProcessingJobPayload, ImageProcessingResult>,
  ): Promise<ImageProcessingResult> {
    const {
      userId,
      originalName,
      fileBufferBase64,
      tempStorageKey,
      targetBucket = DEFAULT_BUCKET,
      dimensions,
    } = job.data;

    this.logger.log(
      `[ImageProcessingProcessor] Iniciando procesamiento de imagen para trabajo ID: ${job.id} (${originalName}) - Usuario: ${userId}`,
    );

    try {
      // 1. Obtener buffer original (desde base64 o desde clave temporal en S3)
      let inputBuffer: Buffer;
      if (fileBufferBase64) {
        inputBuffer = Buffer.from(fileBufferBase64, 'base64');
      } else if (tempStorageKey) {
        inputBuffer = await this.s3StorageService.getFileBuffer(
          targetBucket,
          tempStorageKey,
        );
      } else {
        throw new Error(
          'El trabajo no contiene fileBufferBase64 ni tempStorageKey',
        );
      }

      const originalSizeBytes = inputBuffer.length;

      // 2. Parámetros para Thumbnail (Miniatura WebP)
      const thumbWidth = dimensions?.thumbnail?.width || 200;
      const thumbHeight = dimensions?.thumbnail?.height || 200;
      const thumbFit = dimensions?.thumbnail?.fit || 'cover';
      const thumbQuality = dimensions?.thumbnail?.quality || 80;

      const thumbBuffer = await sharp(inputBuffer)
        .resize({
          width: thumbWidth,
          height: thumbHeight,
          fit: thumbFit,
        })
        .webp({ quality: thumbQuality })
        .toBuffer();

      const thumbMeta = await sharp(thumbBuffer).metadata();

      // 3. Parámetros para Resolución Estándar (Optimizada WebP)
      const stdMaxWidth = dimensions?.standard?.width || 1280;
      const stdMaxHeight = dimensions?.standard?.height || 1280;
      const stdQuality = dimensions?.standard?.quality || 85;

      const standardBuffer = await sharp(inputBuffer)
        .resize({
          width: stdMaxWidth,
          height: stdMaxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: stdQuality })
        .toBuffer();

      const stdMeta = await sharp(standardBuffer).metadata();

      // 4. Subir variantes generadas a SeaweedFS / S3
      const baseId = job.id || uuidv4();
      const thumbKey = `images/variants/${userId}/${baseId}_thumb.webp`;
      const standardKey = `images/variants/${userId}/${baseId}_standard.webp`;

      const [thumbUrl, standardUrl] = await Promise.all([
        this.s3StorageService.uploadFile(
          targetBucket,
          thumbKey,
          thumbBuffer,
          'image/webp',
        ),
        this.s3StorageService.uploadFile(
          targetBucket,
          standardKey,
          standardBuffer,
          'image/webp',
        ),
      ]);

      // 5. Limpieza de archivo temporal si aplicaba
      if (tempStorageKey) {
        try {
          await this.s3StorageService.deleteFile(targetBucket, tempStorageKey);
        } catch (cleanupError) {
          this.logger.warn(
            `No se pudo eliminar el archivo temporal ${tempStorageKey}: ${(cleanupError as Error).message}`,
          );
        }
      }

      // 6. Construir resultado estructurado con métricas
      const thumbnailVariant: ImageVariantResult = {
        key: thumbKey,
        bucket: targetBucket,
        url: thumbUrl,
        width: thumbMeta.width || thumbWidth,
        height: thumbMeta.height || thumbHeight,
        sizeBytes: thumbBuffer.length,
        format: 'webp',
      };

      const standardVariant: ImageVariantResult = {
        key: standardKey,
        bucket: targetBucket,
        url: standardUrl,
        width: stdMeta.width || 0,
        height: stdMeta.height || 0,
        sizeBytes: standardBuffer.length,
        format: 'webp',
      };

      const compressionRatioPercent =
        originalSizeBytes > 0
          ? Number(
              (
                (1 - standardBuffer.length / originalSizeBytes) *
                100
              ).toFixed(2),
            )
          : 0;

      const result: ImageProcessingResult = {
        jobId: String(job.id),
        originalName,
        originalSizeBytes,
        userId,
        variants: {
          thumbnail: thumbnailVariant,
          standard: standardVariant,
        },
        compressionRatioPercent,
        processedAt: new Date().toISOString(),
      };

      this.logger.log(
        `[ImageProcessingProcessor] Imagen procesada exitosamente (${originalName}): ` +
          `Original: ${originalSizeBytes} bytes -> Estándar: ${standardBuffer.length} bytes (${compressionRatioPercent}% compresión), ` +
          `Thumbnail: ${thumbBuffer.length} bytes`,
      );

      // 7. Despachar notificación en tiempo real vía WebSocket / SSE / DB
      await this.notificationsService.createNotification({
        userId,
        title: 'Imagen procesada y optimizada',
        body: `Tu archivo "${originalName}" ha sido procesado exitosamente en formato WebP con resolución estándar y miniatura.`,
        type: 'IMAGE_PROCESSED',
        data: result as unknown as Record<string, unknown>,
      });

      this.logger.log(
        `[ImageProcessingProcessor] Notificación en tiempo real emitida al usuario: ${userId}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[ImageProcessingProcessor] Error procesando imagen en trabajo ${job.id}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}

