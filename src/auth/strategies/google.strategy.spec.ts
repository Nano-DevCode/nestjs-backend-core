import { GoogleStrategy } from './google.strategy';
import type { Profile } from 'passport-google-oauth20';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should initialize with configured=true when env vars are present', () => {
    process.env.GOOGLE_CLIENT_ID = 'my-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'my-client-secret';

    strategy = new GoogleStrategy();

    expect(strategy.isConfigured).toBe(true);
  });

  it('should initialize in resilient dummy mode when credentials are missing', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    strategy = new GoogleStrategy();

    expect(strategy.isConfigured).toBe(false);
  });

  it('should validate and map profile data correctly to OAuthUserProfile', () => {
    strategy = new GoogleStrategy();

    const mockProfile: Profile = {
      id: 'google-uid-123',
      displayName: 'Jane Doe',
      name: {
        givenName: 'Jane',
        familyName: 'Doe',
      },
      emails: [{ value: 'jane@example.com', verified: true } as any],
      photos: [{ value: 'https://photo.url/jane.jpg' }],
      provider: 'google',
      _raw: '',
      _json: { email_verified: true },
    };

    const doneMock = jest.fn();

    strategy.validate('acc-tok', 'ref-tok', mockProfile, doneMock);

    expect(doneMock).toHaveBeenCalledWith(null, {
      provider: 'google',
      providerId: 'google-uid-123',
      email: 'jane@example.com',
      emailVerified: true,
      firstName: 'Jane',
      lastName: 'Doe',
      avatarUrl: 'https://photo.url/jane.jpg',
      rawProfile: { email_verified: true },
    });
  });

  it('should handle profile without emails or name gracefully', () => {
    strategy = new GoogleStrategy();

    const mockProfile: Profile = {
      id: 'google-uid-456',
      displayName: 'Anonymous',
      provider: 'google',
      _raw: '',
      _json: {},
    };

    const doneMock = jest.fn();

    strategy.validate('acc-tok', 'ref-tok', mockProfile, doneMock);

    expect(doneMock).toHaveBeenCalledWith(null, expect.objectContaining({
      provider: 'google',
      providerId: 'google-uid-456',
      email: '',
      emailVerified: false,
    }));
  });
});

