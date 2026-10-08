import { RemoveCommand } from './remove.command';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';
import { GuildQueue } from '../queue/guild-queue.model';

describe('RemoveCommand', () => {
  let command: RemoveCommand;
  let mockQueueManager: jest.Mocked<QueueManagerService>;
  let mockPlaybackService: jest.Mocked<DiscordPlaybackService>;

  beforeEach(() => {
    mockQueueManager = {
      getQueue: jest.fn(),
    } as unknown as jest.Mocked<QueueManagerService>;

    mockPlaybackService = {
      removeTrack: jest.fn(),
    } as unknown as jest.Mocked<DiscordPlaybackService>;

    command = new RemoveCommand(mockQueueManager, mockPlaybackService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('remove');
  });

  it('should reply that queue has no tracks to remove when queue is empty', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: { getInteger: jest.fn().mockReturnValue(1) },
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockQueueManager.getQueue.mockReturnValue(undefined);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '📭 No hay pistas en la cola para remover.',
      ephemeral: true,
    });
  });

  it('should remove track and reply when position is valid', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: { getInteger: jest.fn().mockReturnValue(1) },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
    queue.tracks = [{ encoded: 't1' } as any];
    mockQueueManager.getQueue.mockReturnValue(queue);

    const mockRemoved = {
      info: { title: 'Removed Song' },
    };
    mockPlaybackService.removeTrack.mockReturnValue(mockRemoved as any);

    await command.execute(interaction);

    expect(mockPlaybackService.removeTrack).toHaveBeenCalledWith('guild-1', 0);
    expect(interaction.reply).toHaveBeenCalledWith(
      '🗑️ Se eliminó de la cola: **Removed Song** (Posición #1)',
    );
  });

  it('should reply with error if track removal returns null', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: { getInteger: jest.fn().mockReturnValue(5) },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
    queue.tracks = [{ encoded: 't1' } as any];
    mockQueueManager.getQueue.mockReturnValue(queue);

    mockPlaybackService.removeTrack.mockReturnValue(null);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '⚠️ No existe ninguna pista en la posición #5. La cola tiene 1 elementos.',
      ephemeral: true,
    });
  });
});
