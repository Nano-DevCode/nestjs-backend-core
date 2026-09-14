import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { VirusScanService } from './services/virus-scan.service';
import { ImageProcessingService } from './services/image-processing.service';
import { S3StorageService } from './services/s3-storage.service';

import { PrismaModule } from '../prisma/prisma.module';
import { MobileFilesController } from './mobile-files.controller';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [PrismaModule, LogsModule],
  controllers: [FilesController, MobileFilesController],
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
