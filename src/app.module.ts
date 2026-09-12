import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 60 segundos
        limit: 60, // Máximo 60 peticiones por minuto por IP de forma global
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [PrismaService],
})
export class AppModule {}
