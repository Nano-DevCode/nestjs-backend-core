import { ExecutionContext, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GoogleOAuthGuard } from './google-oauth.guard';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { GoogleStrategy } from '../strategies/google.strategy';

describe('GoogleOAuthGuard', () => {
  let guard: GoogleOAuthGuard;
  let featureFlagsMock: { isFeatureEnabled: jest.Mock };
  let strategyMock: { isConfigured: boolean };

  const createMockContext = (query: Record<string, string> = {}): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ query }),
        getResponse: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    featureFlagsMock = {
      isFeatureEnabled: jest.fn().mockResolvedValue(true),
    };
    strategyMock = {
      isConfigured: true,
    };
    guard = new GoogleOAuthGuard(
      featureFlagsMock as unknown as FeatureFlagsService,
      strategyMock as unknown as GoogleStrategy,
    );
  });

  describe('canActivate', () => {
    it('debe lanzar NotFoundException si el Feature Flag está deshabilitado', async () => {
      featureFlagsMock.isFeatureEnabled.mockResolvedValue(false);

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar BadRequestException si Google OAuth no está configurado en el servidor', async () => {
      strategyMock.isConfigured = false;

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe permitir autenticación si los Feature Flags y configuración son válidos', async () => {
      jest
        .spyOn(AuthGuard('google').prototype, 'canActivate')
        .mockResolvedValue(true);

      const result = await guard.canActivate(createMockContext());
      expect(result).toBe(true);
    });
  });

  describe('getAuthenticateOptions', () => {
    it('debe codificar platform y redirect_uri en el parámetro state si existen', () => {
      const context = createMockContext({
        redirect_uri: 'sistemaapp://oauth',
        platform: 'android',
      });

      const options = guard.getAuthenticateOptions(context);
      expect(options).toHaveProperty('state');

      const decoded = JSON.parse(
        Buffer.from(options['state'] as string, 'base64url').toString('utf8'),
      );
      expect(decoded.redirectUri).toBe('sistemaapp://oauth');
      expect(decoded.platform).toBe('android');
    });
  });
});
