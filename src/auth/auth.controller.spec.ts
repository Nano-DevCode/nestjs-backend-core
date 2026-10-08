import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import type { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: {
    register: jest.Mock;
    verifyEmail: jest.Mock;
    resendVerificationEmail: jest.Mock;
    validateUser: jest.Mock;
    login: jest.Mock;
    clearAuthCookies: jest.Mock;
    getUserAuthContextById: jest.Mock;
  };
  let sessionServiceMock: {
    validateAndRotateToken: jest.Mock;
    revokeAllUserSessions: jest.Mock;
    revokeSession: jest.Mock;
    blacklistToken: jest.Mock;
  };
  let jwtServiceMock: {
    verify: jest.Mock;
    decode: jest.Mock;
  };

  const mockRes = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    authServiceMock = {
      register: jest.fn().mockResolvedValue({ message: 'Registrado con éxito' }),
      verifyEmail: jest.fn().mockResolvedValue({ message: 'Email verificado' }),
      resendVerificationEmail: jest.fn().mockResolvedValue({ message: 'Reenviado' }),
      validateUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        roles: ['user'],
        permissions: [],
      }),
      login: jest.fn().mockResolvedValue({ accessToken: 'new-access-token' }),
      clearAuthCookies: jest.fn(),
      getUserAuthContextById: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        roles: ['user'],
      }),
    };

    sessionServiceMock = {
      validateAndRotateToken: jest.fn().mockResolvedValue({
        success: true,
        isReuse: false,
        activeTokenId: 'rotated-token-id',
      }),
      revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      blacklistToken: jest.fn().mockResolvedValue(undefined),
    };

    jwtServiceMock = {
      verify: jest.fn().mockReturnValue({ sub: 'user-1', tokenId: 'tok-1' }),
      decode: jest.fn().mockReturnValue({ jti: 'jti-123', exp: Math.floor(Date.now() / 1000) + 900 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: SessionService, useValue: sessionServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: TwoFactorService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('debe registrar un usuario', async () => {
      const res = await controller.register({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Tester',
      });
      expect(authServiceMock.register).toHaveBeenCalledWith(
        'test@example.com',
        'Password123!',
        'Tester',
      );
      expect(res.message).toBeDefined();
    });
  });

  describe('verifyEmail y resendVerification', () => {
    it('debe verificar email', async () => {
      const res = await controller.verifyEmail({ token: 'tok-123' });
      expect(authServiceMock.verifyEmail).toHaveBeenCalledWith('tok-123');
      expect(res.message).toBeDefined();
    });

    it('debe reenviar verificación', async () => {
      const res = await controller.resendVerification({ email: 'test@example.com' });
      expect(authServiceMock.resendVerificationEmail).toHaveBeenCalledWith('test@example.com');
      expect(res.message).toBeDefined();
    });
  });

  describe('login', () => {
    it('debe validar credenciales y llamar a login', async () => {
      const mockReq = { cookies: {} } as Request;
      const res = await controller.login(
        { email: 'test@example.com', password: 'Password123!', trustDevice: true },
        mockReq,
        mockRes,
      );

      expect(authServiceMock.validateUser).toHaveBeenCalledWith('test@example.com', 'Password123!');
      expect(authServiceMock.login).toHaveBeenCalled();
      expect(res).toHaveProperty('accessToken');
    });
  });

  describe('refresh', () => {
    it('debe lanzar UnauthorizedException si no hay refresh_token', async () => {
      const mockReq = { cookies: {} } as Request;

      await expect(controller.refresh(mockReq, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe detectar reúso malicioso e invalidar todas las sesiones', async () => {
      const mockReq = { cookies: { refresh_token: 'valid-jwt' } } as unknown as Request;
      sessionServiceMock.validateAndRotateToken.mockResolvedValue({
        success: false,
        isReuse: true,
      });

      await expect(controller.refresh(mockReq, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(sessionServiceMock.revokeAllUserSessions).toHaveBeenCalledWith('user-1');
      expect(authServiceMock.clearAuthCookies).toHaveBeenCalledWith(mockRes);
    });

    it('debe rotar token y emitir nueva sesión', async () => {
      const mockReq = { cookies: { refresh_token: 'valid-jwt' } } as unknown as Request;

      const res = await controller.refresh(mockReq, mockRes);

      expect(sessionServiceMock.validateAndRotateToken).toHaveBeenCalled();
      expect(authServiceMock.login).toHaveBeenCalledWith(
        expect.any(Object),
        mockRes,
        'rotated-token-id',
      );
      expect(res).toHaveProperty('accessToken');
    });
  });

  describe('logout', () => {
    it('debe revocar sesión, agregar access token a blacklist y limpiar cookies', async () => {
      const mockReq = {
        user: { id: 'user-1' },
        cookies: { refresh_token: 'ref-token', access_token: 'header.body.signature' },
        headers: {},
      } as any;

      const res = await controller.logout(mockReq, mockRes);

      expect(sessionServiceMock.revokeSession).toHaveBeenCalled();
      expect(sessionServiceMock.blacklistToken).toHaveBeenCalled();
      expect(authServiceMock.clearAuthCookies).toHaveBeenCalledWith(mockRes);
      expect(res.message).toBeDefined();
    });
  });

  describe('admin y critical endpoints', () => {
    it('debe retornar datos de admin dashboard', () => {
      const req = { user: { id: 'admin-1', roles: ['admin'] } } as any;
      expect(controller.getAdminData(req).user.id).toBe('admin-1');
    });

    it('debe retornar mensaje de usuarios export', () => {
      const req = { user: { id: 'admin-1' } } as any;
      expect(controller.exportUserData(req).message).toContain('users:export');
    });

    it('debe retornar confirmación de acción crítica', () => {
      const req = { user: { id: 'admin-1' } } as any;
      expect(controller.executeCriticalAction(req).message).toContain('Acción crítica');
    });
  });
});
