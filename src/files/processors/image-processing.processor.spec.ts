import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import sharp from 'sharp';
import { ImageProcessingProcessor } from './image-processing.processor';
import { S3StorageService } from '../services/s3-storage.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { ImageProcessingJobPayload } from '../interfaces/image-job.interface';

describe('ImageProcessingProcessor', () => {
  let processor: ImageProcessingProcessor;
  let s3StorageMock: {
    uploadFile: jest.Mock;
    deleteFile: jest.Mock;
    getFileBuffer: jest.Mock;
  };
  let notificationsMock: {
    createNotification: jest.Mock;
  };

  // Generar un buffer PNG válido real de prueba usando Sharp (100x100)
  let samplePngBuffer: Buffer;

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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageProcessingProcessor,
        { provide: S3StorageService, useValue: s3StorageMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    processor = module.get<ImageProcessingProcessor>(ImageProcessingProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process image from base64, generate thumbnail and standard webp, upload to S3, and notify user', async () => {
    const jobData: ImageProcessingJobPayload = {
      userId: 'user-456',
      originalName: 'test-photo.png',
      mimetype: 'image/png',
      fileBufferBase64: samplePngBuffer.toString('base64'),
      targetBucket: 'my-bucket',
    };

    const mockJob = {
      id: 'job-101',
      data: jobData,
    } as unknown as Job<ImageProcessingJobPayload>;

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
    expect(s3StorageMock.uploadFile).toHaveBeenCalledWith(
      'my-bucket',
      expect.stringContaining('job-101_thumb.webp'),
      expect.any(Buffer),
      'image/webp',
    );
    expect(s3StorageMock.uploadFile).toHaveBeenCalledWith(
      'my-bucket',
      expect.stringContaining('job-101_standard.webp'),
      expect.any(Buffer),
      'image/webp',
    );

    // Notificación en tiempo real emitida
    expect(notificationsMock.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-456',
        title: 'Imagen procesada y optimizada',
        type: 'IMAGE_PROCESSED',
        data: expect.objectContaining({
          jobId: 'job-101',
        }),
      }),
    );
  });

  it('should process image from tempStorageKey, delete temp file after processing, and notify', async () => {
    const jobData: ImageProcessingJobPayload = {
      userId: 'user-789',
      originalName: 'temp-photo.jpg',
      mimetype: 'image/jpeg',
      tempStorageKey: 'temp/uploads/raw-image.jpg',
      targetBucket: 'sistema-files',
    };

    const mockJob = {
      id: 'job-202',
      data: jobData,
    } as unknown as Job<ImageProcessingJobPayload>;

    const result = await processor.process(mockJob as any);

    expect(result.jobId).toBe('job-202');
    expect(s3StorageMock.getFileBuffer).toHaveBeenCalledWith(
      'sistema-files',
      'temp/uploads/raw-image.jpg',
    );
    expect(s3StorageMock.deleteFile).toHaveBeenCalledWith(
      'sistema-files',
      'temp/uploads/raw-image.jpg',
    );
    expect(notificationsMock.createNotification).toHaveBeenCalled();
  });

  it('should throw an error if job contains neither buffer nor temp key', async () => {
    const jobData: ImageProcessingJobPayload = {
      userId: 'user-000',
      originalName: 'corrupt.jpg',
      mimetype: 'image/jpeg',
    };

    const mockJob = {
      id: 'job-err',
      data: jobData,
    } as unknown as Job<ImageProcessingJobPayload>;

    await expect(processor.process(mockJob as any)).rejects.toThrow(
      'El trabajo no contiene fileBufferBase64 ni tempStorageKey',
    );
  });
});

