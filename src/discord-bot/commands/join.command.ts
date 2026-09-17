import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { LavalinkService } from '../audio/lavalink.service';
import { QueueManagerService } from '../queue/queue-manager.service';

@Injectable()
export class JoinCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('join')
    .setDescription('Conecta el bot a tu canal de voz actual');

  constructor(
    private readonly lavalinkService: LavalinkService,
    private readonly queueManager: QueueManagerService,
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const member = interaction.member as GuildMember | null;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: '❌ Debes ingresar primero a un canal de voz.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId!;
    const player = await this.lavalinkService.joinVoiceChannel(
      guildId,
      voiceChannel.id,
    );

    if (player) {
      this.queueManager.getOrCreateQueue(
        guildId,
        interaction.channelId,
        voiceChannel.id,
      );
      await interaction.reply(
        `🔊 Conectado exitosamente al canal: **${voiceChannel.name}**`,
      );
    } else {
      await interaction.reply({
        content: '❌ No se pudo conectar al canal de voz.',
        ephemeral: true,
      });
    }
  }
}
