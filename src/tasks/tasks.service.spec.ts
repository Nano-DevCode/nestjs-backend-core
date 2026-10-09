jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => {},
  CronExpression: {
    EVERY_DAY_AT_MIDNIGHT: '0 0 * * *',
    EVERY_WEEK: '0 0 * * 0',
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { AlertsService } from '../alerts/alerts.service';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: {
    auditLog: {
      deleteMany: jest.Mock;
    };
    pool?: {
      waitingCount: number;
    };
  };
  let filesService: Partial<FilesService>;
  let alertsService: {
    sendAlert: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        deleteMany: jest.fn().mockResolvedValue({ count: 42 }),
      },
    };

    filesService = {};
    alertsService = {
      sendAlert: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: FilesService, useValue: filesService },
        { provide: AlertsService, useValue: alertsService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('purgeOrphanFiles should run without error', async () => {
    const res = await service.purgeOrphanFiles();
    expect(res).toBeDefined();
    expect(res.purgedCount).toBe(0);
  });

  it('purgeOldAuditLogs should delete records older than 90 days', async () => {
    const res = await service.purgeOldAuditLogs();

    expect(res).toEqual({ deletedCount: 42 });
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: expect.any(Date),
        },
      },
    });
  });

  it('monitorSystemHealthAndAlert should return health status', () => {
    const res = service.monitorSystemHealthAndAlert();
    expect(res).toBeDefined();
    expect(typeof res.isHealthy).toBe('boolean');
    expect(Array.isArray(res.alerts)).toBe(true);
  });

  it('monitorSystemHealthAndAlert should alert when pool is saturated', () => {
    prisma.pool = { waitingCount: 15 };

    const res = service.monitorSystemHealthAndAlert();
    expect(res.isHealthy).toBe(false);
    expect(res.alerts.length).toBeGreaterThan(0);
    expect(alertsService.sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Connection Pool'),
        severity: 'critical',
      }),
    );
  });

  it('verifyBackupIntegrity should return verified status', async () => {
    const res = await service.verifyBackupIntegrity();
    expect(res).toEqual({ status: 'verified' });
  });
});
