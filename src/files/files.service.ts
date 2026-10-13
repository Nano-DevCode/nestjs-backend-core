import 'multer';
import { Injectable, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  MAX_FILE_SIZE,
  DEFAULT_BUCKET,
  IMAGE_PROCESSING_QUEUE,
  SUPPORTED_IMAGE_MIMETYPES,
} from './files.constants';
import { VirusScanService } from './services/virus-scan.service';
import { ImageProcessingService } from './services/image-processing.service';
import { S3StorageService } from './services/s3-storage.service';
import {
  validateFileMagicBytes,
  sanitizeSafeFilename,
} from './utils/magic-bytes.util';
import type {
  UploadFileParams,
  UploadResult,
} from './interfaces/files.interface';
import type {
  ImageProcessingJobPayload,
  ImageDimensionsConfig,
} from './interfaces/image-job.interface';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly virusScanService: VirusScanService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly s3StorageService: S3StorageService,
    @Optional()
    @InjectQueue(IMAGE_PROCESSING_QUEUE)
    private readonly imageQueue?: Queue<ImageProcessingJobPayload>,
  ) {}

  async uploadFile(params: UploadFileParams): Promise<UploadResult> {
    const { file, customName, bucket } = params;

    if (!file || !file.buffer) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    // 1. Validación estricta de tamaño (máximo 5 MB)
    if (file.buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido de 5 MB (${(file.buffer.length / (1024 * 1024)).toFixed(2)} MB recibidos)`,
      );
    }

    // 2. Validación defensiva de Magic Bytes (Firmas binarias reales vs declared MIME)
    validateFileMagicBytes(file.buffer, file.mimetype);

    // 3. Escaneo antivirus en caliente con ClamAV
    await this.virusScanService.scanBuffer(file.buffer);

    // 4. Procesamiento y optimización de imágenes (.webp)
    const processed = await this.imageProcessingService.processFile(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    // 5. Sanitización criptográfica y asignación del key único (Prevención de Path Traversal)
    const targetBucket = bucket || DEFAULT_BUCKET;
    const key = customName
      ? sanitizeSafeFilename(customName, processed.extension)
      : `${uuidv4()}${processed.extension}`;

    // 6. Almacenamiento en SeaweedFS vía API S3
    await this.s3StorageService.uploadFile(
      targetBucket,
      key,
      processed.buffer,
      processed.mimetype,
    );

    const relativeUrl = `/api/files/view/${encodeURIComponent(key)}`;

    this.logger.log(
      `Archivo almacenado exitosamente: ${targetBucket}/${key} (${processed.buffer.length} bytes)`,
    );

    return {
      key,
      bucket: targetBucket,
      url: relativeUrl,
      size: processed.buffer.length,
      mimetype: processed.mimetype,
      originalName: file.originalname,
      filename: file.originalname,
    };
  }

  async executeWithRollback<T>(
    uploadParams: UploadFileParams,
    dbOperation: (uploadResult: UploadResult) => Promise<T>,
  ): Promise<{ uploadResult: UploadResult; dbResult: T }> {
    const uploadResult = await this.uploadFile(uploadParams);

    try {
      const dbResult = await dbOperation(uploadResult);
      return { uploadResult, dbResult };
    } catch (error) {
      this.logger.error(
        `Fallo en operación de base de datos. Ejecutando rollback y eliminando archivo huérfano: ${uploadResult.bucket}/${uploadResult.key}`,
      );
      try {
        await this.s3StorageService.deleteFile(
          uploadResult.bucket,
          uploadResult.key,
        );
      } catch (deleteError) {
        this.logger.error(
          `Error durante el rollback eliminando archivo ${uploadResult.key}: ${(deleteError as Error).message}`,
        );
      }
      throw error;
    }
  }

  async updateFileByName(
    oldKey: string,
    newFile: Express.Multer.File,
    newName?: string,
    bucket?: string,
  ): Promise<UploadResult> {
    const targetBucket = bucket || DEFAULT_BUCKET;

    const uploadResult = await this.uploadFile({
      file: newFile,
      customName: newName,
      bucket: targetBucket,
    });

    if (oldKey && oldKey !== uploadResult.key) {
      try {
        await this.s3StorageService.deleteFile(targetBucket, oldKey);
      } catch (deleteErr) {
        this.logger.warn(
          `No se pudo eliminar el archivo anterior '${oldKey}': ${(deleteErr as Error).message}`,
        );
      }
    }

    return uploadResult;
  }

  async deleteFileByName(
    key: string,
    bucket?: string,
  ): Promise<{ message: string }> {
    const targetBucket = bucket || DEFAULT_BUCKET;
    await this.s3StorageService.deleteFile(targetBucket, key);
    return { message: `Archivo '${key}' eliminado exitosamente.` };
  }

  async getFileStream(
    key: string,
    bucket?: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    contentLength?: number;
  }> {
    const targetBucket = bucket || DEFAULT_BUCKET;
    return this.s3StorageService.getFileStream(targetBucket, key);
  }

  getFileUrl(key: string, _bucket?: string): string {
    return `/api/files/view/${encodeURIComponent(key)}`;
  }

  async enqueueImageOptimization(params: {
    file: Express.Multer.File;
    userId: string;
    bucket?: string;
    dimensions?: {
      thumbnail?: ImageDimensionsConfig;
      standard?: ImageDimensionsConfig;
    };
    metadata?: Record<string, unknown>;
  }): Promise<{
    jobId: string;
    status: 'queued';
    originalName: string;
    mimetype: string;
    sizeBytes: number;
    message: string;
  }> {
    const { file, userId, bucket, dimensions, metadata } = params;

    if (!file || !file.buffer) {
      throw new BadRequestException('No se ha proporcionado ninguna imagen');
    }

    if (file.buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido de 5 MB (${(file.buffer.length / (1024 * 1024)).toFixed(2)} MB recibidos)`,
      );
    }

    if (!SUPPORTED_IMAGE_MIMETYPES.includes(file.mimetype.toLowerCase())) {
      throw new BadRequestException(
        `Tipo de archivo no soportado para procesamiento de imágenes: ${file.mimetype}. Formatos permitidos: JPEG, PNG, WebP, GIF, AVIF, TIFF`,
      );
    }

    validateFileMagicBytes(file.buffer, file.mimetype);
    await this.virusScanService.scanBuffer(file.buffer);

    if (!this.imageQueue) {
      throw new BadRequestException(
        'La cola de procesamiento de imágenes no está disponible en esta instancia.',
      );
    }

    const payload: ImageProcessingJobPayload = {
      userId,
      originalName: file.originalname,
      mimetype: file.mimetype,
      fileBufferBase64: file.buffer.toString('base64'),
      targetBucket: bucket || DEFAULT_BUCKET,
      dimensions,
      metadata,
    };

    const job = await this.imageQueue.add('optimize-image', payload, {
      priority: 2,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(
      `[FilesService] Imagen encolada exitosamente en BullMQ: ID trabajo ${job.id} (${file.originalname}) para usuario ${userId}`,
    );

    return {
      jobId: String(job.id),
      status: 'queued',
      originalName: file.originalname,
      mimetype: file.mimetype,
      sizeBytes: file.buffer.length,
      message:
        'Imagen encolada exitosamente para optimización en segundo plano. Recibirás una notificación en tiempo real cuando las variantes estén listas.',
    };
  }
}
