import { PermissionFlagsBits } from 'discord.js';
import { SayCommand } from './say.command';

describe('SayCommand', () => {
  let command: SayCommand;

  beforeEach(() => {
    command = new SayCommand();
  });

  it('should have correct command metadata', () => {
    expect(command.data.name).toBe('say');
  });

  it('should reject if used outside a guild', async () => {
    const interaction: any = {
      guild: null,
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Este comando solo puede usarse dentro de un servidor.',
      ephemeral: true,
    });
  });

  it('should reject if bot member cannot be fetched', async () => {
    const interaction: any = {
      guild: {
        members: {
          fetchMe: jest.fn().mockRejectedValue(new Error('Fetch failed')),
        },
      },
      options: {
        getChannel: jest.fn().mockReturnValue({ id: 'c-1' }),
        getString: jest.fn().mockReturnValue('Hello!'),
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ No se pudo verificar la identidad del bot en el servidor.',
      ephemeral: true,
    });
  });

  it('should reject if bot lacks SendMessages permission in target channel', async () => {
    const mockBotMember = {};
    const mockTargetChannel = {
      id: 'c-1',
      permissionsFor: jest.fn().mockReturnValue({
        has: jest.fn().mockReturnValue(false),
      }),
    };

    const interaction: any = {
      guild: {
        members: {
          fetchMe: jest.fn().mockResolvedValue(mockBotMember),
        },
      },
      options: {
        getChannel: jest.fn().mockReturnValue(mockTargetChannel),
        getString: jest.fn().mockReturnValue('Hello!'),
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(mockTargetChannel.permissionsFor).toHaveBeenCalledWith(mockBotMember);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ El bot no tiene permisos suficientes (`Enviar Mensajes`) en el canal <#c-1>.',
      ephemeral: true,
    });
  });

  it('should send message to target channel and reply success', async () => {
    const mockBotMember = {};
    const mockTargetChannel = {
      id: 'c-1',
      permissionsFor: jest.fn().mockReturnValue({
        has: jest.fn().mockReturnValue(true),
      }),
      send: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    };

    const interaction: any = {
      guild: {
        members: {
          fetchMe: jest.fn().mockResolvedValue(mockBotMember),
        },
      },
      options: {
        getChannel: jest.fn().mockReturnValue(mockTargetChannel),
        getString: jest.fn().mockReturnValue('Hello World!'),
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(mockTargetChannel.send).toHaveBeenCalledWith({
      content: 'Hello World!',
      allowedMentions: { parse: ['users', 'roles'] },
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '✅ Mensaje enviado exitosamente a <#c-1>.',
      ephemeral: true,
    });
  });

  it('should handle errors when channel.send fails', async () => {
    const mockBotMember = {};
    const mockTargetChannel = {
      id: 'c-1',
      permissionsFor: jest.fn().mockReturnValue({
        has: jest.fn().mockReturnValue(true),
      }),
      send: jest.fn().mockRejectedValue(new Error('Discord API error')),
    };

    const interaction: any = {
      guild: {
        members: {
          fetchMe: jest.fn().mockResolvedValue(mockBotMember),
        },
      },
      options: {
        getChannel: jest.fn().mockReturnValue(mockTargetChannel),
        getString: jest.fn().mockReturnValue('Hello World!'),
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Falló el envío del mensaje: Discord API error',
      ephemeral: true,
    });
  });
});

