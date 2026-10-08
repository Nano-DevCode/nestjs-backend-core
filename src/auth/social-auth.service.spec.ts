import { Test, TestingModule } from '@nestjs/testing';
import { SocialAuthService } from './social-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenService } from './auth-token.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import type { Request, Response } from 'express';
import type { OAuthUserProfile } from './interfaces/oauth-user-profile.interface';

describe('SocialAuthService', () => {
  let service: SocialAuthService;
  let prismaMock: {
    oAuthAccount: { findUnique: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    profile: { upsert: jest.Mock };
    role: { findFirst: jest.Mock };
  };
  let authTokenServiceMock: {
    createSessionAndCookies: jest.Mock;
    createMobileTokens: jest.Mock;
  };
  let twoFactorServiceMock: {
    createPendingChallenge: jest.Mock;
  };

  const mockProfile: OAuthUserProfile = {
    provider: 'google',
    providerId: 'google-123',
    email: 'oauth@example.com',
    firstName: 'OAuth',
    lastName: 'User',
    avatarUrl: 'https://avatar.url',
    emailVerified: true,
  };

  let mockRes: {
    redirect: jest.Mock;
    cookie: jest.Mock;
  };

  beforeEach(async () => {
    mockRes = {
      redirect: jest.fn(),
      cookie: jest.fn(),
    };

    prismaMock = {
      oAuthAccount: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      profile: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 'role-user' }),
      },
    };

    authTokenServiceMock = {
      createSessionAndCookies: jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        user: { id: 'u-1', email: 'oauth@example.com' },
      }),
      createMobileTokens: jest.fn().mockResolvedValue({
        accessToken: 'mock-mobile-access',
        refreshToken: 'mock-mobile-refresh',
        user: { id: 'u-1', email: 'oauth@example.com' },
      }),
    };

    twoFactorServiceMock = {
      createPendingChallenge: jest.fn().mockResolvedValue('temp-2fa-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthTokenService, useValue: authTokenServiceMock },
        { provide: TwoFactorService, useValue: twoFactorServiceMock },
      ],
    }).compile();

    service = module.get<SocialAuthService>(SocialAuthService);
  });

  describe('handleOAuthCallback', () => {
    it('debe redirigir a error si el perfil no contiene un correo electrónico', async () => {
      const invalidProfile = { ...mockProfile, email: '' };

      await service.handleOAuthCallback(invalidProfile, mockRes as unknown as Response);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login?error='),
      );
    });

    it('debe iniciar sesión y redirigir al frontend si la cuenta ya está federada', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue({
        id: 'oa-1',
        user: {
          id: 'user-1',
          email: 'oauth@example.com',
          isActive: true,
          deletedAt: null,
          emailVerifiedAt: new Date(),
          twoFactor: { isEnabled: false },
          roles: [],
        },
      });

      await service.handleOAuthCallback(mockProfile, mockRes as unknown as Response);

      expect(authTokenServiceMock.createSessionAndCookies).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login?oauth=success'),
      );
    });

    it('debe crear un nuevo usuario con perfil federado si no existe previamente', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'oauth@example.com',
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: new Date(),
        twoFactor: { isEnabled: false },
        roles: [],
      });

      await service.handleOAuthCallback(mockProfile, mockRes as unknown as Response);

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'oauth@example.com',
          }),
        }),
      );
      expect(authTokenServiceMock.createSessionAndCookies).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login?oauth=success'),
      );
    });

    it('debe redirigir al reto de 2FA si el usuario lo tiene habilitado', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue({
        id: 'oa-1',
        user: {
          id: 'user-1',
          email: 'oauth@example.com',
          isActive: true,
          deletedAt: null,
          emailVerifiedAt: new Date(),
          twoFactor: { isEnabled: true },
          roles: [],
        },
      });

      await service.handleOAuthCallback(mockProfile, mockRes as unknown as Response);

      expect(twoFactorServiceMock.createPendingChallenge).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login?require2FA=true'),
      );
    });

    it('debe soportar redirección móvil mediante deep link si se provee en state', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue({
        id: 'oa-1',
        user: {
          id: 'user-1',
          email: 'oauth@example.com',
          isActive: true,
          deletedAt: null,
          emailVerifiedAt: new Date(),
          twoFactor: { isEnabled: false },
          roles: [],
        },
      });

      const stateJson = JSON.stringify({ redirectUri: 'sistemaapp://oauth' });
      const stateBase64 = Buffer.from(stateJson).toString('base64url');
      const mockReq = {
        query: { state: stateBase64 },
      } as unknown as Request;

      await service.handleOAuthCallback(
        mockProfile,
        mockRes as unknown as Response,
        mockReq,
      );

      expect(authTokenServiceMock.createMobileTokens).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('sistemaapp://oauth?accessToken='),
      );
    });
  });
});

