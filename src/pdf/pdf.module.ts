import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PDF_QUEUE } from './pdf.constants';
import { PdfGeneratorService } from './services/pdf-generator.service';
import { PdfGeneratorProcessor } from './processors/pdf-generator.processor';
import { PdfController } from './controllers/pdf.controller';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PDF_QUEUE,
    }),
    FilesModule,
    NotificationsModule,
  ],
  controllers: [PdfController],
  providers: [PdfGeneratorService, PdfGeneratorProcessor],
  exports: [PdfGeneratorService, BullModule],
})
export class PdfModule {}
