import { Reflector } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagsService } from '../feature-flags.service';

describe('FeatureFlagGuard', () => {
  let guard: FeatureFlagGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockFeatureFlagsService: { isFeatureEnabled: jest.Mock };

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    mockFeatureFlagsService = {
      isFeatureEnabled: jest.fn(),
    };

    guard = new FeatureFlagGuard(
      mockReflector,
      mockFeatureFlagsService as unknown as FeatureFlagsService,
    );
  });

  const createMockContext = (user?: { id?: string; roles?: string[] }) => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('debe permitir acceso si la ruta no tiene el decorador @RequireFeature', async () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(undefined);

    const result = await guard.canActivate(createMockContext());
    expect(result).toBe(true);
    expect(mockFeatureFlagsService.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it('debe permitir acceso si el flag está activo', async () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce('BETA_FEATURE');
    mockFeatureFlagsService.isFeatureEnabled.mockResolvedValueOnce(true);

    const context = createMockContext({ id: 'user-1', roles: ['admin'] });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockFeatureFlagsService.isFeatureEnabled).toHaveBeenCalledWith(
      'BETA_FEATURE',
      { userId: 'user-1', role: 'admin' },
    );
  });

  it('debe lanzar NotFoundException si el flag está apagado', async () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce('DISABLED_FEATURE');
    mockFeatureFlagsService.isFeatureEnabled.mockResolvedValueOnce(false);

    const context = createMockContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      new NotFoundException('Feature not found or disabled'),
    );
  });
});
