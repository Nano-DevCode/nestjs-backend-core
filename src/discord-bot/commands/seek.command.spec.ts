import { SeekCommand } from './seek.command';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('SeekCommand', () => {
  let command: SeekCommand;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockPlaybackService = {
      seek: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new SeekCommand(mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('seek');
  });

  it('should adjust position and reply when seek succeeds', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: { getInteger: jest.fn().mockReturnValue(75) },
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.seek.mockResolvedValue(true);

    await command.execute(interaction);

    expect(mockPlaybackService.seek).toHaveBeenCalledWith('guild-1', 75);
    expect(interaction.reply).toHaveBeenCalledWith('⏩ Posición ajustada a **1:15**.');
  });

  it('should warn user if seek fails because there is no active playback', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: { getInteger: jest.fn().mockReturnValue(75) },
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.seek.mockResolvedValue(false);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '⚠️ No hay reproducción activa para ajustar la posición.',
      ephemeral: true,
    });
  });
});
