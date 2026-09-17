import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DiscordGuildService {
  private readonly logger = new Logger(DiscordGuildService.name);

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
}
