import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class BackCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('back')
    .setDescription('Reproduce la canción anterior del historial');

  constructor(private readonly playbackService: DiscordPlaybackService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const prevTrack = await this.playbackService.playPrevious(guildId);

    if (prevTrack) {
      await interaction.reply(`⏮️ Regresando a: **${prevTrack.info.title}**`);
    } else {
      await interaction.reply({
        content: '⚠️ No hay canciones previas en el historial de reproducción.',
        ephemeral: true,
      });
    }
  }
}
