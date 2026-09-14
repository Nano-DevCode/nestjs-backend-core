import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PDF_QUEUE } from '../pdf/pdf.constants';
import { LOGS_QUEUE } from '../logs/logs.constants';

@Module({
  imports: [
    TerminusModule,
    PrismaModule,
    FilesModule,
    NotificationsModule,
    BullModule.registerQueue({ name: PDF_QUEUE }, { name: LOGS_QUEUE }),
  ],
  controllers: [HealthController, TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class HealthModule {}
