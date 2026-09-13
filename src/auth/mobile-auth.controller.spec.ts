import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MobileAuthController } from './mobile-auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { SessionService } from './session.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import type { Request } from 'express';
import type { UserAuthContext } from './interfaces/auth.interface';

describe('MobileAuthController', () => {
  let controller: MobileAuthController;
  let authService: {
    validateUser: jest.Mock;
    getUserAuthContextById: jest.Mock;
  };
  let authTokenService: {
    createMobileTokens: jest.Mock;
  };
  let sessionService: {
    validateAndRotateToken: jest.Mock;
    revokeAllUserSessions: jest.Mock;
    revokeSession: jest.Mock;
    blacklistToken: jest.Mock;
  };
  let twoFactorService: {
    createPendingChallenge: jest.Mock;
    verifyPendingChallenge: jest.Mock;
  };
  let jwtService: {
    verify: jest.Mock;
    decode: jest.Mock;
  };

  const mockUserContext: UserAuthContext = {
    id: 'user-123',
    email: 'mobile@example.com',
    roles: ['user'],
    permissions: ['read:data'],
    isTwoFactorEnabled: false,
  };

  const mockMobileTokensResponse = {
    user: {
      id: 'user-123',
      email: 'mobile@example.com',
      roles: ['user'],
    },
    accessToken: 'mock.mobile.access.token',
    refreshToken: 'mock.mobile.refresh.token',
  };

  beforeEach(async () => {
    authService = {
      validateUser: jest.fn().mockResolvedValue(mockUserContext),
      getUserAuthContextById: jest.fn().mockResolvedValue(mockUserContext),
    };

    authTokenService = {
      createMobileTokens: jest.fn().mockResolvedValue(mockMobileTokensResponse),
    };

    sessionService = {
      validateAndRotateToken: jest.fn().mockResolvedValue({
        success: true,
        isReuse: false,
        activeTokenId: 'token-active-456',
      }),
      revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      blacklistToken: jest.fn().mockResolvedValue(undefined),
    };

    twoFactorService = {
      createPendingChallenge: jest.fn().mockResolvedValue('temp-2fa-token-123'),
      verifyPendingChallenge: jest.fn().mockResolvedValue({
        userId: 'user-123',
        trustDevice: false,
      }),
    };

    jwtService = {
      verify: jest.fn().mockReturnValue({
        sub: 'user-123',
        tokenId: 'token-old-789',
      }),
      decode: jest.fn().mockReturnValue({
        jti: 'jti-mobile-1',
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileAuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AuthTokenService, useValue: authTokenService },
        { provide: SessionService, useValue: sessionService },
        { provide: TwoFactorService, useValue: twoFactorService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    controller = module.get<MobileAuthController>(MobileAuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /auth/mobile/login', () => {
    it('should return mobile tokens in JSON when 2FA is disabled', async () => {
      const result = await controller.login({
        email: 'mobile@example.com',
        password: 'Password123!',
        deviceName: 'Pixel 8',
      });

      expect(authService.validateUser).toHaveBeenCalledWith(
        'mobile@example.com',
        'Password123!',
      );
      expect(authTokenService.createMobileTokens).toHaveBeenCalledWith(
        mockUserContext,
      );
      expect(result).toEqual(mockMobileTokensResponse);
    });

    it('should return require2FA and tempToken when 2FA is enabled', async () => {
      authService.validateUser.mockResolvedValueOnce({
        ...mockUserContext,
        isTwoFactorEnabled: true,
      });

      const result = await controller.login({
        email: 'mobile@example.com',
        password: 'Password123!',
      });

      expect(twoFactorService.createPendingChallenge).toHaveBeenCalledWith(
        'user-123',
        false,
      );
      expect(authTokenService.createMobileTokens).not.toHaveBeenCalled();
      expect(result).toEqual({
        require2FA: true,
        tempToken: 'temp-2fa-token-123',
      });
    });
  });

  describe('POST /auth/mobile/refresh', () => {
    it('should rotate token and return new mobile tokens', async () => {
      const result = await controller.refresh({
        refreshToken: 'valid.refresh.token',
      });

      expect(jwtService.verify).toHaveBeenCalled();
      expect(sessionService.validateAndRotateToken).toHaveBeenCalledWith(
        'user-123',
        'token-old-789',
        expect.any(String),
        604800,
      );
      expect(authService.getUserAuthContextById).toHaveBeenCalledWith(
        'user-123',
      );
      expect(authTokenService.createMobileTokens).toHaveBeenCalledWith(
        mockUserContext,
        'token-active-456',
      );
      expect(result).toEqual(mockMobileTokensResponse);
    });

    it('should throw UnauthorizedException if refresh token is invalid', async () => {
      jwtService.verify.mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });

      await expect(
        controller.refresh({ refreshToken: 'invalid.token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke all user sessions and throw UnauthorizedException when reuse is detected', async () => {
      sessionService.validateAndRotateToken.mockResolvedValueOnce({
        success: false,
        isReuse: true,
      });

      await expect(
        controller.refresh({ refreshToken: 'reused.token' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        'user-123',
      );
    });
  });

  describe('POST /auth/mobile/logout', () => {
    const mockRequest = {
      headers: {
        authorization: 'Bearer header.payload.tokenSignature',
      },
    } as unknown as Request;

    it('should blacklist Bearer token in Redis and revoke specific session when refreshToken is provided', async () => {
      const result = await controller.logout(mockUserContext, mockRequest, {
        refreshToken: 'valid.refresh.token',
      });

      expect(sessionService.blacklistToken).toHaveBeenCalledWith(
        'jti-mobile-1',
        expect.any(Number),
      );
      expect(sessionService.blacklistToken).toHaveBeenCalledWith(
        'tokenSignature',
        expect.any(Number),
      );
      expect(sessionService.revokeSession).toHaveBeenCalledWith(
        'user-123',
        'token-old-789',
      );
      expect(result).toEqual({ message: 'Sesión móvil cerrada exitosamente' });
    });

    it('should blacklist Bearer token and revoke all user sessions when refreshToken is omitted', async () => {
      const result = await controller.logout(mockUserContext, mockRequest, {});

      expect(sessionService.blacklistToken).toHaveBeenCalled();
      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        'user-123',
      );
      expect(result).toEqual({ message: 'Sesión móvil cerrada exitosamente' });
    });
  });

  describe('POST /auth/mobile/2fa/authenticate', () => {
    it('should verify challenge and return mobile tokens without cookies', async () => {
      const result = await controller.authenticate2FA({
        tempToken: 'temp-2fa-token-123',
        code: '123456',
      });

      expect(twoFactorService.verifyPendingChallenge).toHaveBeenCalledWith(
        'temp-2fa-token-123',
        '123456',
      );
      expect(authService.getUserAuthContextById).toHaveBeenCalledWith(
        'user-123',
      );
      expect(authTokenService.createMobileTokens).toHaveBeenCalledWith(
        mockUserContext,
      );
      expect(result).toEqual(mockMobileTokensResponse);
    });
  });
});
