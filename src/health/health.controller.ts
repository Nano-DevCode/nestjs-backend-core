import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { S3StorageService } from '../files/services/s3-storage.service';
import { Public } from '../auth/decorators/auth.decorator';
import { DEFAULT_BUCKET } from '../files/files.constants';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealthIndicator: PrismaHealthIndicator,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly s3StorageService: S3StorageService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary:
      'Verifica el estado de salud de los servicios del sistema (PostgreSQL, Redis y S3 Storage)',
  })
  check() {
    return this.health.check([
      // 1. Verificación de Base de Datos PostgreSQL con PrismaHealthIndicator
      () => this.prismaHealthIndicator.pingCheck('database', this.prisma),

      // 2. Verificación de Conectividad con Redis
      () =>
        this.healthIndicatorService.check('redis').attempt(async () => {
          const pong: unknown = await this.redis.ping();
          if (pong !== 'PONG') {
            throw new Error('Respuesta de ping inesperada de Redis');
          }
        }),

      // 3. Verificación de Almacenamiento SeaweedFS / S3
      () =>
        this.healthIndicatorService.check('storage').attempt(async () => {
          await this.s3StorageService.ensureBucketExists(DEFAULT_BUCKET);
        }),
    ]);
  }
}
