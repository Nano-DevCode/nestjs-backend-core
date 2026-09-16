export interface OAuthUserProfile {
  provider: 'google' | 'facebook';
  providerId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  rawProfile?: Record<string, unknown>;
}
