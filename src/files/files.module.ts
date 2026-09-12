import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { VirusScanService } from './services/virus-scan.service';
import { ImageProcessingService } from './services/image-processing.service';
import { S3StorageService } from './services/s3-storage.service';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    VirusScanService,
    ImageProcessingService,
    S3StorageService,
  ],
  exports: [
    FilesService,
    VirusScanService,
    ImageProcessingService,
    S3StorageService,
  ],
})
export class FilesModule {}
