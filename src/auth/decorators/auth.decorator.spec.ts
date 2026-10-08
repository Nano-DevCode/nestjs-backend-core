import {
  Roles,
  ROLES_KEY,
  RequirePermissions,
  PERMISSIONS_KEY,
  Public,
  IS_PUBLIC_KEY,
} from './auth.decorator';

describe('Auth Decorators', () => {
  it('Roles should attach roles array to metadata', () => {
    class TestController {
      @Roles('admin', 'editor')
      testEndpoint() {}
    }

    const metadata = Reflect.getMetadata(
      ROLES_KEY,
      TestController.prototype.testEndpoint,
    );
    expect(metadata).toEqual(['admin', 'editor']);
  });

  it('RequirePermissions should attach permissions array to metadata', () => {
    class TestController {
      @RequirePermissions('users:create', 'users:delete')
      testEndpoint() {}
    }

    const metadata = Reflect.getMetadata(
      PERMISSIONS_KEY,
      TestController.prototype.testEndpoint,
    );
    expect(metadata).toEqual(['users:create', 'users:delete']);
  });

  it('Public should set isPublic boolean flag in metadata', () => {
    class TestController {
      @Public()
      testEndpoint() {}
    }

    const metadata = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      TestController.prototype.testEndpoint,
    );
    expect(metadata).toBe(true);
  });
});

