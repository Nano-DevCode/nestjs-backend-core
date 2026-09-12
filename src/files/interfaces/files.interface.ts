import 'multer';

export interface UploadFileParams {
  file: Express.Multer.File;
  customName?: string;
  bucket?: string;
}

export interface UploadResult {
  key: string;
  bucket: string;
  url: string;
  size: number;
  mimetype: string;
  originalName: string;
  filename: string;
}

export interface ProcessedFile {
  buffer: Buffer;
  mimetype: string;
  extension: string;
  originalName: string;
}
