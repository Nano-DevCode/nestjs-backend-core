import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';
import { MAIL_QUEUE } from './mail.constants';

const isWorkerDisabled = process.env.DISABLE_WORKERS === 'true';

@Module({
  imports: [
    BullModule.registerQueue({
      name: MAIL_QUEUE,
    }),
  ],
  providers: [MailService, ...(isWorkerDisabled ? [] : [MailProcessor])],
  exports: [MailService, BullModule],
})
export class MailModule {}
