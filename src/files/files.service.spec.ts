import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FilesService } from './files.service';
import { S3StorageService } from './services/s3-storage.service';
import { VirusScanService } from './services/virus-scan.service';
import { ImageProcessingService } from './services/image-processing.service';

describe('FilesService', () => {
  let service: FilesService;
  let s3StorageMock: {
    uploadFile: jest.Mock;
    deleteFile: jest.Mock;
  };
  let virusScanMock: {
    scanBuffer: jest.Mock;
  };
  let imageProcessingMock: {
    processFile: jest.Mock;
  };

  const mockFile = {
    originalname: 'document.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 sample pdf content'),
    size: 28,
  } as Express.Multer.File;

  beforeEach(async () => {
    s3StorageMock = {
      uploadFile: jest.fn().mockResolvedValue('/api/files/view/file.pdf'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    virusScanMock = {
      scanBuffer: jest.fn().mockResolvedValue(undefined),
    };

    imageProcessingMock = {
      processFile: jest.fn().mockImplementation((buf, mime, name) =>
        Promise.resolve({
          buffer: buf,
          mimetype: mime,
          extension: '.pdf',
          originalName: name,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: S3StorageService, useValue: s3StorageMock },
        { provide: VirusScanService, useValue: virusScanMock },
        { provide: ImageProcessingService, useValue: imageProcessingMock },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  describe('uploadFile', () => {
    it('debe lanzar BadRequestException si el archivo no está presente', async () => {
      await expect(service.uploadFile({ file: null as any })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si el archivo excede los 5 MB', async () => {
      const hugeFile = {
        ...mockFile,
        buffer: Buffer.alloc(6 * 1024 * 1024),
      } as Express.Multer.File;

      await expect(service.uploadFile({ file: hugeFile })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe procesar, escanear y almacenar el archivo correctamente', async () => {
      const res = await service.uploadFile({ file: mockFile });

      expect(virusScanMock.scanBuffer).toHaveBeenCalledWith(mockFile.buffer);
      expect(imageProcessingMock.processFile).toHaveBeenCalled();
      expect(s3StorageMock.uploadFile).toHaveBeenCalled();
      expect(res.originalName).toBe('document.pdf');
    });
  });

  describe('executeWithRollback', () => {
    it('debe ejecutar rollback y eliminar el archivo subido si la operación de base de datos falla', async () => {
      const failingDbOp = jest.fn().mockRejectedValue(new Error('DB failure'));

      await expect(
        service.executeWithRollback({ file: mockFile }, failingDbOp),
      ).rejects.toThrow('DB failure');

      expect(s3StorageMock.deleteFile).toHaveBeenCalled();
    });
  });
});

