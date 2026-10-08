import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtMobileAuthGuard } from './jwt-mobile-auth.guard';

describe('JwtMobileAuthGuard', () => {
  let guard: JwtMobileAuthGuard;
  let reflectorMock: {
    getAllAndOverride: jest.Mock;
  };

  const createMockContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };
    guard = new JwtMobileAuthGuard(reflectorMock as unknown as Reflector);
  });

  it('debe permitir acceso si la ruta es pública (@IsPublic)', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });
});

