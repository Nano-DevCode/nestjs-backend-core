import { Test, TestingModule } from '@nestjs/testing';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { LogLevel, LogSource } from '../../prisma/generated/prisma/client';

describe('LogsController', () => {
  let controller: LogsController;
  let service: {
    enqueueClientLog: jest.Mock;
    getLogs: jest.Mock;
    getStats: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      enqueueClientLog: jest.fn(),
      getLogs: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      getStats: jest.fn().mockResolvedValue({
        totalErrors24h: 5,
        sourceDistribution: { backend: 3, frontend: 2 },
        levelDistribution: { info: 1, warn: 2, error: 4, fatal: 1 },
        topFailingContexts: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogsController],
      providers: [{ provide: LogsService, useValue: service }],
    }).compile();

    controller = module.get<LogsController>(LogsController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('reportClientLog', () => {
    it('debe recibir el log del cliente y encolarlo pasando el userId del request si existe', () => {
      const dto = {
        level: LogLevel.ERROR,
        context: 'ErrorBoundaryReact',
        message: 'Uncaught TypeError',
      };
      const mockReq = {
        user: { id: 'usr-123' },
      } as unknown as Parameters<typeof controller.reportClientLog>[1];

      const response = controller.reportClientLog(dto, mockReq);

      expect(service.enqueueClientLog).toHaveBeenCalledWith(dto, 'usr-123');
      expect(response.success).toBe(true);
    });
  });

  describe('getLogs', () => {
    it('debe invocar a getLogs con los query params provistos', async () => {
      const query = { page: 1, limit: 10, source: LogSource.BACKEND };
      const res = await controller.getLogs(query);

      expect(service.getLogs).toHaveBeenCalledWith(query);
      expect(res.total).toBe(0);
    });
  });

  describe('getStats', () => {
    it('debe devolver métricas agregadas', async () => {
      const stats = await controller.getStats();

      expect(service.getStats).toHaveBeenCalled();
      expect(stats.totalErrors24h).toBe(5);
    });
  });
});
