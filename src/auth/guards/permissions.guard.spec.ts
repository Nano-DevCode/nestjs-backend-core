import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
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
    guard = new PermissionsGuard(reflectorMock as unknown as Reflector);
  });

  it('debe permitir acceso si la ruta es pública', () => {
    reflectorMock.getAllAndOverride.mockReturnValueOnce(true);
    expect(guard.canActivate(createMockContext())).toBe(true);
  });

  it('debe permitir acceso si no se requieren roles ni permisos', () => {
    reflectorMock.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);
    expect(guard.canActivate(createMockContext())).toBe(true);
  });

  it('debe dar acceso total si el usuario tiene rol admin', () => {
    reflectorMock.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['manage:secrets']);
    const context = createMockContext({ roles: ['admin'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe permitir acceso si el usuario tiene todos los permisos requeridos', () => {
    reflectorMock.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['files:read', 'files:write']);
    const context = createMockContext({
      roles: ['user'],
      permissions: ['files:read', 'files:write'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe lanzar ForbiddenException si al usuario le falta algún permiso requerido', () => {
    reflectorMock.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['files:read', 'files:delete']);
    const context = createMockContext({
      roles: ['user'],
      permissions: ['files:read'],
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

