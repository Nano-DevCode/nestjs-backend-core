import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { QueueManagerService } from '../queue/queue-manager.service';

@Injectable()
export class QueueCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription(
      'Muestra la lista de canciones en espera y la pista actual',
    );

  constructor(private readonly queueManager: QueueManagerService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const queue = this.queueManager.getQueue(guildId);

    if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
      await interaction.reply({
        content: '📭 La cola de reproducción está vacía.',
        ephemeral: true,
      });
      return;
    }

    const current = queue.currentTrack;
    const currentDurationMin = current
      ? Math.floor(current.info.length / 60000)
      : 0;
    const currentDurationSec = current
      ? Math.floor((current.info.length % 60000) / 1000)
          .toString()
          .padStart(2, '0')
      : '00';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(
        `🎶 Cola de Reproducción - ${interaction.guild?.name || 'Servidor'}`,
      )
      .setDescription(
        current
          ? `**Reproduciendo Ahora:**\n▶️ [${current.info.title}](${current.info.uri || ''}) \`[${currentDurationMin}:${currentDurationSec}]\` (Pedida por <@${current.requester.id}>)\n\n**Próximas Pistas (${queue.tracks.length}):**`
          : 'No hay nada reproduciéndose.',
      );

    if (queue.tracks.length > 0) {
      const topTracks = queue.tracks.slice(0, 10);
      const trackList = topTracks
        .map((t, index) => {
          const min = Math.floor(t.info.length / 60000);
          const sec = Math.floor((t.info.length % 60000) / 1000)
            .toString()
            .padStart(2, '0');
          return `\`${index + 1}.\` [${t.info.title}](${t.info.uri || ''}) \`[${min}:${sec}]\` - <@${t.requester.id}>`;
        })
        .join('\n');

      embed.addFields({
        name: 'En espera:',
        value:
          trackList +
          (queue.tracks.length > 10
            ? `\n*... y ${queue.tracks.length - 10} canciones más.*`
            : ''),
      });
    }

    embed.setFooter({
      text: `Modo Repetición: ${queue.repeatMode.toUpperCase()} | Volumen: ${queue.volume}%`,
    });

    await interaction.reply({ embeds: [embed] });
  }
}
