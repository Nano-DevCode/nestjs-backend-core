import { JoinCommand } from './join.command';
import { LavalinkService } from '../audio/lavalink.service';
import { QueueManagerService } from '../queue/queue-manager.service';

describe('JoinCommand', () => {
  let command: JoinCommand;
  let mockLavalinkService: jest.Mocked<LavalinkService>;
  let mockQueueManager: jest.Mocked<QueueManagerService>;

  beforeEach(() => {
    mockLavalinkService = {
      joinVoiceChannel: jest.fn(),
    } as unknown as jest.Mocked<LavalinkService>;

    mockQueueManager = {
      getOrCreateQueue: jest.fn(),
    } as unknown as jest.Mocked<QueueManagerService>;

    command = new JoinCommand(mockLavalinkService, mockQueueManager);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('join');
  });

  it('should reject if member is not in a voice channel', async () => {
    const interaction: any = {
      member: { voice: { channel: null } },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Debes ingresar primero a un canal de voz.',
      ephemeral: true,
    });
  });

  it('should join voice channel and create queue successfully', async () => {
    const interaction: any = {
      member: { voice: { channel: { id: 'vc-1', name: 'General Voice' } } },
      guildId: 'guild-1',
      channelId: 'ch-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };

    mockLavalinkService.joinVoiceChannel.mockResolvedValue({} as any);

    await command.execute(interaction);

    expect(mockLavalinkService.joinVoiceChannel).toHaveBeenCalledWith('guild-1', 'vc-1');
    expect(mockQueueManager.getOrCreateQueue).toHaveBeenCalledWith('guild-1', 'ch-1', 'vc-1');
    expect(interaction.reply).toHaveBeenCalledWith(
      '🔊 Conectado exitosamente al canal: **General Voice**',
    );
  });

  it('should reply with error if join fails', async () => {
    const interaction: any = {
      member: { voice: { channel: { id: 'vc-1', name: 'General Voice' } } },
      guildId: 'guild-1',
      channelId: 'ch-1',
      reply: jest.fn().mockResolvedValue(undefined),
    };

    mockLavalinkService.joinVoiceChannel.mockResolvedValue(null);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ No se pudo conectar al canal de voz.',
      ephemeral: true,
    });
  });
});
