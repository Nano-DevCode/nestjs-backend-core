import { ResumeCommand } from './resume.command';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('ResumeCommand', () => {
  let command: ResumeCommand;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockPlaybackService = {
      resume: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new ResumeCommand(mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('resume');
  });

  it('should reply with success message when resumed successfully', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.resume.mockResolvedValue(true);

    await command.execute(interaction);

    expect(mockPlaybackService.resume).toHaveBeenCalledWith('guild-1');
    expect(interaction.reply).toHaveBeenCalledWith('▶️ Reproducción reanudada.');
  });

  it('should reply with warning when no track is paused', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockPlaybackService.resume.mockResolvedValue(false);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '⚠️ No hay ninguna pista pausada en este momento.',
      ephemeral: true,
    });
  });
});
