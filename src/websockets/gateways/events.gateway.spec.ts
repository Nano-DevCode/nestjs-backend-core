import { EventsGateway } from './events.gateway';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

describe('EventsGateway', () => {
  let gateway: EventsGateway;

  const mockClient = {
    id: 'socket-test-123',
  } as unknown as AuthenticatedSocket;

  const mockUser: UserAuthContext = {
    id: 'user-id-456',
    email: 'admin@example.com',
    roles: ['admin'],
    permissions: ['*'],
    isTwoFactorEnabled: true,
  };

  beforeEach(() => {
    gateway = new EventsGateway();
    gateway.server = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    } as any;
  });

  it('should handle client connection without error', () => {
    expect(() => gateway.handleConnection(mockClient)).not.toThrow();
  });

  it('should handle client disconnection without error', () => {
    expect(() => gateway.handleDisconnect(mockClient)).not.toThrow();
  });

  it('should handle public ping and return pong with socketId', () => {
    const result = gateway.handlePublicPing(mockClient);

    expect(result).toEqual({
      event: 'public_pong',
      data: {
        time: expect.any(Number),
        socketId: 'socket-test-123',
      },
    });
  });

  it('should handle whoami and return user details', () => {
    const result = gateway.handleWhoAmI(mockUser);

    expect(result).toEqual({
      event: 'whoami_response',
      data: {
        id: 'user-id-456',
        email: 'admin@example.com',
        roles: ['admin'],
        permissions: ['*'],
        isTwoFactorEnabled: true,
      },
    });
  });

  it('should handle admin broadcast event', () => {
    const result = gateway.handleAdminBroadcast(mockUser, {
      message: 'System update in 5 minutes',
    });

    expect(result).toEqual({
      event: 'broadcast_received',
      data: {
        sender: 'admin@example.com',
        message: 'System update in 5 minutes',
      },
    });
  });

  it('should handle file subscription event', () => {
    const result = gateway.handleFileSubscription(mockUser);

    expect(result).toEqual({
      event: 'subscription_success',
      data: {
        channel: 'files',
        user: 'admin@example.com',
      },
    });
  });

  it('should handle critical operation event under 2FA', () => {
    const result = gateway.handleCriticalOperation(mockUser);

    expect(result).toEqual({
      event: 'critical_ack',
      data: {
        success: true,
        message: expect.stringContaining('admin@example.com'),
      },
    });
  });

  it('should handle beta stream event conditioned by feature flag', () => {
    const result = gateway.handleBetaStream(mockUser);

    expect(result).toEqual({
      event: 'beta_data',
      data: {
        feature: 'BETA_FEATURE',
        activeFor: 'admin@example.com',
      },
    });
  });
});
