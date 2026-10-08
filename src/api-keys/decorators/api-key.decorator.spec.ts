import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import {
  RequireApiScope,
  API_KEY_SCOPES_KEY,
  CurrentApiKey,
} from './api-key.decorator';

describe('Api Key Decorators', () => {
  describe('RequireApiScope', () => {
    it('should attach required scopes to target metadata', () => {
      class TestController {
        @RequireApiScope('files:read', 'files:write')
        testRoute() {}
      }

      const metadata = Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        TestController.prototype.testRoute,
      );

      expect(metadata).toEqual(['files:read', 'files:write']);
    });
  });

  describe('CurrentApiKey', () => {
    it('should extract apiKey property from request', () => {
      class TestController {
        testRoute(@CurrentApiKey() _apiKey: any) {}
      }

      const metadata = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        TestController,
        'testRoute',
      );

      const key = Object.keys(metadata)[0];
      const factory = metadata[key].factory;

      const mockRequest = {
        apiKey: {
          id: 'key-1',
          name: 'Partner Key',
          scopes: ['files:read'],
        },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      const result = factory(null, mockContext);
      expect(result).toEqual(mockRequest.apiKey);
    });
  });
});
