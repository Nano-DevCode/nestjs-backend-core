import { ExecutionContext } from '@nestjs/common';
const ROUTE_ARGS_METADATA = '__routeArguments__';
import { WsException } from '@nestjs/websockets';
import {
  WsCurrentUser,
  WsClient,
  WsPayload,
  WsRoles,
  WsPermissions,
  WsRequire2FA,
  WsRequireFeature,
  WsPublic,
} from './index';
import {
  ROLES_KEY,
  PERMISSIONS_KEY,
  IS_PUBLIC_KEY,
} from '../../auth/decorators/auth.decorator';
import { REQUIRE_2FA_KEY } from '../../two-factor/decorators/require-2fa.decorator';
import { REQUIRE_FEATURE_KEY } from '../../features/decorators/require-feature.decorator';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

function getParamDecoratorFactory(
  decorator: (...args: unknown[]) => ParameterDecorator,
) {
  class TestTarget {
    testMethod(@decorator() param: unknown) {
      return param;
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

describe('WebSocket Decorators', () => {
  const mockUser: UserAuthContext = {
    id: 'ws-user-123',
    email: 'ws@example.com',
    roles: ['admin'],
    permissions: ['files.read'],
    isTwoFactorEnabled: true,
  };

  const mockClient = {
    id: 'socket-abc-123',
    data: { user: mockUser },
  };

  function createMockWsContext(
    client: unknown,
    data?: unknown,
  ): ExecutionContext {
    return {
      switchToWs: () => ({
        getClient: () => client,
        getData: () => data,
      }),
    } as unknown as ExecutionContext;
  }

  describe('@WsCurrentUser', () => {
    const factory = getParamDecoratorFactory(WsCurrentUser);

    it('debe retornar el usuario completo cuando no se pasa propiedad', () => {
      const ctx = createMockWsContext(mockClient);
      expect(factory(undefined, ctx)).toEqual(mockUser);
    });

    it('debe retornar la propiedad específica cuando se solicita', () => {
      const ctx = createMockWsContext(mockClient);
      expect(factory('email', ctx)).toBe('ws@example.com');
      expect(factory('id', ctx)).toBe('ws-user-123');
    });

    it('debe lanzar WsException si el socket no tiene usuario autenticado', () => {
      const ctx = createMockWsContext({ data: {} });
      expect(() => factory(undefined, ctx)).toThrow(WsException);
    });
  });

  describe('@WsClient', () => {
    const factory = getParamDecoratorFactory(WsClient);

    it('debe retornar la instancia del socket cliente', () => {
      const ctx = createMockWsContext(mockClient);
      expect(factory(undefined, ctx)).toBe(mockClient);
    });
  });

  describe('@WsPayload', () => {
    const factory = getParamDecoratorFactory(WsPayload);

    it('debe retornar la data completa del mensaje', () => {
      const payload = { room: 'dev', text: 'hola' };
      const ctx = createMockWsContext(mockClient, payload);
      expect(factory(undefined, ctx)).toEqual(payload);
    });

    it('debe retornar una propiedad específica del payload', () => {
      const payload = { room: 'dev', text: 'hola' };
      const ctx = createMockWsContext(mockClient, payload);
      expect(factory('room', ctx)).toBe('dev');
    });
  });

  describe('Decoradores de Metadatos WebSocket', () => {
    class DummyTarget {
      @WsRoles('admin', 'operator')
      @WsPermissions('files.read', 'files.upload')
      @WsRequire2FA()
      @WsRequireFeature('REALTIME_NOTIFICATIONS')
      @WsPublic()
      dummyMethod() {}
    }

    const instance = new DummyTarget();

    it('@WsRoles debe configurar los roles en ROLES_KEY', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, instance.dummyMethod);
      expect(roles).toEqual(['admin', 'operator']);
    });

    it('@WsPermissions debe configurar los permisos en PERMISSIONS_KEY', () => {
      const perms = Reflect.getMetadata(PERMISSIONS_KEY, instance.dummyMethod);
      expect(perms).toEqual(['files.read', 'files.upload']);
    });

    it('@WsRequire2FA debe activar REQUIRE_2FA_KEY en true', () => {
      const require2FA = Reflect.getMetadata(
        REQUIRE_2FA_KEY,
        instance.dummyMethod,
      );
      expect(require2FA).toBe(true);
    });

    it('@WsRequireFeature debe asignar la clave en REQUIRE_FEATURE_KEY', () => {
      const featureKey = Reflect.getMetadata(
        REQUIRE_FEATURE_KEY,
        instance.dummyMethod,
      );
      expect(featureKey).toBe('REALTIME_NOTIFICATIONS');
    });

    it('@WsPublic debe asignar IS_PUBLIC_KEY en true', () => {
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, instance.dummyMethod);
      expect(isPublic).toBe(true);
    });
  });
});
