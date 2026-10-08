import { PlayCommand } from './play.command';
import { LavalinkService } from '../audio/lavalink.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('PlayCommand', () => {
  let command: PlayCommand;
  let mockLavalinkService: jest.Mocked<LavalinkService>;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockLavalinkService = {
      resolveTracks: jest.fn(),
    } as unknown as jest.Mocked<LavalinkService>;

    mockPlaybackService = {
      playTracks: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new PlayCommand(mockLavalinkService, mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('play');
  });

  it('should reject if member is not in a voice channel', async () => {
    const interaction: any = {
      member: { voice: { channel: null } },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Debes estar en un canal de voz para usar este comando.',
      ephemeral: true,
    });
  });

  it('should edit reply when search results are empty', async () => {
    const interaction: any = {
      member: { voice: { channel: { id: 'vc-1' } } },
      options: { getString: jest.fn().mockReturnValue('unknown query') },
      user: { id: 'user-1', username: 'TestUser', displayAvatarURL: jest.fn() },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    };

    mockLavalinkService.resolveTracks.mockResolvedValue({
      loadType: 'empty',
      tracks: [],
    } as any);

    await command.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '🔍 No se encontraron resultados para: `unknown query`',
    });
  });

  it('should handle search error', async () => {
    const interaction: any = {
      member: { voice: { channel: { id: 'vc-1' } } },
      options: { getString: jest.fn().mockReturnValue('error query') },
      user: { id: 'user-1', username: 'TestUser', displayAvatarURL: jest.fn() },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    };

    mockLavalinkService.resolveTracks.mockResolvedValue({
      loadType: 'error',
      tracks: [{ encoded: 'err' }] as any,
      error: 'API rate limited',
    } as any);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Error al procesar audio: API rate limited',
    });
  });

  it('should play single track and reply with embed', async () => {
    const interaction: any = {
      member: { voice: { channel: { id: 'vc-1' } } },
      options: { getString: jest.fn().mockReturnValue('good song') },
      user: { id: 'user-1', username: 'TestUser', displayAvatarURL: jest.fn().mockReturnValue('http://avatar') },
      guildId: 'guild-1',
      channelId: 'ch-1',
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    };

    const mockTrack = {
      encoded: 'enc',
      info: {
        title: 'Good Song',
        author: 'Good Artist',
        length: 215000,
        uri: 'http://song',
        artworkUrl: 'http://art',
      },
    };

    mockLavalinkService.resolveTracks.mockResolvedValue({
      loadType: 'track',
      tracks: [mockTrack],
    } as any);

    mockPlaybackService.playTracks.mockResolvedValue({
      enqueued: 0,
      nowPlaying: mockTrack as any,
    });

    await command.execute(interaction);

    expect(mockPlaybackService.playTracks).toHaveBeenCalledWith(
      'guild-1',
      'vc-1',
      'ch-1',
      [mockTrack],
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [expect.any(Object)],
    });
  });

  it('should play playlist and reply with playlist embed', async () => {
    const interaction: any = {
      member: { voice: { channel: { id: 'vc-1' } } },
      options: { getString: jest.fn().mockReturnValue('playlist link') },
      user: { id: 'user-1', username: 'TestUser', displayAvatarURL: jest.fn().mockReturnValue('http://avatar') },
      guildId: 'guild-1',
      channelId: 'ch-1',
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    };

    const mockTracks = [
      { encoded: 't1', info: { title: 'T1', length: 100000 } },
      { encoded: 't2', info: { title: 'T2', length: 120000 } },
    ];

    mockLavalinkService.resolveTracks.mockResolvedValue({
      loadType: 'playlist',
      playlistName: 'My Hits',
      tracks: mockTracks,
    } as any);

    mockPlaybackService.playTracks.mockResolvedValue({
      enqueued: 2,
      nowPlaying: null,
    });

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [expect.any(Object)],
    });
  });
});
