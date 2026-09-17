import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';

@Injectable()
export class SayCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('say')
    .setDescription('Envía un mensaje a un canal de texto a nombre del bot')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild,
    )
    .addChannelOption((option) =>
      option
        .setName('canal')
        .setDescription('Canal de texto de destino')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('mensaje')
        .setDescription('Contenido del mensaje que publicará el bot')
        .setRequired(true),
    );

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: '❌ Este comando solo puede usarse dentro de un servidor.',
        ephemeral: true,
      });
      return;
    }

    const targetChannel = interaction.options.getChannel('canal', true);
    const content = interaction.options.getString('mensaje', true);

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      await interaction.reply({
        content: '❌ No se pudo verificar la identidad del bot en el servidor.',
        ephemeral: true,
      });
      return;
    }

    const textChannel = targetChannel as GuildTextBasedChannel;
    const permissions = textChannel.permissionsFor(botMember);

    if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages)) {
      await interaction.reply({
        content: `❌ El bot no tiene permisos suficientes (\`Enviar Mensajes\`) en el canal <#${targetChannel.id}>.`,
        ephemeral: true,
      });
      return;
    }

    try {
      await textChannel.send({
        content,
        allowedMentions: { parse: ['users', 'roles'] },
      });

      await interaction.reply({
        content: `✅ Mensaje enviado exitosamente a <#${targetChannel.id}>.`,
        ephemeral: true,
      });
    } catch (err: unknown) {
      await interaction.reply({
        content: `❌ Falló el envío del mensaje: ${(err as Error).message}`,
        ephemeral: true,
      });
    }
  }
}

