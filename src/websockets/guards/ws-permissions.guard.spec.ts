import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { WsPermissionsGuard } from './ws-permissions.guard';

describe('WsPermissionsGuard', () => {
  let guard: WsPermissionsGuard;
  let reflector: jest.Mocked<Reflector>;

  const createMockContext = (client: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToWs: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue(client),
      }),
    } as unknown as ExecutionContext);

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new WsPermissionsGuard(reflector);
  });

  it('should allow access if no permissions are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if required permissions array is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = createMockContext({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw WsException if user is not present on socket', () => {
    reflector.getAllAndOverride.mockReturnValue(['files.write']);
    const context = createMockContext({});

    expect(() => guard.canActivate(context)).toThrow(WsException);
    expect(() => guard.canActivate(context)).toThrow(
      'WsPermissionsGuard: Usuario no autenticado en el socket',
    );
  });

  it('should allow access if user is admin (admin bypass)', () => {
    reflector.getAllAndOverride.mockReturnValue(['files.delete']);
    const context = createMockContext({
      user: { roles: ['admin'], permissions: [] },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has wildcard (*) permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['files.delete']);
    const context = createMockContext({
      data: { user: { roles: ['user'], permissions: ['*'] } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has all required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['files.read', 'files.write']);
    const context = createMockContext({
      user: { roles: ['user'], permissions: ['files.read', 'files.write', 'other.perm'] },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw WsException if user lacks any required permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['files.read', 'files.delete']);
    const context = createMockContext({
      user: { roles: ['user'], permissions: ['files.read'] },
    });

    expect(() => guard.canActivate(context)).toThrow(WsException);
    expect(() => guard.canActivate(context)).toThrow(
      'Prohibido: Permisos insuficientes para esta operación WebSocket. Requeridos: [files.read, files.delete].',
    );
  });
});

