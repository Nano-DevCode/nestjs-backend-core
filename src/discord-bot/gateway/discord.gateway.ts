import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
  type Interaction,
  type Message,
} from 'discord.js';
import {
  loadDiscordBotConfig,
  type DiscordBotConfig,
} from '../config/discord-bot.config';
import { LavalinkService } from '../audio/lavalink.service';
import { CommandRegistryService } from '../commands/command-registry.service';
import { DiscordGuildService } from '../persistence/discord-guild.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class DiscordGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordGateway.name);
  private client: Client | null = null;
  private readonly config: DiscordBotConfig;

  constructor(
    private readonly lavalinkService: LavalinkService,
    private readonly commandRegistry: CommandRegistryService,
    private readonly guildService: DiscordGuildService,
    private readonly playbackService: DiscordPlaybackService,
  ) {
    this.config = loadDiscordBotConfig();
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.isEnabled) {
      this.logger.log(
        'DiscordGateway: DISCORD_BOT_ENABLED está desactivado (false). No se conectará a Discord.',
      );
      return;
    }

    if (!this.config.token) {
      this.logger.warn(
        'DiscordGateway: DISCORD_BOT_ENABLED=true pero falta DISCORD_BOT_TOKEN. Conexión omitida.',
      );
      return;
    }

    this.logger.log('Iniciando cliente de Discord con Lavalink v4...');

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // 1. Inicializar cliente de audio Lavalink (Shoukaku)
    this.lavalinkService.init(this.client, this.config);

    // 2. Eventos del Gateway
    this.client.once(Events.ClientReady, (readyClient) => {
      void (async () => {
        this.logger.log(
          `✅ Bot de Discord conectado como: ${readyClient.user.tag} (ID: ${readyClient.user.id})`,
        );

        readyClient.user.setActivity({
          name: 'AntiGravity Music | /play',
          type: ActivityType.Listening,
        });

        // Asegurar configuración en BD para cada guild conectado
        for (const [guildId, guild] of readyClient.guilds.cache) {
          try {
            await this.guildService.ensureGuildConfig(guildId, guild.name);
          } catch (err: unknown) {
            this.logger.warn(
              `No se pudo registrar guild [${guildId}] en BD: ${(err as Error).message}`,
            );
          }
        }
      })();
    });

    this.client.on(Events.GuildCreate, (guild) => {
      void (async () => {
        this.logger.log(
          `Bot añadido a nuevo servidor: ${guild.name} [${guild.id}]`,
        );
        try {
          await this.guildService.ensureGuildConfig(guild.id, guild.name);
        } catch (err: unknown) {
          this.logger.warn(
            `Error al guardar nuevo guild [${guild.id}]: ${(err as Error).message}`,
          );
        }
      })();
    });

    this.client.on(Events.InteractionCreate, (interaction: Interaction) => {
      if (!interaction.isChatInputCommand()) return;
      void this.commandRegistry.dispatch(interaction);
    });

    this.client.on(Events.MessageCreate, (message: Message) => {
      void (async () => {
        if (message.author.bot) return;

        const content = message.content.trim();
        const match =
          /^(?:boot|bot)\s+perrito\s+pon\s+la\s+m[uú]sica(?:\s+(.*))?$/i.exec(
            content,
          );
        if (!match) return;

        const guildId = message.guildId;
        if (!guildId) return;

        // Restricción de canal dedicado
        try {
          const guildConfig = await this.guildService.getGuildConfig(guildId);
          if (
            guildConfig?.dedicatedChannelId &&
            message.channelId !== guildConfig.dedicatedChannelId
          ) {
            const reply = await message.reply(
              `❌ Por favor usa los comandos en el canal asignado: <#${guildConfig.dedicatedChannelId}>`,
            );
            setTimeout(() => {
              void reply.delete().catch(() => null);
            }, 5000);
            return;
          }
        } catch (err: unknown) {
          this.logger.warn(
            `Error al verificar canal dedicado en guild [${guildId}]: ${(err as Error).message}`,
          );
        }

        const query = match[1]?.trim();
        if (!query) {
          await message.reply(
            '¡Guau! Dime qué canción o enlace quieres que ponga.',
          );
          return;
        }

        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
          await message.reply(
            '¡Guau! 🐶 Necesitas estar conectado en un canal de voz para que pueda poner la música.',
          );
          return;
        }

        try {
          const resolveRes = await this.lavalinkService.resolveTracks(query, {
            id: message.author.id,
            username: message.author.username,
            avatarUrl: message.author.displayAvatarURL(),
          });

          if (resolveRes.tracks.length === 0) {
            await message.reply(
              `¡Guau! 🐾 No encontré ninguna pista para: **${query}**`,
            );
            return;
          }

          const tracksToPlay =
            resolveRes.loadType === 'playlist'
              ? resolveRes.tracks
              : resolveRes.tracks.slice(0, 1);

          const res = await this.playbackService.playTracks(
            guildId,
            voiceChannel.id,
            message.channelId,
            tracksToPlay,
          );

          if (res.nowPlaying) {
            await message.reply(
              `🎶 ¡Guau! Reproduciendo ahora: **${res.nowPlaying.info.title}** - *${res.nowPlaying.info.author}*`,
            );
          } else {
            await message.reply(
              `📥 ¡Guau! Añadida a la cola: **${resolveRes.tracks[0].info.title}** (Total en cola: ${res.enqueued})`,
            );
          }
        } catch (err: unknown) {
          this.logger.error(
            `Error al reproducir vía trigger perrito en [${guildId}]: ${(err as Error).message}`,
          );
          await message.reply(
            `🦴 ¡Grrr! Ocurrió un error al intentar reproducir la música: ${(err as Error).message}`,
          );
        }
      })();
    });

    try {
      await this.client.login(this.config.token);
    } catch (err: unknown) {
      this.logger.error(
        `Error al autenticar bot en Discord: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.logger.log('Cerrando conexión del cliente de Discord...');
      await this.client.destroy();
      this.client = null;
    }
  }

  getClient(): Client | null {
    return this.client;
  }
}
