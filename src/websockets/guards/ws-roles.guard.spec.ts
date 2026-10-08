import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { WsRolesGuard } from './ws-roles.guard';

describe('WsRolesGuard', () => {
  let guard: WsRolesGuard;
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

    guard = new WsRolesGuard(reflector);
  });

  it('should allow access if no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if required roles array is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = createMockContext({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw WsException if user is not present on socket', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const context = createMockContext({});

    expect(() => guard.canActivate(context)).toThrow(WsException);
    expect(() => guard.canActivate(context)).toThrow(
      'WsRolesGuard: Usuario no autenticado en el socket',
    );
  });

  it('should allow access if user is admin (super admin bypass)', () => {
    reflector.getAllAndOverride.mockReturnValue(['moderator']);
    const context = createMockContext({
      user: { roles: ['admin'] },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['editor', 'moderator']);
    const context = createMockContext({
      data: { user: { roles: ['editor'] } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw WsException if user does not have any of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'moderator']);
    const context = createMockContext({
      user: { roles: ['user'] },
    });

    expect(() => guard.canActivate(context)).toThrow(WsException);
    expect(() => guard.canActivate(context)).toThrow(
      'Prohibido: Rol insuficiente. Se requiere alguno de los siguientes roles: [admin, moderator].',
    );
  });
});
