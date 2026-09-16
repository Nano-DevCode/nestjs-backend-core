import {
  Injectable,
  ExecutionContext,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { FacebookStrategy } from '../strategies/facebook.strategy';

@Injectable()
export class FacebookOAuthGuard extends AuthGuard('facebook') {
  constructor(
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly facebookStrategy: FacebookStrategy,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isMasterEnabled =
      await this.featureFlagsService.isFeatureEnabled('oauth_social_login');
    const isFacebookEnabled =
      await this.featureFlagsService.isFeatureEnabled('oauth_facebook');

    if (!isMasterEnabled || !isFacebookEnabled) {
      throw new NotFoundException(
        'El inicio de sesión con Facebook está actualmente deshabilitado en el sistema.',
      );
    }

    if (!this.facebookStrategy.isConfigured) {
      throw new BadRequestException(
        'Facebook OAuth no está configurado en el servidor (faltan FACEBOOK_APP_ID o FACEBOOK_APP_SECRET).',
      );
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
