import { ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

// Helper to extract the parameter decorator factory
function getParamDecoratorFactory(
  decorator: (...args: unknown[]) => ParameterDecorator,
) {
  class TestTarget {
    testMethod(@decorator() user: unknown) {
      return user;
    }
  }

  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestTarget,
    'testMethod',
  ) as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => unknown }
  >;
  const key = Object.keys(args)[0];
  return args[key].factory;
}

describe('CurrentUser Decorator', () => {
  const factory = getParamDecoratorFactory(CurrentUser);

  const mockUser: UserAuthContext = {
    id: 'user-123',
    email: 'test@example.com',
    roles: ['admin', 'user'],
    permissions: ['files.upload', 'files.read'],
    isTwoFactorEnabled: true,
  };

  function createMockContext(user?: UserAuthContext): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should return the entire user object when no property is provided', () => {
    const ctx = createMockContext(mockUser);
    const result = factory(undefined, ctx);
    expect(result).toEqual(mockUser);
  });

  it('should return only the requested property when provided', () => {
    const ctx = createMockContext(mockUser);
    expect(factory('id', ctx)).toBe('user-123');
    expect(factory('email', ctx)).toBe('test@example.com');
    expect(factory('roles', ctx)).toEqual(['admin', 'user']);
    expect(factory('permissions', ctx)).toEqual(['files.upload', 'files.read']);
    expect(factory('isTwoFactorEnabled', ctx)).toBe(true);
  });

  it('should throw InternalServerErrorException if request.user is undefined', () => {
    const ctx = createMockContext(undefined);
    expect(() => factory(undefined, ctx)).toThrow(InternalServerErrorException);
    expect(() => factory(undefined, ctx)).toThrow(
      'CurrentUserDecorator: request.user no está definido. Asegúrate de proteger la ruta con JwtAuthGuard antes de usar este decorador.',
    );
  });
});
