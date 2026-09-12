import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { REQUIRE_FEATURE_KEY } from '../../features/decorators/require-feature.decorator';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

@Injectable()
export class WsFeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!featureKey) {
      return true;
    }

    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const user = client.data?.user ?? client.user;

    const isEnabled = await this.featureFlagsService.isFeatureEnabled(
      featureKey,
      {
        userId: user?.id,
        role: Array.isArray(user?.roles) ? user.roles[0] : undefined,
      },
    );

    if (!isEnabled) {
      throw new WsException(
        `Funcionalidad no disponible: La característica "${featureKey}" se encuentra desactivada por Feature Flag.`,
      );
    }

    return true;
  }
}
