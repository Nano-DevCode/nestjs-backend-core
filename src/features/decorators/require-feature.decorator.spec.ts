import {
  RequireFeature,
  REQUIRE_FEATURE_KEY,
} from './require-feature.decorator';

describe('RequireFeature Decorator', () => {
  it('should set feature key in metadata', () => {
    class TestController {
      @RequireFeature('BETA_ANALYTICS')
      testEndpoint() {}
    }

    const metadata = Reflect.getMetadata(
      REQUIRE_FEATURE_KEY,
      TestController.prototype.testEndpoint,
    );

    expect(metadata).toBe('BETA_ANALYTICS');
  });
});
