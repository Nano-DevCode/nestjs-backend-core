import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RolesQueryService } from './roles-query.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesQueryService', () => {
  let service: RolesQueryService;
  let prismaMock: {
    role: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    permission: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      role: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesQueryService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<RolesQueryService>(RolesQueryService);
  });

  describe('getAllPermissions', () => {
    it('debe devolver todos los permisos ordenados por slug', async () => {
      const mockPerms = [
        { id: 'p1', slug: 'users:read', description: 'Leer usuarios' },
      ];
      prismaMock.permission.findMany.mockResolvedValueOnce(mockPerms);

      const result = await service.getAllPermissions();
      expect(result).toEqual(mockPerms);
      expect(prismaMock.permission.findMany).toHaveBeenCalledWith({
        orderBy: { slug: 'asc' },
        select: { id: true, slug: true, description: true },
      });
    });
  });

  describe('getRoleById', () => {
    it('debe lanzar NotFoundException si el rol no existe', async () => {
      prismaMock.role.findUnique.mockResolvedValueOnce(null);
      await expect(service.getRoleById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe retornar el detalle formateado del rol si existe', async () => {
      const mockRole = {
        id: 'role-1',
        name: 'custom_role',
        description: 'Rol personalizado',
        priority: 15,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { users: 0, permissions: 1 },
        permissions: [
          {
            permission: {
              id: 'p1',
              slug: 'users:read',
              description: 'Leer usuarios',
            },
          },
        ],
      };
      prismaMock.role.findUnique.mockResolvedValueOnce(mockRole);

      const result = await service.getRoleById('role-1');
      expect(result.id).toBe('role-1');
      expect(result.isSystem).toBe(false);
      expect(result.permissions).toHaveLength(1);
    });
  });
});

