import { BadRequestException } from '@nestjs/common';
import {
  detectFileTypeFromBuffer,
  validateFileMagicBytes,
  sanitizeSafeFilename,
} from './magic-bytes.util';

describe('magic-bytes.util', () => {
  describe('detectFileTypeFromBuffer', () => {
    it('should detect PNG files correctly', () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
      ]);
      const result = detectFileTypeFromBuffer(pngBuffer);
      expect(result).toEqual({ mime: 'image/png', ext: '.png' });
    });

    it('should detect JPEG files correctly', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
      const result = detectFileTypeFromBuffer(jpegBuffer);
      expect(result).toEqual({ mime: 'image/jpeg', ext: '.jpg' });
    });

    it('should detect PDF files correctly', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
      const result = detectFileTypeFromBuffer(pdfBuffer);
      expect(result).toEqual({ mime: 'application/pdf', ext: '.pdf' });
    });

    it('should return null for unrecognized buffers or text files', () => {
      const textBuffer = Buffer.from('console.log("hello world");');
      expect(detectFileTypeFromBuffer(textBuffer)).toBeNull();
    });
  });

  describe('validateFileMagicBytes', () => {
    it('should validate matching PNG buffer and MIME type', () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const result = validateFileMagicBytes(pngBuffer, 'image/png');
      expect(result.mime).toBe('image/png');
    });

    it('should throw BadRequestException on spoofed MIME type (text pretending to be PNG)', () => {
      const fakePngBuffer = Buffer.from('<?php echo "evil"; ?>');
      expect(() => validateFileMagicBytes(fakePngBuffer, 'image/png')).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException on MIME discrepancy (JPEG binary declared as PNG)', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(() => validateFileMagicBytes(jpegBuffer, 'image/png')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('sanitizeSafeFilename', () => {
    it('should remove path traversal patterns (../ and ..\\)', () => {
      const dangerous = '../../../etc/passwd.png';
      const sanitized = sanitizeSafeFilename(dangerous, '.png');
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('/');
      expect(sanitized).toBe('passwd.png');
    });

    it('should sanitize special characters and accents', () => {
      const name = 'Mi Foto de Vacaciones (2026)!.jpeg';
      const sanitized = sanitizeSafeFilename(name, '.jpeg');
      expect(sanitized).toBe('Mi_Foto_de_Vacaciones_2026.jpeg');
    });
  });
});
