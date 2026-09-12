jest.mock('@nestjs/terminus', () => ({
  HealthCheck: () => () => {},
  HealthCheckService: class {},
  HealthIndicatorService: class {},
}));
jest.mock('@nestjs/throttler', () => ({
  SkipThrottle: () => () => {},
}));
jest.mock('@nestjs/swagger', () => ({
  ApiTags: () => () => {},
  ApiOperation: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { S3StorageService } from '../files/services/s3-storage.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: { check: jest.Mock };
  let healthIndicatorService: { check: jest.Mock };
  let prismaMock: {
    hasReplica: boolean;
    pool: { totalCount: number; idleCount: number; waitingCount: number };
    replicaPool?: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
    $queryRawUnsafe: jest.Mock;
    readOnly: { $queryRawUnsafe: jest.Mock };
  };
  let redisMock: { ping: jest.Mock };
  let s3Mock: { ensureBucketExists: jest.Mock };

  beforeEach(async () => {
    healthCheckService = {
      check: jest
        .fn()
        .mockImplementation(async (indicators: (() => Promise<unknown>)[]) => {
          const results: Record<string, unknown> = {};
          for (const fn of indicators) {
            const res = await fn();
            Object.assign(results, res);
          }
          return {
            status: 'ok',
            info: results,
            error: {},
            details: results,
          };
        }),
    };

    healthIndicatorService = {
      check: jest.fn().mockImplementation((key: string) => ({
        attempt: jest
          .fn()
          .mockImplementation(
            async (fn: () => Promise<Record<string, unknown>>) => {
              const customData = await fn();
              return { [key]: { status: 'up', ...customData } };
            },
          ),
      })),
    };

    prismaMock = {
      hasReplica: false,
      pool: {
        totalCount: 10,
        idleCount: 8,
        waitingCount: 0,
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      readOnly: {
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ in_recovery: true }]),
      },
    };

    redisMock = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    s3Mock = {
      ensureBucketExists: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: HealthIndicatorService, useValue: healthIndicatorService },
        { provide: PrismaService, useValue: prismaMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
        { provide: S3StorageService, useValue: s3Mock },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('when read replica is disabled (hasReplica = false)', () => {
    it('should return status ok, pool metrics and mark replica as disabled without failing', async () => {
      const result = await controller.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.uptime).toBe('number');
      expect(result.info.memory).toBeDefined();
      expect(typeof result.info.memory.heapUsedMB).toBe('number');
      expect(typeof result.info.memory.rssMB).toBe('number');

      // Base de datos primaria
      expect(healthIndicatorService.check).toHaveBeenCalledWith(
        'database_primary',
      );
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
      expect(result.info.database_primary).toEqual(
        expect.objectContaining({
          status: 'up',
          totalConnections: 10,
          idleConnections: 8,
          activeConnections: 2,
          waitingRequests: 0,
        }),
      );

      // Réplica deshabilitada
      expect(result.info.database_replica).toEqual(
        expect.objectContaining({
          status: 'disabled',
        }),
      );

      // Redis y Storage
      expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
      expect(redisMock.ping).toHaveBeenCalled();
      expect(healthIndicatorService.check).toHaveBeenCalledWith('storage');
    });
  });

  describe('when read replica is enabled (hasReplica = true)', () => {
    it('should ping read replica and report status up with replica pool metrics', async () => {
      prismaMock.hasReplica = true;
      prismaMock.replicaPool = {
        totalCount: 5,
        idleCount: 4,
        waitingCount: 0,
      };

      const result = await controller.check();

      expect(healthIndicatorService.check).toHaveBeenCalledWith(
        'database_replica',
      );
      expect(prismaMock.readOnly.$queryRawUnsafe).toHaveBeenCalledWith(
        'SELECT pg_is_in_recovery() AS in_recovery',
      );
      expect(result.info.database_replica).toEqual(
        expect.objectContaining({
          status: 'up',
          isInRecovery: true,
          isSynchronized: true,
          totalConnections: 5,
          idleConnections: 4,
          activeConnections: 1,
          waitingRequests: 0,
        }),
      );
    });
  });

  describe('when a critical service fails', () => {
    it('should propagate ServiceUnavailableException with enriched status error', async () => {
      healthCheckService.check.mockRejectedValueOnce(
        new ServiceUnavailableException({
          status: 'error',
          info: { database_primary: { status: 'down' } },
          error: {
            database_primary: { status: 'down', message: 'Connection lost' },
          },
          details: { database_primary: { status: 'down' } },
        }),
      );

      await expect(controller.check()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
