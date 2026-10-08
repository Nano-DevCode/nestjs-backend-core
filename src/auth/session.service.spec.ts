import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { UserAuthContext } from './interfaces/auth.interface';

describe('SessionService', () => {
  let service: SessionService;
  let redisMock: {
    type: jest.Mock;
    del: jest.Mock;
    pipeline: jest.Mock;
    exists: jest.Mock;
    eval: jest.Mock;
    zrem: jest.Mock;
    zrange: jest.Mock;
    zremrangebyscore: jest.Mock;
    smembers: jest.Mock;
    set: jest.Mock;
    get: jest.Mock;
  };
  let pipelineMock: {
    set: jest.Mock;
    zremrangebyscore: jest.Mock;
    zadd: jest.Mock;
    expire: jest.Mock;
    del: jest.Mock;
    zrem: jest.Mock;
    exec: jest.Mock;
  };

  beforeEach(async () => {
    pipelineMock = {
      set: jest.fn().mockReturnThis(),
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      zrem: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    redisMock = {
      type: jest.fn().mockResolvedValue('zset'),
      del: jest.fn().mockResolvedValue(1),
      pipeline: jest.fn().mockReturnValue(pipelineMock),
      exists: jest.fn().mockResolvedValue(1),
      eval: jest.fn(),
      zrem: jest.fn().mockResolvedValue(1),
      zrange: jest.fn().mockResolvedValue(['token-1', 'token-2']),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      smembers: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  describe('setSession y hasSession', () => {
    it('debe registrar la sesión activa en Redis usando pipeline', async () => {
      await service.setSession('user-1', 'token-123', 3600);

      expect(redisMock.pipeline).toHaveBeenCalled();
      expect(pipelineMock.set).toHaveBeenCalledWith(
        'session:user-1:token-123',
        'active',
        'EX',
        3600,
      );
      expect(pipelineMock.exec).toHaveBeenCalled();
    });

    it('debe verificar si la sesión existe en Redis', async () => {
      redisMock.exists.mockResolvedValue(1);
      const exists = await service.hasSession('user-1', 'token-123');
      expect(exists).toBe(true);

      redisMock.exists.mockResolvedValue(0);
      const notExists = await service.hasSession('user-1', 'token-456');
      expect(notExists).toBe(false);
    });
  });

  describe('validateAndRotateToken', () => {
    it('debe rotar el token exitosamente (status 1)', async () => {
      redisMock.eval.mockResolvedValue([1, 'new-token']);

      const result = await service.validateAndRotateToken(
        'user-1',
        'old-token',
        'new-token',
        3600,
      );

      expect(result.success).toBe(true);
      expect(result.isReuse).toBe(false);
      expect(result.activeTokenId).toBe('new-token');
      expect(redisMock.zrem).toHaveBeenCalledWith(
        'user_sessions:user-1',
        'old-token',
      );
    });

    it('debe permitir concurrencia dentro de la ventana de gracia (status 2)', async () => {
      redisMock.eval.mockResolvedValue([2, 'active-grace-token']);

      const result = await service.validateAndRotateToken(
        'user-1',
        'old-token',
        'new-token',
        3600,
      );

      expect(result.success).toBe(true);
      expect(result.isReuse).toBe(false);
      expect(result.activeTokenId).toBe('active-grace-token');
    });

    it('debe detectar reúso malicioso o token inválido (status 0)', async () => {
      redisMock.eval.mockResolvedValue([0, '']);

      const result = await service.validateAndRotateToken(
        'user-1',
        'reused-token',
        'new-token',
        3600,
      );

      expect(result.success).toBe(false);
      expect(result.isReuse).toBe(true);
    });
  });

  describe('revokeSession y revokeAllUserSessions', () => {
    it('debe revocar sesión individual eliminando claves de Redis', async () => {
      await service.revokeSession('user-1', 'token-123');

      expect(pipelineMock.del).toHaveBeenCalledWith('session:user-1:token-123');
      expect(pipelineMock.del).toHaveBeenCalledWith(
        'session_rotated:user-1:token-123',
      );
      expect(pipelineMock.zrem).toHaveBeenCalledWith(
        'user_sessions:user-1',
        'token-123',
      );
      expect(pipelineMock.exec).toHaveBeenCalled();
    });

    it('debe revocar todas las sesiones del usuario', async () => {
      redisMock.type.mockResolvedValue('zset');
      redisMock.zrange.mockResolvedValue(['tok-1', 'tok-2']);

      await service.revokeAllUserSessions('user-1');

      expect(redisMock.del).toHaveBeenCalledWith(
        'session:user-1:tok-1',
        'session_rotated:user-1:tok-1',
        'session:user-1:tok-2',
        'session_rotated:user-1:tok-2',
        'user_sessions:user-1',
      );
    });
  });

  describe('blacklistToken y isTokenBlacklisted', () => {
    it('debe guardar token en lista negra si ttlSeconds > 0', async () => {
      await service.blacklistToken('jti-abc', 600);

      expect(redisMock.set).toHaveBeenCalledWith(
        'blacklist:jwt:jti-abc',
        'revoked',
        'EX',
        600,
      );
    });

    it('no debe llamar a Redis si ttlSeconds <= 0', async () => {
      await service.blacklistToken('jti-abc', 0);
      expect(redisMock.set).not.toHaveBeenCalled();
    });

    it('debe comprobar si un token está en la lista negra', async () => {
      redisMock.exists.mockResolvedValue(1);
      expect(await service.isTokenBlacklisted('jti-abc')).toBe(true);

      redisMock.exists.mockResolvedValue(0);
      expect(await service.isTokenBlacklisted('jti-xyz')).toBe(false);
    });
  });

  describe('cacheUserAuthContext y getCachedUserAuthContext', () => {
    const mockContext: UserAuthContext = {
      id: 'u-1',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['read:data'],
      isTwoFactorEnabled: false,
    };

    it('debe almacenar y recuperar el contexto de autenticación en caché', async () => {
      await service.cacheUserAuthContext('u-1', mockContext, 60);

      expect(redisMock.set).toHaveBeenCalledWith(
        'auth:context:u-1',
        JSON.stringify(mockContext),
        'EX',
        60,
      );

      redisMock.get.mockResolvedValue(JSON.stringify(mockContext));
      const cached = await service.getCachedUserAuthContext('u-1');
      expect(cached).toEqual(mockContext);
    });

    it('debe invalidar la caché del usuario', async () => {
      await service.invalidateUserAuthCache('u-1');
      expect(redisMock.del).toHaveBeenCalledWith('auth:context:u-1');
    });
  });
});
