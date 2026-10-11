import {
  Injectable,
  ExecutionContext,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { FeatureFlagKey } from '../../features/constants/feature-flags.constant';
import { FacebookStrategy } from '../strategies/facebook.strategy';

@Injectable()
export class FacebookOAuthGuard extends AuthGuard('facebook') {
  constructor(
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly facebookStrategy: FacebookStrategy,
  ) {
    super();
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

    const baseOptions: Record<string, unknown> = {};

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
    const isFacebookEnabled = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.OAUTH_FACEBOOK,
    );

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
