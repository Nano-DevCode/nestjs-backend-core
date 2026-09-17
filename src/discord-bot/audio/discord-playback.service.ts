import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import type {
  Player,
  PlayerUpdate,
  TrackEndEvent,
  TrackStuckEvent,
} from 'shoukaku';
import { LavalinkService } from './lavalink.service';
import { QueueManagerService } from '../queue/queue-manager.service';
import type { AudioTrack } from '../queue/guild-queue.model';
import { DiscordBotWsGateway } from '../gateway/discord-bot-ws.gateway';
import { loadDiscordBotConfig } from '../config/discord-bot.config';

@Injectable()
export class DiscordPlaybackService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordPlaybackService.name);
  private readonly listenersAttached = new Set<string>();
  private readonly activeFailures = new Set<string>();
  private progressInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly lavalinkService: LavalinkService,
    private readonly queueManager: QueueManagerService,
    private readonly wsGateway: DiscordBotWsGateway,
  ) {}

  onModuleInit(): void {
    const config = loadDiscordBotConfig();
    if (!config.isEnabled) return;

    // Ticker periódico de progreso de reproducción (cada 1.000 ms)
    this.progressInterval = setInterval(() => {
      this.tickProgress();
    }, 1000);
  }

  onModuleDestroy(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private tickProgress(): void {
    const activeGuildIds = this.queueManager.getAllActiveGuildIds();
    for (const guildId of activeGuildIds) {
      const queue = this.queueManager.getQueue(guildId);
      if (!queue || !queue.currentTrack || queue.isPaused) continue;

      const player = this.lavalinkService.getPlayer(guildId);
      const position = player?.position ?? queue.lastPlaybackPosition;
      queue.lastPlaybackPosition = position;

      this.wsGateway.emitTrackProgress(guildId, {
        guildId,
        position,
        duration: queue.currentTrack.info.length || 0,
        isPaused: queue.isPaused,
      });
    }
  }

  getQueuePayload(guildId: string) {
    const queue = this.queueManager.getQueue(guildId);
    if (!queue) return this.getEmptyQueuePayload(guildId);

    const player = this.lavalinkService.getPlayer(guildId);
    return {
      ...queue.toJSON(),
      position: player?.position ?? queue.lastPlaybackPosition,
    };
  }

  getEmptyQueuePayload(guildId: string) {
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

  async playTracks(
    guildId: string,
    voiceChannelId: string,
    textChannelId: string,
    tracks: AudioTrack[],
  ): Promise<{ enqueued: number; nowPlaying: AudioTrack | null }> {
    const queue = this.queueManager.getOrCreateQueue(
      guildId,
      textChannelId,
      voiceChannelId,
    );

    let player: Player | null | undefined =
      this.lavalinkService.getPlayer(guildId);
    if (!player) {
      player = await this.lavalinkService.joinVoiceChannel(
        guildId,
        voiceChannelId,
      );
    }

    if (!player) {
      throw new Error(
        'No fue posible establecer conexión con el canal de voz.',
      );
    }

    this.attachPlayerListeners(guildId, player);

    const wasIdle = !queue.currentTrack;

    queue.addTracks(tracks);

    if (wasIdle) {
      const next = queue.getNextTrack();
      if (next) {
        await this.lavalinkService.playTrack(guildId, next);
        this.wsGateway.emitTrackStart(guildId, {
          guildId,
          track: next,
        });
        this.wsGateway.emitPlaybackState(guildId, {
          guildId,
          isPaused: false,
          volume: queue.volume,
          status: 'playing',
        });
        this.wsGateway.emitQueueUpdated(guildId, this.getQueuePayload(guildId));
        return { enqueued: tracks.length - 1, nowPlaying: next };
      }
    }

    this.wsGateway.emitQueueUpdated(guildId, this.getQueuePayload(guildId));
    return { enqueued: tracks.length, nowPlaying: queue.currentTrack };
  }

  async playNext(guildId: string): Promise<AudioTrack | null> {
    const queue = this.queueManager.getQueue(guildId);
    if (!queue) return null;

    const nextTrack = queue.getNextTrack();
    if (!nextTrack) {
      await this.lavalinkService.stop(guildId);
      this.wsGateway.emitTrackStart(guildId, { guildId, track: null });
      this.wsGateway.emitPlaybackState(guildId, {
        guildId,
        isPaused: false,
        volume: queue.volume,
        status: 'idle',
      });
      this.wsGateway.emitQueueUpdated(guildId, this.getQueuePayload(guildId));
      return null;
    }

    await this.lavalinkService.playTrack(guildId, nextTrack);
    this.wsGateway.emitTrackStart(guildId, { guildId, track: nextTrack });
    this.wsGateway.emitPlaybackState(guildId, {
      guildId,
      isPaused: false,
      volume: queue.volume,
      status: 'playing',
    });
    this.wsGateway.emitQueueUpdated(guildId, this.getQueuePayload(guildId));
    return nextTrack;
  }

  async playPrevious(guildId: string): Promise<AudioTrack | null> {
    const queue = this.queueManager.getQueue(guildId);
    if (!queue) return null;

    const previousTrack = queue.getPreviousTrack();
    if (!previousTrack) return null;

    await this.lavalinkService.playTrack(guildId, previousTrack);
    this.wsGateway.emitTrackStart(guildId, {
      guildId,
      track: previousTrack,
    });
    this.wsGateway.emitPlaybackState(guildId, {
      guildId,
      isPaused: false,
      volume: queue.volume,
      status: 'playing',
    });
    this.wsGateway.emitQueueUpdated(guildId, this.getQueuePayload(guildId));
    return previousTrack;
  }

  async pause(guildId: string): Promise<boolean> {
    const queue = this.queueManager.getQueue(guildId);
    if (queue) queue.isPaused = true;
    const res = await this.lavalinkService.pause(guildId, true);
    this.wsGateway.emitPlaybackState(guildId, {
      guildId,
      isPaused: true,
      volume: queue?.volume || 100,
      status: 'paused',
    });
    return res;
  }

  async resume(guildId: string): Promise<boolean> {
    const queue = this.queueManager.getQueue(guildId);
    if (queue) queue.isPaused = false;
    const res = await this.lavalinkService.pause(guildId, false);
    this.wsGateway.emitPlaybackState(guildId, {
      guildId,
      isPaused: false,
      volume: queue?.volume || 100,
      status: 'playing',
    });
    return res;
  }

  async seek(guildId: string, positionSeconds: number): Promise<boolean> {
    const queue = this.queueManager.getQueue(guildId);
    const ms = Math.max(0, positionSeconds * 1000);
    if (queue) queue.lastPlaybackPosition = ms;
    const res = await this.lavalinkService.seek(guildId, ms);
    this.wsGateway.emitTrackProgress(guildId, {
      guildId,
      position: ms,
      duration: queue?.currentTrack?.info.length || 0,
      isPaused: queue?.isPaused ?? false,
    });
    return res;
  }

  async setVolume(guildId: string, volume: number): Promise<boolean> {
    const clamped = Math.max(0, Math.min(200, volume));
    const queue = this.queueManager.getQueue(guildId);
    if (queue) queue.volume = clamped;
    const res = await this.lavalinkService.setVolume(guildId, clamped);
    this.wsGateway.emitPlaybackState(guildId, {
      guildId,
      isPaused: queue?.isPaused ?? false,
      volume: clamped,
      status: queue?.isPaused ? 'paused' : 'playing',
    });
    return res;
  }

  async stop(guildId: string): Promise<void> {
    const queue = this.queueManager.getQueue(guildId);
    if (queue) {
      queue.clearQueue();
      queue.currentTrack = null;
      queue.isPaused = false;
    }
    await this.lavalinkService.stop(guildId);
    this.queueManager.deleteQueue(guildId);
    this.wsGateway.emitPlaybackState(guildId, {
      guildId,
      isPaused: false,
      volume: 100,
      status: 'stopped',
    });
    this.wsGateway.emitTrackStart(guildId, { guildId, track: null });
    this.wsGateway.emitQueueUpdated(
      guildId,
      this.getEmptyQueuePayload(guildId),
    );
  }

  async leave(guildId: string): Promise<void> {
    await this.stop(guildId);
    await this.lavalinkService.leaveVoiceChannel(guildId);
    this.listenersAttached.delete(guildId);
    this.wsGateway.emitPlaybackState(guildId, {
      guildId,
      isPaused: false,
      volume: 100,
      status: 'disconnected',
    });
  }

  removeTrack(guildId: string, index: number): AudioTrack | null {
    const queue = this.queueManager.getQueue(guildId);
    if (!queue) return null;
    const removed = queue.removeTrack(index);
    if (removed) {
      this.wsGateway.emitQueueUpdated(guildId, this.getQueuePayload(guildId));
    }
    return removed;
  }

  clearQueue(guildId: string): void {
    const queue = this.queueManager.getQueue(guildId);
    if (queue) {
      queue.clearQueue();
      this.wsGateway.emitQueueUpdated(guildId, this.getQueuePayload(guildId));
    }
  }

  private attachPlayerListeners(guildId: string, player: Player): void {
    if (this.listenersAttached.has(guildId)) return;
    this.listenersAttached.add(guildId);

    player.on('start', () => {
      this.logger.log(`Reproducción iniciada en guild [${guildId}]`);
      const queue = this.queueManager.getQueue(guildId);
      if (queue?.currentTrack) {
        this.wsGateway.emitTrackStart(guildId, {
          guildId,
          track: queue.currentTrack,
        });
      }
    });

    player.on('end', (data: TrackEndEvent) => {
      this.logger.log(
        `Track finalizado en [${guildId}] (Razón: ${data.reason})`,
      );
      if (data.reason === 'finished') {
        void this.playNext(guildId);
      } else if (data.reason === 'loadFailed') {
        void this.handleTrackFailure(guildId, 'loadFailed');
      }
    });

    player.on('exception', (error: unknown) => {
      const errMsg =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : JSON.stringify(error);
      this.logger.error(
        `Excepción de reproducción en [${guildId}]: ${errMsg}`,
      );
      void this.handleTrackFailure(guildId, errMsg);
    });

    player.on('stuck', (data: TrackStuckEvent) => {
      this.logger.warn(
        `Pista atascada en [${guildId}] (Umbral alcanzado: ${data.thresholdMs}ms). Intentando fallback o saltando a la siguiente...`,
      );
      void this.handleTrackFailure(guildId, `stuck:${data.thresholdMs}ms`);
    });


    player.on('update', (data: PlayerUpdate) => {
      const queue = this.queueManager.getQueue(guildId);
      if (queue && data.state && typeof data.state.position === 'number') {
        queue.lastPlaybackPosition = data.state.position;
        this.wsGateway.emitTrackProgress(guildId, {
          guildId,
          position: data.state.position,
          duration: queue.currentTrack?.info.length || 0,
          isPaused: queue.isPaused,
        });
      }
    });
  }

  private async handleTrackFailure(
    guildId: string,
    reason: string,
  ): Promise<void> {
    const queue = this.queueManager.getQueue(guildId);
    if (!queue || !queue.currentTrack) {
      await this.playNext(guildId);
      return;
    }

    const currentTrack = queue.currentTrack;
    const trackKey = `${guildId}:${currentTrack.encoded}`;
    if (this.activeFailures.has(trackKey)) {
      return;
    }
    this.activeFailures.add(trackKey);

    try {
      if (!currentTrack.fallbackAttempted) {
        currentTrack.fallbackAttempted = true;
        const rawTitle = currentTrack.info.title || '';
        const author = currentTrack.info.author || '';
        const cleanTitle = this.cleanTrackTitleForSearch(rawTitle, author);

        this.logger.warn(
          `Pista falló en reproducción en [${guildId}] ('${rawTitle}', Razón: ${reason}). Iniciando rescate adaptativo...`,
        );

        let fallbackTrack: AudioTrack | null = null;

        const isFromYouTube =
          currentTrack.info.sourceName === 'youtube' ||
          currentTrack.info.uri?.includes('youtube.com') ||
          currentTrack.info.uri?.includes('youtu.be');

        if (isFromYouTube) {
          // 1. Si la pista falló desde YouTube, priorizar rescate en SoundCloud para evitar bloqueos del CDN de YouTube
          try {
            const scQuery = `scsearch:${cleanTitle}`;
            const scResult = await this.lavalinkService.resolveTracks(
              scQuery,
              currentTrack.requester,
            );
            if (scResult.tracks.length > 0) {
              const safeTrack =
                scResult.tracks.find(
                  (t) => !t.info.isrc || t.info.isrc === '',
                ) || scResult.tracks[0];
              fallbackTrack = safeTrack;
              this.logger.log(
                `Rescate exitoso vía SoundCloud para canción de YouTube: '${fallbackTrack.info.title}'`,
              );
            }
          } catch (scErr: unknown) {
            this.logger.warn(
              `Fallback a SoundCloud no pudo completarse: ${(scErr as Error).message}`,
            );
          }

          // 2. Si SoundCloud no arrojó resultados, intentar una versión alternativa en YouTube Music
          if (!fallbackTrack) {
            try {
              const ytmQuery = `ytmsearch:${cleanTitle}`;
              const ytmResult = await this.lavalinkService.resolveTracks(
                ytmQuery,
                currentTrack.requester,
              );
              const candidate = ytmResult.tracks.find(
                (t) => t.info.identifier !== currentTrack.info.identifier,
              );
              if (candidate) {
                fallbackTrack = candidate;
                this.logger.log(
                  `Rescate secundario vía YouTube Music: '${fallbackTrack.info.title}'`,
                );
              }
            } catch (ytmErr: unknown) {
              this.logger.warn(
                `Fallback secundario a YouTube Music falló: ${(ytmErr as Error).message}`,
              );
            }
          }
        } else {
          // Si falló otra fuente (ej: SoundCloud), intentar primero con YouTube
          try {
            const ytmQuery = `ytmsearch:${cleanTitle}`;
            const ytmResult = await this.lavalinkService.resolveTracks(
              ytmQuery,
              currentTrack.requester,
            );
            if (ytmResult.tracks.length > 0) {
              fallbackTrack = ytmResult.tracks[0];
              this.logger.log(
                `Rescate exitoso vía YouTube Music: '${fallbackTrack.info.title}'`,
              );
            }
          } catch (ytmErr: unknown) {
            this.logger.warn(
              `Fallback a YouTube Music no pudo completarse: ${(ytmErr as Error).message}`,
            );
          }
        }

        if (fallbackTrack) {
          fallbackTrack.fallbackAttempted = true;
          queue.currentTrack = fallbackTrack;
          queue.lastPlaybackPosition = 0;

          await this.lavalinkService.playTrack(guildId, fallbackTrack);
          this.wsGateway.emitTrackStart(guildId, {
            guildId,
            track: fallbackTrack,
          });
          this.wsGateway.emitPlaybackState(guildId, {
            guildId,
            isPaused: false,
            volume: queue.volume,
            status: 'playing',
          });
          this.wsGateway.emitQueueUpdated(guildId, this.getQueuePayload(guildId));
          return;
        }
      }

      await this.playNext(guildId);
    } catch (err: unknown) {
      this.logger.error(
        `Error al ejecutar fallback en [${guildId}]: ${(err as Error).message}`,
      );
      await this.playNext(guildId);
    } finally {
      setTimeout(() => {
        this.activeFailures.delete(trackKey);
      }, 3000);
    }
  }

  private cleanTrackTitleForSearch(rawTitle: string, author?: string): string {
    let title = rawTitle;

    // 1. Quitar contenido entre corchetes y paréntesis: [Official Video], (Lyrics), etc.
    title = title.replace(/\[[^\]]*\]/g, ' ');
    title = title.replace(/\([^)]*\)/g, ' ');

    // 2. Cortar después de separadores comunes de subtítulos y metadatos: //, |, •
    title = title.replace(/(\/\/|\||•).*/, ' ');

    // 3. Remover palabras clave comunes de YouTube
    title = title.replace(
      /\b(official\s+video|official\s+music\s+video|official\s+audio|music\s+video|video\s+oficial|audio\s+oficial|letra\s+en\s+español|sub\s+español|subtitulado|sub\s+eng|lyrics|letra|visualizer|hd|4k|remastered|remaster)\b/gi,
      ' ',
    );

    // 4. Limpiar caracteres especiales dejando letras, números, espacios y guiones
    title = title.replace(/[^\p{L}\p{N}\s\-']/gu, ' ');
    title = title.replace(/\s*-\s*$/, '');
    title = title.replace(/\s+/g, ' ').trim();

    // 5. Si el título ya contiene "Artista - Canción" o ya incluye el autor, no concatenar el autor
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
