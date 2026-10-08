import { PauseCommand } from './pause.command';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('PauseCommand', () => {
  let command: PauseCommand;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockPlaybackService = {
      pause: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new PauseCommand(mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('pause');
  });

  it('should reply with success message when paused successfully', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.pause.mockResolvedValue(true);

    await command.execute(interaction);

    expect(mockPlaybackService.pause).toHaveBeenCalledWith('guild-1');
    expect(interaction.reply).toHaveBeenCalledWith('⏸️ Reproducción pausada.');
  });

  it('should reply with warning when no track is playing', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.pause.mockResolvedValue(false);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '⚠️ No hay ninguna pista reproduciéndose actualmente.',
      ephemeral: true,
    });
  });
});

