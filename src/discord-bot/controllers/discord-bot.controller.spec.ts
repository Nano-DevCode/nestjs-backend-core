import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DiscordBotController } from './discord-bot.controller';
import { DiscordGateway } from '../gateway/discord.gateway';
import { LavalinkService } from '../audio/lavalink.service';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';
import { DiscordGuildService } from '../persistence/discord-guild.service';
import { FeatureFlagsService } from '../../features/feature-flags.service';

describe('DiscordBotController', () => {
  let controller: DiscordBotController;
  let gatewayMock: { getClient: jest.Mock };
  let lavalinkMock: { isConnected: boolean; getPlayer: jest.Mock; resolveTracks: jest.Mock };
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
            ['g-1', { id: 'g-1', name: 'Server 1', channels: { cache: new Map() } }],
          ]),
        },
        user: { id: 'bot-1', tag: 'Bot#0001', displayAvatarURL: () => 'http://avatar' },
      }),
    };

    lavalinkMock = {
      isConnected: true,
      getPlayer: jest.fn().mockReturnValue({ position: 45000 }),
      resolveTracks: jest.fn(),
    };

    queueManagerMock = {
      getQueue: jest.fn(),
      getAllActiveGuildIds: jest.fn().mockReturnValue(['g-1']),
    };

    playbackMock = {
      playTracks: jest.fn(),
      pause: jest.fn().mockResolvedValue(true),
      resume: jest.fn().mockResolvedValue(true),
      playNext: jest.fn().mockResolvedValue({ info: { title: 'Next Song' } }),
      playPrevious: jest.fn().mockResolvedValue({ info: { title: 'Prev Song' } }),
      seek: jest.fn().mockResolvedValue(true),
      setVolume: jest.fn().mockResolvedValue(true),
      stop: jest.fn().mockResolvedValue(true),
      leave: jest.fn().mockResolvedValue(true),
      removeTrack: jest.fn(),
      clearQueue: jest.fn(),
    };

    guildServiceMock = {
      getGuildConfig: jest.fn().mockResolvedValue({ guildId: 'g-1', prefix: '/' }),
      updateGuildConfig: jest.fn().mockResolvedValue({
        guildId: 'g-1',
        dedicatedChannelId: 'chan-123',
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
        { provide: FeatureFlagsService, useValue: featureFlagsServiceMock },
      ],
    }).compile();

    controller = module.get<DiscordBotController>(DiscordBotController);
  });

  describe('getStatus', () => {
    it('debe retornar métricas del bot y estado de conexión', async () => {
      const status = await controller.getStatus();

      expect(status.isEnabled).toBe(true);
      expect(status.isDiscordConnected).toBe(true);
      expect(status.isLavalinkConnected).toBe(true);
      expect(status.guildCount).toBe(1);
      expect(status.activeQueuesCount).toBe(1);
      expect(status.user).toEqual({
        id: 'bot-1',
        tag: 'Bot#0001',
        avatar: 'http://avatar',
      });
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
  });

  describe('handlePlayback', () => {
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

