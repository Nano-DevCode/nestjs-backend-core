import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { WEBHOOKS_QUEUE } from './webhooks.constants';
import { WebhooksService } from './webhooks.service';
import { WebhooksProcessor } from './processors/webhooks.processor';
import { WebhooksController } from './webhooks.controller';

const isWorkerDisabled = process.env.DISABLE_WORKERS === 'true';

@Module({
  imports: [
    RedisModule,
    AuthModule,
    BullModule.registerQueue({
      name: WEBHOOKS_QUEUE,
    }),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, ...(isWorkerDisabled ? [] : [WebhooksProcessor])],
  exports: [WebhooksService, BullModule],
})
export class WebhooksModule {}

