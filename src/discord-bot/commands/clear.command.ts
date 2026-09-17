import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class ClearCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Vacía todas las canciones en espera de la cola');

  constructor(
    private readonly queueManager: QueueManagerService,
    private readonly playback: DiscordPlaybackService,
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const queue = this.queueManager.getQueue(guildId);

    if (!queue || queue.tracks.length === 0) {
      await interaction.reply({
        content: '📭 La cola ya se encuentra vacía.',
        ephemeral: true,
      });
      return;
    }

    const count = queue.tracks.length;
    this.playback.clearQueue(guildId);
    await interaction.reply(
      `🧹 Se han eliminado **${count}** canciones de la cola.`,
    );
  }
}
