import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { DiscordGuildService } from '../persistence/discord-guild.service';

@Injectable()
export class SetChannelCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription(
      'Configura o elimina el canal de texto exclusivo para comandos y música',
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild,
    )
    .addChannelOption((option) =>
      option
        .setName('canal')
        .setDescription('Canal de texto que será exclusivo para los comandos')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('remover')
        .setDescription(
          'Indica true si deseas eliminar la restricción de canal exclusivo',
        )
        .setRequired(false),
    );

  constructor(private readonly guildService: DiscordGuildService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: '❌ Este comando solo puede usarse dentro de un servidor.',
        ephemeral: true,
      });
      return;
    }

    const channelOption = interaction.options.getChannel('canal');
    const removeOption = interaction.options.getBoolean('remover');

    if (removeOption) {
      await this.guildService.updateGuildConfig(guildId, {
        dedicatedChannelId: null,
      });
      await interaction.reply({
        content:
          '✅ **Restricción eliminada.** El bot ahora aceptará comandos de música en cualquier canal de texto.',
        ephemeral: true,
      });
      return;
    }

    if (channelOption) {
      await this.guildService.updateGuildConfig(guildId, {
        dedicatedChannelId: channelOption.id,
      });
      await interaction.reply({
        content: `✅ **Canal exclusivo configurado.** A partir de ahora, los comandos y la música solo se atenderán en <#${channelOption.id}>.`,
        ephemeral: true,
      });
      return;
    }

    const currentConfig = await this.guildService.getGuildConfig(guildId);
    if (currentConfig?.dedicatedChannelId) {
      await interaction.reply({
        content: `📌 El canal exclusivo actual es <#${currentConfig.dedicatedChannelId}>.\nPara cambiarlo usa \`/setchannel canal:#otro-canal\` o para removerlo usa \`/setchannel remover:true\`.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content:
          'ℹ️ No hay ningún canal exclusivo asignado. El bot acepta comandos en cualquier canal.\nUsa `/setchannel canal:#tu-canal` para definir uno.',
        ephemeral: true,
      });
    }
  }
}

