import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { UserAuthContext } from './interfaces/auth.interface';
import { parseUserAgent, type ParsedUserAgent } from './utils/user-agent.util';

export interface RotationResult {
  success: boolean;
  isReuse: boolean;
  activeTokenId?: string;
}

export interface SessionMetadata {
  ip?: string;
  userAgent?: string;
}

export interface UserSessionInfo extends ParsedUserAgent {
  sessionId: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

@Injectable()
export class SessionService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async setSession(
    userId: string,
    tokenId: string,
    ttlSeconds: number,
    metadata?: SessionMetadata,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const expireAt = now + ttlSeconds;
    const sessionKey = `session:${userId}:${tokenId}`;
    const userSessionsKey = `user_sessions:${userId}`;

    // Limpia clave previa si existía en formato legacy 'set'
    const keyType = await this.redis.type(userSessionsKey);
    if (keyType === 'set') {
      await this.redis.del(userSessionsKey);
    }

    const sessionPayload = JSON.stringify({
      sessionId: tokenId,
      userId,
      ip: metadata?.ip || 'Desconocida',
      userAgent: metadata?.userAgent || 'Desconocido',
      ...parseUserAgent(metadata?.userAgent),
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    });

    await this.redis
      .pipeline()
      .set(sessionKey, sessionPayload, 'EX', ttlSeconds)
      .zremrangebyscore(userSessionsKey, '-inf', now)
      .zadd(userSessionsKey, expireAt, tokenId)
      .expire(userSessionsKey, ttlSeconds)
      .exec();
  }

  async getUserSessions(
    userId: string,
    currentTokenId?: string,
  ): Promise<UserSessionInfo[]> {
    const userSessionsKey = `user_sessions:${userId}`;
    const now = Math.floor(Date.now() / 1000);
    await this.redis.zremrangebyscore(userSessionsKey, '-inf', now);
    const tokenIds = await this.redis.zrange(userSessionsKey, '0', '-1');

    if (!tokenIds || tokenIds.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    tokenIds.forEach((tid) => pipeline.get(`session:${userId}:${tid}`));
    const results = await pipeline.exec();

    const sessions: UserSessionInfo[] = [];

    tokenIds.forEach((tid, idx) => {
      const raw = results?.[idx]?.[1];
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          sessions.push({
            ...parsed,
            sessionId: tid,
            current: tid === currentTokenId,
          });
        } catch {
          // Fallback legacy 'active' string
          sessions.push({
            sessionId: tid,
            ip: 'Desconocida',
            userAgent: 'Desconocido',
            deviceType: 'unknown',
            browser: 'Desconocido',
            os: 'Desconocido',
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
            current: tid === currentTokenId,
          });
        }
      }
    });

    return sessions;
  }

  async revokeOtherUserSessions(
    userId: string,
    currentTokenId: string,
  ): Promise<number> {
    const userSessionsKey = `user_sessions:${userId}`;
    const tokenIds = await this.redis.zrange(userSessionsKey, '0', '-1');
    const toRemove = tokenIds.filter((tid) => tid !== currentTokenId);

    if (toRemove.length === 0) return 0;

    const pipeline = this.redis.pipeline();
    toRemove.forEach((tid) => {
      pipeline.del(`session:${userId}:${tid}`);
      pipeline.del(`session_rotated:${userId}:${tid}`);
      pipeline.zrem(userSessionsKey, tid);
      pipeline.set(`blacklist:jwt:${tid}`, 'revoked', 'EX', 86400 * 7);
    });
    await pipeline.exec();

    return toRemove.length;
  }

  async hasSession(userId: string, tokenId: string): Promise<boolean> {
    const exists = await this.redis.exists(`session:${userId}:${tokenId}`);
    return exists === 1;
  }

  async validateAndRotateToken(
    userId: string,
    currentTokenId: string,
    newTokenId: string,
    ttlSeconds: number,
    gracePeriodSeconds = 30,
  ): Promise<RotationResult> {
    const sessionKey = `session:${userId}:${currentTokenId}`;
    const rotatedKey = `session_rotated:${userId}:${currentTokenId}`;
    const userSessionsKey = `user_sessions:${userId}`;

    // Script Lua atómico:
    // Retorna:
    // [1, newTokenId]: Consumo exitoso de token activo y registro de rotación
    // [2, activeTokenId]: Token dentro de la ventana de gracia (concurrencia legítima)
    // [0, ""]: Reúso no autorizado o token inexistente
    const luaScript = `
      if redis.call('DEL', KEYS[1]) == 1 then
        redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
        return {1, ARGV[1]}
      else
        local graceTarget = redis.call('GET', KEYS[2])
        if graceTarget then
          return {2, graceTarget}
        else
          return {0, ''}
        end
      end
    `;

    const result = (await this.redis.eval(
      luaScript,
      2,
      sessionKey,
      rotatedKey,
      newTokenId,
      gracePeriodSeconds,
    )) as [number, string];

    const [status, activeTokenId] = result;

    if (status === 1) {
      await this.setSession(userId, newTokenId, ttlSeconds);
      await this.redis.zrem(userSessionsKey, currentTokenId);
      return { success: true, isReuse: false, activeTokenId: newTokenId };
    }

    if (status === 2) {
      return { success: true, isReuse: false, activeTokenId };
    }

    return { success: false, isReuse: true };
  }

  async revokeSession(userId: string, tokenId: string): Promise<void> {
    await this.redis
      .pipeline()
      .del(`session:${userId}:${tokenId}`)
      .del(`session_rotated:${userId}:${tokenId}`)
      .zrem(`user_sessions:${userId}`, tokenId)
      .exec();
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const userSessionsKey = `user_sessions:${userId}`;
    const now = Math.floor(Date.now() / 1000);

    let tokenIds: string[] = [];
    const keyType = await this.redis.type(userSessionsKey);
    if (keyType === 'zset') {
      await this.redis.zremrangebyscore(userSessionsKey, '-inf', now);
      tokenIds = await this.redis.zrange(userSessionsKey, '0', '-1');
    } else if (keyType === 'set') {
      tokenIds = await this.redis.smembers(userSessionsKey);
    }

    if (tokenIds.length > 0) {
      const keysToDelete = tokenIds.flatMap((tid) => [
        `session:${userId}:${tid}`,
        `session_rotated:${userId}:${tid}`,
      ]);
      keysToDelete.push(userSessionsKey);
      await this.redis.del(...keysToDelete);
    } else {
      await this.redis.del(userSessionsKey);
    }
  }

  async blacklistToken(identifier: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.set(
      `blacklist:jwt:${identifier}`,
      'revoked',
      'EX',
      ttlSeconds,
    );
  }

  async isTokenBlacklisted(identifier: string): Promise<boolean> {
    const exists = await this.redis.exists(`blacklist:jwt:${identifier}`);
    return exists === 1;
  }

  async getCachedUserAuthContext(
    userId: string,
  ): Promise<UserAuthContext | null> {
    try {
      const data = await this.redis.get(`auth:context:${userId}`);
      return data ? (JSON.parse(data) as UserAuthContext) : null;
    } catch {
      return null;
    }
  }

  async cacheUserAuthContext(
    userId: string,
    context: UserAuthContext,
    ttlSeconds = 60,
  ): Promise<void> {
    try {
      await this.redis.set(
        `auth:context:${userId}`,
        JSON.stringify(context),
        'EX',
        ttlSeconds,
      );
    } catch {
      // Fallback silencioso en caso de indisponibilidad temporal de Redis
    }
  }

  async invalidateUserAuthCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`auth:context:${userId}`);
    } catch {
      // Fallback silencioso
    }
  }
}
