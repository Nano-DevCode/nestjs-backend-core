import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import * as tls from 'node:tls';
import { PrismaService } from '../../prisma/prisma.service';
import { LavalinkService } from '../audio/lavalink.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordBotWsGateway } from '../gateway/discord-bot-ws.gateway';
import {
  TwitchRateLimiterService,
  DEFAULT_TWITCH_POLICY,
} from './twitch-rate-limiter.service';

/**
 * Normaliza cualquier entrada de canal de Twitch (ej. "#Legend_Slayer4",
 * "https://twitch.tv/legend_slayer4") a minúsculas y sin prefijo '#'.
 */
export function normalizeTwitchChannel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
    .replace(/^#+/, '')
    .split(/[/?#\s]/)[0]
    .trim();
}

/**
 * Estructura tipada compatible con `ChatMessage` de `@twurple/chat`.
 */
export interface TwurpleChatMessageContext {
  userInfo: {
    userId: string;
    userName: string;
    displayName: string;
    isBroadcaster: boolean;
    isMod: boolean;
    isVip?: boolean;
    isSubscriber?: boolean;
  };
}

/**
 * Interfaz compatible con `ChatClient` de `@twurple/chat`.
 */
export interface TwurpleChatClientLike {
  connect(): Promise<void> | void;
  quit(): Promise<void> | void;
  join(channel: string): Promise<void>;
  part(channel: string): void;
  say(channel: string, text: string): Promise<void>;
  onMessage(
    handler: (
      channel: string,
      user: string,
      text: string,
      msg: TwurpleChatMessageContext,
    ) => void | Promise<void>,
  ): unknown;
}

/**
 * Cliente IRCv3 sobre TLS nativo para Twitch (`irc.chat.twitch.tv:6697`)
 * compatible con la interfaz `TwurpleChatClientLike`.
 * Soporta tanto modo autenticado (lectura + escritura con TWITCH_BOT_OAUTH_TOKEN)
 * como modo anónimo `justinfan` (lectura en tiempo real de comandos !pl sin token).
 */
class NativeTwitchIrcClient implements TwurpleChatClientLike {
  private socket: tls.TLSSocket | null = null;
  private isConnected = false;
  private isQuitting = false;
  private readonly joinedChannels = new Set<string>();
  private readonly messageHandlers: Array<
    (
      channel: string,
      user: string,
      text: string,
      msg: TwurpleChatMessageContext,
    ) => void | Promise<void>
  > = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lineBuffer = '';
  private readonly canSendMessages: boolean;
  private readonly botUsername: string;
  private readonly oauthToken: string;

  constructor() {
    const rawUser = (process.env.TWITCH_BOT_USERNAME || '').trim().toLowerCase();
    const rawToken = (process.env.TWITCH_BOT_OAUTH_TOKEN || '').trim();

    if (rawToken && rawToken !== 'YOUR_TWITCH_BOT_OAUTH_TOKEN') {
      this.canSendMessages = true;
      this.botUsername = rawUser || 'antigravity_bot';
      this.oauthToken = rawToken.startsWith('oauth:')
        ? rawToken
        : `oauth:${rawToken}`;
    } else {
      this.canSendMessages = false;
      this.botUsername = `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
      this.oauthToken = 'SCHMOOPIIE';
    }
  }

  connect(): void {
    if (this.isQuitting) return;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    console.log(
      `[TwitchChatService] 🔌 Conectando a Twitch IRC (irc.chat.twitch.tv:6697) como '${this.botUsername}' (modo=${
        this.canSendMessages ? 'AUTENTICADO Lectura/Escritura' : 'LECTURA EN VIVO (sin TWITCH_BOT_OAUTH_TOKEN)'
      })...`,
    );

    const sock = tls.connect({
      host: 'irc.chat.twitch.tv',
      port: 6697,
      servername: 'irc.chat.twitch.tv',
    });

    this.socket = sock;
    sock.setEncoding('utf8');

    sock.on('secureConnect', () => {
      this.isConnected = true;
      sock.write('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership\r\n');
      sock.write(`PASS ${this.oauthToken}\r\n`);
      sock.write(`NICK ${this.botUsername}\r\n`);

      console.log(
        `[TwitchChatService] ✅ Conectado a Twitch IRC como '${this.botUsername}'. Uniéndose a ${this.joinedChannels.size} canal(es) activo(s): [${Array.from(this.joinedChannels).join(', ')}]`,
      );

      for (const ch of this.joinedChannels) {
        sock.write(`JOIN #${ch}\r\n`);
      }
    });

    sock.on('data', (chunk: string) => {
      this.lineBuffer += chunk;
      const lines = this.lineBuffer.split('\r\n');
      this.lineBuffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        this.handleIrcLine(line);
      }
    });

    sock.on('error', (err: Error) => {
      console.error(`[TwitchChatService] ⚠️ Error en socket Twitch IRC: ${err.message}`);
    });

    sock.on('close', () => {
      this.isConnected = false;
      if (!this.isQuitting) {
        console.warn(
          '[TwitchChatService] 🔄 Conexión Twitch IRC cerrada. Reintentando en 5s...',
        );
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      }
    });
  }

  private handleIrcLine(line: string): void {
    if (line.startsWith('PING')) {
      const payload = line.slice(4).trim() || ':tmi.twitch.tv';
      this.socket?.write(`PONG ${payload}\r\n`);
      return;
    }

    if (line.includes('JOIN #')) {
      console.log(`[TwitchChatService] 📡 IRC JOIN confirmado: ${line}`);
      return;
    }

    if (line.includes('NOTICE * :Login authentication failed')) {
      console.error(
        '[TwitchChatService] ❌ Falló la autenticación en Twitch IRC: verifica TWITCH_BOT_USERNAME y TWITCH_BOT_OAUTH_TOKEN.',
      );
      return;
    }

    // Parsear mensajes PRIVMSG con o sin tags IRCv3
    // Ejemplo: @badge-info=;badges=broadcaster/1;display-name=Legend_Slayer4;mod=0;user-id=1234 :legend_slayer4!legend_slayer4@legend_slayer4.tmi.twitch.tv PRIVMSG #legend_slayer4 :!pl Stay The Score
    let tagsPart = '';
    let rest = line;

    if (rest.startsWith('@')) {
      const spaceIdx = rest.indexOf(' ');
      if (spaceIdx === -1) return;
      tagsPart = rest.slice(1, spaceIdx);
      rest = rest.slice(spaceIdx + 1).trim();
    }

    const privmsgMatch = rest.match(
      /^:([^!]+)!(\S+)\s+PRIVMSG\s+#(\S+)\s+:(.*)$/,
    );
    if (!privmsgMatch) return;

    const [, rawUser, , rawChannel, messageText] = privmsgMatch;
    const cleanChannel = normalizeTwitchChannel(rawChannel);
    const userName = rawUser.toLowerCase();

    const tags: Record<string, string> = {};
    if (tagsPart) {
      for (const pair of tagsPart.split(';')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) {
          tags[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
        }
      }
    }

    const badges = tags['badges'] || '';
    const isBroadcaster =
      badges.includes('broadcaster/') || userName === cleanChannel;
    const isMod = tags['mod'] === '1' || badges.includes('moderator/');
    const isVip = tags['vip'] === '1' || badges.includes('vip/');
    const isSubscriber = tags['subscriber'] === '1';

    const context: TwurpleChatMessageContext = {
      userInfo: {
        userId: tags['user-id'] || userName,
        userName,
        displayName: tags['display-name'] || rawUser,
        isBroadcaster,
        isMod,
        isVip,
        isSubscriber,
      },
    };

    for (const handler of this.messageHandlers) {
      Promise.resolve(
        handler(`#${cleanChannel}`, userName, messageText, context),
      ).catch((err: unknown) => {
        console.error(
          `[TwitchChatService] Error procesando mensaje de #${cleanChannel}: ${(err as Error).message}`,
        );
      });
    }
  }

  async join(channel: string): Promise<void> {
    const clean = normalizeTwitchChannel(channel);
    if (!clean) return;
    this.joinedChannels.add(clean);
    if (this.isConnected && this.socket) {
      console.log(
        `[TwitchChatService] ➕ Ejecutando JOIN dinámico en tiempo real al canal de Twitch: #${clean}`,
      );
      this.socket.write(`JOIN #${clean}\r\n`);
    }
  }

  part(channel: string): void {
    const clean = normalizeTwitchChannel(channel);
    if (!clean) return;
    this.joinedChannels.delete(clean);
    if (this.isConnected && this.socket) {
      console.log(`[TwitchChatService] ➖ Saliendo del canal de Twitch: #${clean}`);
      this.socket.write(`PART #${clean}\r\n`);
    }
  }

  async say(channel: string, text: string): Promise<void> {
    const clean = normalizeTwitchChannel(channel);
    if (!clean) return;

    if (!this.canSendMessages) {
      console.log(
        `[TwitchChatService] 💬 (Respuesta generada para #${clean}; configura TWITCH_BOT_OAUTH_TOKEN para escribir en el chat): ${text}`,
      );
      return;
    }

    if (this.isConnected && this.socket) {
      this.socket.write(`PRIVMSG #${clean} :${text}\r\n`);
    }
  }

  onMessage(
    handler: (
      channel: string,
      user: string,
      text: string,
      msg: TwurpleChatMessageContext,
    ) => void | Promise<void>,
  ): void {
    this.messageHandlers.push(handler);
  }

  async quit(): Promise<void> {
    this.isQuitting = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
  }
}

export interface TwitchChannelLink {
  userId: string;
  twitchChannel: string;
  twitchUserId?: string;
  guildId: string;
  voiceChannelId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  linkedAt: string;
}

const TWITCH_OAUTH_PROVIDER = 'twitch_music_bot';

@Injectable()
export class TwitchChatService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(TwitchChatService.name);
  private chatClient: TwurpleChatClientLike | null = null;

  /**
   * Mapa en memoria de canales de Twitch activos -> Configuración de Discord/Lavalink del streamer
   * Key: twitchChannel en minúsculas (sin #)
   */
  private readonly channelLinks = new Map<string, TwitchChannelLink>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lavalink: LavalinkService,
    private readonly playback: DiscordPlaybackService,
    private readonly queueManager: QueueManagerService,
    private readonly wsGateway: DiscordBotWsGateway,
    private readonly rateLimiter: TwitchRateLimiterService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // 1. Restaurar canales de Twitch vinculados desde PostgreSQL
    if (this.prisma.oAuthAccount?.findMany) {
      try {
        const records = await this.prisma.oAuthAccount.findMany({
          where: { provider: TWITCH_OAUTH_PROVIDER },
        });

        for (const rec of records) {
          const clean = normalizeTwitchChannel(rec.providerId);
          const profile = rec.profileData as Partial<TwitchChannelLink> | null;
          if (clean && profile?.guildId && profile?.voiceChannelId) {
            this.channelLinks.set(clean, {
              userId: rec.userId,
              twitchChannel: clean,
              twitchUserId: profile.twitchUserId,
              guildId: profile.guildId,
              voiceChannelId: profile.voiceChannelId,
              accessToken: profile.accessToken,
              refreshToken: profile.refreshToken,
              expiresIn: profile.expiresIn,
              linkedAt: profile.linkedAt || new Date().toISOString(),
            });
          }
        }

        console.log(
          `[TwitchChatService] 📋 ${this.channelLinks.size} canal(es) de Twitch restaurados desde PostgreSQL: [${Array.from(this.channelLinks.keys()).join(', ')}]`,
        );
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudieron restaurar canales de Twitch desde BD: ${(err as Error).message}`,
        );
      }
    }

    // 2. Inicializar y conectar el cliente IRC de Twitch si no fue inyectado manualmente
    if (!this.chatClient) {
      const ircClient = new NativeTwitchIrcClient();
      this.attachChatClient(ircClient);
      for (const ch of this.channelLinks.keys()) {
        await ircClient.join(ch);
      }
      ircClient.connect();
    }
  }

  /**
   * Permite inyectar una instancia de `ChatClient` de `@twurple/chat` (o un mock en pruebas).
   */
  attachChatClient(client: TwurpleChatClientLike): void {
    this.chatClient = client;
    this.chatClient.onMessage(async (channel, user, text, msg) => {
      await this.handleIncomingChatMessage(channel, user, text, msg);
    });
    this.logger.log(
      'Listener de @twurple/chat enlazado exitosamente a TwitchChatService.',
    );
  }

  /**
   * Vincula el canal de Twitch de un streamer con su servidor y canal de voz de Discord en Lavalink.
   */
  async linkTwitchChannel(data: {
    userId: string;
    twitchChannel: string;
    twitchUserId?: string;
    guildId: string;
    voiceChannelId: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
  }): Promise<TwitchChannelLink> {
    const cleanChannel = normalizeTwitchChannel(data.twitchChannel);

    const link: TwitchChannelLink = {
      userId: data.userId,
      twitchChannel: cleanChannel,
      twitchUserId: data.twitchUserId,
      guildId: data.guildId,
      voiceChannelId: data.voiceChannelId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      linkedAt: new Date().toISOString(),
    };

    this.channelLinks.set(cleanChannel, link);

    if (this.prisma.oAuthAccount?.upsert) {
      try {
        await this.prisma.oAuthAccount.upsert({
          where: {
            provider_providerId: {
              provider: TWITCH_OAUTH_PROVIDER,
              providerId: cleanChannel,
            },
          },
          create: {
            userId: data.userId,
            provider: TWITCH_OAUTH_PROVIDER,
            providerId: cleanChannel,
            profileData: JSON.parse(JSON.stringify(link)) as object,
          },
          update: {
            userId: data.userId,
            profileData: JSON.parse(JSON.stringify(link)) as object,
          },
        });
      } catch (err: unknown) {
        this.logger.warn(
          `Vinculación Twitch guardada en memoria para #${cleanChannel} (DB fallback: ${(err as Error).message})`,
        );
      }
    }

    if (this.chatClient) {
      await this.chatClient.join(cleanChannel).catch((err: unknown) => {
        this.logger.warn(
          `No se pudo unir al canal de Twitch #${cleanChannel}: ${(err as Error).message}`,
        );
      });
    }

    return link;
  }

  /**
   * Desvincula un canal de Twitch del bot musical.
   */
  async unlinkTwitchChannel(
    userId: string,
    twitchChannel: string,
  ): Promise<boolean> {
    const cleanChannel = normalizeTwitchChannel(twitchChannel);
    const existing = this.channelLinks.get(cleanChannel);

    if (existing && existing.userId === userId) {
      this.channelLinks.delete(cleanChannel);
    }

    if (this.chatClient) {
      this.chatClient.part(cleanChannel);
    }

    if (this.prisma.oAuthAccount?.deleteMany) {
      try {
        await this.prisma.oAuthAccount.deleteMany({
          where: {
            userId,
            provider: TWITCH_OAUTH_PROVIDER,
            providerId: cleanChannel,
          },
        });
      } catch {
        // Ignorar error de DB en fallback
      }
    }

    return Boolean(existing);
  }

  getChannelLink(twitchChannel: string): TwitchChannelLink | undefined {
    const cleanChannel = normalizeTwitchChannel(twitchChannel);
    return this.channelLinks.get(cleanChannel);
  }

  getUserLinks(userId: string): TwitchChannelLink[] {
    return Array.from(this.channelLinks.values()).filter(
      (link) => link.userId === userId,
    );
  }

  /**
   * Procesa todos los comandos del chat de Twitch:
   * - !pl <canción o URL>
   * - !song / !np
   * - !queue / !q
   * - !skip (Solo Broadcaster / Moderadores)
   * - !remove <posición> (Solo Broadcaster / Moderadores)
   */
  async handleIncomingChatMessage(
    rawChannel: string,
    user: string,
    text: string,
    msg: TwurpleChatMessageContext,
  ): Promise<string | null> {
    const cleanChannel = normalizeTwitchChannel(rawChannel);
    const trimmed = text.trim();

    console.log(
      `[TwitchChatService] 📨 Mensaje recibido en [#${cleanChannel}] de @${msg.userInfo.displayName || user}: "${trimmed}"`,
    );

    if (!trimmed.startsWith('!')) {
      return null;
    }

    const link = this.channelLinks.get(cleanChannel);
    if (!link) {
      console.warn(
        `[TwitchChatService] ⚠️ Comando recibido en #${cleanChannel}, pero el canal no figura en channelLinks activos.`,
      );
      return null;
    }

    const [rawCommand, ...args] = trimmed.split(/\s+/);
    const command = rawCommand.toLowerCase();
    const argText = args.join(' ').trim();
    const viewerMention = `@${msg.userInfo.displayName || msg.userInfo.userName}`;
    const isModOrBroadcaster =
      Boolean(msg.userInfo.isBroadcaster) || Boolean(msg.userInfo.isMod);

    switch (command) {
      case '!pl':
      case '!sr': {
        return await this.handlePlayCommand(
          cleanChannel,
          link,
          argText,
          msg,
          viewerMention,
        );
      }

      case '!song':
      case '!np': {
        const queue = this.queueManager.getQueue(link.guildId);
        if (!queue?.currentTrack) {
          return await this.reply(
            cleanChannel,
            `${viewerMention} 🔇 No hay ninguna canción reproduciéndose en este momento.`,
          );
        }
        const track = queue.currentTrack;
        return await this.reply(
          cleanChannel,
          `${viewerMention} 🎶 Sonando ahora: "${track.info.title}" de ${track.info.author} (Pedida por: ${track.requester.username})`,
        );
      }

      case '!queue':
      case '!q': {
        const queue = this.queueManager.getQueue(link.guildId);
        if (!queue || queue.tracks.length === 0) {
          return await this.reply(
            cleanChannel,
            `${viewerMention} 📋 La cola de reproducción está vacía. Usa !pl <canción o URL> para pedir una.`,
          );
        }
        const preview = queue.tracks
          .slice(0, 3)
          .map((t, idx) => `#${idx + 1} ${t.info.title}`)
          .join(' | ');
        return await this.reply(
          cleanChannel,
          `${viewerMention} 📋 En cola (${queue.tracks.length}): ${preview}`,
        );
      }

      case '!skip': {
        if (!isModOrBroadcaster) {
          return await this.reply(
            cleanChannel,
            `${viewerMention} ⛔ Solo el streamer y los moderadores del canal pueden usar !skip.`,
          );
        }

        const nextTrack = await this.playback.playNext(link.guildId);
        if (nextTrack) {
          return await this.reply(
            cleanChannel,
            `${viewerMention} ⏭️ Canción saltada. Ahora suena: "${nextTrack.info.title}".`,
          );
        }
        return await this.reply(
          cleanChannel,
          `${viewerMention} ⏭️ Canción saltada. No quedan más pistas en la cola.`,
        );
      }

      case '!remove': {
        if (!isModOrBroadcaster) {
          return await this.reply(
            cleanChannel,
            `${viewerMention} ⛔ Solo el streamer y los moderadores del canal pueden usar !remove.`,
          );
        }

        const position = parseInt(argText, 10);
        if (Number.isNaN(position) || position < 1) {
          return await this.reply(
            cleanChannel,
            `${viewerMention} ⚠️ Uso correcto: !remove <número de posición en la cola, ej. 1>.`,
          );
        }

        const removed = this.playback.removeTrack(link.guildId, position - 1);
        if (!removed) {
          return await this.reply(
            cleanChannel,
            `${viewerMention} ❌ No existe ninguna canción en la posición #${position}.`,
          );
        }

        return await this.reply(
          cleanChannel,
          `${viewerMention} 🗑️ Eliminada de la cola (#${position}): "${removed.info.title}".`,
        );
      }

      default:
        return null;
    }
  }

  private async handlePlayCommand(
    cleanChannel: string,
    link: TwitchChannelLink,
    query: string,
    msg: TwurpleChatMessageContext,
    viewerMention: string,
  ): Promise<string> {
    if (!query) {
      return await this.reply(
        cleanChannel,
        `${viewerMention} ⚠️ Uso: !pl <nombre de la canción o URL de YouTube/Spotify/SoundCloud>`,
      );
    }

    // 1. Verificar límite de 3 canciones en cola por viewer
    const currentQueue = this.queueManager.getQueue(link.guildId);
    const queueLimitCheck = this.rateLimiter.canViewerEnqueueMoreTracks(
      currentQueue,
      msg.userInfo.userId,
      DEFAULT_TWITCH_POLICY.maxTracksInQueuePerViewer,
    );

    if (!queueLimitCheck.allowed) {
      return await this.reply(
        cleanChannel,
        `${viewerMention} ✋ Ya tienes ${queueLimitCheck.currentCount}/${queueLimitCheck.maxAllowed} canciones en la cola. Espera a que se reproduzca una antes de pedir otra.`,
      );
    }

    // 2. Verificar Cooldown de 15 segundos por usuario
    const cooldownCheck = await this.rateLimiter.checkAndSetCooldown(
      cleanChannel,
      msg.userInfo.userId,
      DEFAULT_TWITCH_POLICY.cooldownSeconds,
    );

    if (!cooldownCheck.allowed) {
      return await this.reply(
        cleanChannel,
        `${viewerMention} ⏳ Espera ${cooldownCheck.remainingSeconds}s antes de pedir otra canción.`,
      );
    }

    // 3. Resolver la pista con LavalinkService
    const requester = {
      id: `twitch:${msg.userInfo.userId}`,
      username: `${msg.userInfo.displayName || msg.userInfo.userName} (Twitch)`,
    };

    console.log(
      `[TwitchChatService] 🔎 [#${cleanChannel}] Buscando canción en Lavalink para ${viewerMention}: "${query}"...`,
    );

    const resolveResult = await this.lavalink.resolveTracks(query, requester);

    if (
      resolveResult.loadType === 'error' ||
      resolveResult.loadType === 'empty' ||
      resolveResult.tracks.length === 0
    ) {
      return await this.reply(
        cleanChannel,
        `${viewerMention} ❌ No se encontró ninguna canción para "${query}".`,
      );
    }

    // En chat de Twitch siempre se toma únicamente la primera pista (evita que un viewer meta una playlist entera)
    const selectedTrack = resolveResult.tracks[0];

    // 4. Validar duración máxima de 10 minutos (600,000 ms) y que no sea stream en vivo
    const durationCheck = this.rateLimiter.isTrackDurationValid(
      selectedTrack.info.length,
      selectedTrack.info.isStream,
      DEFAULT_TWITCH_POLICY.maxTrackDurationMs,
    );

    if (!durationCheck.valid) {
      return await this.reply(
        cleanChannel,
        `${viewerMention} ⛔ ${durationCheck.reason}`,
      );
    }

    // 5. Enviar a DiscordPlaybackService (Lavalink + Cola + WebSocket para OBS Overlay)
    await this.playback.playTracks(link.guildId, link.voiceChannelId, '', [
      selectedTrack,
    ]);

    const updatedQueue = this.queueManager.getQueue(link.guildId);
    if (updatedQueue) {
      this.wsGateway.emitQueueUpdated(link.guildId, updatedQueue.toJSON());
    }

    const durationFormatted = this.formatDuration(selectedTrack.info.length);
    const queuePosition = updatedQueue ? updatedQueue.tracks.length : 0;

    const statusLabel =
      queuePosition === 0
        ? 'Reproduciendo ahora'
        : `Posición en cola: #${queuePosition}`;

    return await this.reply(
      cleanChannel,
      `${viewerMention} 🎵 Agregada: "${selectedTrack.info.title}" — ${selectedTrack.info.author} [${durationFormatted}] (${statusLabel})`,
    );
  }

  private async reply(channel: string, message: string): Promise<string> {
    if (this.chatClient) {
      try {
        await this.chatClient.say(channel, message);
      } catch (err: unknown) {
        this.logger.error(
          `Error enviando respuesta al chat de Twitch [#${channel}]: ${(err as Error).message}`,
        );
      }
    }
    return message;
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.chatClient) {
      await Promise.resolve(this.chatClient.quit()).catch(() => undefined);
    }
  }
}
