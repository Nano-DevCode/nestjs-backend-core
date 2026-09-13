import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MobileFilesController } from './mobile-files.controller';
import { S3StorageService } from './services/s3-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';

describe('MobileFilesController', () => {
  let controller: MobileFilesController;
  let s3StorageService: {
    generatePresignedUploadUrl: jest.Mock;
    objectExists: jest.Mock;
  };
  let prisma: {
    storedFile: {
      upsert: jest.Mock;
    };
  };

  const mockUser: UserAuthContext = {
    id: 'user-id-456',
    email: 'mobile.user@example.com',
    roles: ['user'],
    permissions: ['files.upload'],
    isTwoFactorEnabled: false,
  };

  beforeEach(async () => {
    s3StorageService = {
      generatePresignedUploadUrl: jest.fn().mockResolvedValue({
        uploadUrl: 'http://localhost:8333/sistema-files/uuid-photo.jpg?sig=123',
        key: 'uuid-photo.jpg',
        bucket: 'sistema-files',
        expiresIn: 600,
        method: 'PUT',
      }),
      objectExists: jest.fn().mockResolvedValue(true),
    };

    prisma = {
      storedFile: {
        upsert: jest.fn().mockResolvedValue({
          id: 'file-123',
          key: 'uuid-photo.jpg',
          bucket: 'sistema-files',
          originalName: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          scanStatus: 'PENDING',
          uploadedBy: 'user-id-456',
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileFilesController],
      providers: [
        {
          provide: S3StorageService,
          useValue: s3StorageService,
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    controller = module.get<MobileFilesController>(MobileFilesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createPresignedUrl', () => {
    it('should generate presigned upload url successfully', async () => {
      const dto = {
        filename: 'avatar.jpg',
        contentType: 'image/jpeg',
        fileSize: 2048,
      };

      const result = await controller.createPresignedUrl(dto);

      expect(s3StorageService.generatePresignedUploadUrl).toHaveBeenCalled();
      expect(result).toHaveProperty('uploadUrl');
      expect(result).toHaveProperty('fileKey');
      expect(result.method).toBe('PUT');
      expect(result.headers['Content-Type']).toBe('image/jpeg');
    });
  });

  describe('confirmUpload', () => {
    it('should confirm and persist file metadata when object exists in storage', async () => {
      const dto = {
        fileKey: 'uuid-photo.jpg',
        originalName: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      };

      const result = await controller.confirmUpload(mockUser, dto);

      expect(s3StorageService.objectExists).toHaveBeenCalledWith(
        'sistema-files',
        dto.fileKey,
      );
      expect(prisma.storedFile.upsert).toHaveBeenCalled();
      expect(result.status).toBe('confirmed');
      expect(result.file.id).toBe('file-123');
    });

    it('should throw BadRequestException if object does not exist in storage', async () => {
      s3StorageService.objectExists.mockResolvedValue(false);

      const dto = {
        fileKey: 'non-existent-key.jpg',
        originalName: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      };

      await expect(controller.confirmUpload(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
