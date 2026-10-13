export interface ImageDimensionsConfig {
  width?: number;
  height?: number;
  quality?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

/**
 * Contrato de Job para BullMQ (ImageJobPayload).
 * Pasa exclusivamente la ruta temporal del archivo en disco (`tempFilePath`)
 * para evitar almacenar pesados payloads binarios o base64 en la memoria RAM de Redis.
 */
export interface ImageJobPayload {
  userId: string;
  originalName: string;
  mimetype: string;
  tempFilePath: string; // Ruta temporal en disco (previene saturación de Redis)
  targetBucket?: string;
  dimensions?: {
    thumbnail?: ImageDimensionsConfig;
    standard?: ImageDimensionsConfig;
  };
  metadata?: Record<string, unknown>;
  fileBufferBase64?: string;
  tempStorageKey?: string;
}

// Alias para compatibilidad
export type ImageProcessingJobPayload = ImageJobPayload;

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
