import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { GuildQueue } from '../queue/guild-queue.model';

export interface TwitchSongRequestPolicy {
  cooldownSeconds: number;
  maxTracksInQueuePerViewer: number;
  maxTrackDurationMs: number;
}

export const DEFAULT_TWITCH_POLICY: TwitchSongRequestPolicy = {
  cooldownSeconds: 15,
  maxTracksInQueuePerViewer: 3,
  maxTrackDurationMs: 10 * 60 * 1000, // 10 minutos (600,000 ms)
};

@Injectable()
export class TwitchRateLimiterService {
  private readonly logger = new Logger(TwitchRateLimiterService.name);
  private readonly memoryCooldowns = new Map<string, number>();

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /**
   * Verifica si un viewer está en cooldown (15s) para el canal de Twitch indicado.
   * Si no está en cooldown, registra la marca de tiempo con TTL automático en Redis (y fallback en memoria).
   */
  async checkAndSetCooldown(
    channelName: string,
    twitchUserId: string,
    cooldownSeconds = DEFAULT_TWITCH_POLICY.cooldownSeconds,
  ): Promise<{ allowed: boolean; remainingSeconds: number }> {
    const normalizedChannel = channelName.toLowerCase().replace(/^#/, '');
    const key = `twitch:sr:cooldown:${normalizedChannel}:${twitchUserId}`;
    const now = Date.now();

    if (this.redis && this.redis.status === 'ready') {
      try {
        const ttl = await this.redis.pttl(key);
        if (ttl > 0) {
          return {
            allowed: false,
            remainingSeconds: Math.ceil(ttl / 1000),
          };
        }

        await this.redis.set(key, String(now), 'EX', cooldownSeconds, 'NX');
        return { allowed: true, remainingSeconds: 0 };
      } catch (err: unknown) {
        this.logger.warn(
          `Redis no disponible para cooldown de Twitch, usando memoria: ${(err as Error).message}`,
        );
      }
    }

    const expiresAt = this.memoryCooldowns.get(key);
    if (expiresAt && expiresAt > now) {
      return {
        allowed: false,
        remainingSeconds: Math.ceil((expiresAt - now) / 1000),
      };
    }

    this.memoryCooldowns.set(key, now + cooldownSeconds * 1000);
    return { allowed: true, remainingSeconds: 0 };
  }

  /**
   * Cuenta cuántas canciones pendientes tiene un viewer en la cola activa (máximo 3 por viewer).
   */
  canViewerEnqueueMoreTracks(
    queue: GuildQueue | undefined,
    twitchUserId: string,
    maxTracks = DEFAULT_TWITCH_POLICY.maxTracksInQueuePerViewer,
  ): { allowed: boolean; currentCount: number; maxAllowed: number } {
    if (!queue) {
      return { allowed: true, currentCount: 0, maxAllowed: maxTracks };
    }

    const viewerRequesterId = `twitch:${twitchUserId}`;
    const currentCount = queue.tracks.filter(
      (track) => track.requester.id === viewerRequesterId,
    ).length;

    return {
      allowed: currentCount < maxTracks,
      currentCount,
      maxAllowed: maxTracks,
    };
  }

  /**
   * Valida que la pista no sea un stream infinito ni supere los 10 minutos (600,000 ms).
   */
  isTrackDurationValid(
    lengthMs: number,
    isStream: boolean,
    maxDurationMs = DEFAULT_TWITCH_POLICY.maxTrackDurationMs,
  ): { valid: boolean; reason?: string } {
    if (isStream) {
      return {
        valid: false,
        reason: 'No se permiten transmisiones en vivo (streams infinitos).',
      };
    }

    if (lengthMs > maxDurationMs) {
      const maxMinutes = Math.floor(maxDurationMs / 60000);
      return {
        valid: false,
        reason: `La canción supera el límite máximo de ${maxMinutes} minutos.`,
      };
    }

    return { valid: true };
  }
}
