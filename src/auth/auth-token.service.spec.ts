import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenService, AUTH_COOKIE_OPTIONS } from './auth-token.service';
import { SessionService } from './session.service';
import type { Response } from 'express';
import type { UserAuthContext } from './interfaces/auth.interface';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let jwtService: { sign: jest.Mock };
  let sessionService: { setSession: jest.Mock };

  const mockUser: UserAuthContext = {
    id: 'user-abc',
    email: 'user@example.com',
    roles: ['user'],
    permissions: ['read:data'],
    isTwoFactorEnabled: false,
  };

  beforeEach(async () => {
    jwtService = {
      sign: jest.fn().mockImplementation((payload, options) => {
        return `signed.${payload.sub || payload.id}.${options?.expiresIn || 'token'}`;
      }),
    };

    sessionService = {
      setSession: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: SessionService, useValue: sessionService },
      ],
    }).compile();

    service = module.get<AuthTokenService>(AuthTokenService);
  });

  describe('generateTokens', () => {
    it('debe generar access y refresh tokens firmados con jwtService', () => {
      const tokens = service.generateTokens(mockUser, 'token-id-123');

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('createSessionAndCookies', () => {
    it('debe almacenar sesiÃ³n en Redis, configurar cookies HTTP-Only y retornar UserAuthResponse', async () => {
      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const result = await service.createSessionAndCookies(mockUser, mockRes);

      expect(sessionService.setSession).toHaveBeenCalledTimes(1);
      expect(sessionService.setSession).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
        604800,
      );
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
    });

    it('no debe regenerar sesiÃ³n si se suministra un existingTokenId', async () => {
      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      await service.createSessionAndCookies(mockUser, mockRes, 'existing-tid');

      expect(sessionService.setSession).not.toHaveBeenCalled();
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('createMobileTokens', () => {
    it('debe generar tokens y guardar sesiÃ³n sin depender de Express Cookies', async () => {
      const result = await service.createMobileTokens(mockUser);

      expect(sessionService.setSession).toHaveBeenCalledTimes(1);
      expect(result.user.id).toBe(mockUser.id);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('clearAuthCookies', () => {
    it('debe limpiar las cookies de autenticaciÃ³n en la respuesta Express', () => {
      const mockRes = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      service.clearAuthCookies(mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledTimes(2);
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(Object),
      );
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(Object),
      );
    });
  });

  describe('AUTH_COOKIE_OPTIONS', () => {
    it('debe retornar configuraciones de cookies correctas para desarrollo/producciÃ³n', () => {
      const accessOpts = AUTH_COOKIE_OPTIONS.getAccessTokenOptions();
      const refreshOpts = AUTH_COOKIE_OPTIONS.getRefreshTokenOptions();
      const temp2FaOpts = AUTH_COOKIE_OPTIONS.getTemp2FaTokenOptions();

      expect(accessOpts.httpOnly).toBe(true);
      expect(refreshOpts.path).toBe('/api/auth');
      expect(temp2FaOpts.maxAge).toBe(5 * 60 * 1000);
    });
  });
});


