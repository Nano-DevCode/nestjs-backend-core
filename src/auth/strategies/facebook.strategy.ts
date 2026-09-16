import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import type { OAuthUserProfile } from '../interfaces/oauth-user-profile.interface';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  private readonly logger = new Logger(FacebookStrategy.name);
  public readonly isConfigured: boolean;

  constructor() {
    const clientID = process.env.FACEBOOK_APP_ID;
    const clientSecret = process.env.FACEBOOK_APP_SECRET;
    const callbackURL =
      process.env.FACEBOOK_CALLBACK_URL ||
      'https://sistema.nano-service.com/api/auth/facebook/callback';

    const isConfigured = Boolean(clientID && clientSecret);

    super({
      clientID: clientID || 'dummy-facebook-app-id',
      clientSecret: clientSecret || 'dummy-facebook-app-secret',
      callbackURL,
      scope: ['email'],
      profileFields: ['id', 'emails', 'name', 'photos'],
    });

    this.isConfigured = isConfigured;
    if (!isConfigured) {
      this.logger.warn(
        'Facebook OAuth no está configurado (FACEBOOK_APP_ID o FACEBOOK_APP_SECRET ausentes). La estrategia inició en modo resiliente con valores dummy.',
      );
    }
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: OAuthUserProfile) => void,
  ): void {
    const email = profile.emails?.[0]?.value;
    const emailVerified = Boolean(email);

    const userProfile: OAuthUserProfile = {
      provider: 'facebook',
      providerId: profile.id,
      email: email || '',
      emailVerified,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      avatarUrl: profile.photos?.[0]?.value,
      rawProfile: profile._json as Record<string, unknown>,
    };

    done(null, userProfile);
  }
}
