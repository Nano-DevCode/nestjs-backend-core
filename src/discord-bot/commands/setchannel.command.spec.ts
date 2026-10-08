import { SetChannelCommand } from './setchannel.command';
import { DiscordGuildService } from '../persistence/discord-guild.service';

describe('SetChannelCommand', () => {
  let command: SetChannelCommand;
  let mockGuildService: jest.Mocked<DiscordGuildService>;

  beforeEach(() => {
    mockGuildService = {
      updateGuildConfig: jest.fn(),
      getGuildConfig: jest.fn(),
    } as unknown as jest.Mocked<DiscordGuildService>;

    command = new SetChannelCommand(mockGuildService);
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('setchannel');
  });

  it('should reject if used outside a guild', async () => {
    const interaction: any = {
      guildId: null,
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Este comando solo puede usarse dentro de un servidor.',
      ephemeral: true,
    });
  });

  it('should remove dedicated channel when remover option is true', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: {
        getChannel: jest.fn().mockReturnValue(null),
        getBoolean: jest.fn().mockReturnValue(true),
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(mockGuildService.updateGuildConfig).toHaveBeenCalledWith('guild-1', {
      dedicatedChannelId: null,
    });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Restricción eliminada'),
        ephemeral: true,
      }),
    );
  });

  it('should set dedicated channel when canal option is provided', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: {
        getChannel: jest.fn().mockReturnValue({ id: 'music-chan-id' }),
        getBoolean: jest.fn().mockReturnValue(false),
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(mockGuildService.updateGuildConfig).toHaveBeenCalledWith('guild-1', {
      dedicatedChannelId: 'music-chan-id',
    });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('<#music-chan-id>'),
        ephemeral: true,
      }),
    );
  });

  it('should show current dedicated channel if none passed and one is configured', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: {
        getChannel: jest.fn().mockReturnValue(null),
        getBoolean: jest.fn().mockReturnValue(false),
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    mockGuildService.getGuildConfig.mockResolvedValue({
      id: '1',
      guildId: 'guild-1',
      guildName: 'Guild',
      dedicatedChannelId: 'existing-chan-id',
      defaultVolume: 100,
      djRoleId: null,
      autoLeaveTimeout: 300,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('<#existing-chan-id>'),
        ephemeral: true,
      }),
    );
  });

  it('should inform that no dedicated channel exists when none configured', async () => {
    const interaction: any = {
      guildId: 'guild-1',
      options: {
        getChannel: jest.fn().mockReturnValue(null),
        getBoolean: jest.fn().mockReturnValue(false),
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    mockGuildService.getGuildConfig.mockResolvedValue(null);

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('No hay ningún canal exclusivo asignado'),
        ephemeral: true,
      }),
    );
  });
});
