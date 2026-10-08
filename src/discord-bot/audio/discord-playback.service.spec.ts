import { DiscordPlaybackService } from './discord-playback.service';
import { LavalinkService } from './lavalink.service';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordBotWsGateway } from '../gateway/discord-bot-ws.gateway';
import type { AudioTrack } from '../queue/guild-queue.model';
import { GuildQueue } from '../queue/guild-queue.model';

describe('DiscordPlaybackService', () => {
  let service: DiscordPlaybackService;
  let mockLavalinkService: jest.Mocked<LavalinkService>;
  let mockQueueManager: jest.Mocked<QueueManagerService>;
  let mockWsGateway: jest.Mocked<DiscordBotWsGateway>;

  const mockTrack: AudioTrack = {
    encoded: 'encoded-track-1',
    info: {
      identifier: 'id-1',
      isSeekable: true,
      author: 'Test Artist',
      length: 180000,
      isStream: false,
      position: 0,
      title: 'Test Song',
      uri: 'https://youtube.com/watch?v=id-1',
      sourceName: 'youtube',
    },
    requester: { id: 'user-1', username: 'Tester' },
  };

  let mockPlayer: any;

  beforeEach(() => {
    mockPlayer = {
      position: 1000,
      on: jest.fn(),
    };

    mockLavalinkService = {
      getPlayer: jest.fn().mockReturnValue(mockPlayer),
      joinVoiceChannel: jest.fn().mockResolvedValue(mockPlayer),
      playTrack: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn().mockResolvedValue(true),
      seek: jest.fn().mockResolvedValue(true),
      setVolume: jest.fn().mockResolvedValue(true),
      leaveVoiceChannel: jest.fn().mockResolvedValue(undefined),
      resolveTracks: jest.fn(),
    } as unknown as jest.Mocked<LavalinkService>;

    mockQueueManager = {
      getQueue: jest.fn(),
      getOrCreateQueue: jest.fn(),
      deleteQueue: jest.fn(),
      getAllActiveGuildIds: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<QueueManagerService>;

    mockWsGateway = {
      emitTrackProgress: jest.fn(),
      emitTrackStart: jest.fn(),
      emitPlaybackState: jest.fn(),
      emitQueueUpdated: jest.fn(),
    } as unknown as jest.Mocked<DiscordBotWsGateway>;

    service = new DiscordPlaybackService(
      mockLavalinkService,
      mockQueueManager,
      mockWsGateway,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should initialize and destroy periodic progress intervals without crashing', () => {
    service.onModuleInit();
    expect(service).toBeDefined();
    service.onModuleDestroy();
  });

  describe('getQueuePayload & getEmptyQueuePayload', () => {
    it('should return empty payload when queue does not exist', () => {
      mockQueueManager.getQueue.mockReturnValue(undefined);

      const payload = service.getQueuePayload('guild-1');

      expect(payload).toEqual({
        guildId: 'guild-1',
        currentTrack: null,
        tracks: [],
        history: [],
        volume: 100,
        isPaused: false,
        repeatMode: 'off',
        position: 0,
      });
    });

    it('should return populated payload with player position when queue exists', () => {
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      queue.currentTrack = mockTrack;
      mockQueueManager.getQueue.mockReturnValue(queue);

      const payload = service.getQueuePayload('guild-1');

      expect(payload.guildId).toBe('guild-1');
      expect(payload.currentTrack).toEqual(mockTrack);
      expect(payload.position).toBe(1000);
    });
  });

  describe('playTracks', () => {
    it('should throw error if player cannot be joined', async () => {
      mockLavalinkService.getPlayer.mockReturnValue(null);
      mockLavalinkService.joinVoiceChannel.mockResolvedValue(null);
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      mockQueueManager.getOrCreateQueue.mockReturnValue(queue);

      await expect(
        service.playTracks('guild-1', 'vc-1', 'ch-1', [mockTrack]),
      ).rejects.toThrow('No fue posible establecer conexión con el canal de voz.');
    });

    it('should play first track when queue is initially idle', async () => {
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      mockQueueManager.getOrCreateQueue.mockReturnValue(queue);

      const res = await service.playTracks('guild-1', 'vc-1', 'ch-1', [mockTrack]);

      expect(res.nowPlaying).toEqual(mockTrack);
      expect(mockLavalinkService.playTrack).toHaveBeenCalledWith('guild-1', mockTrack);
      expect(mockWsGateway.emitTrackStart).toHaveBeenCalled();
      expect(mockWsGateway.emitPlaybackState).toHaveBeenCalledWith(
        'guild-1',
        expect.objectContaining({ status: 'playing' }),
      );
      expect(mockWsGateway.emitQueueUpdated).toHaveBeenCalled();
    });

    it('should enqueue tracks without interrupting current playback if already playing', async () => {
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      queue.currentTrack = { ...mockTrack, encoded: 'already-playing' };
      mockQueueManager.getOrCreateQueue.mockReturnValue(queue);

      const res = await service.playTracks('guild-1', 'vc-1', 'ch-1', [mockTrack]);

      expect(res.enqueued).toBe(1);
      expect(mockLavalinkService.playTrack).not.toHaveBeenCalled();
      expect(mockWsGateway.emitQueueUpdated).toHaveBeenCalled();
    });
  });

  describe('playNext & playPrevious', () => {
    it('should play next track when available', async () => {
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      queue.addTracks([mockTrack]);
      mockQueueManager.getQueue.mockReturnValue(queue);

      const next = await service.playNext('guild-1');

      expect(next).toEqual(mockTrack);
      expect(mockLavalinkService.playTrack).toHaveBeenCalledWith('guild-1', mockTrack);
      expect(mockWsGateway.emitTrackStart).toHaveBeenCalledWith('guild-1', {
        guildId: 'guild-1',
        track: mockTrack,
      });
    });

    it('should stop and emit idle state when no next track exists', async () => {
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      mockQueueManager.getQueue.mockReturnValue(queue);

      const next = await service.playNext('guild-1');

      expect(next).toBeNull();
      expect(mockLavalinkService.stop).toHaveBeenCalledWith('guild-1');
      expect(mockWsGateway.emitPlaybackState).toHaveBeenCalledWith('guild-1', {
        guildId: 'guild-1',
        isPaused: false,
        volume: 100,
        status: 'idle',
      });
    });

    it('should play previous track when available in history', async () => {
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      queue.history.push(mockTrack);
      mockQueueManager.getQueue.mockReturnValue(queue);

      const prev = await service.playPrevious('guild-1');

      expect(prev).toEqual(mockTrack);
      expect(mockLavalinkService.playTrack).toHaveBeenCalledWith('guild-1', mockTrack);
    });
  });

  describe('playback control: pause, resume, seek, setVolume, stop, leave', () => {
    let queue: GuildQueue;

    beforeEach(() => {
      queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      queue.currentTrack = mockTrack;
      mockQueueManager.getQueue.mockReturnValue(queue);
    });

    it('should pause playback and emit ws state', async () => {
      const res = await service.pause('guild-1');

      expect(res).toBe(true);
      expect(queue.isPaused).toBe(true);
      expect(mockLavalinkService.pause).toHaveBeenCalledWith('guild-1', true);
      expect(mockWsGateway.emitPlaybackState).toHaveBeenCalledWith('guild-1', {
        guildId: 'guild-1',
        isPaused: true,
        volume: 100,
        status: 'paused',
      });
    });

    it('should resume playback and emit ws state', async () => {
      queue.isPaused = true;
      const res = await service.resume('guild-1');

      expect(res).toBe(true);
      expect(queue.isPaused).toBe(false);
      expect(mockLavalinkService.pause).toHaveBeenCalledWith('guild-1', false);
      expect(mockWsGateway.emitPlaybackState).toHaveBeenCalledWith('guild-1', {
        guildId: 'guild-1',
        isPaused: false,
        volume: 100,
        status: 'playing',
      });
    });

    it('should seek to specific position and emit progress', async () => {
      const res = await service.seek('guild-1', 45);

      expect(res).toBe(true);
      expect(queue.lastPlaybackPosition).toBe(45000);
      expect(mockLavalinkService.seek).toHaveBeenCalledWith('guild-1', 45000);
      expect(mockWsGateway.emitTrackProgress).toHaveBeenCalledWith('guild-1', {
        guildId: 'guild-1',
        position: 45000,
        duration: 180000,
        isPaused: false,
      });
    });

    it('should clamp volume between 0 and 200 and emit state', async () => {
      const res = await service.setVolume('guild-1', 250);

      expect(res).toBe(true);
      expect(queue.volume).toBe(200);
      expect(mockLavalinkService.setVolume).toHaveBeenCalledWith('guild-1', 200);
    });

    it('should stop playback, delete queue, and emit stopped state', async () => {
      await service.stop('guild-1');

      expect(mockLavalinkService.stop).toHaveBeenCalledWith('guild-1');
      expect(mockQueueManager.deleteQueue).toHaveBeenCalledWith('guild-1');
      expect(mockWsGateway.emitPlaybackState).toHaveBeenCalledWith('guild-1', {
        guildId: 'guild-1',
        isPaused: false,
        volume: 100,
        status: 'stopped',
      });
    });

    it('should leave voice channel and emit disconnected state', async () => {
      await service.leave('guild-1');

      expect(mockLavalinkService.leaveVoiceChannel).toHaveBeenCalledWith('guild-1');
      expect(mockWsGateway.emitPlaybackState).toHaveBeenCalledWith('guild-1', {
        guildId: 'guild-1',
        isPaused: false,
        volume: 100,
        status: 'disconnected',
      });
    });
  });

  describe('queue operations: removeTrack & clearQueue', () => {
    it('should remove track by index and emit queue updated', () => {
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      queue.addTracks([mockTrack]);
      mockQueueManager.getQueue.mockReturnValue(queue);

      const removed = service.removeTrack('guild-1', 0);

      expect(removed).toEqual(mockTrack);
      expect(mockWsGateway.emitQueueUpdated).toHaveBeenCalled();
    });

    it('should clear queue and emit queue updated', () => {
      const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
      queue.addTracks([mockTrack]);
      mockQueueManager.getQueue.mockReturnValue(queue);

      service.clearQueue('guild-1');

      expect(queue.tracks.length).toBe(0);
      expect(mockWsGateway.emitQueueUpdated).toHaveBeenCalled();
    });
  });
});

