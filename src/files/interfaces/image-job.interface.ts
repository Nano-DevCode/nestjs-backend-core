export interface ImageDimensionsConfig {
  width?: number;
  height?: number;
  quality?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface ImageProcessingJobPayload {
  userId: string;
  originalName: string;
  mimetype: string;
  /**
   * Buffer codificado en base64 para transferencia serializada en Redis,
   * o clave temporal en S3 si el archivo original fue almacenado preliminarmente.
   */
  fileBufferBase64?: string;
  tempStorageKey?: string;
  targetBucket?: string;
  dimensions?: {
    thumbnail?: ImageDimensionsConfig;
    standard?: ImageDimensionsConfig;
  };
  metadata?: Record<string, unknown>;
}

export interface ImageVariantResult {
  key: string;
  bucket: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: 'webp';
}

export interface ImageProcessingResult {
  jobId: string;
  originalName: string;
  originalSizeBytes: number;
  userId: string;
  variants: {
    thumbnail: ImageVariantResult;
    standard: ImageVariantResult;
  };
  compressionRatioPercent: number;
  processedAt: string;
}

