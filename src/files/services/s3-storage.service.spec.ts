import { NotFoundException } from '@nestjs/common';
import { S3StorageService } from './s3-storage.service';
import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

describe('S3StorageService', () => {
  let service: S3StorageService;
  let sendMock: jest.Mock;

  beforeEach(() => {
    sendMock = jest.fn();
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(sendMock);
    service = new S3StorageService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('uploadFile', () => {
    it('debe enviar PutObjectCommand y retornar la URL del archivo', async () => {
      sendMock.mockResolvedValue({});

      const url = await service.uploadFile(
        'my-bucket',
        'file.txt',
        Buffer.from('hello'),
        'text/plain',
      );

      expect(sendMock).toHaveBeenCalled();
      expect(url).toContain('file.txt');
    });
  });

  describe('deleteFile', () => {
    it('debe enviar DeleteObjectCommand sin errores', async () => {
      sendMock.mockResolvedValue({});

      await expect(
        service.deleteFile('my-bucket', 'file.txt'),
      ).resolves.not.toThrow();
      expect(sendMock).toHaveBeenCalled();
    });
  });

  describe('getFileStream', () => {
    it('debe lanzar NotFoundException si no existe el Body', async () => {
      sendMock.mockResolvedValue({ Body: null });

      await expect(
        service.getFileStream('my-bucket', 'missing.txt'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe retornar el stream y metadatos de tipo de contenido', async () => {
      const stream = Readable.from(['data']);
      sendMock.mockResolvedValue({
        Body: stream,
        ContentType: 'text/plain',
        ContentLength: 4,
      });

      const res = await service.getFileStream('my-bucket', 'exists.txt');
      expect(res.contentType).toBe('text/plain');
      expect(res.stream).toBe(stream);
    });
  });
});

