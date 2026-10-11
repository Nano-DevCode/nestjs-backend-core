import {
  Injectable,
  ExecutionContext,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { FeatureFlagKey } from '../../features/constants/feature-flags.constant';
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

  override getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const redirectUri = req.query?.['redirect_uri'] as string | undefined;
    const platform = req.query?.['platform'] as string | undefined;

    const referer = req.headers?.referer as string | undefined;
    let webOrigin: string | undefined;
    if (referer) {
      try {
        webOrigin = new URL(referer).origin;
      } catch {
        // Fallback silencioso si el referer no es una URL parseable
      }
    }

    const effectiveRedirectUri = redirectUri || webOrigin;
    const effectivePlatform =
      platform ||
      (redirectUri && !redirectUri.startsWith('http') ? 'mobile' : 'web');

    const baseOptions: Record<string, unknown> = {
      prompt: 'select_account',
    };

    if (effectiveRedirectUri || platform) {
      const stateData = {
        redirectUri: effectiveRedirectUri,
        platform: effectivePlatform,
      };
      baseOptions['state'] = Buffer.from(JSON.stringify(stateData)).toString(
        'base64url',
      );
    }

    return baseOptions;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isMasterEnabled = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.OAUTH_SOCIAL_LOGIN,
    );
    const isGoogleEnabled = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.OAUTH_GOOGLE,
    );

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
