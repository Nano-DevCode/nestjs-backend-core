import { Test, TestingModule } from '@nestjs/testing';
import { TwitchChatService } from './twitch-chat.service';
import { TwitchRateLimiterService } from './twitch-rate-limiter.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LavalinkService } from '../audio/lavalink.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordBotWsGateway } from '../gateway/discord-bot-ws.gateway';

describe('TwitchChatService & TwitchRateLimiterService', () => {
  let service: TwitchChatService;
  let rateLimiter: TwitchRateLimiterService;
  let lavalinkMock: { resolveTracks: jest.Mock };
  let playbackMock: {
    playTracks: jest.Mock;
    playNext: jest.Mock;
    removeTrack: jest.Mock;
  };
  let queueManagerMock: { getQueue: jest.Mock };
  let wsGatewayMock: { emitQueueUpdated: jest.Mock };
  let chatClientMock: {
    connect: jest.Mock;
    quit: jest.Mock;
    join: jest.Mock;
    part: jest.Mock;
    say: jest.Mock;
    onMessage: jest.Mock;
  };

  beforeEach(async () => {
    lavalinkMock = {
      resolveTracks: jest.fn(),
    };

    playbackMock = {
      playTracks: jest.fn().mockResolvedValue({
        nowPlaying: { info: { title: 'Test Song' } },
        enqueued: 1,
      }),
      playNext: jest.fn().mockResolvedValue({ info: { title: 'Next Track' } }),
      removeTrack: jest
        .fn()
        .mockReturnValue({ info: { title: 'Removed Track' } }),
    };

    queueManagerMock = {
      getQueue: jest.fn().mockReturnValue({
        guildId: 'guild-1',
        tracks: [],
        toJSON: () => ({ guildId: 'guild-1', tracks: [] }),
      }),
    };

    wsGatewayMock = {
      emitQueueUpdated: jest.fn(),
    };

    chatClientMock = {
      connect: jest.fn(),
      quit: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      part: jest.fn(),
      say: jest.fn().mockResolvedValue(undefined),
      onMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitchRateLimiterService,
        TwitchChatService,
        { provide: PrismaService, useValue: {} },
        { provide: LavalinkService, useValue: lavalinkMock },
        { provide: DiscordPlaybackService, useValue: playbackMock },
        { provide: QueueManagerService, useValue: queueManagerMock },
        { provide: DiscordBotWsGateway, useValue: wsGatewayMock },
      ],
    }).compile();

    service = module.get<TwitchChatService>(TwitchChatService);
    rateLimiter = module.get<TwitchRateLimiterService>(
      TwitchRateLimiterService,
    );
    service.attachChatClient(chatClientMock);

    await service.linkTwitchChannel({
      userId: 'streamer-1',
      twitchChannel: 'nano_stream',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
    });
  });

  it('debe resolver y encolar una canción con !pl <canción> respetando las reglas', async () => {
    lavalinkMock.resolveTracks.mockResolvedValue({
      loadType: 'search',
      tracks: [
        {
          encoded: 'enc-1',
          info: {
            title: 'One More Time',
            author: 'Daft Punk',
            length: 320000, // 5m 20s (< 10 min)
            isStream: false,
          },
          requester: { id: 'twitch:v-1', username: 'Viewer1 (Twitch)' },
        },
      ],
    });

    const reply = await service.handleIncomingChatMessage(
      '#nano_stream',
      'viewer1',
      '!pl Daft Punk One More Time',
      {
        userInfo: {
          userId: 'v-1',
          userName: 'viewer1',
          displayName: 'Viewer1',
          isBroadcaster: false,
          isMod: false,
        },
      },
    );

    expect(lavalinkMock.resolveTracks).toHaveBeenCalledWith(
      'Daft Punk One More Time',
      {
        id: 'twitch:v-1',
        username: 'Viewer1 (Twitch)',
      },
    );
    expect(playbackMock.playTracks).toHaveBeenCalledWith(
      'guild-1',
      'voice-1',
      '',
      expect.any(Array),
    );
    expect(wsGatewayMock.emitQueueUpdated).toHaveBeenCalled();
    expect(reply).toContain('Agregada: "One More Time"');
  });

  it('debe bloquear por Cooldown (15s) si el mismo viewer envía dos !pl seguidos', async () => {
    lavalinkMock.resolveTracks.mockResolvedValue({
      loadType: 'search',
      tracks: [
        {
          encoded: 'enc-1',
          info: {
            title: 'Song A',
            author: 'Artist',
            length: 180000,
            isStream: false,
          },
          requester: { id: 'twitch:v-2', username: 'Viewer2 (Twitch)' },
        },
      ],
    });

    await service.handleIncomingChatMessage(
      '#nano_stream',
      'viewer2',
      '!pl Song A',
      {
        userInfo: {
          userId: 'v-2',
          userName: 'viewer2',
          displayName: 'Viewer2',
          isBroadcaster: false,
          isMod: false,
        },
      },
    );

    const secondReply = await service.handleIncomingChatMessage(
      '#nano_stream',
      'viewer2',
      '!pl Song B',
      {
        userInfo: {
          userId: 'v-2',
          userName: 'viewer2',
          displayName: 'Viewer2',
          isBroadcaster: false,
          isMod: false,
        },
      },
    );

    expect(secondReply).toContain('⏳ Espera');
  });

  it('debe rechazar canciones mayores a 10 minutos (600,000 ms)', async () => {
    lavalinkMock.resolveTracks.mockResolvedValue({
      loadType: 'track',
      tracks: [
        {
          encoded: 'enc-long',
          info: {
            title: '10 Hours Mix',
            author: 'Troll',
            length: 11 * 60 * 1000, // 11 minutos
            isStream: false,
          },
          requester: { id: 'twitch:v-3', username: 'Viewer3 (Twitch)' },
        },
      ],
    });

    const reply = await service.handleIncomingChatMessage(
      '#nano_stream',
      'viewer3',
      '!pl https://youtube.com/watch?v=longmix',
      {
        userInfo: {
          userId: 'v-3',
          userName: 'viewer3',
          displayName: 'Viewer3',
          isBroadcaster: false,
          isMod: false,
        },
      },
    );

    expect(reply).toContain('supera el límite máximo de 10 minutos');
    expect(playbackMock.playTracks).not.toHaveBeenCalled();
  });

  it('debe limitar a máximo 3 canciones en cola por viewer', async () => {
    queueManagerMock.getQueue.mockReturnValue({
      guildId: 'guild-1',
      tracks: [
        { requester: { id: 'twitch:v-4', username: 'Viewer4' } },
        { requester: { id: 'twitch:v-4', username: 'Viewer4' } },
        { requester: { id: 'twitch:v-4', username: 'Viewer4' } },
      ],
    });

    const reply = await service.handleIncomingChatMessage(
      '#nano_stream',
      'viewer4',
      '!pl Another Song',
      {
        userInfo: {
          userId: 'v-4',
          userName: 'viewer4',
          displayName: 'Viewer4',
          isBroadcaster: false,
          isMod: false,
        },
      },
    );

    expect(reply).toContain('Ya tienes 3/3 canciones en la cola');
    expect(lavalinkMock.resolveTracks).not.toHaveBeenCalled();
  });

  it('debe restringir !skip y !remove exclusivamente al broadcaster y moderadores', async () => {
    const viewerAttempt = await service.handleIncomingChatMessage(
      '#nano_stream',
      'viewer5',
      '!skip',
      {
        userInfo: {
          userId: 'v-5',
          userName: 'viewer5',
          displayName: 'Viewer5',
          isBroadcaster: false,
          isMod: false,
        },
      },
    );

    expect(viewerAttempt).toContain(
      '⛔ Solo el streamer y los moderadores del canal pueden usar !skip',
    );
    expect(playbackMock.playNext).not.toHaveBeenCalled();

    const modAttempt = await service.handleIncomingChatMessage(
      '#nano_stream',
      'mod1',
      '!skip',
      {
        userInfo: {
          userId: 'mod-1',
          userName: 'mod1',
          displayName: 'ModUser',
          isBroadcaster: false,
          isMod: true,
        },
      },
    );

    expect(modAttempt).toContain('⏭️ Canción saltada');
    expect(playbackMock.playNext).toHaveBeenCalledWith('guild-1');
    expect(rateLimiter).toBeDefined();
  });
});
