import { BackCommand } from './back.command';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('BackCommand', () => {
  let command: BackCommand;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockPlaybackService = {
      playPrevious: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new BackCommand(mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('back');
  });

  it('should announce returning track when previous track is found', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.playPrevious.mockResolvedValue({
      info: { title: 'Previous Song' },
    } as any);

    await command.execute(interaction);

    expect(mockPlaybackService.playPrevious).toHaveBeenCalledWith('guild-1');
    expect(interaction.reply).toHaveBeenCalledWith('⏮️ Regresando a: **Previous Song**');
  });

  it('should warn user when no previous track exists in history', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.playPrevious.mockResolvedValue(null);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '⚠️ No hay canciones previas en el historial de reproducción.',
      ephemeral: true,
    });
  });
});
