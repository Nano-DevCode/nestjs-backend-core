import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type UserGuildRole =
  | 'OWNER'
  | 'ADMINISTRATOR'
  | 'MANAGE_GUILD'
  | 'MANUAL_VERIFIED';

export interface UserLavalinkRegistration {
  userId: string;
  guildId: string;
  guildName?: string | null;
  role: UserGuildRole | string;
  voiceChannelId?: string | null;
  discordUserId?: string | null;
  nodeName: string;
  linkedAt: string;
  registeredAt: string;
}

const LAVALINK_PROVIDER = 'discord_lavalink';
const DISCORD_OAUTH_PROVIDER = 'discord';

@Injectable()
export class DiscordGuildService {
  private readonly logger = new Logger(DiscordGuildService.name);
  private readonly memoryRegistrations = new Map<
    string,
    Map<string, UserLavalinkRegistration>
  >();
  private readonly memoryUserDiscordIds = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async getGuildConfig(guildId: string) {
    return this.prisma.discordGuildConfig.findUnique({
      where: { guildId },
    });
  }

  async ensureGuildConfig(guildId: string, name?: string) {
    return this.prisma.discordGuildConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        name: name || null,
        prefix: '/',
        defaultVolume: 100,
      },
      update: {
        ...(name ? { name } : {}),
      },
    });
  }

  async updateGuildConfig(
    guildId: string,
    data: {
      prefix?: string;
      dedicatedChannelId?: string | null;
      defaultVolume?: number;
      djRoleId?: string | null;
      name?: string;
    },
  ) {
    return this.prisma.discordGuildConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        name: data.name || null,
        prefix: data.prefix || '/',
        dedicatedChannelId: data.dedicatedChannelId || null,
        defaultVolume: data.defaultVolume ?? 100,
        djRoleId: data.djRoleId || null,
      },
      update: {
        ...(data.prefix !== undefined ? { prefix: data.prefix } : {}),
        ...(data.dedicatedChannelId !== undefined
          ? { dedicatedChannelId: data.dedicatedChannelId }
          : {}),
        ...(data.defaultVolume !== undefined
          ? { defaultVolume: data.defaultVolume }
          : {}),
        ...(data.djRoleId !== undefined ? { djRoleId: data.djRoleId } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
      },
    });
  }

  /**
   * Guarda el discordUserId del usuario al vincular su cuenta mediante Discord OAuth2.
   */
  async saveUserDiscordId(
    userId: string,
    discordUserId: string,
    profileData?: Record<string, unknown>,
  ): Promise<void> {
    this.memoryUserDiscordIds.set(userId, discordUserId);

    const prismaAny = this.prisma as unknown as {
      user?: {
        update?: (args: unknown) => Promise<unknown>;
      };
    };

    if (prismaAny.user?.update) {
      try {
        await prismaAny.user.update({
          where: { id: userId },
          data: { discordUserId },
        });
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudo actualizar discordUserId en tabla users para [${userId}]: ${(err as Error).message}`,
        );
      }
    }

    if (this.prisma.oAuthAccount?.upsert) {
      try {
        await this.prisma.oAuthAccount.upsert({
          where: {
            provider_providerId: {
              provider: DISCORD_OAUTH_PROVIDER,
              providerId: discordUserId,
            },
          },
          create: {
            userId,
            provider: DISCORD_OAUTH_PROVIDER,
            providerId: discordUserId,
            profileData: (profileData ?? { discordUserId }) as object,
          },
          update: {
            userId,
            profileData: (profileData ?? { discordUserId }) as object,
          },
        });
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudo guardar cuenta OAuth de Discord para [${userId}]: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Obtiene el discordUserId asociado al usuario (desde User, OAuthAccount o registros previos).
   */
  async getUserDiscordId(userId: string): Promise<string | null> {
    const cached = this.memoryUserDiscordIds.get(userId);
    if (cached) {
      return cached;
    }

    const prismaAny = this.prisma as unknown as {
      user?: {
        findUnique?: (args: unknown) => Promise<{ discordUserId?: string | null } | null>;
      };
    };

    if (prismaAny.user?.findUnique) {
      try {
        const userRecord = await prismaAny.user.findUnique({
          where: { id: userId },
          select: { discordUserId: true },
        });
        if (userRecord?.discordUserId) {
          this.memoryUserDiscordIds.set(userId, userRecord.discordUserId);
          return userRecord.discordUserId;
        }
      } catch {
        // Fallback a OAuthAccount
      }
    }

    if (this.prisma.oAuthAccount?.findMany) {
      try {
        const accounts = await this.prisma.oAuthAccount.findMany({
          where: {
            userId,
            provider: DISCORD_OAUTH_PROVIDER,
          },
        });
        if (accounts.length > 0 && accounts[0].providerId) {
          this.memoryUserDiscordIds.set(userId, accounts[0].providerId);
          return accounts[0].providerId;
        }
      } catch {
        // Fallback a registros de servidor
      }
    }

    const registrations = await this.getUserRegistrations(userId);
    const withDiscordId = registrations.find((r) => Boolean(r.discordUserId));
    return withDiscordId?.discordUserId ?? null;
  }

  /**
   * Registra o actualiza la relación de pertenencia UserGuild (userId, guildId, role, linkedAt).
   */
  async registerUserLavalinkSession(
    userId: string,
    data: {
      guildId: string;
      guildName?: string;
      role?: UserGuildRole | string;
      voiceChannelId?: string | null;
      discordUserId?: string | null;
      nodeName?: string;
    },
  ): Promise<UserLavalinkRegistration> {
    await this.ensureGuildConfig(data.guildId, data.guildName);

    const nowIso = new Date().toISOString();
    const existing = await this.getUserGuildRegistration(userId, data.guildId);

    const registration: UserLavalinkRegistration = {
      userId,
      guildId: data.guildId,
      guildName: data.guildName ?? existing?.guildName ?? null,
      role: data.role || existing?.role || 'OWNER',
      voiceChannelId:
        data.voiceChannelId !== undefined
          ? data.voiceChannelId
          : (existing?.voiceChannelId ?? null),
      discordUserId:
        data.discordUserId !== undefined
          ? data.discordUserId
          : (existing?.discordUserId ?? null),
      nodeName: data.nodeName || existing?.nodeName || 'lavalink-node-1',
      linkedAt: existing?.linkedAt || nowIso,
      registeredAt: existing?.registeredAt || nowIso,
    };

    if (registration.discordUserId) {
      this.memoryUserDiscordIds.set(userId, registration.discordUserId);
    }

    let userMap = this.memoryRegistrations.get(userId);
    if (!userMap) {
      userMap = new Map<string, UserLavalinkRegistration>();
      this.memoryRegistrations.set(userId, userMap);
    }
    userMap.set(data.guildId, registration);

    // 1. Persistir en la tabla dedicada UserGuild (user_guilds)
    const prismaWithUserGuild = this.prisma as unknown as {
      userGuild?: {
        upsert: (args: unknown) => Promise<unknown>;
      };
    };

    if (prismaWithUserGuild.userGuild?.upsert) {
      try {
        await prismaWithUserGuild.userGuild.upsert({
          where: {
            userId_guildId: {
              userId,
              guildId: data.guildId,
            },
          },
          create: {
            userId,
            guildId: data.guildId,
            guildName: registration.guildName,
            role: registration.role,
            discordUserId: registration.discordUserId,
            voiceChannelId: registration.voiceChannelId,
            nodeName: registration.nodeName,
          },
          update: {
            ...(registration.guildName !== null
              ? { guildName: registration.guildName }
              : {}),
            role: registration.role,
            ...(registration.discordUserId !== null
              ? { discordUserId: registration.discordUserId }
              : {}),
            ...(data.voiceChannelId !== undefined
              ? { voiceChannelId: data.voiceChannelId }
              : {}),
            nodeName: registration.nodeName,
          },
        });
      } catch (err: unknown) {
        this.logger.warn(
          `Aviso al persistir UserGuild en DB para [${userId}:${data.guildId}]: ${(err as Error).message}`,
        );
      }
    }

    // 2. Mantener sincronizado en OAuthAccount para compatibilidad retroactiva
    const providerId = `${userId}:${data.guildId}`;
    if (this.prisma.oAuthAccount?.upsert) {
      try {
        await this.prisma.oAuthAccount.upsert({
          where: {
            provider_providerId: {
              provider: LAVALINK_PROVIDER,
              providerId,
            },
          },
          create: {
            userId,
            provider: LAVALINK_PROVIDER,
            providerId,
            profileData: JSON.parse(JSON.stringify(registration)) as object,
          },
          update: {
            profileData: JSON.parse(JSON.stringify(registration)) as object,
          },
        });
      } catch (err: unknown) {
        this.logger.warn(
          `Registro Lavalink almacenado en memoria para usuario [${userId}] (DB fallback: ${(err as Error).message})`,
        );
      }
    }

    return registration;
  }

  /**
   * Sincroniza en lote los servidores verificados por Discord OAuth2 (OWNER, ADMINISTRATOR o MANAGE_GUILD).
   */
  async syncOAuthGuilds(
    userId: string,
    discordUserId: string,
    verifiedGuilds: Array<{
      guildId: string;
      guildName: string;
      role: UserGuildRole;
      voiceChannelId?: string | null;
    }>,
  ): Promise<UserLavalinkRegistration[]> {
    await this.saveUserDiscordId(userId, discordUserId);

    const results: UserLavalinkRegistration[] = [];
    for (const guild of verifiedGuilds) {
      const reg = await this.registerUserLavalinkSession(userId, {
        guildId: guild.guildId,
        guildName: guild.guildName,
        role: guild.role,
        discordUserId,
        ...(guild.voiceChannelId ? { voiceChannelId: guild.voiceChannelId } : {}),
      });
      results.push(reg);
    }

    return results;
  }

  /**
   * Obtiene todos los servidores vinculados formalmente a un userId.
   */
  async getUserRegistrations(
    userId: string,
  ): Promise<UserLavalinkRegistration[]> {
    const merged = new Map<string, UserLavalinkRegistration>();

    const memMap = this.memoryRegistrations.get(userId);
    if (memMap) {
      for (const [guildId, reg] of memMap.entries()) {
        merged.set(guildId, reg);
      }
    }

    // 1. Consultar desde la tabla formal UserGuild (user_guilds)
    const prismaWithUserGuild = this.prisma as unknown as {
      userGuild?: {
        findMany: (args: unknown) => Promise<
          Array<{
            userId: string;
            guildId: string;
            guildName: string | null;
            role: string;
            discordUserId: string | null;
            voiceChannelId: string | null;
            nodeName: string;
            linkedAt: Date;
          }>
        >;
      };
    };

    if (prismaWithUserGuild.userGuild?.findMany) {
      try {
        const userGuilds = await prismaWithUserGuild.userGuild.findMany({
          where: { userId },
          orderBy: { linkedAt: 'desc' },
        });

        for (const ug of userGuilds) {
          const linkedIso =
            ug.linkedAt instanceof Date
              ? ug.linkedAt.toISOString()
              : new Date().toISOString();
          merged.set(ug.guildId, {
            userId: ug.userId,
            guildId: ug.guildId,
            guildName: ug.guildName ?? null,
            role: ug.role || 'OWNER',
            voiceChannelId: ug.voiceChannelId ?? null,
            discordUserId: ug.discordUserId ?? null,
            nodeName: ug.nodeName || 'lavalink-node-1',
            linkedAt: linkedIso,
            registeredAt: linkedIso,
          });
        }
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudieron consultar registros UserGuild en DB para [${userId}]: ${(err as Error).message}`,
        );
      }
    }

    // 2. Consultar también registros previos en OAuthAccount (migración transparente)
    if (this.prisma.oAuthAccount?.findMany) {
      try {
        const records = await this.prisma.oAuthAccount.findMany({
          where: {
            userId,
            provider: LAVALINK_PROVIDER,
          },
        });

        for (const rec of records) {
          const data = rec.profileData as unknown as
            | Partial<UserLavalinkRegistration>
            | undefined;
          if (data?.guildId && !merged.has(data.guildId)) {
            const linkedIso =
              data.linkedAt ||
              data.registeredAt ||
              rec.createdAt.toISOString();
            merged.set(data.guildId, {
              userId,
              guildId: data.guildId,
              guildName: data.guildName ?? null,
              role: data.role || 'OWNER',
              voiceChannelId: data.voiceChannelId ?? null,
              discordUserId: data.discordUserId ?? null,
              nodeName: data.nodeName || 'lavalink-node-1',
              linkedAt: linkedIso,
              registeredAt: linkedIso,
            });
          }
        }
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudieron consultar registros Lavalink en DB para [${userId}]: ${(err as Error).message}`,
        );
      }
    }

    return Array.from(merged.values());
  }

  async getUserGuildRegistration(
    userId: string,
    guildId: string,
  ): Promise<UserLavalinkRegistration | null> {
    const list = await this.getUserRegistrations(userId);
    return list.find((item) => item.guildId === guildId) ?? null;
  }

  /**
   * Verifica si un usuario tiene permiso sobre un guildId específico.
   * Los roles 'admin' y 'superadmin' tienen acceso global de monitoreo/soporte.
   */
  async hasGuildAccess(
    userId: string | undefined,
    guildId: string,
    roles?: string[],
  ): Promise<boolean> {
    const normalizedRoles = (roles || []).map((r) => r.toLowerCase());
    if (
      normalizedRoles.includes('admin') ||
      normalizedRoles.includes('superadmin')
    ) {
      return true;
    }

    if (!userId || !guildId) {
      return false;
    }

    const registration = await this.getUserGuildRegistration(userId, guildId);
    return Boolean(registration);
  }

  async unregisterUserGuild(userId: string, guildId: string): Promise<boolean> {
    const memMap = this.memoryRegistrations.get(userId);
    let existed = false;
    if (memMap?.has(guildId)) {
      memMap.delete(guildId);
      existed = true;
    }

    const prismaWithUserGuild = this.prisma as unknown as {
      userGuild?: {
        deleteMany: (args: unknown) => Promise<{ count: number }>;
      };
    };

    if (prismaWithUserGuild.userGuild?.deleteMany) {
      try {
        const res = await prismaWithUserGuild.userGuild.deleteMany({
          where: { userId, guildId },
        });
        if (res.count > 0) {
          existed = true;
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Aviso al eliminar UserGuild en DB para [${userId}:${guildId}]: ${(err as Error).message}`,
        );
      }
    }

    const providerId = `${userId}:${guildId}`;
    if (this.prisma.oAuthAccount?.deleteMany) {
      try {
        const res = await this.prisma.oAuthAccount.deleteMany({
          where: {
            userId,
            provider: LAVALINK_PROVIDER,
            providerId,
          },
        });
        if (res.count > 0) {
          existed = true;
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Aviso al eliminar registro Lavalink en DB para [${userId}:${guildId}]: ${(err as Error).message}`,
        );
      }
    }

    return existed;
  }
}
