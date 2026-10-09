import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import type { UserAuthContext } from './interfaces/auth.interface';

describe('SessionController', () => {
  let controller: SessionController;
  let mockSessionService: jest.Mocked<SessionService>;

  const mockUser: UserAuthContext = {
    id: 'user-123',
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
    isTwoFactorEnabled: false,
  };

  beforeEach(() => {
    mockSessionService = {
      getUserSessions: jest.fn(),
      revokeOtherUserSessions: jest.fn(),
      revokeSession: jest.fn(),
      blacklistToken: jest.fn(),
    } as unknown as jest.Mocked<SessionService>;

    controller = new SessionController(mockSessionService);
  });

  describe('getActiveSessions', () => {
    it('should return all active sessions for current user', async () => {
      const mockSessions = [
        {
          sessionId: 'jti-1',
          ip: '192.168.1.1',
          userAgent: 'Chrome on Windows',
          deviceType: 'desktop' as const,
          browser: 'Google Chrome',
          os: 'Windows 10/11',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          current: true,
        },
      ];
      mockSessionService.getUserSessions.mockResolvedValue(mockSessions);

      const req: any = { user: { jti: 'jti-1' } };
      const result = await controller.getActiveSessions(mockUser, req);

      expect(result).toEqual(mockSessions);
      expect(mockSessionService.getUserSessions).toHaveBeenCalledWith('user-123', 'jti-1');
    });
  });

  describe('revokeOtherSessions', () => {
    it('should revoke all other sessions except current', async () => {
      mockSessionService.revokeOtherUserSessions.mockResolvedValue(2);

      const req: any = { user: { jti: 'jti-current' } };
      const result = await controller.revokeOtherSessions(mockUser, req);

      expect(result).toEqual({
        message: 'Se han cerrado 2 sesión(es) en otros dispositivos.',
        revokedCount: 2,
      });
      expect(mockSessionService.revokeOtherUserSessions).toHaveBeenCalledWith('user-123', 'jti-current');
    });
  });

  describe('revokeSession', () => {
    it('should revoke and blacklist target session', async () => {
      mockSessionService.revokeSession.mockResolvedValue(undefined);
      mockSessionService.blacklistToken.mockResolvedValue(undefined);

      const result = await controller.revokeSession(mockUser, 'jti-target');

      expect(result).toEqual({
        message: "Sesión 'jti-target' cerrada y revocada exitosamente.",
      });
      expect(mockSessionService.revokeSession).toHaveBeenCalledWith('user-123', 'jti-target');
      expect(mockSessionService.blacklistToken).toHaveBeenCalledWith('jti-target', 86400 * 7);
    });
  });
});

