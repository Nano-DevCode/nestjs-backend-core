import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { PdfModule } from './pdf/pdf.module';
import { MailModule } from './mail/mail.module';
import { ExportsModule } from './exports/exports.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { LogsModule } from './logs/logs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    PrismaModule,
    RedisModule,
    FilesModule,
    NotificationsModule,
    TasksModule,
    PdfModule,
    MailModule,
    ExportsModule,
    WebhooksModule,
    LogsModule,
  ],
})
export class WorkerModule {}

