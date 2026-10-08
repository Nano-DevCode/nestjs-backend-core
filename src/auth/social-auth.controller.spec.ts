import { Test, TestingModule } from '@nestjs/testing';
import { SocialAuthController } from './social-auth.controller';
import { SocialAuthService } from './social-auth.service';
import { FeatureFlagsService } from '../features/feature-flags.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import type { Request, Response } from 'express';
import type { OAuthUserProfile } from './interfaces/oauth-user-profile.interface';

describe('SocialAuthController', () => {
  let controller: SocialAuthController;
  let socialAuthServiceMock: {
    handleOAuthCallback: jest.Mock;
  };

  const mockUser: OAuthUserProfile = {
    provider: 'google',
    providerId: '12345',
    email: 'test@example.com',
  };

  const mockRes = { redirect: jest.fn() } as unknown as Response;
  const mockReq = { user: mockUser } as unknown as Request & { user: OAuthUserProfile };

  beforeEach(async () => {
    socialAuthServiceMock = {
      handleOAuthCallback: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialAuthController],
      providers: [
        { provide: SocialAuthService, useValue: socialAuthServiceMock },
        { provide: FeatureFlagsService, useValue: { isFeatureEnabled: jest.fn().mockResolvedValue(true) } },
        { provide: GoogleStrategy, useValue: { isConfigured: true } },
        { provide: FacebookStrategy, useValue: { isConfigured: true } },
      ],
    }).compile();

    controller = module.get<SocialAuthController>(SocialAuthController);
  });

  describe('googleAuthCallback', () => {
    it('debe invocar handleOAuthCallback con el usuario y la respuesta', async () => {
      await controller.googleAuthCallback(mockReq, mockRes);
      expect(socialAuthServiceMock.handleOAuthCallback).toHaveBeenCalledWith(
        mockUser,
        mockRes,
        mockReq,
      );
    });
  });

  describe('facebookAuthCallback', () => {
    it('debe invocar handleOAuthCallback con el usuario y la respuesta', async () => {
      await controller.facebookAuthCallback(mockReq, mockRes);
      expect(socialAuthServiceMock.handleOAuthCallback).toHaveBeenCalledWith(
        mockUser,
        mockRes,
        mockReq,
      );
    });
  });
});
