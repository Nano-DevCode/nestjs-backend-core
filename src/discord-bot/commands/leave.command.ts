import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class LeaveCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Detiene la música y desconecta el bot del canal de voz');

  constructor(private readonly playbackService: DiscordPlaybackService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    await this.playbackService.leave(guildId);
    await interaction.reply('👋 Bot desconectado del canal de voz.');
  }
}
