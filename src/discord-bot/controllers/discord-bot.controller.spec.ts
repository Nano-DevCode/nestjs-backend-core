import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DiscordBotController } from './discord-bot.controller';
import { DiscordGateway } from '../gateway/discord.gateway';
import { LavalinkService } from '../audio/lavalink.service';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';
import { DiscordGuildService } from '../persistence/discord-guild.service';
import { DiscordOAuthService } from '../oauth/discord-oauth.service';
import { FeatureFlagsService } from '../../features/feature-flags.service';

describe('DiscordBotController', () => {
  let controller: DiscordBotController;
  let gatewayMock: { getClient: jest.Mock };
  let lavalinkMock: {
    isConnected: boolean;
    getPlayer: jest.Mock;
    resolveTracks: jest.Mock;
    getNodesStatus: jest.Mock;
    registerNode: jest.Mock;
  };
  let queueManagerMock: {
    getQueue: jest.Mock;
    getAllActiveGuildIds: jest.Mock;
  };
  let playbackMock: {
    playTracks: jest.Mock;
    pause: jest.Mock;
    resume: jest.Mock;
    playNext: jest.Mock;
    playPrevious: jest.Mock;
    seek: jest.Mock;
    setVolume: jest.Mock;
    stop: jest.Mock;
    leave: jest.Mock;
    removeTrack: jest.Mock;
    clearQueue: jest.Mock;
  };
  let guildServiceMock: {
    getGuildConfig: jest.Mock;
    updateGuildConfig: jest.Mock;
    registerUserLavalinkSession: jest.Mock;
    getUserRegistrations: jest.Mock;
    getUserGuildRegistration: jest.Mock;
    unregisterUserGuild: jest.Mock;
    getUserDiscordId: jest.Mock;
    hasGuildAccess: jest.Mock;
  };
  let discordOAuthMock: {
    getAuthorizationUrl: jest.Mock;
    verifySignedState: jest.Mock;
    syncUserGuildsFromOAuth: jest.Mock;
  };
  let featureFlagsServiceMock: {
    isFeatureEnabled: jest.Mock;
  };

  beforeEach(async () => {
    gatewayMock = {
      getClient: jest.fn().mockReturnValue({
        isReady: jest.fn().mockReturnValue(true),
        guilds: {
          cache: new Map([
            [
              'g-1',
              {
                id: 'g-1',
                name: 'Server 1',
                ownerId: 'discord-user-99',
                iconURL: () => 'http://guild-icon',
                memberCount: 15,
                channels: { cache: new Map() },
                voiceStates: {
                  cache: new Map([
                    ['discord-user-99', { channelId: 'voice-chan-auto' }],
                  ]),
                },
              },
            ],
            [
              'g-2',
              {
                id: 'g-2',
                name: 'Other User Server',
                ownerId: 'other-discord-owner',
                iconURL: () => 'http://guild-icon-2',
                memberCount: 40,
                channels: { cache: new Map() },
                voiceStates: { cache: new Map() },
              },
            ],
          ]),
        },
        user: {
          id: 'bot-1',
          tag: 'Bot#0001',
          displayAvatarURL: () => 'http://avatar',
        },
      }),
    };

    lavalinkMock = {
      isConnected: true,
      getPlayer: jest.fn().mockReturnValue({ position: 45000 }),
      resolveTracks: jest.fn(),
      getNodesStatus: jest.fn().mockReturnValue([
        {
          name: 'lavalink-node-1',
          state: 1,
          connected: true,
          players: 1,
          playingPlayers: 1,
        },
      ]),
      registerNode: jest.fn().mockReturnValue({
        registered: true,
        nodeName: 'custom-node',
        isConnected: true,
        message: 'Registrado',
      }),
    };

    queueManagerMock = {
      getQueue: jest.fn(),
      getAllActiveGuildIds: jest.fn().mockReturnValue(['g-1']),
    };

    playbackMock = {
      playTracks: jest.fn().mockResolvedValue({
        nowPlaying: { info: { title: 'Song 1' } },
        enqueued: 1,
      }),
      pause: jest.fn().mockResolvedValue(true),
      resume: jest.fn().mockResolvedValue(true),
      playNext: jest.fn().mockResolvedValue({ info: { title: 'Next Song' } }),
      playPrevious: jest
        .fn()
        .mockResolvedValue({ info: { title: 'Prev Song' } }),
      seek: jest.fn().mockResolvedValue(true),
      setVolume: jest.fn().mockResolvedValue(true),
      stop: jest.fn().mockResolvedValue(true),
      leave: jest.fn().mockResolvedValue(true),
      removeTrack: jest.fn(),
      clearQueue: jest.fn(),
    };

    guildServiceMock = {
      getGuildConfig: jest
        .fn()
        .mockResolvedValue({ guildId: 'g-1', prefix: '/' }),
      updateGuildConfig: jest.fn().mockResolvedValue({
        guildId: 'g-1',
        dedicatedChannelId: 'chan-123',
      }),
      registerUserLavalinkSession: jest.fn().mockResolvedValue({
        userId: 'user-123',
        guildId: 'g-1',
        guildName: 'Server 1',
        role: 'OWNER',
        voiceChannelId: 'voice-chan-auto',
        discordUserId: 'discord-user-99',
        nodeName: 'lavalink-node-1',
        linkedAt: '2026-11-10T00:00:00.000Z',
        registeredAt: '2026-11-10T00:00:00.000Z',
      }),
      getUserRegistrations: jest.fn().mockResolvedValue([]),
      getUserGuildRegistration: jest.fn().mockResolvedValue(null),
      unregisterUserGuild: jest.fn().mockResolvedValue(true),
      getUserDiscordId: jest.fn().mockResolvedValue(null),
      hasGuildAccess: jest.fn().mockResolvedValue(true),
    };

    discordOAuthMock = {
      getAuthorizationUrl: jest.fn().mockReturnValue({
        authorizeUrl: 'https://discord.com/oauth2/authorize?client_id=bot-1',
        scopes: ['identify', 'guilds'],
        state: 'signed.state',
      }),
      verifySignedState: jest.fn().mockReturnValue({
        userId: 'user-123',
        redirectPath: '/admin/discord-bot',
      }),
      syncUserGuildsFromOAuth: jest.fn().mockResolvedValue({
        discordUser: { id: 'discord-user-99', username: 'nano' },
        linkedGuilds: [{ userId: 'user-123', guildId: 'g-1', role: 'OWNER' }],
        eligibleWithoutBot: [],
      }),
    };

    featureFlagsServiceMock = {
      isFeatureEnabled: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscordBotController],
      providers: [
        { provide: DiscordGateway, useValue: gatewayMock },
        { provide: LavalinkService, useValue: lavalinkMock },
        { provide: QueueManagerService, useValue: queueManagerMock },
        { provide: DiscordPlaybackService, useValue: playbackMock },
        { provide: DiscordGuildService, useValue: guildServiceMock },
        { provide: DiscordOAuthService, useValue: discordOAuthMock },
        { provide: FeatureFlagsService, useValue: featureFlagsServiceMock },
      ],
    }).compile();

    controller = module.get<DiscordBotController>(DiscordBotController);
  });

  describe('getStatus', () => {
    it('debe retornar métricas del bot, nodos Lavalink, inviteUrl y sesiones para un administrador', async () => {
      const status = await controller.getStatus({
        user: { id: 'admin-1', email: 'admin@example.com', roles: ['admin'] },
      } as never);

      expect(status.isEnabled).toBe(true);
      expect(status.isDiscordConnected).toBe(true);
      expect(status.isLavalinkConnected).toBe(true);
      expect(status.guildCount).toBe(2);
      expect(status.activeQueuesCount).toBe(1);
      expect(status.inviteUrl).toContain('client_id=bot-1');
      expect(status.lavalinkNodes).toHaveLength(1);
      expect(status.user).toEqual({
        id: 'bot-1',
        tag: 'Bot#0001',
        avatar: 'http://avatar',
      });
    });

    it('debe ocultar nodos Lavalink y métricas globales a usuarios estándar ("user")', async () => {
      const status = await controller.getStatus({
        user: { id: 'user-123', email: 'test@example.com', roles: ['user'] },
      } as never);

      expect(status.lavalinkNodes).toEqual([]);
      expect(status.guildCount).toBe(0);
      expect(status.activeQueuesCount).toBe(0);
    });
  });

  describe('getGuilds (Aislamiento Multi-Usuario)', () => {
    it('usuario estándar ("user") solo recibe los servidores vinculados a su userId', async () => {
      guildServiceMock.getUserRegistrations.mockResolvedValue([
        {
          userId: 'user-123',
          guildId: 'g-1',
          role: 'OWNER',
        },
      ]);

      const guilds = await controller.getGuilds({
        user: { id: 'user-123', email: 'user@example.com', roles: ['user'] },
      } as never);

      expect(guilds).toHaveLength(1);
      expect(guilds[0].id).toBe('g-1');
    });

    it('administrador ("admin") puede listar todos los servidores globales del bot', async () => {
      const guilds = await controller.getGuilds({
        user: { id: 'admin-1', email: 'admin@example.com', roles: ['admin'] },
      } as never);

      expect(guilds).toHaveLength(2);
    });
  });

  describe('registerInLavalink & getMyLavalinkSessions', () => {
    it('debe registrar a un usuario regular en Lavalink verificando que sea ownerId y autodetectando su canal de voz', async () => {
      const res = await controller.registerInLavalink(
        {
          guildId: 'g-1',
          discordUserId: 'discord-user-99',
        },
        {
          user: { id: 'user-123', email: 'user@example.com', roles: ['user'] },
        } as never,
      );

      expect(res.success).toBe(true);
      expect(
        guildServiceMock.registerUserLavalinkSession,
      ).toHaveBeenCalledWith('user-123', {
        guildId: 'g-1',
        guildName: 'Server 1',
        role: 'OWNER',
        voiceChannelId: 'voice-chan-auto',
        discordUserId: 'discord-user-99',
        nodeName: 'lavalink-node-1',
      });
    });

    it('debe rechazar con ForbiddenException si un usuario intenta vincular por Guild ID un servidor donde NO es owner ni administrador', async () => {
      await expect(
        controller.registerInLavalink(
          {
            guildId: 'g-2',
            discordUserId: 'intruder-discord-id',
          },
          {
            user: {
              id: 'user-123',
              email: 'user@example.com',
              roles: ['user'],
            },
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe lanzar ForbiddenException si un usuario sin rol admin intenta registrar un customNode', async () => {
      await expect(
        controller.registerInLavalink(
          {
            guildId: 'g-1',
            customNode: {
              name: 'my-node',
              host: '127.0.0.1',
              port: 2333,
              password: 'pass',
            },
          },
          {
            user: {
              id: 'user-123',
              email: 'user@example.com',
              roles: ['user'],
            },
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('checkBotEnabled (Feature Flag)', () => {
    it('debe lanzar ServiceUnavailableException si DISCORD_BOT_ENABLED es false', async () => {
      featureFlagsServiceMock.isFeatureEnabled.mockResolvedValue(false);

      await expect(controller.getQueue('g-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('getQueue', () => {
    it('debe retornar estado por defecto si no existe una cola activa', async () => {
      queueManagerMock.getQueue.mockReturnValue(undefined);

      const queue = await controller.getQueue('g-1');
      expect(queue.guildId).toBe('g-1');
      expect(queue.currentTrack).toBeNull();
      expect(queue.tracks).toEqual([]);
    });

    it('debe retornar la cola existente con la posición actual del reproductor', async () => {
      const mockQueue = {
        toJSON: () => ({
          guildId: 'g-1',
          currentTrack: { info: { title: 'Song 1' } },
          tracks: [],
          volume: 100,
        }),
        lastPlaybackPosition: 20000,
      };
      queueManagerMock.getQueue.mockReturnValue(mockQueue);

      const queue = await controller.getQueue('g-1');
      expect(queue.position).toBe(45000);
      expect(queue.guildId).toBe('g-1');
    });

    it('debe lanzar ForbiddenException (403) si el usuario no tiene asignado ese guildId', async () => {
      guildServiceMock.hasGuildAccess.mockResolvedValue(false);

      await expect(
        controller.getQueue('g-2', {
          user: { id: 'user-123', email: 'user@example.com', roles: ['user'] },
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handlePlayback', () => {
    it('debe reproducir usando la identidad del usuario autenticado y su sesión registrada en Lavalink', async () => {
      guildServiceMock.getUserGuildRegistration.mockResolvedValue({
        userId: 'user-123',
        guildId: 'g-1',
        voiceChannelId: 'voice-chan-registered',
        nodeName: 'lavalink-node-1',
      });
      lavalinkMock.resolveTracks.mockResolvedValue({
        loadType: 'search',
        tracks: [
          {
            encoded: 'enc-1',
            info: { title: 'Song 1' },
            requester: { id: 'user-123', username: 'user@example.com' },
          },
        ],
      });

      const res = await controller.handlePlayback(
        'g-1',
        { action: 'play', query: 'daft punk' },
        {
          user: { id: 'user-123', email: 'user@example.com', roles: ['user'] },
        } as never,
      );

      expect(lavalinkMock.resolveTracks).toHaveBeenCalledWith('daft punk', {
        id: 'user-123',
        username: 'user@example.com',
      });
      expect(playbackMock.playTracks).toHaveBeenCalledWith(
        'g-1',
        'voice-chan-registered',
        '',
        expect.any(Array),
      );
      expect(res.success).toBe(true);
    });

    it('debe pausar la reproducción cuando action es pause', async () => {
      const res = await controller.handlePlayback('g-1', { action: 'pause' });
      expect(playbackMock.pause).toHaveBeenCalledWith('g-1');
      expect(res.success).toBe(true);
    });

    it('debe reanudar la reproducción cuando action es resume', async () => {
      const res = await controller.handlePlayback('g-1', { action: 'resume' });
      expect(playbackMock.resume).toHaveBeenCalledWith('g-1');
      expect(res.success).toBe(true);
    });

    it('debe saltar pista cuando action es skip', async () => {
      const res = await controller.handlePlayback('g-1', { action: 'skip' });
      expect(playbackMock.playNext).toHaveBeenCalledWith('g-1');
      expect(res.nextTrack).toBeDefined();
    });

    it('debe cambiar volumen cuando action es volume', async () => {
      const res = await controller.handlePlayback('g-1', {
        action: 'volume',
        value: 80,
      });
      expect(playbackMock.setVolume).toHaveBeenCalledWith('g-1', 80);
      expect(res.success).toBe(true);
    });

    it('debe detener reproducción cuando action es stop', async () => {
      const res = await controller.handlePlayback('g-1', { action: 'stop' });
      expect(playbackMock.stop).toHaveBeenCalledWith('g-1');
      expect(res.success).toBe(true);
    });
  });

  describe('removeTrack and clearQueue', () => {
    it('debe lanzar NotFoundException si no existe cola para la guild', async () => {
      queueManagerMock.getQueue.mockReturnValue(undefined);

      await expect(controller.removeTrack('g-1', '0')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe vaciar la cola llamando a clearQueue', async () => {
      queueManagerMock.getQueue.mockReturnValue({ tracks: [{}, {}] });

      const res = await controller.clearQueue('g-1');
      expect(playbackMock.clearQueue).toHaveBeenCalledWith('g-1');
      expect(res.count).toBe(2);
    });
  });

  describe('updateGuildConfig', () => {
    it('debe actualizar canal dedicado de la guild', async () => {
      const res = await controller.updateGuildConfig('g-1', {
        dedicatedChannelId: 'chan-123',
      });
      expect(guildServiceMock.updateGuildConfig).toHaveBeenCalledWith('g-1', {
        dedicatedChannelId: 'chan-123',
      });
      expect(res.success).toBe(true);
    });
  });
});
