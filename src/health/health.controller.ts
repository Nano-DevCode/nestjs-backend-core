import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '../common/scalar/scalar.decorators';
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
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly s3StorageService: S3StorageService,
  ) {}

  @Get()
  @Public()
  @SkipThrottle()
  @HealthCheck()
  @ApiOperation({
    summary:
      'Verifica el estado detallado del sistema (PostgreSQL primario, réplica, Redis, almacenamiento y métricas)',
  })
  async check() {
    const memUsage = process.memoryUsage();
    const memoryMetrics = {
      heapUsedMB: Math.round(memUsage.heapUsed / (1024 * 1024)),
      rssMB: Math.round(memUsage.rss / (1024 * 1024)),
    };

    const replicaDisabledStatus = {
      status: 'disabled',
      message: 'Read replica no configurada (DATABASE_REPLICA_URL no definida)',
    };

    try {
      const result = await this.health.check([
        // 1. Base de datos primaria con métricas de connection pool
        () =>
          this.healthIndicatorService
            .check('database_primary')
            .attempt(async () => {
              await this.prisma.$queryRawUnsafe('SELECT 1');
              return {
                ...(this.prisma.pool
                  ? {
                      totalConnections: this.prisma.pool.totalCount,
                      idleConnections: this.prisma.pool.idleCount,
                      activeConnections:
                        this.prisma.pool.totalCount -
                        this.prisma.pool.idleCount,
                      waitingRequests: this.prisma.pool.waitingCount,
                    }
                  : {}),
              };
            }),

        // 2. Base de datos réplica de lectura (Dinámico / Condicional)
        ...(this.prisma.hasReplica
          ? [
              () =>
                this.healthIndicatorService
                  .check('database_replica')
                  .attempt(async () => {
                    const recoveryResult =
                      await this.prisma.readOnly.$queryRawUnsafe<
                        Array<{ in_recovery: boolean }>
                      >('SELECT pg_is_in_recovery() AS in_recovery');
                    const isInRecovery = Boolean(
                      recoveryResult[0]?.in_recovery,
                    );

                    return {
                      isInRecovery,
                      isSynchronized: isInRecovery,
                      ...(this.prisma.replicaPool
                        ? {
                            totalConnections:
                              this.prisma.replicaPool.totalCount,
                            idleConnections: this.prisma.replicaPool.idleCount,
                            activeConnections:
                              this.prisma.replicaPool.totalCount -
                              this.prisma.replicaPool.idleCount,
                            waitingRequests:
                              this.prisma.replicaPool.waitingCount,
                          }
                        : {}),
                    };
                  }),
            ]
          : []),

        // 3. Conectividad Redis (PING/PONG)
        () =>
          this.healthIndicatorService.check('redis').attempt(async () => {
            const pong: unknown = await this.redis.ping();
            if (pong !== 'PONG') {
              throw new Error('Respuesta inesperada de ping en Redis');
            }
          }),

        // 4. Almacenamiento Compatible S3 (SeaweedFS / S3)
        () =>
          this.healthIndicatorService.check('storage').attempt(async () => {
            await this.s3StorageService.ensureBucketExists(DEFAULT_BUCKET);
          }),
      ]);

      const replicaStatus = this.prisma.hasReplica
        ? (result.info?.['database_replica'] ?? { status: 'up' })
        : replicaDisabledStatus;

      return {
        status: result.status,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        info: {
          ...result.info,
          database_replica: replicaStatus,
          memory: memoryMetrics,
        },
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        const response = error.getResponse() as Record<string, unknown>;
        const replicaStatus = this.prisma.hasReplica
          ? ((response['info'] as Record<string, unknown>)?.[
              'database_replica'
            ] ?? { status: 'down' })
          : replicaDisabledStatus;

        throw new ServiceUnavailableException({
          status: response['status'] || 'error',
          timestamp: new Date().toISOString(),
          uptime: Math.floor(process.uptime()),
          info: {
            ...((response['info'] as Record<string, unknown>) || {}),
            database_replica: replicaStatus,
            memory: memoryMetrics,
          },
          error: response['error'],
          details: response['details'],
        });
      }
      throw error;
    }
  }

  @Get('metrics')
  @Public()
  @SkipThrottle()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary:
      'Exporta métricas operativas del sistema en formato estándar Prometheus / OpenMetrics',
  })
  async getPrometheusMetrics(): Promise<string> {
    const memUsage = process.memoryUsage();
    const uptime = Math.floor(process.uptime());

    let redisUp = 0;
    try {
      const pong: unknown = await this.redis.ping();
      if (pong === 'PONG') redisUp = 1;
    } catch {
      redisUp = 0;
    }

    const lines = [
      '# HELP process_uptime_seconds Tiempo transcurrido del proceso en segundos',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime}`,
      '# HELP process_heap_bytes Memoria Heap de Node.js en bytes',
      '# TYPE process_heap_bytes gauge',
      `process_heap_bytes ${memUsage.heapUsed}`,
      '# HELP process_rss_bytes Memoria Residente RSS en bytes',
      '# TYPE process_rss_bytes gauge',
      `process_rss_bytes ${memUsage.rss}`,
      '# HELP redis_up Estado de conectividad con Redis (1=up, 0=down)',
      '# TYPE redis_up gauge',
      `redis_up ${redisUp}`,
    ];

    if (this.prisma.pool) {
      lines.push(
        '# HELP db_pool_connections Conexiones a PostgreSQL primaria',
        '# TYPE db_pool_connections gauge',
        `db_pool_connections{state="total"} ${this.prisma.pool.totalCount}`,
        `db_pool_connections{state="idle"} ${this.prisma.pool.idleCount}`,
        `db_pool_connections{state="active"} ${this.prisma.pool.totalCount - this.prisma.pool.idleCount}`,
        `db_pool_connections{state="waiting"} ${this.prisma.pool.waitingCount}`,
      );
    }

    return lines.join('\n') + '\n';
  }
}

