import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersHierarchyService } from '../users/users-hierarchy.service';
import { AuditService } from '../audit/audit.service';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';

describe('RolesService', () => {
  let service: RolesService;
  let prismaMock: {
    role: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    permission: {
      findMany: jest.Mock;
    };
    rolePermission: {
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    userRole: {
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let hierarchyMock: {
    assertCanSetPriority: jest.Mock;
    assertCanManageRolePriority: jest.Mock;
    getUserPriority: jest.Mock;
  };
  let auditMock: {
    log: jest.Mock;
  };

  const mockAdminUser: UserAuthContext = {
    id: 'admin-123',
    email: 'admin@test.com',
    roles: ['admin'],
    priority: 90,
    permissions: ['roles:manage', 'users:read'],
  };

  beforeEach(async () => {
    prismaMock = {
      role: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
      },
      rolePermission: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      userRole: {
        count: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prismaMock),
      ),
    };

    hierarchyMock = {
      assertCanSetPriority: jest.fn(),
      assertCanManageRolePriority: jest.fn(),
      getUserPriority: jest.fn().mockReturnValue(90),
    };

    auditMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UsersHierarchyService, useValue: hierarchyMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  describe('getRoles', () => {
    it('debe listar roles paginados con metadatos calculados correctamente', async () => {
      const mockRolesFromDb = [
        {
          id: 'role-1',
          name: 'admin',
          description: 'Administrador del sistema',
          priority: 90,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { users: 2, permissions: 5 },
          permissions: [
            {
              permission: {
                id: 'p1',
                slug: 'users:read',
                description: 'Lectura de usuarios',
              },
            },
          ],
        },
      ];

      prismaMock.role.count.mockResolvedValueOnce(1);
      prismaMock.role.findMany.mockResolvedValueOnce(mockRolesFromDb);

      const result = await service.getRoles({ page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPrevPage).toBe(false);
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].name).toBe('admin');
      expect(result.roles[0].isSystem).toBe(true);
      expect(result.roles[0].userCount).toBe(2);
      expect(result.roles[0].permissionCount).toBe(5);
    });

    it('debe filtrar roles por búsqueda en nombre o descripción', async () => {
      prismaMock.role.count.mockResolvedValueOnce(0);
      prismaMock.role.findMany.mockResolvedValueOnce([]);

      await service.getRoles({ search: 'moderador' });

      expect(prismaMock.role.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'moderador', mode: 'insensitive' } },
            { description: { contains: 'moderador', mode: 'insensitive' } },
          ],
        },
      });
    });

    it('debe devolver todos los roles sin paginar cuando all es true', async () => {
      prismaMock.role.count.mockResolvedValueOnce(2);
      prismaMock.role.findMany.mockResolvedValueOnce([]);

      const result = await service.getRoles({ all: true });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(prismaMock.role.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ skip: expect.anything() }),
      );
    });
  });

  describe('createRole', () => {
    it('debe validar jerarquía y lanzar ForbiddenException si la prioridad es igual o mayor a la del usuario', async () => {
      hierarchyMock.assertCanSetPriority.mockImplementation(() => {
        throw new ForbiddenException(
          'No puedes asignar una prioridad igual o superior a la de tu rol.',
        );
      });

      await expect(
        service.createRole(
          { name: 'super_gestor', priority: 95 },
          mockAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(hierarchyMock.assertCanSetPriority).toHaveBeenCalledWith(
        mockAdminUser,
        95,
      );
    });

    it('debe lanzar ConflictException si el nombre del rol ya existe (case-insensitive)', async () => {
      prismaMock.role.findFirst.mockResolvedValueOnce({
        id: 'existing-id',
        name: 'soporte',
      });

      await expect(
        service.createRole(
          { name: 'SOPORTE', priority: 30 },
          mockAdminUser,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.role.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: 'soporte', mode: 'insensitive' } },
      });
    });

    it('debe crear el rol y asociar permisos dentro de una transacción atómica', async () => {
      prismaMock.role.findFirst.mockResolvedValueOnce(null);
      prismaMock.permission.findMany.mockResolvedValueOnce([{ id: 'perm-1' }]);
      prismaMock.role.create.mockResolvedValueOnce({
        id: 'new-role-id',
        name: 'moderador',
        priority: 40,
        description: 'Rol moderador',
      });

      // Simular getRoleById retornado al final
      prismaMock.role.findUnique.mockResolvedValueOnce({
        id: 'new-role-id',
        name: 'moderador',
        priority: 40,
        description: 'Rol moderador',
        _count: { users: 0, permissions: 1 },
        permissions: [
          {
            permission: {
              id: 'perm-1',
              slug: 'users:read',
              description: 'Lectura de usuarios',
            },
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createRole(
        {
          name: 'moderador',
          priority: 40,
          description: 'Rol moderador',
          permissionIds: ['perm-1'],
        },
        mockAdminUser,
        {
          ipAddress: '127.0.0.1',
          method: 'POST',
          endpoint: '/roles',
          userId: mockAdminUser.id,
        },
      );

      expect(hierarchyMock.assertCanSetPriority).toHaveBeenCalledWith(
        mockAdminUser,
        40,
      );
      expect(prismaMock.role.create).toHaveBeenCalledWith({
        data: {
          name: 'moderador',
          description: 'Rol moderador',
          priority: 40,
        },
      });
      expect(prismaMock.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'new-role-id', permissionId: 'perm-1' }],
      });
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROLE_CREATED',
          entity: 'Role',
          entityId: 'new-role-id',
        }),
      );
      expect(result.name).toBe('moderador');
      expect(result.permissionCount).toBe(1);
    });
  });

  describe('updateRole', () => {
    it('debe rechazar modificar un rol de igual o mayor jerarquía a la del usuario', async () => {
      prismaMock.role.findUnique.mockResolvedValueOnce({
        id: 'superadmin-id',
        name: 'superadmin',
        priority: 100,
      });

      hierarchyMock.assertCanManageRolePriority.mockImplementation(() => {
        throw new ForbiddenException(
          'No tienes privilegios suficientes para modificar un rol de igual o mayor jerarquía.',
        );
      });

      await expect(
        service.updateRole(
          'superadmin-id',
          { description: 'Nuevo texto' },
          mockAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe rechazar renombrar roles base del sistema como "admin"', async () => {
      prismaMock.role.findUnique.mockResolvedValueOnce({
        id: 'admin-id',
        name: 'admin',
        priority: 90,
      });

      await expect(
        service.updateRole(
          'admin-id',
          { name: 'super_jefe' },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar alterar la prioridad de roles del sistema', async () => {
      prismaMock.role.findUnique.mockResolvedValueOnce({
        id: 'admin-id',
        name: 'admin',
        priority: 90,
      });

      await expect(
        service.updateRole(
          'admin-id',
          { priority: 50 },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteRole', () => {
    it('debe rechazar eliminar un rol base del sistema (superadmin, admin, user)', async () => {
      prismaMock.role.findUnique.mockResolvedValueOnce({
        id: 'user-id',
        name: 'user',
        priority: 10,
        _count: { users: 0 },
      });

      await expect(
        service.deleteRole('user-id', mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar eliminar un rol que tenga usuarios asignados', async () => {
      prismaMock.role.findUnique.mockResolvedValueOnce({
        id: 'custom-role-id',
        name: 'soporte',
        priority: 20,
        _count: { users: 3 },
      });

      await expect(
        service.deleteRole('custom-role-id', mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe eliminar exitosamente un rol personalizado sin usuarios y registrar auditoría', async () => {
      prismaMock.role.findUnique.mockResolvedValueOnce({
        id: 'custom-role-id',
        name: 'soporte',
        priority: 20,
        _count: { users: 0 },
      });

      const res = await service.deleteRole(
        'custom-role-id',
        mockAdminUser,
        {
          ipAddress: '127.0.0.1',
          method: 'DELETE',
          endpoint: '/roles/custom-role-id',
          userId: mockAdminUser.id,
        },
      );

      expect(res.success).toBe(true);
      expect(prismaMock.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'custom-role-id' },
      });
      expect(prismaMock.role.delete).toHaveBeenCalledWith({
        where: { id: 'custom-role-id' },
      });
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROLE_DELETED',
          entity: 'Role',
          entityId: 'custom-role-id',
        }),
      );
    });
  });
});
