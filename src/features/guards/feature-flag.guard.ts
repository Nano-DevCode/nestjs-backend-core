import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { FeatureFlagsService } from '../feature-flags.service';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';

interface RequestWithUser extends Request {
  user?: {
    id?: string;
    roles?: string[];
  };
}

@Injectable()
export class FeatureFlagGuard implements CanActivate {
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

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    const isEnabled = await this.featureFlagsService.isFeatureEnabled(
      featureKey,
      {
        userId: user?.id,
        role: Array.isArray(user?.roles) ? user.roles[0] : undefined,
      },
    );

    if (!isEnabled) {
      throw new NotFoundException('Feature not found or disabled');
    }

    return true;
  }
}
