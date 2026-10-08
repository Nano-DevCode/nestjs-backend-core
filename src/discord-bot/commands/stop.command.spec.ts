import { StopCommand } from './stop.command';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('StopCommand', () => {
  let command: StopCommand;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockPlaybackService = {
      stop: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new StopCommand(mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('stop');
  });

  it('should stop playback and reply', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(mockPlaybackService.stop).toHaveBeenCalledWith('guild-1');
    expect(interaction.reply).toHaveBeenCalledWith('⏹️ Reproducción detenida y cola vaciada.');
  });
});
