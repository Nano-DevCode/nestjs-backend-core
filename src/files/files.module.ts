import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { VirusScanService } from './services/virus-scan.service';
import { ImageProcessingService } from './services/image-processing.service';
import { S3StorageService } from './services/s3-storage.service';
import { ImageProcessingProcessor } from './processors/image-processing.processor';
import { IMAGE_PROCESSING_QUEUE } from './files.constants';
import { PrismaModule } from '../prisma/prisma.module';
import { MobileFilesController } from './mobile-files.controller';
import { LogsModule } from '../logs/logs.module';
import { NotificationsModule } from '../notifications/notifications.module';

const isWorkerDisabled = process.env.DISABLE_WORKERS === 'true';

@Module({
  imports: [
    PrismaModule,
    LogsModule,
    forwardRef(() => NotificationsModule),
    BullModule.registerQueue({
      name: IMAGE_PROCESSING_QUEUE,
    }),
  ],
  controllers: [FilesController, MobileFilesController],
  providers: [
    FilesService,
    VirusScanService,
    ImageProcessingService,
    S3StorageService,
    ...(isWorkerDisabled ? [] : [ImageProcessingProcessor]),
  ],
  exports: [
    FilesService,
    VirusScanService,
    ImageProcessingService,
    S3StorageService,
    BullModule,
  ],
})
export class FilesModule {}
