import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import type { OAuthUserProfile } from '../interfaces/oauth-user-profile.interface';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  public readonly isConfigured: boolean;

  constructor() {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL =
      process.env.GOOGLE_CALLBACK_URL ||
      'https://sistema.nano-service.com/api/auth/google/callback';

    const isConfigured = Boolean(clientID && clientSecret);

    super({
      clientID: clientID || 'dummy-google-client-id',
      clientSecret: clientSecret || 'dummy-google-client-secret',
      callbackURL,
      scope: ['email', 'profile'],
    });

    this.isConfigured = isConfigured;
    if (!isConfigured) {
      this.logger.warn(
        'Google OAuth no está configurado (GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET ausentes). La estrategia inició en modo resiliente con valores dummy.',
      );
    }
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const primaryEmail = profile.emails?.[0];
    const email = primaryEmail?.value || '';

    const rawProfile = profile._json as Record<string, unknown>;
    const emailVerifiedProp = (
      primaryEmail as { verified?: boolean | string } | undefined
    )?.verified;
    const emailVerified =
      emailVerifiedProp === true ||
      emailVerifiedProp === 'true' ||
      Boolean(rawProfile?.email_verified);

    const userProfile: OAuthUserProfile = {
      provider: 'google',
      providerId: profile.id,
      email,
      emailVerified,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      avatarUrl: profile.photos?.[0]?.value,
      rawProfile,
    };

    done(null, userProfile);
  }
}
