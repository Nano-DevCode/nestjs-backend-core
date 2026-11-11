import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

import { IMAGE_PROCESSING_QUEUE } from './files/files.constants';
import { S3StorageService } from './files/services/s3-storage.service';
import { VirusScanService } from './files/services/virus-scan.service';
import { ImageProcessingService } from './files/services/image-processing.service';
import { FilesService } from './files/files.service';
import { ImageProcessingProcessor } from './files/processors/image-processing.processor';

import { NotificationsService } from './notifications/notifications.service';

import { PDF_QUEUE } from './pdf/pdf.constants';
import { PdfGeneratorService } from './pdf/services/pdf-generator.service';
import { PdfGeneratorProcessor } from './pdf/processors/pdf-generator.processor';

import { MAIL_QUEUE } from './mail/mail.constants';
import { MailService } from './mail/mail.service';
import { MailProcessor } from './mail/mail.processor';

import { EXPORTS_QUEUE } from './exports/exports.constants';
import { ExportsService } from './exports/exports.service';
import { ExportsProcessor } from './exports/processors/exports.processor';

import { WEBHOOKS_QUEUE } from './webhooks/webhooks.constants';
import { WebhooksService } from './webhooks/webhooks.service';
import { WebhooksProcessor } from './webhooks/processors/webhooks.processor';

import { LOGS_QUEUE } from './logs/logs.constants';
import { LogsService } from './logs/logs.service';
import { LogsProcessor } from './logs/processors/logs.processor';

import { TasksService } from './tasks/tasks.service';

/**
 * WorkerModule (Contexto de Ejecución Puro de Background Workers)
 *
 * Totalmente desacoplado de la capa HTTP, Controladores REST, WebSockets Gateways,
 * Guards (JwtAuthGuard, GoogleOAuthGuard, FacebookOAuthGuard, RolesGuard) y
 * Estrategias de Passport. Únicamente registra infraestructura de datos (Prisma/Redis),
 * colas BullMQ, servicios de dominio puros y procesadores en segundo plano.
 */
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    BullModule.registerQueue(
      {
        name: IMAGE_PROCESSING_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      },
      { name: PDF_QUEUE },
      { name: MAIL_QUEUE },
      { name: EXPORTS_QUEUE },
      { name: WEBHOOKS_QUEUE },
      { name: LOGS_QUEUE },
    ),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
  ],
  providers: [
    // Archivos y Almacenamiento
    S3StorageService,
    VirusScanService,
    ImageProcessingService,
    FilesService,
    ImageProcessingProcessor,

    // Notificaciones (persistencia en BD sin WebSocket Gateway HTTP)
    NotificationsService,

    // Generación de PDFs
    PdfGeneratorService,
    PdfGeneratorProcessor,

    // Correo Electrónico
    MailService,
    MailProcessor,

    // Exportación de Reportes (CSV/Excel/PDF)
    ExportsService,
    ExportsProcessor,

    // Webhooks Salientes
    WebhooksService,
    WebhooksProcessor,

    // Auditoría e Ingestión de Logs
    LogsService,
    LogsProcessor,

    // Tareas Programadas (Cron Jobs de mantenimiento)
    TasksService,
  ],
})
export class WorkerModule {}

