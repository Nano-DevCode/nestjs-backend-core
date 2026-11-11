import { sanitizeMetadata, REDACTED_VALUE } from './sanitize-metadata.util';

describe('sanitizeMetadata', () => {
  it('debe mantener valores primitivos inofensivos', () => {
    expect(sanitizeMetadata(null)).toBeNull();
    expect(sanitizeMetadata(undefined)).toBeUndefined();
    expect(sanitizeMetadata(42)).toBe(42);
    expect(sanitizeMetadata(true)).toBe(true);
    expect(sanitizeMetadata('simple string')).toBe('simple string');
  });

  it('debe enmascarar tokens Bearer dentro de cadenas', () => {
    const raw =
      'Header Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0';
    const sanitized = sanitizeMetadata(raw);
    expect(sanitized).toBe(`Header Authorization: Bearer ${REDACTED_VALUE}`);
  });

  it('debe enmascarar recursivamente claves sensibles en objetos simples y anidados', () => {
    const input = {
      user: {
        id: 'u1',
        name: 'Manuel',
        password: 'superSecretPassword123',
        currentPassword: 'oldSecretPassword',
        nested: {
          accessToken: 'token-value',
          refreshToken: 'refresh-token-value',
          apiKey: 'ak_live_xyz',
          secret: 'top_secret',
          creditCard: '4532-1234-5678-9012',
          cvv: '123',
        },
      },
      action: 'UPDATE_PROFILE',
    };

    const output = sanitizeMetadata(input) as typeof input;

    expect(output.user.name).toBe('Manuel');
    expect(output.user.password).toBe(REDACTED_VALUE);
    expect(output.user.currentPassword).toBe(REDACTED_VALUE);
    expect(output.user.nested.accessToken).toBe(REDACTED_VALUE);
    expect(output.user.nested.refreshToken).toBe(REDACTED_VALUE);
    expect(output.user.nested.apiKey).toBe(REDACTED_VALUE);
    expect(output.user.nested.secret).toBe(REDACTED_VALUE);
    expect(output.user.nested.creditCard).toBe(REDACTED_VALUE);
    expect(output.user.nested.cvv).toBe(REDACTED_VALUE);
    expect(output.action).toBe('UPDATE_PROFILE');
  });

  it('debe procesar arreglos y enmascarar objetos dentro de ellos', () => {
    const input = [
      { email: 'user@example.com', token: 'secret-token' },
      { role: 'admin', safe: true },
    ];

    const output = sanitizeMetadata(input) as Array<Record<string, unknown>>;

    expect(output[0].email).toBe('user@example.com');
    expect(output[0].token).toBe(REDACTED_VALUE);
    expect(output[1].role).toBe('admin');
  });

  it('debe proteger contra referencias circulares sin causar desbordamiento', () => {
    const circularObj: Record<string, unknown> = { name: 'safe' };
    circularObj.self = circularObj;

    const output = sanitizeMetadata(circularObj) as Record<string, unknown>;
    expect(output.name).toBe('safe');
    expect(output.self).toBe('[Circular Reference]');
  });
});
