import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { LOGS_QUEUE } from './logs.constants';
import { LogsService } from './logs.service';
import { LogsProcessor } from './processors/logs.processor';
import { LogsController } from './logs.controller';

const isWorkerDisabled = process.env.DISABLE_WORKERS === 'true';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({
      name: LOGS_QUEUE,
    }),
  ],
  controllers: [LogsController],
  providers: [LogsService, ...(isWorkerDisabled ? [] : [LogsProcessor])],
  exports: [LogsService, BullModule],
})
export class LogsModule {}
