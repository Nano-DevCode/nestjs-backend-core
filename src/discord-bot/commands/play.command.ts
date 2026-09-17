import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import type { ISlashCommand } from './command.interface';
import { LavalinkService } from '../audio/lavalink.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';

@Injectable()
export class PlayCommand implements ISlashCommand {
  readonly data = new SlashCommandBuilder()
    .setName('play')
    .setDescription(
      'Reproduce una canción o playlist desde YouTube, SoundCloud o URL',
    )
    .addStringOption((option) =>
      option
        .setName('busqueda')
        .setDescription('Nombre de la canción, artista o enlace directo')
        .setRequired(true),
    );

  constructor(
    private readonly lavalinkService: LavalinkService,
    private readonly playbackService: DiscordPlaybackService,
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const member = interaction.member as GuildMember | null;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: '❌ Debes estar en un canal de voz para usar este comando.',
        ephemeral: true,
      });
      return;
    }

    const query = interaction.options.getString('busqueda', true);
    await interaction.deferReply();

    const requester = {
      id: interaction.user.id,
      username: interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL(),
    };

    const searchResult = await this.lavalinkService.resolveTracks(
      query,
      requester,
    );

    if (searchResult.loadType === 'empty' || searchResult.tracks.length === 0) {
      await interaction.editReply({
        content: `🔍 No se encontraron resultados para: \`${query}\``,
      });
      return;
    }

    if (searchResult.loadType === 'error') {
      await interaction.editReply({
        content: `❌ Error al procesar audio: ${searchResult.error || 'Error desconocido'}`,
      });
      return;
    }

    const guildId = interaction.guildId!;
    const textChannelId = interaction.channelId;

    const tracksToPlay =
      searchResult.loadType === 'playlist'
        ? searchResult.tracks
        : searchResult.tracks.slice(0, 1);

    const result = await this.playbackService.playTracks(
      guildId,
      voiceChannel.id,
      textChannelId,
      tracksToPlay,
    );

    if (searchResult.loadType === 'playlist') {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📁 Playlist Añadida a la Cola')
        .setDescription(
          `**${searchResult.playlistName || 'Playlist'}**\nSe añadieron **${searchResult.tracks.length}** canciones a la lista.`,
        )
        .setFooter({ text: `Solicitado por ${interaction.user.username}` });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const firstTrack = searchResult.tracks[0];
    const durationMin = Math.floor(firstTrack.info.length / 60000);
    const durationSec = Math.floor((firstTrack.info.length % 60000) / 1000)
      .toString()
      .padStart(2, '0');

    const isEnqueued = result.enqueued > 0;
    const embed = new EmbedBuilder()
      .setColor(isEnqueued ? 0x00d166 : 0x5865f2)
      .setTitle(isEnqueued ? '⏳ Añadida a la Cola' : '▶️ Reproduciendo Ahora')
      .setDescription(
        `[${firstTrack.info.title}](${firstTrack.info.uri || ''})`,
      )
      .addFields(
        {
          name: 'Canal / Artista',
          value: firstTrack.info.author,
          inline: true,
        },
        {
          name: 'Duración',
          value: `${durationMin}:${durationSec}`,
          inline: true,
        },
      )
      .setFooter({ text: `Solicitado por ${interaction.user.username}` });

    if (firstTrack.info.artworkUrl) {
      embed.setThumbnail(firstTrack.info.artworkUrl);
    }

    await interaction.editReply({ embeds: [embed] });
  }
}
