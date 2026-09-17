import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class StopCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la reproducción y vacía la cola por completo');

  constructor(private readonly playbackService: DiscordPlaybackService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    await this.playbackService.stop(guildId);
    await interaction.reply('⏹️ Reproducción detenida y cola vaciada.');
  }
}
