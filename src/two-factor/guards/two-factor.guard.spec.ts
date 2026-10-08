import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TwoFactorGuard } from './two-factor.guard';
import { TwoFactorService } from '../two-factor.service';

describe('TwoFactorGuard', () => {
  let guard: TwoFactorGuard;
  let reflectorMock: { getAllAndOverride: jest.Mock };
  let twoFactorServiceMock: { verifyActionCode: jest.Mock };

  const createMockContext = (
    user?: any,
    headers: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user, headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };
    twoFactorServiceMock = {
      verifyActionCode: jest.fn(),
    };
    guard = new TwoFactorGuard(
      reflectorMock as unknown as Reflector,
      twoFactorServiceMock as unknown as TwoFactorService,
    );
  });

  it('debe permitir acceso si la ruta no requiere 2FA (@Require2FA)', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const result = await guard.canActivate(createMockContext());
    expect(result).toBe(true);
  });

  it('debe lanzar UnauthorizedException si el usuario no está en la petición', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(createMockContext(null))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('debe permitir acceso si el usuario no tiene 2FA habilitado en su cuenta', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const user = { id: 'u-1', email: 'test@example.com', isTwoFactorEnabled: false };

    const result = await guard.canActivate(createMockContext(user));
    expect(result).toBe(true);
  });

  it('debe lanzar UnauthorizedException si no se envía header x-2fa-code o tiene formato inválido', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const user = { id: 'u-1', email: 'test@example.com', isTwoFactorEnabled: true };

    await expect(
      guard.canActivate(createMockContext(user, {})),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      guard.canActivate(createMockContext(user, { 'x-2fa-code': '123' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe lanzar UnauthorizedException si el código 2FA es incorrecto', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const user = { id: 'u-1', email: 'test@example.com', isTwoFactorEnabled: true };
    twoFactorServiceMock.verifyActionCode.mockResolvedValue(false);

    await expect(
      guard.canActivate(createMockContext(user, { 'x-2fa-code': '123456' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe permitir acceso cuando el código 2FA es válido', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const user = { id: 'u-1', email: 'test@example.com', isTwoFactorEnabled: true };
    twoFactorServiceMock.verifyActionCode.mockResolvedValue(true);

    const result = await guard.canActivate(
      createMockContext(user, { 'x-2fa-code': '123456' }),
    );
    expect(result).toBe(true);
    expect(twoFactorServiceMock.verifyActionCode).toHaveBeenCalledWith('u-1', '123456');
  });
});
