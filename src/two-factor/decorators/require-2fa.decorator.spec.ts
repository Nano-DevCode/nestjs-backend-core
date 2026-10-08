import {
  Require2FA,
  REQUIRE_2FA_KEY,
} from './require-2fa.decorator';

describe('Require2FA Decorator', () => {
  it('should set require2FA boolean true in metadata', () => {
    class TestController {
      @Require2FA()
      testEndpoint() {}
    }

    const metadata = Reflect.getMetadata(
      REQUIRE_2FA_KEY,
      TestController.prototype.testEndpoint,
    );

    expect(metadata).toBe(true);
  });
});

