import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { WsFeatureFlagGuard } from './ws-feature.guard';
import { FeatureFlagsService } from '../../features/feature-flags.service';

describe('WsFeatureFlagGuard', () => {
  let guard: WsFeatureFlagGuard;
  let reflector: jest.Mocked<Reflector>;
  let featureFlagsService: jest.Mocked<FeatureFlagsService>;

  const createMockContext = (client: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToWs: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue(client),
      }),
    } as unknown as ExecutionContext);

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    featureFlagsService = {
      isFeatureEnabled: jest.fn(),
    } as unknown as jest.Mocked<FeatureFlagsService>;

    guard = new WsFeatureFlagGuard(reflector, featureFlagsService);
  });

  it('should allow access if no feature flag is required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it('should allow access if required feature flag is enabled for user', async () => {
    reflector.getAllAndOverride.mockReturnValue('BETA_FEATURE');
    const client = {
      user: { id: 'u-1', roles: ['beta_tester'] },
    };
    const context = createMockContext(client);
    featureFlagsService.isFeatureEnabled.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isFeatureEnabled).toHaveBeenCalledWith(
      'BETA_FEATURE',
      { userId: 'u-1', role: 'beta_tester' },
    );
  });

  it('should throw WsException if required feature flag is disabled', async () => {
    reflector.getAllAndOverride.mockReturnValue('EXPERIMENTAL_WS');
    const client = {
      data: { user: { id: 'u-2', roles: ['user'] } },
    };
    const context = createMockContext(client);
    featureFlagsService.isFeatureEnabled.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Funcionalidad no disponible: La característica "EXPERIMENTAL_WS" se encuentra desactivada por Feature Flag.',
    );
  });
});
