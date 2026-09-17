import * as dotenv from 'dotenv';
import * as path from 'path';
import { REST } from '@discordjs/rest';
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  Routes,
} from 'discord.js';

// Cargar variables de entorno automáticamente desde .env y .env.production
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

/**
 * Script de Registro Global de Slash Commands en la API de Discord
 *
 * Uso:
 *   npx tsx scripts/register-commands.ts
 */

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription(
      'Reproduce una canción o playlist desde YouTube, SoundCloud o URL',
    )
    .addStringOption((option) =>
      option
        .setName('busqueda')
        .setDescription('Nombre de la canción, artista o enlace directo')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa la reproducción actual'),
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Reanuda la pista pausada'),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta a la siguiente canción de la cola'),
  new SlashCommandBuilder()
    .setName('back')
    .setDescription('Reproduce la canción anterior del historial'),
  new SlashCommandBuilder()
    .setName('seek')
    .setDescription(
      'Avanza o retrocede la reproducción al segundo especificado',
    )
    .addIntegerOption((option) =>
      option
        .setName('segundos')
        .setDescription('Posición en segundos a la que saltar')
        .setRequired(true)
        .setMinValue(0),
    ),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription(
      'Muestra la lista de canciones en espera y la pista actual',
    ),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Elimina una canción específica de la cola según su número')
    .addIntegerOption((option) =>
      option
        .setName('posicion')
        .setDescription('Número de posición en la lista (1, 2, 3...)')
        .setRequired(true)
        .setMinValue(1),
    ),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Vacía todas las canciones en espera de la cola'),
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Conecta el bot a tu canal de voz actual'),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Detiene la música y desconecta el bot del canal de voz'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la reproducción y vacía la cola por completo'),
  new SlashCommandBuilder()
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
    ),
  new SlashCommandBuilder()
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
    ),
].map((cmd) => cmd.toJSON());

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    console.error(
      '❌ Error: Se requieren DISCORD_BOT_TOKEN y DISCORD_CLIENT_ID para registrar comandos.',
    );
    process.exit(1);
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  console.log(
    `🤖 Registrando 12 Slash Commands en Discord (${guildId ? `Guild: ${guildId}` : 'Global'})...`,
  );
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const data = (await rest.put(route, {
      body: commands,
    })) as unknown[];

    console.log(
      `✅ ¡Se registraron exitosamente ${data.length} comandos (${guildId ? 'en el servidor especificado' : 'globales'}) en Discord!`,
    );
  } catch (error: unknown) {
    console.error('💥 Error al registrar comandos:', error);
    process.exit(1);
  }
}

void main();
