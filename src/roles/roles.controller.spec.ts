import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Reflector } from '@nestjs/core';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';

describe('RolesController', () => {
  let controller: RolesController;
  let serviceMock: {
    getRoles: jest.Mock;
    getAllPermissions: jest.Mock;
    getRoleById: jest.Mock;
    createRole: jest.Mock;
    updateRole: jest.Mock;
    deleteRole: jest.Mock;
  };

  const mockUser: UserAuthContext = {
    id: 'admin-1',
    email: 'admin@test.com',
    roles: ['admin'],
    priority: 90,
  };

  const mockAudit = {
    ipAddress: '127.0.0.1',
    method: 'POST',
    endpoint: '/roles',
  };

  beforeEach(async () => {
    serviceMock = {
      getRoles: jest.fn().mockResolvedValue([
        { id: '1', name: 'admin', priority: 90 },
      ]),
      getAllPermissions: jest.fn().mockResolvedValue([
        { id: 'p1', slug: 'users:read', description: 'Lectura' },
      ]),
      getRoleById: jest.fn().mockResolvedValue({
        id: '1',
        name: 'admin',
        priority: 90,
      }),
      createRole: jest.fn().mockResolvedValue({
        id: '2',
        name: 'operador',
        priority: 30,
      }),
      updateRole: jest.fn().mockResolvedValue({
        id: '2',
        name: 'operador_v2',
        priority: 35,
      }),
      deleteRole: jest.fn().mockResolvedValue({
        success: true,
        message: 'Rol eliminado',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        { provide: RolesService, useValue: serviceMock },
        { provide: Reflector, useValue: {} },
      ],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  it('debe obtener la lista de roles', async () => {
    const roles = await controller.getRoles();
    expect(roles).toHaveLength(1);
    expect(serviceMock.getRoles).toHaveBeenCalled();
  });

  it('debe obtener la lista de permisos', async () => {
    const perms = await controller.getPermissions();
    expect(perms).toHaveLength(1);
    expect(serviceMock.getAllPermissions).toHaveBeenCalled();
  });

  it('debe crear un rol pasando el usuario actual y metadata de auditoría', async () => {
    const res = await controller.createRole(
      { name: 'operador', priority: 30 },
      mockUser,
      mockAudit,
    );
    expect(res.id).toBe('2');
    expect(serviceMock.createRole).toHaveBeenCalledWith(
      { name: 'operador', priority: 30 },
      mockUser,
      mockAudit,
    );
  });

  it('debe actualizar un rol existente', async () => {
    const res = await controller.updateRole(
      '2',
      { priority: 35 },
      mockUser,
      mockAudit,
    );
    expect(res.name).toBe('operador_v2');
    expect(serviceMock.updateRole).toHaveBeenCalledWith(
      '2',
      { priority: 35 },
      mockUser,
      mockAudit,
    );
  });

  it('debe eliminar un rol', async () => {
    const res = await controller.deleteRole('2', mockUser, mockAudit);
    expect(res.success).toBe(true);
    expect(serviceMock.deleteRole).toHaveBeenCalledWith('2', mockUser, mockAudit);
  });
});

