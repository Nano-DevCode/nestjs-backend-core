import { RedisClientProvider } from './redis.provider';
import { REDIS_CLIENT } from './redis.constants';

describe('RedisClientProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should provide REDIS_CLIENT token', () => {
    expect((RedisClientProvider as any).provide).toBe(REDIS_CLIENT);
  });

  it('should throw fatal error in production when REDIS_PASSWORD is not set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_PASSWORD;

    const factory = (RedisClientProvider as any).useFactory;
    expect(() => factory()).toThrow(
      'FATAL: REDIS_PASSWORD no está definido en entorno de producción.',
    );
  });

  it('should create redis instance in development or when password is provided', () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6379';

    const factory = (RedisClientProvider as any).useFactory;
    const client = factory();

    expect(client).toBeDefined();
    // Clean up redis client connection handle
    if (client && typeof client.disconnect === 'function') {
      client.disconnect();
    }
  });
});

