import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { DEFAULT_BUCKET } from '../files.constants';

@Injectable()
export class S3StorageService implements OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly endpoint: string;

  constructor() {
    this.endpoint = process.env['S3_ENDPOINT'] || 'http://localhost:8333';
    const region = process.env['S3_REGION'] || 'us-east-1';
    const accessKeyId = process.env['S3_ACCESS_KEY'] || 'tu_access_key';
    const secretAccessKey = process.env['S3_SECRET_KEY'] || 'tu_secret_key';
    const forcePathStyle = process.env['S3_FORCE_PATH_STYLE'] !== 'false';

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region,
      forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists(DEFAULT_BUCKET);
  }

  async ensureBucketExists(bucket: string): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      this.logger.log(
        `Bucket '${bucket}' no encontrado. Creando automáticamente en SeaweedFS...`,
      );
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        this.logger.log(`Bucket '${bucket}' creado exitosamente.`);
      } catch (createErr) {
        this.logger.warn(
          `No se pudo crear automáticamente el bucket '${bucket}': ${(createErr as Error).message}`,
        );
      }
    }
  }

  async uploadFile(
    bucket: string,
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return this.getFileUrl(bucket, key);
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      this.logger.log(`Archivo eliminado de SeaweedFS: ${bucket}/${key}`);
    } catch (error) {
      this.logger.error(
        `Error eliminando archivo ${bucket}/${key}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async getFileStream(
    bucket: string,
    key: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    contentLength?: number;
  }> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundException(
          `El archivo '${key}' no contiene datos o no fue encontrado en SeaweedFS`,
        );
      }

      return {
        stream: response.Body as unknown as NodeJS.ReadableStream,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength,
      };
    } catch (error) {
      this.logger.error(
        `Error al obtener archivo ${bucket}/${key}: ${(error as Error).message}`,
      );
      if (
        (error as { name?: string }).name === 'NoSuchKey' ||
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        throw new NotFoundException(
          `El archivo '${key}' no existe en el almacenamiento`,
        );
      }
      throw error;
    }
  }

  getFileUrl(_bucket: string, key: string): string {
    return `/api/files/view/${encodeURIComponent(key)}`;
  }
}
