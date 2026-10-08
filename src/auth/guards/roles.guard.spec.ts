import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflectorMock: {
    getAllAndOverride: jest.Mock;
  };

  const createMockContext = (user?: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RolesGuard(reflectorMock as unknown as Reflector);
  });

  it('debe permitir acceso si la ruta es pública (@IsPublic)', () => {
    reflectorMock.getAllAndOverride.mockReturnValueOnce(true); // IS_PUBLIC_KEY
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe permitir acceso si no hay roles requeridos', () => {
    reflectorMock.getAllAndOverride
      .mockReturnValueOnce(false) // IS_PUBLIC_KEY
      .mockReturnValueOnce([]); // ROLES_KEY
    const context = createMockContext({ roles: ['user'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe permitir acceso si el usuario tiene uno de los roles requeridos', () => {
    reflectorMock.getAllAndOverride
      .mockReturnValueOnce(false) // IS_PUBLIC_KEY
      .mockReturnValueOnce(['admin', 'editor']); // ROLES_KEY
    const context = createMockContext({ roles: ['admin'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe lanzar ForbiddenException si el usuario no tiene los roles ni permisos requeridos', () => {
    reflectorMock.getAllAndOverride
      .mockReturnValueOnce(false) // IS_PUBLIC_KEY
      .mockReturnValueOnce(['admin']) // ROLES_KEY
      .mockReturnValueOnce([]); // PERMISSIONS_KEY
    const context = createMockContext({ roles: ['user'], permissions: [] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('debe permitir acceso si el usuario no tiene el rol pero cumple los permisos requeridos', () => {
    reflectorMock.getAllAndOverride
      .mockReturnValueOnce(false) // IS_PUBLIC_KEY
      .mockReturnValueOnce(['admin']) // ROLES_KEY
      .mockReturnValueOnce(['read:files']); // PERMISSIONS_KEY
    const context = createMockContext({
      roles: ['user'],
      permissions: ['read:files'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});

