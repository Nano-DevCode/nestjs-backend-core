import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class PauseCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa la reproducción actual');

  constructor(private readonly playbackService: DiscordPlaybackService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const success = await this.playbackService.pause(guildId);

    if (success) {
      await interaction.reply('⏸️ Reproducción pausada.');
    } else {
      await interaction.reply({
        content: '⚠️ No hay ninguna pista reproduciéndose actualmente.',
        ephemeral: true,
      });
    }
  }
}
