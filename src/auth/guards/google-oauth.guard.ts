import {
  Injectable,
  ExecutionContext,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { GoogleStrategy } from '../strategies/google.strategy';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly googleStrategy: GoogleStrategy,
  ) {
    super({
      prompt: 'select_account',
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isMasterEnabled =
      await this.featureFlagsService.isFeatureEnabled('oauth_social_login');
    const isGoogleEnabled =
      await this.featureFlagsService.isFeatureEnabled('oauth_google');

    if (!isMasterEnabled || !isGoogleEnabled) {
      throw new NotFoundException(
        'El inicio de sesión con Google está actualmente deshabilitado en el sistema.',
      );
    }

    if (!this.googleStrategy.isConfigured) {
      throw new BadRequestException(
        'Google OAuth no está configurado en el servidor (faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET).',
      );
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
