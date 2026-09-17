import { Injectable, Logger } from '@nestjs/common';
import { Shoukaku, Connectors, LoadType, type Player } from 'shoukaku';
import type { Client } from 'discord.js';
import type { DiscordBotConfig } from '../config/discord-bot.config';
import type {
  AudioTrack,
  AudioTrackInfo,
  AudioTrackRequester,
} from '../queue/guild-queue.model';

export interface TrackResolveResult {
  loadType: 'track' | 'playlist' | 'search' | 'empty' | 'error';
  tracks: AudioTrack[];
  playlistName?: string;
  error?: string;
}

@Injectable()
export class LavalinkService {
  private readonly logger = new Logger(LavalinkService.name);
  private shoukaku: Shoukaku | null = null;
  private isNodeReady = false;

  init(client: Client, config: DiscordBotConfig): void {
    if (!config.isEnabled) {
      this.logger.log(
        'LavalinkService omitido: DISCORD_BOT_ENABLED está desactivado.',
      );
      return;
    }

    const nodes = [
      {
        name: config.lavalink.name,
        url: `${config.lavalink.host}:${config.lavalink.port}`,
        auth: config.lavalink.password,
        secure: config.lavalink.secure,
      },
    ];

    try {
      this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
        moveOnDisconnect: true,
        resume: true,
        reconnectTries: 5,
        restTimeout: 10000,
      });

      this.shoukaku.on('ready', (name: string, resumed: boolean) => {
        this.isNodeReady = true;
        this.logger.log(`Nodo Lavalink [${name}] listo. (Resumed: ${resumed})`);
      });

      this.shoukaku.on('error', (name: string, error: unknown) => {
        this.logger.error(
          `Error en nodo Lavalink [${name}]: ${(error as Error).message}`,
        );
      });

      this.shoukaku.on(
        'close',
        (name: string, code: number, reason: string) => {
          this.isNodeReady = false;
          this.logger.warn(
            `Conexión cerrada con Lavalink [${name}] (Código: ${code}, Razón: ${reason})`,
          );
        },
      );

      this.shoukaku.on('disconnect', (name: string, count: number) => {
        this.isNodeReady = false;
        this.logger.warn(
          `Nodo Lavalink [${name}] desconectado. Intento #${count}`,
        );
      });
    } catch (err: unknown) {
      this.logger.error(
        `Error al inicializar Shoukaku: ${(err as Error).message}`,
      );
    }
  }

  get isConnected(): boolean {
    return this.isNodeReady && this.shoukaku !== null;
  }

  getPlayer(guildId: string): Player | undefined {
    return this.shoukaku?.players.get(guildId);
  }

  async joinVoiceChannel(
    guildId: string,
    channelId: string,
    shardId = 0,
  ): Promise<Player | null> {
    if (!this.shoukaku) {
      throw new Error('Shoukaku no está inicializado.');
    }
    try {
      const player = await this.shoukaku.joinVoiceChannel({
        guildId,
        channelId,
        shardId,
        deaf: true,
      });
      return player;
    } catch (error: unknown) {
      this.logger.error(
        `Error al unirse al canal de voz en [${guildId}]: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async leaveVoiceChannel(guildId: string): Promise<void> {
    if (!this.shoukaku) return;
    try {
      await this.shoukaku.leaveVoiceChannel(guildId);
    } catch (error: unknown) {
      this.logger.warn(
        `Aviso al abandonar canal de voz [${guildId}]: ${(error as Error).message}`,
      );
    }
  }

  async resolveTracks(
    query: string,
    requester: AudioTrackRequester,
  ): Promise<TrackResolveResult> {
    if (!this.shoukaku) {
      return {
        loadType: 'error',
        tracks: [],
        error: 'Servicio Lavalink no disponible',
      };
    }

    const node = this.shoukaku.getIdealNode();
    if (!node) {
      return {
        loadType: 'error',
        tracks: [],
        error: 'No hay nodos de Lavalink disponibles para procesar la búsqueda',
      };
    }

    let processedQuery = query.trim();

    // 1. Detección y resolución de metadatos de enlaces de Spotify mediante OpenGraph
    const isSpotifyUrl =
      /^(https?:\/\/)?(open\.)?spotify\.com\/track\/([a-zA-Z0-9]+)/i.test(
        processedQuery,
      );
    if (isSpotifyUrl) {
      try {
        const spotifyUrl = processedQuery.startsWith('http')
          ? processedQuery
          : `https://${processedQuery}`;
        const resp = await fetch(spotifyUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(4000),
        });
        if (resp.ok) {
          const html = await resp.text();
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            const rawTitle = titleMatch[1]
              .replace(/\s*\|\s*Spotify$/i, '')
              .replace(/ - song and lyrics by /i, ' ')
              .replace(/ - song by /i, ' ')
              .replace(/ - track by /i, ' ')
              .trim();
            if (rawTitle) {
              this.logger.log(
                `Enlace de Spotify resuelto a metadatos de búsqueda: '${rawTitle}'`,
              );
              processedQuery = rawTitle;
            }
          }
        }
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudo resolver metadatos de Spotify para '${processedQuery}': ${(err as Error).message}`,
        );
      }
    }

    const isUrl = /^https?:\/\//i.test(processedQuery);
    const hasSearchPrefix = /^(ytsearch|ytmsearch|scsearch):/i.test(
      processedQuery,
    );

    let identifier: string;
    let allowFallback = false;

    if (isUrl || hasSearchPrefix) {
      identifier = processedQuery;
      if (/^(ytsearch|ytmsearch):/i.test(processedQuery)) {
        allowFallback = true;
      }
    } else {
      // Priorizar YouTube Music (ytmsearch) con cliente WEB_REMIX para máxima estabilidad
      identifier = `ytmsearch:${processedQuery}`;
      allowFallback = true;
    }

    let result = await this.resolveIdentifier(node, identifier, requester);

    // 2. Cascada automática: si ytmsearch no encuentra o falla, reintentar con ytsearch y luego scsearch
    if (
      allowFallback &&
      (result.loadType === 'empty' ||
        result.loadType === 'error' ||
        result.tracks.length === 0)
    ) {
      const cleanTerm = processedQuery
        .replace(/^(ytsearch|ytmsearch|scsearch):/i, '')
        .trim();

      if (identifier.startsWith('ytmsearch:')) {
        const ytResult = await this.resolveIdentifier(
          node,
          `ytsearch:${cleanTerm}`,
          requester,
        );
        if (ytResult.tracks.length > 0) {
          return ytResult;
        }
      }

      const scIdentifier = `scsearch:${cleanTerm}`;
      this.logger.log(
        `Búsqueda en YouTube no arrojó resultados para '${cleanTerm}'. Reintentando con SoundCloud (${scIdentifier})...`,
      );
      const scResult = await this.resolveIdentifier(
        node,
        scIdentifier,
        requester,
      );
      if (scResult.tracks.length > 0) {
        return scResult;
      }
    }

    // 3. Fallback de enlace directo de YouTube mediante oEmbed si Lavalink no pudo resolverlo
    const isYouTubeUrl =
      /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i.test(
        processedQuery,
      );

    if (
      isYouTubeUrl &&
      (result.loadType === 'empty' ||
        result.loadType === 'error' ||
        result.tracks.length === 0)
    ) {
      try {
        const fullYtUrl = processedQuery.startsWith('http')
          ? processedQuery
          : `https://${processedQuery}`;
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(fullYtUrl)}&format=json`;
        const oembedResp = await fetch(oembedUrl, {
          signal: AbortSignal.timeout(4000),
        });
        if (oembedResp.ok) {
          const data = (await oembedResp.json()) as {
            title?: string;
            author_name?: string;
          };
          if (data.title) {
            const cleanTitle = this.cleanTrackTitleForSearch(
              data.title,
              data.author_name,
            );
            this.logger.log(
              `Enlace de YouTube no se pudo resolver directamente ('${fullYtUrl}'). Título oEmbed: '${data.title}'. Resolviendo vía YouTube Music...`,
            );

            // Intento 1: YouTube Music oficial
            const ytmResult = await this.resolveIdentifier(
              node,
              `ytmsearch:${cleanTitle}`,
              requester,
            );
            if (ytmResult.tracks.length > 0) {
              return ytmResult;
            }

            // Intento 2: SoundCloud
            const scResult = await this.resolveIdentifier(
              node,
              `scsearch:${cleanTitle}`,
              requester,
            );
            if (scResult.tracks.length > 0) {
              return scResult;
            }
          }
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Fallback de oEmbed para YouTube falló en '${processedQuery}': ${(err as Error).message}`,
        );
      }
    }

    return result;
  }

  private async resolveIdentifier(
    node: NonNullable<ReturnType<Shoukaku['getIdealNode']>>,
    identifier: string,
    requester: AudioTrackRequester,
  ): Promise<TrackResolveResult> {
    try {
      const res = await node.rest.resolve(identifier);

      if (!res) {
        return { loadType: 'empty', tracks: [] };
      }

      switch (res.loadType) {
        case LoadType.TRACK: {
          const trackData = res.data as {
            encoded: string;
            info: AudioTrackInfo;
          };

          const audioTrack: AudioTrack = {
            encoded: trackData.encoded,
            info: trackData.info,
            requester,
          };
          return { loadType: 'track', tracks: [audioTrack] };
        }

        case LoadType.PLAYLIST: {
          const playlistData = res.data as {
            info: { name: string; selectedTrack: number };
            tracks: Array<{
              encoded: string;
              info: AudioTrackInfo;
            }>;
          };

          const audioTracks: AudioTrack[] = playlistData.tracks.map((t) => ({
            encoded: t.encoded,
            info: t.info,
            requester,
          }));

          return {
            loadType: 'playlist',
            tracks: audioTracks,
            playlistName: playlistData.info.name,
          };
        }

        case LoadType.SEARCH: {
          const searchData = res.data as Array<{
            encoded: string;
            info: AudioTrackInfo;
          }>;

          const audioTracks: AudioTrack[] = searchData.map((t) => ({
            encoded: t.encoded,
            info: t.info,
            requester,
          }));

          return { loadType: 'search', tracks: audioTracks };
        }

        case LoadType.EMPTY:
          return { loadType: 'empty', tracks: [] };

        case LoadType.ERROR:
        default: {
          const errData = res.data as { message?: string } | undefined;
          return {
            loadType: 'error',
            tracks: [],
            error: errData?.message || 'Error desconocido al resolver la pista',
          };
        }
      }
    } catch (err: unknown) {
      this.logger.error(
        `Excepción al resolver búsqueda '${identifier}': ${(err as Error).message}`,
      );
      return {
        loadType: 'error',
        tracks: [],
        error: (err as Error).message,
      };
    }
  }


  async playTrack(guildId: string, track: AudioTrack): Promise<boolean> {
    const player = this.getPlayer(guildId);
    if (!player) return false;

    try {
      await player.playTrack({ track: { encoded: track.encoded } });
      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Error al reproducir pista en guild [${guildId}]: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async pause(guildId: string, paused: boolean): Promise<boolean> {
    const player = this.getPlayer(guildId);
    if (!player) return false;
    try {
      await player.setPaused(paused);
      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Error al pausar/reanudar en [${guildId}]: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async seek(guildId: string, positionMs: number): Promise<boolean> {
    const player = this.getPlayer(guildId);
    if (!player) return false;
    try {
      await player.seekTo(positionMs);
      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Error al buscar posición en [${guildId}]: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async setVolume(guildId: string, volume: number): Promise<boolean> {
    const player = this.getPlayer(guildId);
    if (!player) return false;
    try {
      await player.setGlobalVolume(volume);
      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Error al ajustar volumen en [${guildId}]: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async stop(guildId: string): Promise<boolean> {
    const player = this.getPlayer(guildId);
    if (!player) return false;
    try {
      await player.stopTrack();
      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Error al detener reproducción en [${guildId}]: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private cleanTrackTitleForSearch(rawTitle: string, author?: string): string {
    let title = rawTitle;

    title = title.replace(/\[[^\]]*\]/g, ' ');
    title = title.replace(/\([^)]*\)/g, ' ');
    title = title.replace(/(\/\/|\||•).*/, ' ');
    title = title.replace(
      /\b(official\s+video|official\s+music\s+video|official\s+audio|music\s+video|video\s+oficial|audio\s+oficial|letra\s+en\s+español|sub\s+español|subtitulado|sub\s+eng|lyrics|letra|visualizer|hd|4k|remastered|remaster)\b/gi,
      ' ',
    );
    title = title.replace(/[^\p{L}\p{N}\s\-']/gu, ' ');
    title = title.replace(/\s*-\s*$/, '');
    title = title.replace(/\s+/g, ' ').trim();

    if (
      title.includes('-') ||
      (author && title.toLowerCase().includes(author.toLowerCase()))
    ) {
      return title;
    }

    if (author && !/channel|vevo|records|lyrics|subs|topic|!/i.test(author)) {
      return `${title} ${author}`.trim();
    }

    return title;
  }
}
