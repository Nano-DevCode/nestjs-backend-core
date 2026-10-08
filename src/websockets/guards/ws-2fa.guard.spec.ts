import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { WsTwoFactorGuard } from './ws-2fa.guard';
import { TwoFactorService } from '../../two-factor/two-factor.service';

describe('WsTwoFactorGuard', () => {
  let guard: WsTwoFactorGuard;
  let reflector: jest.Mocked<Reflector>;
  let twoFactorService: jest.Mocked<TwoFactorService>;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'user@test.com',
    roles: ['user'],
    permissions: [],
    isTwoFactorEnabled: true,
  };

  const createMockContext = (client: any, data: any = {}): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToWs: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue(client),
        getData: jest.fn().mockReturnValue(data),
      }),
    } as unknown as ExecutionContext);

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    twoFactorService = {
      verifyActionCode: jest.fn(),
    } as unknown as jest.Mocked<TwoFactorService>;

    guard = new WsTwoFactorGuard(reflector, twoFactorService);
  });

  it('should allow access if 2FA is not required', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(twoFactorService.verifyActionCode).not.toHaveBeenCalled();
  });

  it('should throw WsException if user is not present on socket', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Usuario no autenticado en el socket.',
    );
  });

  it('should allow access if user does not have 2FA enabled', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const client = { user: { ...mockUser, isTwoFactorEnabled: false } };
    const context = createMockContext(client);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(twoFactorService.verifyActionCode).not.toHaveBeenCalled();
  });

  it('should throw WsException if TOTP code is missing or invalid format', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const client = { user: mockUser };
    const context = createMockContext(client, { payloadData: 'something' });

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Step-Up 2FA Requerido: Debes proporcionar un código TOTP de 6 dígitos válido',
    );
  });

  it('should throw WsException if TOTP code fails verification', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const client = { user: mockUser };
    const context = createMockContext(client, { code: '123456' });
    twoFactorService.verifyActionCode.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Código 2FA inválido o expirado para esta acción crítica de WebSocket.',
    );
    expect(twoFactorService.verifyActionCode).toHaveBeenCalledWith('user-uuid-1', '123456');
  });

  it('should allow access when valid TOTP code is supplied in event payload', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const client = { user: mockUser };
    const context = createMockContext(client, { totpCode: '654321' });
    twoFactorService.verifyActionCode.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(twoFactorService.verifyActionCode).toHaveBeenCalledWith('user-uuid-1', '654321');
  });

  it('should allow access when valid TOTP code is supplied in header fallback', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const client = {
      user: mockUser,
      handshake: {
        headers: { 'x-2fa-code': '999888' },
      },
    };
    const context = createMockContext(client, {});
    twoFactorService.verifyActionCode.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(twoFactorService.verifyActionCode).toHaveBeenCalledWith('user-uuid-1', '999888');
  });
});

