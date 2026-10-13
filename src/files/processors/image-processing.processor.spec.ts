import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ImageProcessingProcessor } from './image-processing.processor';
import { S3StorageService } from '../services/s3-storage.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { ImageJobPayload } from '../interfaces/image-job.interface';

describe('ImageProcessingProcessor', () => {
  let processor: ImageProcessingProcessor;
  let s3StorageMock: {
    uploadFile: jest.Mock;
    deleteFile: jest.Mock;
    getFileBuffer: jest.Mock;
  };
  let notificationsMock: {
    createNotification: jest.Mock;
    sendUserEvent: jest.Mock;
  };

  let samplePngBuffer: Buffer;
  let tempTestFile: string;

  beforeAll(async () => {
    samplePngBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  });

  beforeEach(async () => {
    s3StorageMock = {
      uploadFile: jest
        .fn()
        .mockImplementation((bucket, key) =>
          Promise.resolve(`https://s3.local/${bucket}/${key}`),
        ),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getFileBuffer: jest.fn().mockResolvedValue(samplePngBuffer),
    };

    notificationsMock = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif-123' }),
      sendUserEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageProcessingProcessor,
        { provide: S3StorageService, useValue: s3StorageMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    processor = module.get<ImageProcessingProcessor>(ImageProcessingProcessor);

    // Crear archivo temporal real en disco para pruebas
    const tempDir = path.join(os.tmpdir(), 'jest_image_processor_tests');
    await fs.promises.mkdir(tempDir, { recursive: true });
    tempTestFile = path.join(tempDir, `test_${Date.now()}.png`);
    await fs.promises.writeFile(tempTestFile, samplePngBuffer);
  });

  afterEach(async () => {
    if (fs.existsSync(tempTestFile)) {
      try {
        await fs.promises.unlink(tempTestFile);
      } catch {
        // Ignorar
      }
    }
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process image from tempFilePath, delete temp file from disk, upload variants to S3, and emit image:processed WebSocket event', async () => {
    expect(fs.existsSync(tempTestFile)).toBe(true);

    const jobData: ImageJobPayload = {
      userId: 'user-456',
      originalName: 'test-photo.png',
      mimetype: 'image/png',
      tempFilePath: tempTestFile,
      targetBucket: 'my-bucket',
    };

    const mockJob = {
      id: 'job-101',
      data: jobData,
    } as unknown as Job<ImageJobPayload>;

    const result = await processor.process(mockJob as any);

    expect(result).toBeDefined();
    expect(result.jobId).toBe('job-101');
    expect(result.originalName).toBe('test-photo.png');
    expect(result.userId).toBe('user-456');

    // Variantes
    expect(result.variants.thumbnail).toBeDefined();
    expect(result.variants.thumbnail.format).toBe('webp');
    expect(result.variants.thumbnail.key).toContain('job-101_thumb.webp');
    expect(result.variants.standard).toBeDefined();
    expect(result.variants.standard.format).toBe('webp');
    expect(result.variants.standard.key).toContain('job-101_standard.webp');

    // Subidas a S3
    expect(s3StorageMock.uploadFile).toHaveBeenCalledTimes(2);

    // Checklist 4: El archivo temporal debió ser eliminado del disco
    expect(fs.existsSync(tempTestFile)).toBe(false);

    // Checklist 4: Emisión de evento WebSocket image:processed
    expect(notificationsMock.sendUserEvent).toHaveBeenCalledWith(
      'user-456',
      'image:processed',
      expect.objectContaining({
        jobId: 'job-101',
        variants: expect.any(Object),
      }),
    );

    // Notificación en base de datos
    expect(notificationsMock.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-456',
        type: 'IMAGE_PROCESSED',
      }),
    );
  });

  it('should throw error if tempFilePath does not exist on disk', async () => {
    const jobData: ImageJobPayload = {
      userId: 'user-000',
      originalName: 'nonexistent.png',
      mimetype: 'image/png',
      tempFilePath: '/path/to/nonexistent/file.png',
    };

    const mockJob = {
      id: 'job-err',
      data: jobData,
    } as unknown as Job<ImageJobPayload>;

    await expect(processor.process(mockJob as any)).rejects.toThrow(
      'El archivo temporal no existe en disco',
    );
  });
});
