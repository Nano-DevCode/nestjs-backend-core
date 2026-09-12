import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as path from 'path';
import { SUPPORTED_IMAGE_MIMETYPES } from '../files.constants';
import type { ProcessedFile } from '../interfaces/files.interface';

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  async processFile(
    buffer: Buffer,
    mimetype: string,
    originalName: string,
  ): Promise<ProcessedFile> {
    const isImage = SUPPORTED_IMAGE_MIMETYPES.includes(mimetype.toLowerCase());

    if (isImage) {
      try {
        const convertedBuffer = await sharp(buffer)
          .webp({ quality: 80 })
          .toBuffer();

        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        const webpName = `${baseName}.webp`;

        this.logger.log(
          `Imagen convertida a WebP: ${originalName} -> ${webpName} (Compresión: ${buffer.length} a ${convertedBuffer.length} bytes)`,
        );

        return {
          buffer: convertedBuffer,
          mimetype: 'image/webp',
          extension: '.webp',
          originalName: webpName,
        };
      } catch (error) {
        this.logger.warn(
          `No se pudo optimizar la imagen con Sharp (${(error as Error).message}), preservando archivo original.`,
        );
      }
    }

    const extension = path.extname(originalName).toLowerCase();
    return {
      buffer,
      mimetype,
      extension,
      originalName,
    };
  }
}
