import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ExportsService } from './exports.service';
import { EXPORTS_QUEUE } from './exports.constants';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PrismaService } from '../prisma/prisma.service';

describe('ExportsService', () => {
  let service: ExportsService;
  let queueMock: {
    add: jest.Mock;
  };
  let redisMock: {
    set: jest.Mock;
    get: jest.Mock;
  };
  let prismaMock: {
    user: {
      findMany: jest.Mock;
    };
    auditLog: {
      findMany: jest.Mock;
    };
    systemLog: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'bull-job-1' }),
    };

    redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
    };

    prismaMock = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', email: 'test@example.com' }]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1', action: 'CREATE' }]),
      },
      systemLog: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1', message: 'System ok' }]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportsService,
        {
          provide: getQueueToken(EXPORTS_QUEUE),
          useValue: queueMock,
        },
        {
          provide: REDIS_CLIENT,
          useValue: redisMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ExportsService>(ExportsService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('requestExport', () => {
    it('debe encolar un trabajo en BullMQ y persistir el estado inicial en Redis', async () => {
      const res = await service.requestExport('user-123', {
        title: 'Reporte Usuarios',
        format: 'csv',
        datasetType: 'users',
      });

      expect(res.exportId).toBeDefined();
      expect(res.status).toBe('pending');
      expect(res.queueJobId).toBe('bull-job-1');

      expect(redisMock.set).toHaveBeenCalledTimes(1);
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining(res.exportId),
        expect.any(String),
        'EX',
        86400,
      );
      expect(queueMock.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('getExportStatus & updateExportStatus', () => {
    it('getExportStatus debe retornar null si no existe', async () => {
      redisMock.get.mockResolvedValue(null);
      const res = await service.getExportStatus('inexistente');
      expect(res).toBeNull();
    });

    it('getExportStatus debe retornar el objeto parseado si existe', async () => {
      const statusObj = { exportId: 'e-1', status: 'completed' };
      redisMock.get.mockResolvedValue(JSON.stringify(statusObj));
      const res = await service.getExportStatus('e-1');
      expect(res).toEqual(statusObj);
    });

    it('updateExportStatus debe actualizar y persistir el nuevo estado', async () => {
      const current = { exportId: 'e-1', status: 'pending', progressPercentage: 0 };
      redisMock.get.mockResolvedValue(JSON.stringify(current));

      await service.updateExportStatus('e-1', {
        status: 'completed',
        progressPercentage: 100,
      });

      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('e-1'),
        expect.stringContaining('"status":"completed"'),
        'EX',
        86400,
      );
    });
  });

  describe('fetchDataset', () => {
    it('debe recuperar usuarios cuando datasetType es "users"', async () => {
      const data = await service.fetchDataset('users');
      expect(data).toHaveLength(1);
      expect(prismaMock.user.findMany).toHaveBeenCalled();
    });

    it('debe recuperar audit logs cuando datasetType es "audit_logs"', async () => {
      const data = await service.fetchDataset('audit_logs');
      expect(data).toHaveLength(1);
      expect(prismaMock.auditLog.findMany).toHaveBeenCalled();
    });

    it('debe recuperar system logs cuando datasetType es "system_logs"', async () => {
      const data = await service.fetchDataset('system_logs');
      expect(data).toHaveLength(1);
      expect(prismaMock.systemLog.findMany).toHaveBeenCalled();
    });

    it('debe retornar arreglo vacío para tipo desconocido', async () => {
      const data = await service.fetchDataset('unknown');
      expect(data).toEqual([]);
    });
  });

  describe('formatDatasetAsCsv', () => {
    it('debe retornar cadena vacía si no hay registros', () => {
      expect(service.formatDatasetAsCsv([])).toBe('');
    });

    it('debe generar formato CSV con comillas y escape de comas según RFC-4180', () => {
      const records = [
        { id: 1, name: 'Juan, Perez', role: 'ADMIN' },
        { id: 2, name: 'Maria "La Guapa"', role: 'USER' },
      ];

      const csv = service.formatDatasetAsCsv(records);
      const lines = csv.split('\r\n');

      expect(lines[0]).toBe('id,name,role');
      expect(lines[1]).toBe('1,"Juan, Perez",ADMIN');
      expect(lines[2]).toBe('2,"Maria ""La Guapa""",USER');
    });

    it('debe respetar el delimitador tabulado para TSV', () => {
      const records = [{ id: 1, name: 'Ana' }];
      const tsv = service.formatDatasetAsCsv(records, ['id', 'name'], '\t');
      expect(tsv).toBe('id\tname\r\n1\tAna');
    });
  });
});

