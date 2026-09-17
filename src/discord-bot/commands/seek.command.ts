import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class SeekCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('seek')
    .setDescription(
      'Avanza o retrocede la reproducción al segundo especificado',
    )
    .addIntegerOption((option) =>
      option
        .setName('segundos')
        .setDescription('Posición en segundos a la que saltar')
        .setRequired(true)
        .setMinValue(0),
    );

  constructor(private readonly playbackService: DiscordPlaybackService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const seconds = interaction.options.getInteger('segundos', true);

    const success = await this.playbackService.seek(guildId, seconds);
    if (success) {
      const min = Math.floor(seconds / 60);
      const sec = (seconds % 60).toString().padStart(2, '0');
      await interaction.reply(`⏩ Posición ajustada a **${min}:${sec}**.`);
    } else {
      await interaction.reply({
        content: '⚠️ No hay reproducción activa para ajustar la posición.',
        ephemeral: true,
      });
    }
  }
}
