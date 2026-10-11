import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from '../notifications/notifications.gateway';
import type { Prisma } from '../../prisma/generated/prisma/client';
import type {
  FeatureFlagContext,
  FeatureFlagData,
  FeatureFlagRules,
} from './interfaces/feature-flags.interface';

export const CORE_FEATURE_FLAGS = [
  {
    key: 'DISCORD_BOT_ENABLED',
    description: 'Módulo del bot de música en Discord y orquestación con Lavalink v4.',
    isEnabled: true,
    rules: { percentage: 100, allowedRoles: ['admin', 'superadmin'] },
  },
  {
    key: 'BETA_FEATURE',
    description: 'Acceso anticipado a endpoints y herramientas experimentales con verificación @RequireFeature.',
    isEnabled: true,
    rules: { percentage: 100, allowedRoles: ['admin', 'user'] },
  },
  {
    key: 'DARK_MODE_V2',
    description: 'Motor de temas visuales dinámicos con soporte OLED y gradientes reactivos.',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'S3_MULTIPART_V2',
    description: 'Subida paralela por fragmentos (chunks) para archivos pesados mayores a 50 MB.',
    isEnabled: false,
    rules: { percentage: 0, allowedRoles: ['admin'] },
  },
  {
    key: 'OAUTH_SOCIAL_LOGIN',
    description: 'Autenticación social federada (Master Switch).',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'OAUTH_GOOGLE',
    description: 'Inicio de sesión social con Google OAuth2.',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'OAUTH_FACEBOOK',
    description: 'Inicio de sesión social con Facebook Login.',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'oauth_social_login',
    description: 'Autenticación social federada (Alias minúsculas).',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'oauth_google',
    description: 'Inicio de sesión social con Google OAuth2 (Alias minúsculas).',
    isEnabled: true,
    rules: { percentage: 100 },
  },
  {
    key: 'oauth_facebook',
    description: 'Inicio de sesión social con Facebook Login (Alias minúsculas).',
    isEnabled: true,
    rules: { percentage: 100 },
  },
];

@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly cacheTtlSeconds = 300; // 5 minutos de TTL en caché Redis

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCoreFeatureFlags();
  }

  async ensureCoreFeatureFlags(): Promise<void> {
    for (const flag of CORE_FEATURE_FLAGS) {
      try {
        const existing = await this.prisma.featureFlag.findUnique({
          where: { key: flag.key },
        });
        if (!existing) {
          await this.prisma.featureFlag.create({
            data: {
              key: flag.key,
              description: flag.description,
              isEnabled: flag.isEnabled,
              rules: flag.rules as unknown as Prisma.InputJsonValue,
            },
          });
          this.logger.log(`Feature Flag inicializada en BD: ${flag.key}`);
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Error al auto-crear flag [${flag.key}]: ${(err as Error).message}`,
        );
      }
    }
  }

  async isFeatureEnabled(
    key: string,
    context?: FeatureFlagContext,
  ): Promise<boolean> {
    const canonicalKey = key.trim();
    const upperKey = canonicalKey.toUpperCase();
    const lowerKey = canonicalKey.toLowerCase();
    const cacheKey = `feature_flag:${canonicalKey}`;

    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
      if (!cached && canonicalKey !== upperKey) {
        cached = await this.redis.get(`feature_flag:${upperKey}`);
      }
      if (!cached && canonicalKey !== lowerKey) {
        cached = await this.redis.get(`feature_flag:${lowerKey}`);
      }
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
      let flag = await this.prisma.featureFlag.findUnique({
        where: { key: canonicalKey },
        select: { isEnabled: true, rules: true },
      });

      if (!flag && canonicalKey !== upperKey) {
        flag = await this.prisma.featureFlag.findUnique({
          where: { key: upperKey },
          select: { isEnabled: true, rules: true },
        });
      }

      if (!flag && canonicalKey !== lowerKey) {
        flag = await this.prisma.featureFlag.findUnique({
          where: { key: lowerKey },
          select: { isEnabled: true, rules: true },
        });
      }

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
    await this.setFeatureFlag(key, true);
  }

  async disableFeature(key: string): Promise<void> {
    await this.setFeatureFlag(key, false);
  }

  async setFeatureFlag(
    key: string,
    isEnabled?: boolean,
    description?: string,
    rules?: FeatureFlagRules,
  ) {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { key },
    });

    const finalIsEnabled =
      isEnabled !== undefined ? isEnabled : (existing?.isEnabled ?? false);
    const finalDescription =
      description !== undefined ? description : existing?.description;
    const finalRules =
      rules !== undefined
        ? rules
        : (existing?.rules as FeatureFlagRules | null);

    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: {
        isEnabled: finalIsEnabled,
        ...(description !== undefined ? { description } : {}),
        ...(rules !== undefined
          ? { rules: rules as unknown as Prisma.InputJsonValue }
          : {}),
      },
      create: {
        key,
        isEnabled: finalIsEnabled,
        description: finalDescription,
        ...(finalRules !== undefined
          ? { rules: finalRules as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });

    const cacheKey = `feature_flag:${key}`;
    try {
      await this.redis.del(cacheKey);
      await this.redis.set(
        cacheKey,
        JSON.stringify({ isEnabled: flag.isEnabled, rules: flag.rules }),
        'EX',
        this.cacheTtlSeconds,
      );
    } catch (err) {
      this.logger.warn(
        `Error al sincronizar Redis para flag '${key}': ${(err as Error).message}`,
      );
    }

    // Emisión reactiva en tiempo real vía WebSockets
    const rulesObj = flag.rules as FeatureFlagRules | null;
    const roles = Array.isArray(rulesObj?.allowedRoles)
      ? rulesObj.allowedRoles
      : [];
    const rollout =
      typeof rulesObj?.percentage === 'number'
        ? rulesObj.percentage
        : flag.isEnabled
          ? 100
          : 0;

    this.notificationGateway.broadcastFeatureFlag({
      key: flag.key,
      enabled: flag.isEnabled,
      roles,
      rollout,
    });

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
