import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../prisma/generated/prisma/client';
import type {
  FeatureFlagContext,
  FeatureFlagData,
  FeatureFlagRules,
} from './interfaces/feature-flags.interface';

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly cacheTtlSeconds = 300; // 5 minutos de TTL en caché Redis

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async isFeatureEnabled(
    key: string,
    context?: FeatureFlagContext,
  ): Promise<boolean> {
    const cacheKey = `feature_flag:${key}`;

    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch (err) {
      this.logger.warn(
        `Error al consultar Redis para flag '${key}': ${(err as Error).message}`,
      );
    }

    let flagData: FeatureFlagData;

    if (cached !== null) {
      try {
        flagData = JSON.parse(cached) as FeatureFlagData;
      } catch {
        flagData = { isEnabled: cached === 'true' };
      }
    } else {
      const flag = await this.prisma.featureFlag.findUnique({
        where: { key },
        select: { isEnabled: true, rules: true },
      });

      if (!flag) {
        // Cachear ausencia con TTL reducido para prevenir cache stampede
        try {
          await this.redis.set(
            cacheKey,
            JSON.stringify({ isEnabled: false }),
            'EX',
            60,
          );
        } catch {
          // Ignorar fallo de redis
        }
        return false;
      }

      flagData = {
        isEnabled: flag.isEnabled,
        rules: flag.rules as FeatureFlagRules | null,
      };

      try {
        await this.redis.set(
          cacheKey,
          JSON.stringify(flagData),
          'EX',
          this.cacheTtlSeconds,
        );
      } catch (err) {
        this.logger.warn(
          `Error al persistir flag en Redis: ${(err as Error).message}`,
        );
      }
    }

    if (!flagData.isEnabled) {
      return false;
    }

    // Evaluación de reglas condicionales (usuario, rol o rollout porcentual)
    const rules = flagData.rules;
    if (!rules || typeof rules !== 'object') {
      return true;
    }

    if (Array.isArray(rules.allowedUsers) && rules.allowedUsers.length > 0) {
      if (context?.userId && rules.allowedUsers.includes(context.userId)) {
        return true;
      }
      if (!rules.allowedRoles && rules.percentage === undefined) {
        return false;
      }
    }

    if (Array.isArray(rules.allowedRoles) && rules.allowedRoles.length > 0) {
      if (context?.role && rules.allowedRoles.includes(context.role)) {
        return true;
      }
      if (rules.percentage === undefined) {
        return false;
      }
    }

    if (typeof rules.percentage === 'number') {
      if (rules.percentage <= 0) return false;
      if (rules.percentage >= 100) return true;

      const seed = context?.userId || Math.random().toString();
      const hash = seed
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return hash % 100 < rules.percentage;
    }

    return true;
  }

  async enableFeature(key: string): Promise<void> {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: { isEnabled: true },
      create: { key, isEnabled: true },
    });

    const cacheKey = `feature_flag:${key}`;
    await this.redis.set(
      cacheKey,
      JSON.stringify({ isEnabled: true, rules: flag.rules }),
      'EX',
      this.cacheTtlSeconds,
    );
  }

  async disableFeature(key: string): Promise<void> {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: { isEnabled: false },
      create: { key, isEnabled: false },
    });

    const cacheKey = `feature_flag:${key}`;
    await this.redis.set(
      cacheKey,
      JSON.stringify({ isEnabled: false, rules: flag.rules }),
      'EX',
      this.cacheTtlSeconds,
    );
  }

  async setFeatureFlag(
    key: string,
    isEnabled: boolean,
    description?: string,
    rules?: FeatureFlagRules,
  ) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: {
        isEnabled,
        ...(description !== undefined ? { description } : {}),
        ...(rules !== undefined
          ? { rules: rules as unknown as Prisma.InputJsonValue }
          : {}),
      },
      create: {
        key,
        isEnabled,
        description,
        ...(rules !== undefined
          ? { rules: rules as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });

    const cacheKey = `feature_flag:${key}`;
    await this.redis.set(
      cacheKey,
      JSON.stringify({ isEnabled, rules: flag.rules }),
      'EX',
      this.cacheTtlSeconds,
    );

    return flag;
  }

  async invalidateCache(key: string): Promise<void> {
    await this.redis.del(`feature_flag:${key}`);
  }

  async getAllFlags() {
    return this.prisma.featureFlag.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
