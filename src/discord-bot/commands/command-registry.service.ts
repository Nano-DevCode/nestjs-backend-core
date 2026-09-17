import { Injectable, Logger } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ISlashCommand, SlashCommandData } from './command.interface';
import { PlayCommand } from './play.command';
import { PauseCommand } from './pause.command';
import { ResumeCommand } from './resume.command';
import { SkipCommand } from './skip.command';
import { BackCommand } from './back.command';
import { SeekCommand } from './seek.command';
import { QueueCommand } from './queue.command';
import { RemoveCommand } from './remove.command';
import { ClearCommand } from './clear.command';
import { JoinCommand } from './join.command';
import { LeaveCommand } from './leave.command';
import { StopCommand } from './stop.command';
import { SetChannelCommand } from './setchannel.command';
import { SayCommand } from './say.command';
import { DiscordGuildService } from '../persistence/discord-guild.service';

@Injectable()
export class CommandRegistryService {
  private readonly logger = new Logger(CommandRegistryService.name);
  private readonly commands = new Map<string, ISlashCommand>();

  constructor(
    private readonly playCommand: PlayCommand,
    private readonly pauseCommand: PauseCommand,
    private readonly resumeCommand: ResumeCommand,
    private readonly skipCommand: SkipCommand,
    private readonly backCommand: BackCommand,
    private readonly seekCommand: SeekCommand,
    private readonly queueCommand: QueueCommand,
    private readonly removeCommand: RemoveCommand,
    private readonly clearCommand: ClearCommand,
    private readonly joinCommand: JoinCommand,
    private readonly leaveCommand: LeaveCommand,
    private readonly stopCommand: StopCommand,
    private readonly setChannelCommand: SetChannelCommand,
    private readonly sayCommand: SayCommand,
    private readonly guildService: DiscordGuildService,
  ) {
    this.registerCommands([
      this.playCommand,
      this.pauseCommand,
      this.resumeCommand,
      this.skipCommand,
      this.backCommand,
      this.seekCommand,
      this.queueCommand,
      this.removeCommand,
      this.clearCommand,
      this.joinCommand,
      this.leaveCommand,
      this.stopCommand,
      this.setChannelCommand,
      this.sayCommand,
    ]);
  }

  private registerCommands(commandList: ISlashCommand[]): void {
    for (const cmd of commandList) {
      this.commands.set(cmd.data.name, cmd);
      this.logger.debug(`Comando Slash registrado: /${cmd.data.name}`);
    }
  }

  getCommand(name: string): ISlashCommand | undefined {
    return this.commands.get(name);
  }

  getAllCommandData(): SlashCommandData[] {
    return Array.from(this.commands.values()).map((cmd) => cmd.data);
  }

  async dispatch(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    if (!command) {
      this.logger.warn(`Comando no reconocido: ${interaction.commandName}`);
      await interaction.reply({
        content: `❌ Comando no reconocido: \`/${interaction.commandName}\``,
        ephemeral: true,
      });
      return;
    }

    // Comprobar restricción de canal dedicado (excepto comandos administrativos como /setchannel y /say)
    const isExemptCommand =
      interaction.commandName === 'setchannel' ||
      interaction.commandName === 'say';

    if (!isExemptCommand && interaction.guildId) {
      try {
        const guildConfig = await this.guildService.getGuildConfig(
          interaction.guildId,
        );
        if (
          guildConfig?.dedicatedChannelId &&
          interaction.channelId !== guildConfig.dedicatedChannelId
        ) {
          await interaction.reply({
            content: `❌ Por favor usa los comandos en el canal asignado: <#${guildConfig.dedicatedChannelId}>`,
            ephemeral: true,
          });
          return;
        }
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudo verificar canal dedicado para guild [${interaction.guildId}]: ${(err as Error).message}`,
        );
      }
    }

    try {
      await command.execute(interaction);
    } catch (error: unknown) {
      this.logger.error(
        `Error al ejecutar /${interaction.commandName}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      const replyContent =
        '❌ Ocurrió un error inesperado al procesar este comando.';

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: replyContent });
      } else {
        await interaction.reply({ content: replyContent, ephemeral: true });
      }
    }
  }
}
