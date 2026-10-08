import { LeaveCommand } from './leave.command';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

describe('LeaveCommand', () => {
  let command: LeaveCommand;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockPlaybackService = {
      leave: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new LeaveCommand(mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('leave');
  });

  it('should leave voice channel and reply', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(mockPlaybackService.leave).toHaveBeenCalledWith('guild-1');
    expect(interaction.reply).toHaveBeenCalledWith('👋 Bot desconectado del canal de voz.');
  });
});

