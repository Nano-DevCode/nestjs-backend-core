import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { AuditContext, AuditMetadata } from './audit-context.decorator';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

function getParamDecoratorFactory(
  decorator: (...args: unknown[]) => ParameterDecorator,
) {
  class TestTarget {
    testMethod(@decorator() audit: AuditMetadata) {
      return audit;
    }
  }

  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestTarget,
    'testMethod',
  ) as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => AuditMetadata }
  >;
  const key = Object.keys(args)[0];
  return args[key].factory;
}

describe('AuditContext Decorator', () => {
  const factory = getParamDecoratorFactory(AuditContext);

  const mockUser: UserAuthContext = {
    id: 'user-456',
    email: 'audit@example.com',
    roles: ['admin'],
    permissions: ['files.upload'],
    isTwoFactorEnabled: false,
  };

  function createMockContext(
    req: Partial<Record<string, unknown>>,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  }

  it('should extract audit metadata accurately from authenticated request', () => {
    const ctx = createMockContext({
      user: mockUser,
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      method: 'POST',
      originalUrl: '/files/upload',
    });

    const result = factory(undefined, ctx);

    expect(result).toEqual({
      userId: 'user-456',
      ipAddress: '203.0.113.195',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      method: 'POST',
      endpoint: '/files/upload',
    });
  });

  it('should fallback to socket.remoteAddress if x-forwarded-for is not present', () => {
    const ctx = createMockContext({
      headers: {
        'user-agent': 'PostmanRuntime/7.29.2',
      },
      socket: {
        remoteAddress: '127.0.0.1',
      },
      method: 'DELETE',
      url: '/files/my-file.pdf',
    });

    const result = factory(undefined, ctx);

    expect(result.userId).toBeUndefined();
    expect(result.ipAddress).toBe('127.0.0.1');
    expect(result.userAgent).toBe('PostmanRuntime/7.29.2');
    expect(result.method).toBe('DELETE');
    expect(result.endpoint).toBe('/files/my-file.pdf');
  });

  it('should set ipAddress to unknown if no IP headers or socket available', () => {
    const ctx = createMockContext({
      headers: {},
      method: 'GET',
      url: '/api/health',
    });

    const result = factory(undefined, ctx);

    expect(result.ipAddress).toBe('unknown');
    expect(result.userAgent).toBeUndefined();
  });
});
