import { FacebookStrategy } from './facebook.strategy';
import type { Profile } from 'passport-facebook';

describe('FacebookStrategy', () => {
  let strategy: FacebookStrategy;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should initialize with configured=true when env vars are present', () => {
    process.env.FACEBOOK_APP_ID = 'fb-app-123';
    process.env.FACEBOOK_APP_SECRET = 'fb-sec-456';

    strategy = new FacebookStrategy();

    expect(strategy.isConfigured).toBe(true);
  });

  it('should initialize in resilient dummy mode when credentials are missing', () => {
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;

    strategy = new FacebookStrategy();

    expect(strategy.isConfigured).toBe(false);
  });

  it('should validate and map facebook profile correctly', () => {
    strategy = new FacebookStrategy();

    const mockProfile: Profile = {
      id: 'fb-user-999',
      displayName: 'John Smith',
      name: {
        givenName: 'John',
        familyName: 'Smith',
      },
      emails: [{ value: 'john@example.com' }],
      photos: [{ value: 'https://fb.com/pic.jpg' }],
      provider: 'facebook',
      _raw: '',
      _json: { id: 'fb-user-999' },
    };

    const doneMock = jest.fn();

    strategy.validate('acc-tok', 'ref-tok', mockProfile, doneMock);

    expect(doneMock).toHaveBeenCalledWith(null, {
      provider: 'facebook',
      providerId: 'fb-user-999',
      email: 'john@example.com',
      emailVerified: true,
      firstName: 'John',
      lastName: 'Smith',
      avatarUrl: 'https://fb.com/pic.jpg',
      rawProfile: { id: 'fb-user-999' },
    });
  });

  it('should handle facebook profile without email', () => {
    strategy = new FacebookStrategy();

    const mockProfile: Profile = {
      id: 'fb-user-no-email',
      displayName: 'No Email User',
      provider: 'facebook',
      _raw: '',
      _json: {},
    };

    const doneMock = jest.fn();

    strategy.validate('acc-tok', 'ref-tok', mockProfile, doneMock);

    expect(doneMock).toHaveBeenCalledWith(null, expect.objectContaining({
      provider: 'facebook',
      providerId: 'fb-user-no-email',
      email: '',
      emailVerified: false,
    }));
  });
});

