export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const SUPPORTED_IMAGE_MIMETYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
];

export const DEFAULT_BUCKET = process.env['S3_BUCKET'] || 'sistema-files';

export const IMAGE_PROCESSING_QUEUE = 'image-processing-queue';
