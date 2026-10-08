import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from './ws-jwt.guard';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let reflector: jest.Mocked<Reflector>;
  let jwtService: jest.Mocked<JwtService>;
  let authService: jest.Mocked<AuthService>;
  let sessionService: jest.Mocked<SessionService>;

  const mockUser = {
    id: 'user-123',
    email: 'user@example.com',
    roles: ['user'],
    permissions: ['files.read'],
    isTwoFactorEnabled: false,
  };

  const createMockContext = (client: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToWs: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue(client),
        getData: jest.fn(),
      }),
    } as unknown as ExecutionContext);

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    jwtService = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    authService = {
      getUserAuthContextById: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    sessionService = {
      isTokenBlacklisted: jest.fn(),
    } as unknown as jest.Mocked<SessionService>;

    guard = new WsJwtGuard(reflector, jwtService, authService, sessionService);
  });

  it('should allow access if handler or class is marked as public', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('should allow access if socket client is already authenticated', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const client = { user: mockUser };
    const context = createMockContext(client);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('should throw WsException if token is missing in socket handshake', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const client = { handshake: {} };
    const context = createMockContext(client);

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'No autorizado: Token de autenticación ausente en el handshake WebSocket.',
    );
  });

  it('should throw WsException if jwt verification fails', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const client = {
      handshake: {
        auth: { token: 'invalid.jwt.token' },
      },
    };
    const context = createMockContext(client);
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'No autorizado: Token inválido o expirado.',
    );
  });

  it('should throw WsException if token JTI is blacklisted', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const client = {
      handshake: {
        headers: { authorization: 'Bearer header.token.signature' },
      },
    };
    const context = createMockContext(client);
    jwtService.verify.mockReturnValue({
      sub: 'user-123',
      jti: 'jti-revoked-id',
    });
    sessionService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'No autorizado: Sesión revocada. Conéctate nuevamente.',
    );
  });

  it('should throw WsException if token signature is blacklisted', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const client = {
      handshake: {
        headers: {
          cookie: 'access_token=cookie.token.revoked_sig',
        },
      },
    };
    const context = createMockContext(client);
    jwtService.verify.mockReturnValue({
      sub: 'user-123',
    });
    sessionService.isTokenBlacklisted.mockResolvedValueOnce(true);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'No autorizado: Sesión revocada. Conéctate nuevamente.',
    );
  });

  it('should authenticate successfully with query param token and attach user to client', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const client: any = {
      handshake: {
        query: { token: 'query.token.valid_sig' },
      },
      data: {},
    };
    const context = createMockContext(client);
    jwtService.verify.mockReturnValue({
      sub: 'user-123',
      jti: 'valid-jti',
    });
    sessionService.isTokenBlacklisted.mockResolvedValue(false);
    authService.getUserAuthContextById.mockResolvedValue(mockUser as any);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(client.user).toEqual(mockUser);
    expect(client.data.user).toEqual(mockUser);
  });

  it('should throw WsException if user context cannot be retrieved', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const client: any = {
      handshake: {
        auth: { token: 'Bearer valid.jwt.token' },
      },
    };
    const context = createMockContext(client);
    jwtService.verify.mockReturnValue({
      sub: 'nonexistent-user',
    });
    sessionService.isTokenBlacklisted.mockResolvedValue(false);
    authService.getUserAuthContextById.mockRejectedValue(
      new Error('User not found'),
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      'No autorizado: Usuario inactivo, no verificado o inexistente.',
    );
  });
});

