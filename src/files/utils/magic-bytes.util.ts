import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface DetectedFileType {
  mime: string;
  ext: string;
}

/**
 * Inspecciona los primeros bytes del buffer (Magic Numbers / Firmas binarias)
 * para identificar el tipo real de archivo y prevenir MIME-type spoofing.
 */
export function detectFileTypeFromBuffer(
  buffer: Buffer,
): DetectedFileType | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: '.png' };
  }

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }

  // GIF: 47 49 46 38 ('GIF8')
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return { mime: 'image/gif', ext: '.gif' };
  }

  // WebP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { mime: 'application/pdf', ext: '.pdf' };
  }

  return null;
}

/**
 * Valida que el archivo coincida con su firma binaria declarada y rechaza
 * archivos con extensiones o MIME types falseados.
 */
export function validateFileMagicBytes(
  buffer: Buffer,
  declaredMimetype: string,
): DetectedFileType {
  const detected = detectFileTypeFromBuffer(buffer);

  if (!detected) {
    throw new BadRequestException(
      'Formato de archivo no soportado o firma binaria (Magic Bytes) irreconocible.',
    );
  }

  const normalizedDeclared = declaredMimetype.toLowerCase();

  // Equivalencias de JPEG / JPG
  const isJpegMatch =
    detected.mime === 'image/jpeg' &&
    (normalizedDeclared === 'image/jpeg' || normalizedDeclared === 'image/jpg');

  if (detected.mime !== normalizedDeclared && !isJpegMatch) {
    throw new BadRequestException(
      `Discrepancia de seguridad: El archivo declarado como '${declaredMimetype}' contiene firma binaria de '${detected.mime}'.`,
    );
  }

  return detected;
}

/**
 * Sanitiza nombres de archivo para neutralizar ataques de Path Traversal
 * y caracteres maliciosos de sistema de archivos.
 */
export function sanitizeSafeFilename(
  name: string,
  fallbackExt = '.bin',
): string {
  const rawExt = path.extname(name).toLowerCase();
  const ext = rawExt || fallbackExt;
  // path.basename remueve directorios ../ o ..\
  const base = path.basename(name, rawExt);
  const sanitizedBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const finalBase = sanitizedBase || uuidv4();
  return `${finalBase}${ext}`;
}
