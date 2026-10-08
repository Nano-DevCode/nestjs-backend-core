import { JwtService } from '@nestjs/jwt';
import { NotificationGateway } from './notifications.gateway';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import type { AuthenticatedSocket } from '../websockets/interfaces/authenticated-socket.interface';

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let jwtService: jest.Mocked<JwtService>;
  let authService: jest.Mocked<AuthService>;
  let sessionService: jest.Mocked<SessionService>;

  const mockUser = {
    id: 'user-notif-1',
    email: 'notif@example.com',
    roles: ['user'],
    permissions: [],
    isTwoFactorEnabled: false,
  };

  let mockServer: any;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    authService = {
      getUserAuthContextById: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    sessionService = {
      isTokenBlacklisted: jest.fn(),
      getCachedUserAuthContext: jest.fn(),
    } as unknown as jest.Mocked<SessionService>;

    gateway = new NotificationGateway(jwtService, authService, sessionService);

    const mockNamespace = {
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: new Map([['s2', {}]]),
    };

    mockServer = {
      of: jest.fn().mockReturnValue(mockNamespace),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: {
        sockets: new Map([['s1', {}]]),
      },
    };

    gateway.server = mockServer;
  });

  describe('afterInit', () => {
    it('should configure namespaces and log initialization', () => {
      gateway.afterInit(mockServer);
      expect(mockServer.of).toHaveBeenCalledWith('/realtime/notifications');
    });
  });

  describe('handleConnection', () => {
    it('should join user room if client is authenticated via handshake auth token', async () => {
      const mockSocket = {
        id: 'sock-1',
        handshake: {
          auth: { token: 'Bearer valid.jwt.token' },
        },
        join: jest.fn(),
        data: {},
      } as unknown as AuthenticatedSocket;

      jwtService.verify.mockReturnValue({ sub: 'user-notif-1', jti: 'jti-1' });
      sessionService.isTokenBlacklisted.mockResolvedValue(false);
      sessionService.getCachedUserAuthContext.mockResolvedValue(mockUser as any);

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('user:user-notif-1');
      expect((mockSocket as any).user).toEqual(mockUser);
    });

    it('should handle unauthenticated connection gracefully without joining room', async () => {
      const mockSocket = {
        id: 'sock-anon',
        handshake: {},
        join: jest.fn(),
        data: {},
      } as unknown as AuthenticatedSocket;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.join).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should log disconnection without errors', () => {
      const mockSocket = { id: 'sock-dc' } as unknown as AuthenticatedSocket;
      expect(() => gateway.handleDisconnect(mockSocket)).not.toThrow();
    });
  });

  describe('handleManualAuth', () => {
    it('should return error if token is missing', async () => {
      const mockSocket = { id: 'sock-manual', join: jest.fn() } as unknown as AuthenticatedSocket;

      const result = await gateway.handleManualAuth(mockSocket, {});

      expect(result).toEqual({ success: false, message: 'Token no proporcionado' });
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should return error if token validation fails', async () => {
      const mockSocket = { id: 'sock-manual', join: jest.fn() } as unknown as AuthenticatedSocket;
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const result = await gateway.handleManualAuth(mockSocket, { token: 'bad-token' });

      expect(result).toEqual({ success: false, message: 'Token inválido o expirado' });
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should authenticate client and join room when token is valid', async () => {
      const mockSocket = {
        id: 'sock-manual',
        join: jest.fn(),
        data: {},
      } as unknown as AuthenticatedSocket;

      jwtService.verify.mockReturnValue({ sub: 'user-notif-1' });
      sessionService.isTokenBlacklisted.mockResolvedValue(false);
      sessionService.getCachedUserAuthContext.mockResolvedValue(null);
      authService.getUserAuthContextById.mockResolvedValue(mockUser as any);

      const result = await gateway.handleManualAuth(mockSocket, {
        token: 'Bearer valid-jwt',
      });

      expect(result).toEqual({
        success: true,
        user: { id: 'user-notif-1', email: 'notif@example.com' },
      });
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-notif-1');
    });
  });

  describe('sendToUser', () => {
    it('should emit notification to user room across root and notification namespaces', () => {
      const payload = { title: 'New Message', content: 'Hello' };

      gateway.sendToUser('user-notif-1', payload);

      expect(mockServer.to).toHaveBeenCalledWith('user:user-notif-1');
      expect(mockServer.emit).toHaveBeenCalledWith('notification', payload);
      expect(mockServer.emit).toHaveBeenCalledWith('notification:new', payload);
    });

    it('should do nothing if server is not set', () => {
      gateway.server = null as any;
      expect(() => gateway.sendToUser('user-1', {})).not.toThrow();
    });
  });

  describe('broadcastFeatureFlag', () => {
    it('should emit feature-flag:updated across all configured namespaces', () => {
      const flagPayload = {
        key: 'DARK_MODE',
        enabled: true,
        roles: ['user'],
        rollout: 100,
      };

      gateway.broadcastFeatureFlag(flagPayload);

      expect(mockServer.emit).toHaveBeenCalledWith('feature-flag:updated', flagPayload);
      expect(mockServer.of).toHaveBeenCalledWith('/realtime/notifications');
      expect(mockServer.of).toHaveBeenCalledWith('/realtime');
      expect(mockServer.of).toHaveBeenCalledWith('/realtime/discord-bot');
    });
  });

  describe('getConnectedSocketsCount', () => {
    it('should return total count of connected sockets across namespaces', () => {
      const count = gateway.getConnectedSocketsCount();
      expect(count).toBe(2);
    });

    it('should return 0 if server is null', () => {
      gateway.server = null as any;
      expect(gateway.getConnectedSocketsCount()).toBe(0);
    });
  });
});

