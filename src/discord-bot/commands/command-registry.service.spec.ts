import { CommandRegistryService } from './command-registry.service';
import type { ISlashCommand } from './command.interface';
import { DiscordGuildService } from '../persistence/discord-guild.service';

describe('CommandRegistryService', () => {
  let service: CommandRegistryService;
  let mockGuildService: jest.Mocked<DiscordGuildService>;

  const createMockCommand = (name: string): ISlashCommand => ({
    data: {
      name,
      description: `Description for ${name}`,
      toJSON: () => ({ name, description: `Description for ${name}` }),
    } as any,
    execute: jest.fn().mockResolvedValue(undefined),
  });

  let playCmd: ISlashCommand;
  let pauseCmd: ISlashCommand;
  let resumeCmd: ISlashCommand;
  let skipCmd: ISlashCommand;
  let backCmd: ISlashCommand;
  let seekCmd: ISlashCommand;
  let queueCmd: ISlashCommand;
  let removeCmd: ISlashCommand;
  let clearCmd: ISlashCommand;
  let joinCmd: ISlashCommand;
  let leaveCmd: ISlashCommand;
  let stopCmd: ISlashCommand;
  let setChannelCmd: ISlashCommand;
  let sayCmd: ISlashCommand;

  beforeEach(() => {
    mockGuildService = {
      getGuildConfig: jest.fn(),
    } as unknown as jest.Mocked<DiscordGuildService>;

    playCmd = createMockCommand('play');
    pauseCmd = createMockCommand('pause');
    resumeCmd = createMockCommand('resume');
    skipCmd = createMockCommand('skip');
    backCmd = createMockCommand('back');
    seekCmd = createMockCommand('seek');
    queueCmd = createMockCommand('queue');
    removeCmd = createMockCommand('remove');
    clearCmd = createMockCommand('clear');
    joinCmd = createMockCommand('join');
    leaveCmd = createMockCommand('leave');
    stopCmd = createMockCommand('stop');
    setChannelCmd = createMockCommand('setchannel');
    sayCmd = createMockCommand('say');

    service = new CommandRegistryService(
      playCmd as any,
      pauseCmd as any,
      resumeCmd as any,
      skipCmd as any,
      backCmd as any,
      seekCmd as any,
      queueCmd as any,
      removeCmd as any,
      clearCmd as any,
      joinCmd as any,
      leaveCmd as any,
      stopCmd as any,
      setChannelCmd as any,
      sayCmd as any,
      mockGuildService,
    );
  });

  it('should register all 14 commands upon creation', () => {
    expect(service.getCommand('play')).toBe(playCmd);
    expect(service.getCommand('pause')).toBe(pauseCmd);
    expect(service.getCommand('resume')).toBe(resumeCmd);
    expect(service.getCommand('skip')).toBe(skipCmd);
    expect(service.getCommand('back')).toBe(backCmd);
    expect(service.getCommand('seek')).toBe(seekCmd);
    expect(service.getCommand('queue')).toBe(queueCmd);
    expect(service.getCommand('remove')).toBe(removeCmd);
    expect(service.getCommand('clear')).toBe(clearCmd);
    expect(service.getCommand('join')).toBe(joinCmd);
    expect(service.getCommand('leave')).toBe(leaveCmd);
    expect(service.getCommand('stop')).toBe(stopCmd);
    expect(service.getCommand('setchannel')).toBe(setChannelCmd);
    expect(service.getCommand('say')).toBe(sayCmd);
  });

  it('should return all command data for slash registration', () => {
    const dataList = service.getAllCommandData();
    expect(dataList.length).toBe(14);
    expect(dataList.map((d) => d.name)).toContain('play');
    expect(dataList.map((d) => d.name)).toContain('setchannel');
  });

  describe('dispatch', () => {
    it('should reply with error if command is not recognized', async () => {
      const interaction: any = {
        commandName: 'unknown-cmd',
        reply: jest.fn().mockResolvedValue(undefined),
      };

      await service.dispatch(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Comando no reconocido: `/unknown-cmd`',
        ephemeral: true,
      });
    });

    it('should block command execution if not in dedicated channel', async () => {
      const interaction: any = {
        commandName: 'play',
        guildId: 'guild-100',
        channelId: 'general-channel',
        reply: jest.fn().mockResolvedValue(undefined),
      };

      mockGuildService.getGuildConfig.mockResolvedValue({
        id: '1',
        guildId: 'guild-100',
        guildName: 'Test Guild',
        dedicatedChannelId: 'music-channel',
        defaultVolume: 100,
        djRoleId: null,
        autoLeaveTimeout: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.dispatch(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Por favor usa los comandos en el canal asignado: <#music-channel>',
        ephemeral: true,
      });
      expect(playCmd.execute).not.toHaveBeenCalled();
    });

    it('should allow exempt commands (like setchannel) outside dedicated channel', async () => {
      const interaction: any = {
        commandName: 'setchannel',
        guildId: 'guild-100',
        channelId: 'general-channel',
        reply: jest.fn().mockResolvedValue(undefined),
      };

      await service.dispatch(interaction);

      expect(setChannelCmd.execute).toHaveBeenCalledWith(interaction);
    });

    it('should dispatch successfully when channel matches dedicated channel', async () => {
      const interaction: any = {
        commandName: 'play',
        guildId: 'guild-100',
        channelId: 'music-channel',
        reply: jest.fn().mockResolvedValue(undefined),
      };

      mockGuildService.getGuildConfig.mockResolvedValue({
        id: '1',
        guildId: 'guild-100',
        guildName: 'Test Guild',
        dedicatedChannelId: 'music-channel',
        defaultVolume: 100,
        djRoleId: null,
        autoLeaveTimeout: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.dispatch(interaction);

      expect(playCmd.execute).toHaveBeenCalledWith(interaction);
    });

    it('should handle command execution errors and edit reply if already replied or deferred', async () => {
      const interaction: any = {
        commandName: 'play',
        guildId: 'guild-100',
        channelId: 'music-channel',
        deferred: true,
        editReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
      };

      mockGuildService.getGuildConfig.mockResolvedValue(null);
      (playCmd.execute as jest.Mock).mockRejectedValue(new Error('Playback error'));

      await service.dispatch(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '❌ Ocurrió un error inesperado al procesar este comando.',
      });
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('should handle command execution errors and reply ephemeral if not deferred', async () => {
      const interaction: any = {
        commandName: 'pause',
        guildId: 'guild-100',
        channelId: 'music-channel',
        deferred: false,
        replied: false,
        reply: jest.fn().mockResolvedValue(undefined),
      };

      mockGuildService.getGuildConfig.mockResolvedValue(null);
      (pauseCmd.execute as jest.Mock).mockRejectedValue(new Error('Pause error'));

      await service.dispatch(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Ocurrió un error inesperado al procesar este comando.',
        ephemeral: true,
      });
    });
  });
});

