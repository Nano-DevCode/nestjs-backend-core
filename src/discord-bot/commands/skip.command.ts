import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class SkipCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta a la siguiente canción de la cola');

  constructor(private readonly playbackService: DiscordPlaybackService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const nextTrack = await this.playbackService.playNext(guildId);

    if (nextTrack) {
      await interaction.reply(
        `⏭️ Canción saltada. Ahora reproduciendo: **${nextTrack.info.title}**`,
      );
    } else {
      await interaction.reply(
        '⏭️ Canción saltada. No quedan más canciones en la cola.',
      );
    }
  }
}
