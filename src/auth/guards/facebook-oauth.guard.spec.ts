import { ExecutionContext, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FacebookOAuthGuard } from './facebook-oauth.guard';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { FacebookStrategy } from '../strategies/facebook.strategy';

describe('FacebookOAuthGuard', () => {
  let guard: FacebookOAuthGuard;
  let featureFlagsMock: { isFeatureEnabled: jest.Mock };
  let strategyMock: { isConfigured: boolean };

  const createMockContext = (query: Record<string, string> = {}): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ query }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    featureFlagsMock = {
      isFeatureEnabled: jest.fn().mockResolvedValue(true),
    };
    strategyMock = {
      isConfigured: true,
    };
    guard = new FacebookOAuthGuard(
      featureFlagsMock as unknown as FeatureFlagsService,
      strategyMock as unknown as FacebookStrategy,
    );
  });

  describe('canActivate', () => {
    it('debe lanzar NotFoundException si el Feature Flag está deshabilitado', async () => {
      featureFlagsMock.isFeatureEnabled.mockResolvedValueOnce(false);

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar BadRequestException si Facebook OAuth no está configurado en el servidor', async () => {
      strategyMock.isConfigured = false;

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe permitir autenticación si los Feature Flags y configuración son válidos', async () => {
      jest
        .spyOn(AuthGuard('facebook').prototype, 'canActivate')
        .mockResolvedValue(true);

      const result = await guard.canActivate(createMockContext());
      expect(result).toBe(true);
    });
  });

  describe('getAuthenticateOptions', () => {
    it('debe codificar platform y redirect_uri en el parámetro state si existen', () => {
      const context = createMockContext({
        redirect_uri: 'sistemaapp://oauth',
        platform: 'ios',
      });

      const options = guard.getAuthenticateOptions(context);
      expect(options).toHaveProperty('state');

      const decoded = JSON.parse(
        Buffer.from(options['state'] as string, 'base64url').toString('utf8'),
      );
      expect(decoded.redirectUri).toBe('sistemaapp://oauth');
      expect(decoded.platform).toBe('ios');
    });
  });
});
