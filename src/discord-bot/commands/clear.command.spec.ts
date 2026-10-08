import { ClearCommand } from './clear.command';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';
import { GuildQueue } from '../queue/guild-queue.model';

describe('ClearCommand', () => {
  let command: ClearCommand;
  let mockQueueManager: jest.Mocked<QueueManagerService>;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockQueueManager = {
      getQueue: jest.fn(),
    } as unknown as jest.Mocked<QueueManagerService>;

    mockPlaybackService = {
      clearQueue: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new ClearCommand(mockQueueManager, mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('clear');
  });

  it('should reply that queue is already empty if no tracks exist', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockQueueManager.getQueue.mockReturnValue(undefined);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '📭 La cola ya se encuentra vacía.',
      ephemeral: true,
    });
  });

  it('should clear tracks and reply with count of removed songs', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };

    const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
    queue.tracks = [{ encoded: 't1' } as any, { encoded: 't2' } as any];
    mockQueueManager.getQueue.mockReturnValue(queue);

    await command.execute(interaction);

    expect(mockPlaybackService.clearQueue).toHaveBeenCalledWith('guild-1');
    expect(interaction.reply).toHaveBeenCalledWith(
      '🧹 Se han eliminado **2** canciones de la cola.',
    );
  });
});

