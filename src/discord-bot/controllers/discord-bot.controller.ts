import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ServiceUnavailableException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/auth.decorator';
import { DiscordGateway } from '../gateway/discord.gateway';
import { LavalinkService } from '../audio/lavalink.service';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';
import { DiscordGuildService } from '../persistence/discord-guild.service';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
} from 'class-validator';

export class SendMessageDto {
  @IsString({ message: 'El guildId debe ser un string' })
  @IsNotEmpty({ message: 'El guildId es requerido' })
  guildId!: string;

  @IsString({ message: 'El channelId debe ser un string' })
  @IsNotEmpty({ message: 'El channelId es requerido' })
  channelId!: string;

  @IsString({ message: 'El contenido del mensaje debe ser un string' })
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  content!: string;
}

export class UpdateGuildConfigDto {
  @IsOptional()
  @IsString({ message: 'dedicatedChannelId debe ser un string o null' })
  dedicatedChannelId?: string | null;
}

export class PlaybackActionDto {
  @IsString({ message: 'La acción debe ser una cadena de texto válida' })
  @IsNotEmpty({ message: 'La acción es requerida' })
  @IsIn(
    [
      'play',
      'pause',
      'resume',
      'skip',
      'back',
      'seek',
      'volume',
      'stop',
      'leave',
    ],
    { message: 'Acción de reproducción no reconocida' },
  )
  action!:
    | 'play'
    | 'pause'
    | 'resume'
    | 'skip'
    | 'back'
    | 'seek'
    | 'volume'
    | 'stop'
    | 'leave';

  @IsOptional()
  @IsString({ message: 'El término de búsqueda debe ser un string' })
  query?: string;

  @IsOptional()
  @IsString({ message: 'El ID del canal de voz debe ser un string' })
  voiceChannelId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'El valor debe ser numérico' })
  value?: number;
}

@Controller('discord')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class DiscordBotController {
  constructor(
    private readonly gateway: DiscordGateway,
    private readonly lavalink: LavalinkService,
    private readonly queueManager: QueueManagerService,
    private readonly playback: DiscordPlaybackService,
    private readonly guildService: DiscordGuildService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  private async checkBotEnabled(): Promise<void> {
    const isEnabled =
      await this.featureFlagsService.isFeatureEnabled('DISCORD_BOT_ENABLED');
    if (!isEnabled) {
      throw new ServiceUnavailableException(
        'El módulo del bot de Discord está desactivado por Feature Flag (DISCORD_BOT_ENABLED=false).',
      );
    }
  }

  @Get('status')
  async getStatus() {
    const isFeatureEnabled =
      await this.featureFlagsService.isFeatureEnabled('DISCORD_BOT_ENABLED');
    const client = this.gateway.getClient();
    const isClientReady = Boolean(client?.isReady());
    const isLavalinkReady = this.lavalink.isConnected;

    return {
      isEnabled: isFeatureEnabled,
      isDiscordConnected: isClientReady,
      isLavalinkConnected: isLavalinkReady,
      guildCount: client?.guilds.cache.size || 0,
      activeQueuesCount: this.queueManager.getAllActiveGuildIds().length,
      user: client?.user
        ? {
            id: client.user.id,
            tag: client.user.tag,
            avatar: client.user.displayAvatarURL(),
          }
        : null,
    };
  }

  @Get('guilds')
  async getGuilds() {
    await this.checkBotEnabled();
    const client = this.gateway.getClient();

    if (!client || !client.isReady()) {
      return [];
    }

    const guildsData = await Promise.all(
      Array.from(client.guilds.cache.values()).map(async (guild) => {
        const queue = this.queueManager.getQueue(guild.id);
        const config = await this.guildService.getGuildConfig(guild.id);

        const fetchedChannels =
          guild.channels.cache.size === 0
            ? await guild.channels.fetch().catch(() => null)
            : guild.channels.cache;

        const voiceChannels = (
          fetchedChannels ? Array.from(fetchedChannels.values()) : []
        )
          .filter(
            (c) =>
              Boolean(c) &&
              (c!.type === ChannelType.GuildVoice ||
                c!.type === ChannelType.GuildStageVoice),
          )
          .map((c) => ({ id: c!.id, name: c!.name }));

        const textChannels = (
          fetchedChannels ? Array.from(fetchedChannels.values()) : []
        )
          .filter(
            (c) =>
              Boolean(c) &&
              (c!.type === ChannelType.GuildText ||
                c!.type === ChannelType.GuildAnnouncement),
          )
          .map((c) => ({ id: c!.id, name: c!.name }));

        return {
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL(),
          memberCount: guild.memberCount,
          hasActiveQueue: Boolean(queue?.currentTrack),
          currentTrack: queue?.currentTrack?.info || null,
          voiceChannels,
          textChannels,
          config,
        };
      }),
    );

    return guildsData;
  }

  @Get('queue/:guildId')
  async getQueue(@Param('guildId') guildId: string) {
    await this.checkBotEnabled();
    const queue = this.queueManager.getQueue(guildId);

    if (!queue) {
      return {
        guildId,
        currentTrack: null,
        tracks: [],
        history: [],
        volume: 100,
        isPaused: false,
        repeatMode: 'off',
        position: 0,
      };
    }

    const player = this.lavalink.getPlayer(guildId);

    return {
      ...queue.toJSON(),
      position: player?.position || queue.lastPlaybackPosition,
    };
  }

  @Post('playback/:guildId')
  async handlePlayback(
    @Param('guildId') guildId: string,
    @Body() dto: PlaybackActionDto,
  ) {
    await this.checkBotEnabled();

    switch (dto.action) {
      case 'play': {
        if (!dto.query) {
          throw new BadRequestException(
            'Se requiere el campo query para reproducir.',
          );
        }

        let voiceChannelId = dto.voiceChannelId;
        if (!voiceChannelId) {
          const client = this.gateway.getClient();
          const guild = client?.guilds.cache.get(guildId);
          if (guild) {
            const fetched =
              guild.channels.cache.size === 0
                ? await guild.channels.fetch().catch(() => null)
                : guild.channels.cache;
            const channelsList = fetched ? Array.from(fetched.values()) : [];
            const firstVoice = channelsList.find(
              (c) =>
                Boolean(c) &&
                (c!.type === ChannelType.GuildVoice ||
                  c!.type === ChannelType.GuildStageVoice),
            );
            if (firstVoice) {
              voiceChannelId = firstVoice.id;
            }
          }
        }

        if (!voiceChannelId) {
          throw new BadRequestException(
            'Se requiere voiceChannelId o que exista un canal de voz disponible en el servidor.',
          );
        }

        const resolveRes = await this.lavalink.resolveTracks(dto.query, {
          id: 'dashboard-admin',
          username: 'Web Admin',
        });

        if (resolveRes.tracks.length === 0) {
          throw new NotFoundException(
            'No se encontraron canciones con esa búsqueda.',
          );
        }

        const tracksToPlay =
          resolveRes.loadType === 'playlist'
            ? resolveRes.tracks
            : resolveRes.tracks.slice(0, 1);

        const res = await this.playback.playTracks(
          guildId,
          voiceChannelId,
          '',
          tracksToPlay,
        );

        return {
          success: true,
          message:
            resolveRes.loadType === 'playlist'
              ? `Playlist "${resolveRes.playlistName || 'Playlist'}" (${tracksToPlay.length} pistas) enviada a la cola.`
              : `Pista "${tracksToPlay[0]?.info.title || 'Canción'}" enviada a reproducción.`,
          nowPlaying: res.nowPlaying,
          enqueued: res.enqueued,
        };
      }

      case 'pause':
        await this.playback.pause(guildId);
        return { success: true, message: 'Reproducción pausada.' };

      case 'resume':
        await this.playback.resume(guildId);
        return { success: true, message: 'Reproducción reanudada.' };

      case 'skip': {
        const next = await this.playback.playNext(guildId);
        return {
          success: true,
          message: next ? `Saltado a ${next.info.title}` : 'Fin de la cola.',
          nextTrack: next,
        };
      }

      case 'back': {
        const prev = await this.playback.playPrevious(guildId);
        return {
          success: true,
          message: prev
            ? `Regresando a ${prev.info.title}`
            : 'No hay tracks previos.',
          previousTrack: prev,
        };
      }

      case 'seek': {
        if (typeof dto.value !== 'number') {
          throw new BadRequestException(
            'Se requiere valor numérico en segundos para seek.',
          );
        }
        await this.playback.seek(guildId, dto.value);
        return { success: true, message: `Posición ajustada a ${dto.value}s.` };
      }

      case 'volume': {
        if (typeof dto.value !== 'number') {
          throw new BadRequestException(
            'Se requiere valor numérico para volumen (0-200).',
          );
        }
        await this.playback.setVolume(guildId, dto.value);
        return { success: true, message: `Volumen ajustado a ${dto.value}%.` };
      }

      case 'stop':
        await this.playback.stop(guildId);
        return { success: true, message: 'Reproducción detenida.' };

      case 'leave':
        await this.playback.leave(guildId);
        return { success: true, message: 'Bot desconectado del canal de voz.' };

      default:
        throw new BadRequestException(
          `Acción no soportada: ${(dto as { action: string }).action}`,
        );
    }
  }

  @Delete('queue/:guildId/tracks/:index')
  async removeTrack(
    @Param('guildId') guildId: string,
    @Param('index') indexStr: string,
  ) {
    await this.checkBotEnabled();
    const queue = this.queueManager.getQueue(guildId);
    if (!queue) {
      throw new NotFoundException(
        'No existe una cola activa para este servidor.',
      );
    }

    const index = parseInt(indexStr, 10);
    const removed = this.playback.removeTrack(guildId, index);
    if (!removed) {
      throw new NotFoundException(
        `No se encontró canción en el índice ${index}.`,
      );
    }

    return {
      success: true,
      message: `Canción "${removed.info.title}" eliminada de la cola.`,
      removed,
    };
  }

  @Delete('queue/:guildId')
  async clearQueue(@Param('guildId') guildId: string) {
    await this.checkBotEnabled();
    const queue = this.queueManager.getQueue(guildId);
    if (!queue) {
      return { success: true, count: 0 };
    }
    const count = queue.tracks.length;
    this.playback.clearQueue(guildId);
    return {
      success: true,
      count,
      message: `Se vaciaron ${count} pistas de la cola.`,
    };
  }

  @Post('messages/send')
  async sendMessage(@Body() dto: SendMessageDto) {
    await this.checkBotEnabled();
    const client = this.gateway.getClient();
    if (!client || !client.isReady()) {
      throw new ServiceUnavailableException(
        'El bot de Discord no está conectado actualmente.',
      );
    }

    const guild = client.guilds.cache.get(dto.guildId);
    if (!guild) {
      throw new NotFoundException(
        `El servidor con ID ${dto.guildId} no fue encontrado.`,
      );
    }

    const channel = await guild.channels.fetch(dto.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      throw new BadRequestException(
        'El canal indicado no existe o no es un canal de texto válido.',
      );
    }

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      throw new ServiceUnavailableException(
        'No se pudo verificar la identidad del bot en el servidor.',
      );
    }

    const permissions = channel.permissionsFor(botMember);
    if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages)) {
      throw new BadRequestException(
        'El bot no tiene permisos suficientes para enviar mensajes en ese canal.',
      );
    }

    try {
      const sent = await channel.send({
        content: dto.content,
        allowedMentions: { parse: ['users', 'roles'] },
      });

      return {
        success: true,
        messageId: sent.id,
        channelId: channel.id,
        message: 'Mensaje enviado exitosamente a Discord.',
      };
    } catch (err: unknown) {
      throw new BadRequestException(
        `No se pudo enviar el mensaje: ${(err as Error).message}`,
      );
    }
  }

  @Patch('guilds/:guildId/config')
  async updateGuildConfig(
    @Param('guildId') guildId: string,
    @Body() dto: UpdateGuildConfigDto,
  ) {
    await this.checkBotEnabled();
    const config = await this.guildService.updateGuildConfig(guildId, {
      dedicatedChannelId: dto.dedicatedChannelId ?? null,
    });

    return {
      success: true,
      message: 'Configuración de servidor actualizada exitosamente.',
      config,
    };
  }
}
