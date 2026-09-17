import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class ResumeCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Reanuda la pista pausada');

  constructor(private readonly playbackService: DiscordPlaybackService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const success = await this.playbackService.resume(guildId);

    if (success) {
      await interaction.reply('▶️ Reproducción reanudada.');
    } else {
      await interaction.reply({
        content: '⚠️ No hay ninguna pista pausada en este momento.',
        ephemeral: true,
      });
    }
  }
}
