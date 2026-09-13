import { CustomThrottlerGuard } from './custom-throttler.guard';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import type { Reflector } from '@nestjs/core';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;

  beforeEach(() => {
    // Instanciar el guard con dependencias simuladas
    guard = new CustomThrottlerGuard(
      {} as unknown as ThrottlerModuleOptions,
      {} as unknown as ThrottlerStorage,
      {} as unknown as Reflector,
    );
  });

  it('should track by user id if req.user is present', async () => {
    const req = { user: { id: 'usr-123' } };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('user:usr-123');
  });

  it('should track by token signature if Bearer authorization header is present and user is missing', async () => {
    const req = {
      headers: {
        authorization: 'Bearer header.payload.signature123',
      },
    };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('token:signature123');
  });

  it('should fallback to x-forwarded-for first IP if unauthenticated', async () => {
    const req = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18',
      },
    };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:203.0.113.195');
  });

  it('should fallback to req.ip if no forwarded header', async () => {
    const req = {
      ip: '192.168.1.50',
    };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:192.168.1.50');
  });

  it('should fallback to socket.remoteAddress if req.ip is not available', async () => {
    const req = {
      socket: { remoteAddress: '10.0.0.1' },
    };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('should fallback to unknown if no IP is found', async () => {
    const req = {};
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:unknown');
  });
});
