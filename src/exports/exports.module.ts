import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EXPORTS_QUEUE } from './exports.constants';
import { ExportsService } from './exports.service';
import { ExportsProcessor } from './processors/exports.processor';
import { ExportsController } from './exports.controller';
import { RedisModule } from '../redis/redis.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

const isWorkerDisabled = process.env.DISABLE_WORKERS === 'true';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    RedisModule,
    FilesModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: EXPORTS_QUEUE,
    }),
  ],
  controllers: [ExportsController],
  providers: [ExportsService, ...(isWorkerDisabled ? [] : [ExportsProcessor])],
  exports: [ExportsService, BullModule],
})
export class ExportsModule {}

