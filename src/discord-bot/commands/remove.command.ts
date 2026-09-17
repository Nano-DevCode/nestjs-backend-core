import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class RemoveCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Elimina una canción específica de la cola según su número')
    .addIntegerOption((option) =>
      option
        .setName('posicion')
        .setDescription('Número de posición en la lista (1, 2, 3...)')
        .setRequired(true)
        .setMinValue(1),
    );

  constructor(
    private readonly queueManager: QueueManagerService,
    private readonly playback: DiscordPlaybackService,
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const position = interaction.options.getInteger('posicion', true);
    const queue = this.queueManager.getQueue(guildId);

    if (!queue || queue.tracks.length === 0) {
      await interaction.reply({
        content: '📭 No hay pistas en la cola para remover.',
        ephemeral: true,
      });
      return;
    }

    const removed = this.playback.removeTrack(guildId, position - 1);
    if (removed) {
      await interaction.reply(
        `🗑️ Se eliminó de la cola: **${removed.info.title}** (Posición #${position})`,
      );
    } else {
      await interaction.reply({
        content: `⚠️ No existe ninguna pista en la posición #${position}. La cola tiene ${queue.tracks.length} elementos.`,
        ephemeral: true,
      });
    }
  }
}
