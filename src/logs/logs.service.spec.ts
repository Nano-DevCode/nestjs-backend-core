import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { LogsService } from './logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { LOGS_QUEUE, LOG_JOB_NAMES } from './logs.constants';
import { LogSource, LogLevel } from '../../prisma/generated/prisma/client';

describe('LogsService', () => {
  let service: LogsService;
  let prisma: {
    systemLog: {
      findMany: jest.Mock;
      count: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let queue: {
    add: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      systemLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 15 }),
      },
    };

    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-xyz' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(LOGS_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get<LogsService>(LogsService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('enqueue & flush', () => {
    it('debe acumular logs en memoria y sanitizar contraseñas antes de encolar', async () => {
      service.enqueue({
        source: LogSource.BACKEND,
        level: LogLevel.ERROR,
        context: 'AuthService',
        message: 'Intento de login fallido',
        metadata: { password: 'clearPassword', ip: '127.0.0.1' },
      });

      // Ejecutar vaciado manual
      await service.flush();

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        LOG_JOB_NAMES.BATCH_INSERT,
        expect.objectContaining({
          logs: [
            expect.objectContaining({
              source: LogSource.BACKEND,
              metadata: {
                password: '***REDACTED***',
                ip: '127.0.0.1',
              },
            }),
          ],
        }),
        expect.any(Object),
      );
    });

    it('enqueueClientLog debe asignar source: FRONTEND', async () => {
      service.enqueueClientLog(
        {
          level: LogLevel.WARN,
          context: 'ReactUI',
          message: 'Componente lento',
        },
        'user-1',
      );

      await service.flush();

      expect(queue.add).toHaveBeenCalledWith(
        LOG_JOB_NAMES.BATCH_INSERT,
        expect.objectContaining({
          logs: [
            expect.objectContaining({
              source: LogSource.FRONTEND,
              level: LogLevel.WARN,
              context: 'ReactUI',
              userId: 'user-1',
            }),
          ],
        }),
        expect.any(Object),
      );
    });

    it('enqueueBackendLog debe asignar source: BACKEND', async () => {
      service.enqueueBackendLog({
        level: LogLevel.FATAL,
        context: 'GlobalExceptionFilter',
        message: 'Crash en el proceso',
      });

      await service.flush();

      expect(queue.add).toHaveBeenCalledWith(
        LOG_JOB_NAMES.BATCH_INSERT,
        expect.objectContaining({
          logs: [
            expect.objectContaining({
              source: LogSource.BACKEND,
              level: LogLevel.FATAL,
              context: 'GlobalExceptionFilter',
            }),
          ],
        }),
        expect.any(Object),
      );
    });
  });

  describe('getLogs', () => {
    it('debe consultar con filtros y paginación en PostgreSQL', async () => {
      prisma.systemLog.findMany.mockResolvedValue([
        { id: '1', message: 'Test log' },
      ]);
      prisma.systemLog.count.mockResolvedValue(1);

      const result = await service.getLogs({
        page: 2,
        limit: 10,
        source: LogSource.BACKEND,
        level: LogLevel.ERROR,
        search: 'crash',
      });

      expect(prisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          where: expect.objectContaining({
            source: LogSource.BACKEND,
            level: LogLevel.ERROR,
          }),
        }),
      );
      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('getStats', () => {
    it('debe calcular métricas de errores y distribución de las últimas 24 horas', async () => {
      prisma.systemLog.findMany.mockResolvedValue([
        { source: LogSource.BACKEND, level: LogLevel.ERROR, context: 'Auth' },
        { source: LogSource.BACKEND, level: LogLevel.ERROR, context: 'Auth' },
        { source: LogSource.FRONTEND, level: LogLevel.FATAL, context: 'UI' },
        { source: LogSource.FRONTEND, level: LogLevel.INFO, context: 'Nav' },
      ]);

      const stats = await service.getStats();

      expect(stats.totalErrors24h).toBe(3); // 2 ERROR + 1 FATAL
      expect(stats.sourceDistribution.backend).toBe(2);
      expect(stats.sourceDistribution.frontend).toBe(2);
      expect(stats.topFailingContexts).toEqual([
        { context: 'Auth', count: 2 },
        { context: 'UI', count: 1 },
      ]);
    });
  });

  describe('purgeOldLogs', () => {
    it('debe eliminar registros con más de 30 días de antigüedad', async () => {
      const result = await service.purgeOldLogs();

      expect(prisma.systemLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date),
          },
        },
      });
      expect(result.deletedCount).toBe(15);
    });
  });
});
