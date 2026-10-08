import { QueueCommand } from './queue.command';
import { QueueManagerService } from '../queue/queue-manager.service';
import { GuildQueue } from '../queue/guild-queue.model';

describe('QueueCommand', () => {
  let command: QueueCommand;
  let mockQueueManager: jest.Mocked<QueueManagerService>;

  beforeEach(() => {
    mockQueueManager = {
      getQueue: jest.fn(),
    } as unknown as jest.Mocked<QueueManagerService>;

    command = new QueueCommand(mockQueueManager);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('queue');
  });

  it('should reply that queue is empty if queue is missing or has no tracks', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };
    mockQueueManager.getQueue.mockReturnValue(undefined);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '📭 La cola de reproducción está vacía.',
      ephemeral: true,
    });
  });

  it('should display embed with current track and upcoming tracks', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      guild: { name: 'Test Guild' },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    const queue = new GuildQueue('guild-1', 'ch-1', 'vc-1');
    queue.currentTrack = {
      encoded: 'curr',
      info: { title: 'Current Song', uri: 'http://curr', length: 185000 } as any,
      requester: { id: 'req-1', username: 'Requester' },
    };
    queue.tracks = [
      {
        encoded: 'next-1',
        info: { title: 'Next Song 1', uri: 'http://next1', length: 200000 } as any,
        requester: { id: 'req-2', username: 'Requester2' },
      },
    ];

    mockQueueManager.getQueue.mockReturnValue(queue);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      embeds: [expect.any(Object)],
    });
  });
});

