import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { TwoFactorModule } from './two-factor/two-factor.module';
import { FilesModule } from './files/files.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { TasksModule } from './tasks/tasks.module';
import { FeatureFlagsModule } from './features/feature-flags.module';
import { WebsocketsModule } from './websockets/websockets.module';
import { MobileModule } from './mobile/mobile.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PdfModule } from './pdf/pdf.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { LogsModule } from './logs/logs.module';
import { DiscordBotModule } from './discord-bot/discord-bot.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 segundo
        limit: 20, // 20 req/segundo (ráfagas cortas)
      },
      {
        name: 'medium',
        ttl: 10000, // 10 segundos
        limit: 80, // 80 req/10s (actividad continua)
      },
      {
        name: 'long',
        ttl: 60000, // 60 segundos
        limit: 300, // 300 req/minuto (tope de protección)
      },
    ]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    MailModule,
    TwoFactorModule,
    FilesModule,
    AuditModule,
    HealthModule,
    TasksModule,
    FeatureFlagsModule,
    WebsocketsModule,
    MobileModule,
    NotificationsModule,
    PdfModule,
    ApiKeysModule,
    LogsModule,
    DiscordBotModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
  exports: [PrismaService],
})
export class AppModule {}
