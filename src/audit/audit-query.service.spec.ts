import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditQueryService', () => {
  let service: AuditQueryService;
  let prismaMock: {
    auditLog: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      auditLog: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditQueryService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AuditQueryService>(AuditQueryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe listar registros de auditoría paginados correctamente', async () => {
      const mockAudits = [
        {
          id: 'audit-1',
          action: 'USER_CREATED',
          entity: 'User',
          entityId: 'u-1',
          user: { id: 'admin-1', email: 'admin@sistema.com', name: 'Admin' },
          method: 'POST',
          endpoint: '/api/users',
          ipAddress: '127.0.0.1',
          userAgent: 'Chrome',
          createdAt: new Date(),
          details: { email: 'new@sistema.com' },
        },
      ];

      prismaMock.auditLog.count.mockResolvedValueOnce(1);
      prismaMock.auditLog.findMany.mockResolvedValueOnce(mockAudits);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPrevPage).toBe(false);
      expect(result.audits).toHaveLength(1);
      expect(result.audits[0].action).toBe('USER_CREATED');
    });

    it('debe aplicar filtros por acción, entidad y búsqueda', async () => {
      prismaMock.auditLog.count.mockResolvedValueOnce(0);
      prismaMock.auditLog.findMany.mockResolvedValueOnce([]);

      await service.findAll({
        action: 'ROLE_UPDATED',
        entity: 'Role',
        search: '192.168.1.1',
      });

      expect(prismaMock.auditLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          action: { contains: 'ROLE_UPDATED', mode: 'insensitive' },
          entity: { contains: 'Role', mode: 'insensitive' },
          OR: expect.arrayContaining([
            { ipAddress: { contains: '192.168.1.1', mode: 'insensitive' } },
          ]),
        }),
      });
    });
  });

  describe('findById', () => {
    it('debe lanzar NotFoundException si no existe el registro de auditoría', async () => {
      prismaMock.auditLog.findUnique.mockResolvedValueOnce(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe retornar el detalle del registro de auditoría si existe', async () => {
      const mockAudit = {
        id: 'audit-100',
        action: 'USER_UPDATED',
        user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin' },
        createdAt: new Date(),
      };

      prismaMock.auditLog.findUnique.mockResolvedValueOnce(mockAudit);

      const result = await service.findById('audit-100');
      expect(result.id).toBe('audit-100');
      expect(result.action).toBe('USER_UPDATED');
    });
  });
});

