import { SkipCommand } from './skip.command';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('SkipCommand', () => {
  let command: SkipCommand;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockPlaybackService = {
      playNext: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new SkipCommand(mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('skip');
  });

  it('should announce new track when skipped to next track', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.playNext.mockResolvedValue({
      info: { title: 'Next Hit' },
    } as any);

    await command.execute(interaction);

    expect(mockPlaybackService.playNext).toHaveBeenCalledWith('guild-1');
    expect(interaction.reply).toHaveBeenCalledWith(
      '⏭️ Canción saltada. Ahora reproduciendo: **Next Hit**',
    );
  });

  it('should inform user when no more tracks remain in queue', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.playNext.mockResolvedValue(null);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      '⏭️ Canción saltada. No quedan más canciones en la cola.',
    );
  });
});
