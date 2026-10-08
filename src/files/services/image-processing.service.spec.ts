import { ImageProcessingService } from './image-processing.service';

describe('ImageProcessingService', () => {
  let service: ImageProcessingService;

  beforeEach(() => {
    service = new ImageProcessingService();
  });

  describe('processFile', () => {
    it('debe mantener intacto un archivo no correspondiente a imagen (ej. PDF)', async () => {
      const buffer = Buffer.from('%PDF-1.4 test file content');
      const result = await service.processFile(
        buffer,
        'application/pdf',
        'document.pdf',
      );

      expect(result.mimetype).toBe('application/pdf');
      expect(result.extension).toBe('.pdf');
      expect(result.originalName).toBe('document.pdf');
      expect(result.buffer).toBe(buffer);
    });

    it('debe convertir una imagen válida a formato WebP', async () => {
      // 1x1 transparent PNG pixel
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      );

      const result = await service.processFile(
        pngBuffer,
        'image/png',
        'avatar.png',
      );

      expect(result.mimetype).toBe('image/webp');
      expect(result.extension).toBe('.webp');
      expect(result.originalName).toBe('avatar.webp');
      expect(result.buffer).toBeDefined();
    });

    it('debe mantener el buffer original si el archivo de imagen está corrupto', async () => {
      const corruptedImage = Buffer.from('not-a-real-png-or-jpeg');
      const result = await service.processFile(
        corruptedImage,
        'image/png',
        'broken.png',
      );

      expect(result.originalName).toBe('broken.png');
      expect(result.mimetype).toBe('image/png');
    });
  });
});

