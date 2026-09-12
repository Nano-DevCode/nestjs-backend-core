jest.mock('@nestjs/terminus', () => ({
  HealthCheck: () => () => {},
  HealthCheckService: class {},
  HealthIndicatorService: class {},
  PrismaHealthIndicator: class {},
}));
jest.mock('@nestjs/swagger', () => ({
  ApiTags: () => () => {},
  ApiOperation: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  HealthIndicatorService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { S3StorageService } from '../files/services/s3-storage.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: { check: jest.Mock };
  let prismaHealthIndicator: { pingCheck: jest.Mock };
  let healthIndicatorService: { check: jest.Mock };

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn().mockImplementation((indicators: (() => unknown)[]) => {
        return Promise.all(indicators.map((fn) => fn()));
      }),
    };

    prismaHealthIndicator = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    healthIndicatorService = {
      check: jest.fn().mockReturnValue({
        attempt: jest
          .fn()
          .mockImplementation(async (fn: () => Promise<void>) => {
            await fn();
            return { status: 'up' };
          }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PrismaHealthIndicator, useValue: prismaHealthIndicator },
        { provide: HealthIndicatorService, useValue: healthIndicatorService },
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) },
        },
        {
          provide: REDIS_CLIENT,
          useValue: { ping: jest.fn().mockResolvedValue('PONG') },
        },
        {
          provide: S3StorageService,
          useValue: {
            ensureBucketExists: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should execute health check indicators for database, redis and storage', async () => {
    await controller.check();

    expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    expect(prismaHealthIndicator.pingCheck).toHaveBeenCalledWith(
      'database',
      expect.anything(),
    );
    expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
    expect(healthIndicatorService.check).toHaveBeenCalledWith('storage');
  });
});
