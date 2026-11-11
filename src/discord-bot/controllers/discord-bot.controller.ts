import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  Optional,
  ServiceUnavailableException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Public, Roles } from '../../auth/decorators/auth.decorator';
import { DiscordGateway } from '../gateway/discord.gateway';
import { LavalinkService } from '../audio/lavalink.service';
import { QueueManagerService } from '../queue/queue-manager.service';
import { DiscordPlaybackService } from '../audio/discord-playback.service';
import {
  DiscordGuildService,
  type UserGuildRole,
} from '../persistence/discord-guild.service';
import { DiscordOAuthService } from '../oauth/discord-oauth.service';
import { GuildAccessGuard } from '../guards/guild-access.guard';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { FeatureFlagKey } from '../../features/constants/feature-flags.constant';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '../../common/scalar/scalar.decorators';

interface AuthenticatedUser {
  id: string;
  email: string;
  roles?: string[];
  permissions?: string[];
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export class CustomLavalinkNodeDto {
  @IsString({ message: 'El nombre del nodo debe ser un string' })
  @IsNotEmpty({ message: 'El nombre del nodo es requerido' })
  name!: string;

  @IsString({ message: 'El host del nodo debe ser un string' })
  @IsNotEmpty({ message: 'El host del nodo es requerido' })
  host!: string;

  @IsNumber({}, { message: 'El puerto debe ser numérico' })
  port!: number;

  @IsString({ message: 'La contraseña del nodo debe ser un string' })
  @IsNotEmpty({ message: 'La contraseña del nodo es requerida' })
  password!: string;

  @IsOptional()
  @IsBoolean({ message: 'secure debe ser booleano' })
  secure?: boolean;
}

export class RegisterLavalinkDto {
  @IsString({ message: 'El guildId debe ser un string' })
  @IsNotEmpty({ message: 'El guildId es requerido para vincular Lavalink' })
  guildId!: string;

  @IsOptional()
  @IsString({ message: 'El voiceChannelId debe ser un string' })
  voiceChannelId?: string;

  @IsOptional()
  @IsString({ message: 'El discordUserId debe ser un string (Snowflake)' })
  discordUserId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomLavalinkNodeDto)
  customNode?: CustomLavalinkNodeDto;
}

export class SyncDiscordOAuthDto {
  @IsOptional()
  @IsString({ message: 'El código OAuth2 de Discord debe ser un string' })
  code?: string;

  @IsOptional()
  @IsString({ message: 'El accessToken OAuth2 de Discord debe ser un string' })
  accessToken?: string;

  @IsOptional()
  @IsString({ message: 'El redirectUri debe ser un string' })
  redirectUri?: string;
}

export class ResolveTrackDto {
  @IsString({ message: 'La búsqueda o URL (query) debe ser un string' })
  @IsNotEmpty({ message: 'El campo query es requerido' })
  query!: string;
}

export class SendMessageDto {
  @IsString({ message: 'El guildId debe ser un string' })
  @IsNotEmpty({ message: 'El guildId es requerido' })
  guildId!: string;

  @IsString({ message: 'El channelId debe ser un string' })
  @IsNotEmpty({ message: 'El channelId es requerido' })
  channelId!: string;

  @IsString({ message: 'El contenido del mensaje debe ser un string' })
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  content!: string;
}

export class UpdateGuildConfigDto {
  @IsOptional()
  @IsString({ message: 'dedicatedChannelId debe ser un string o null' })
  dedicatedChannelId?: string | null;
}

export class PlaybackActionDto {
  @IsString({ message: 'La acción debe ser una cadena de texto válida' })
  @IsNotEmpty({ message: 'La acción es requerida' })
  @IsIn(
    [
      'play',
      'pause',
      'resume',
      'skip',
      'back',
      'seek',
      'volume',
      'stop',
      'leave',
    ],
    { message: 'Acción de reproducción no reconocida' },
  )
  action!:
    | 'play'
    | 'pause'
    | 'resume'
    | 'skip'
    | 'back'
    | 'seek'
    | 'volume'
    | 'stop'
    | 'leave';

  @IsOptional()
  @IsString({ message: 'El término de búsqueda debe ser un string' })
  query?: string;

  @IsOptional()
  @IsString({ message: 'El ID del canal de voz debe ser un string' })
  voiceChannelId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'El valor debe ser numérico' })
  value?: number;
}

@ApiTags('Discord Bot & Audio Engine')
@ApiBearerAuth('bearer-jwt')
@Controller('discord')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DiscordBotController {
  constructor(
    private readonly gateway: DiscordGateway,
    private readonly lavalink: LavalinkService,
    private readonly queueManager: QueueManagerService,
    private readonly playback: DiscordPlaybackService,
    private readonly guildService: DiscordGuildService,
    private readonly featureFlagsService: FeatureFlagsService,
    @Optional() private readonly discordOAuth?: DiscordOAuthService,
  ) {}

  private isAdminUser(req?: AuthenticatedRequest): boolean {
    const userRoles = (req?.user?.roles || []).map((r) => r.toLowerCase());
    return userRoles.includes('admin') || userRoles.includes('superadmin');
  }

  private async assertGuildAccess(
    req: AuthenticatedRequest | undefined,
    guildId: string,
  ): Promise<void> {
    if (!req?.user) {
      return;
    }

    if (this.isAdminUser(req)) {
      return;
    }

    const hasAccess = this.guildService.hasGuildAccess
      ? await this.guildService.hasGuildAccess(
          req.user.id,
          guildId,
          req.user.roles,
        )
      : Boolean(
          await this.guildService.getUserGuildRegistration?.(
            req.user.id,
            guildId,
          ),
        );

    if (!hasAccess) {
      throw new ForbiddenException(
        'No tienes permiso sobre este servidor de Discord',
      );
    }
  }

  private async checkBotEnabled(): Promise<void> {
    const isEnabled = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.DISCORD_BOT_ENABLED,
    );
    if (!isEnabled) {
      throw new ServiceUnavailableException(
        'El módulo del bot de Discord está desactivado por Feature Flag (DISCORD_BOT_ENABLED=false).',
      );
    }
  }

  private buildBotInviteUrl(clientId?: string): string | null {
    const resolvedClientId =
      clientId || process.env.DISCORD_CLIENT_ID || undefined;
    if (!resolvedClientId) {
      return null;
    }
    // Permisos: ViewChannel, SendMessages, Connect, Speak, UseVAD (36700160)
    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(resolvedClientId)}&permissions=36700160&scope=bot%20applications.commands`;
  }

  @Get('oauth/url')
  @ApiOperation({
    summary:
      'Genera la URL de autorización Discord OAuth2 (scopes: identify, guilds) para vincular y sincronizar servidores del usuario',
  })
  @ApiQuery({
    name: 'redirectPath',
    required: false,
    description: 'Ruta relativa del frontend a donde regresar tras el callback',
  })
  @ApiResponse({
    status: 200,
    description: 'URL de autorización OAuth2 de Discord firmada con state',
  })
  async getDiscordOAuthUrl(
    @Req() req?: AuthenticatedRequest,
    @Query('redirectPath') redirectPath?: string,
  ) {
    await this.checkBotEnabled();
    if (!this.discordOAuth) {
      throw new ServiceUnavailableException(
        'El servicio DiscordOAuthService no está disponible.',
      );
    }

    const userId = req?.user?.id;
    if (!userId) {
      throw new ForbiddenException('Usuario no autenticado.');
    }

    return this.discordOAuth.getAuthorizationUrl(userId, redirectPath);
  }

  @Public()
  @Get('oauth/callback')
  @ApiOperation({
    summary:
      'Callback de Discord OAuth2 (scopes identify y guilds). Cruza servidores con ADMINISTRATOR (0x8) o MANAGE_GUILD (0x20) y presencia del bot',
  })
  @ApiQuery({ name: 'code', required: true, description: 'Código OAuth2 de Discord' })
  @ApiQuery({ name: 'state', required: true, description: 'Estado firmado con userId' })
  async handleDiscordOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('format') format?: string,
    @Req() req?: AuthenticatedRequest,
    @Res() res?: Response,
  ) {
    await this.checkBotEnabled();
    if (!this.discordOAuth) {
      throw new ServiceUnavailableException(
        'El servicio DiscordOAuthService no está disponible.',
      );
    }

    if (!code) {
      throw new BadRequestException(
        'Falta el parámetro "code" devuelto por Discord OAuth2.',
      );
    }

    let userId = req?.user?.id;
    let redirectPath = '/admin/discord-bot';

    if (state) {
      const verified = this.discordOAuth.verifySignedState(state);
      userId = verified.userId;
      redirectPath = verified.redirectPath;
    }

    if (!userId) {
      throw new ForbiddenException(
        'No se pudo determinar el usuario para vincular la cuenta de Discord.',
      );
    }

    const syncResult = await this.discordOAuth.syncUserGuildsFromOAuth(userId, {
      code,
    });

    const acceptsHtml =
      format !== 'json' &&
      Boolean(req?.headers?.accept?.includes('text/html'));

    if (res && acceptsHtml) {
      const frontendBase = (
        process.env.FRONTEND_URL ||
        process.env.APP_URL ||
        'https://sistema.nano-service.com'
      ).replace(/\/$/, '');
      const redirectUrl = `${frontendBase}${redirectPath}?discord_linked=true&discord_user=${encodeURIComponent(syncResult.discordUser.username)}&linked_count=${syncResult.linkedGuilds.length}`;
      return res.redirect(redirectUrl);
    }

    const payload = {
      success: true,
      message: `Cuenta de Discord (${syncResult.discordUser.username}) vinculada. Se sincronizaron ${syncResult.linkedGuilds.length} servidor(es) donde tienes permisos de administración y el bot está presente.`,
      ...syncResult,
    };

    if (res) {
      return res.status(200).json(payload);
    }
    return payload;
  }

  @Post('oauth/sync')
  @ApiOperation({
    summary:
      'Sincroniza los servidores del usuario con Discord OAuth2 usando un code o accessToken',
  })
  @ApiResponse({
    status: 200,
    description:
      'Servidores cruzados con permisos ADMINISTRATOR / MANAGE_GUILD y presencia del bot en caché',
  })
  async syncDiscordOAuth(
    @Body() dto: SyncDiscordOAuthDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    if (!this.discordOAuth) {
      throw new ServiceUnavailableException(
        'El servicio DiscordOAuthService no está disponible.',
      );
    }

    const userId = req?.user?.id;
    if (!userId) {
      throw new ForbiddenException('Usuario no autenticado.');
    }

    const result = await this.discordOAuth.syncUserGuildsFromOAuth(userId, {
      code: dto.code,
      accessToken: dto.accessToken,
      redirectUri: dto.redirectUri,
    });

    return {
      success: true,
      message: `Se vincularon ${result.linkedGuilds.length} servidor(es) de Discord a tu cuenta.`,
      ...result,
    };
  }

  @Get('status')
  @ApiOperation({
    summary:
      'Consulta el estado de conectividad del bot de Discord, nodos Lavalink y sesiones del usuario',
  })
  @ApiResponse({
    status: 200,
    description:
      'Estado de conexión, nodos Lavalink, link de invitación y servidores registrados por el usuario',
  })
  async getStatus(@Req() req?: AuthenticatedRequest) {
    const isFeatureEnabled = await this.featureFlagsService.isFeatureEnabled(
      FeatureFlagKey.DISCORD_BOT_ENABLED,
    );
    const client = this.gateway.getClient();
    const isClientReady = Boolean(client?.isReady());
    const isLavalinkReady = this.lavalink.isConnected;
    const lavalinkNodes = this.lavalink.getNodesStatus?.() ?? [];

    const userId = req?.user?.id;
    const isAdmin = this.isAdminUser(req);
    const myRegistrations =
      userId && this.guildService.getUserRegistrations
        ? await this.guildService.getUserRegistrations(userId)
        : [];
    const discordUserId =
      userId && this.guildService.getUserDiscordId
        ? await this.guildService.getUserDiscordId(userId)
        : null;

    const myGuildIds = new Set(myRegistrations.map((r) => r.guildId));
    const allActiveGuildIds = this.queueManager.getAllActiveGuildIds();
    const scopedActiveQueuesCount = isAdmin
      ? allActiveGuildIds.length
      : allActiveGuildIds.filter((id) => myGuildIds.has(id)).length;

    return {
      isEnabled: isFeatureEnabled,
      isDiscordConnected: isClientReady,
      isLavalinkConnected: isLavalinkReady,
      lavalinkNodes: isAdmin ? lavalinkNodes : [],
      guildCount: isAdmin
        ? client?.guilds.cache.size || 0
        : myRegistrations.length,
      activeQueuesCount: scopedActiveQueuesCount,
      inviteUrl: this.buildBotInviteUrl(client?.user?.id),
      discordUserId,
      myRegistrations,
      user: client?.user
        ? {
            id: client.user.id,
            tag: client.user.tag,
            avatar: client.user.displayAvatarURL(),
          }
        : null,
    };
  }

  @Get('guilds')
  @ApiOperation({
    summary:
      'Lista los servidores (guilds) de Discord. Usuarios regulares solo ven sus servidores vinculados; admins ven todos o con ?scope=all',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    description:
      'Filtrar por "mine" (solo registrados por el usuario) o "all" (todos los disponibles - solo admin/superadmin)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Listado de servidores autorizados para el usuario, canales de voz y pistas en reproducción',
  })
  async getGuilds(
    @Req() req?: AuthenticatedRequest,
    @Query('scope') scope?: 'mine' | 'all',
  ) {
    await this.checkBotEnabled();
    const client = this.gateway.getClient();

    if (!client || !client.isReady()) {
      return [];
    }

    const userId = req?.user?.id;
    const isAdmin = this.isAdminUser(req);
    const userRegistrations =
      userId && this.guildService.getUserRegistrations
        ? await this.guildService.getUserRegistrations(userId)
        : [];
    const registeredMap = new Map(
      userRegistrations.map((reg) => [reg.guildId, reg]),
    );

    // Usuarios estándar ('user'): AISLAMIENTO ESTRICTO - solo pueden ver los servidores formalmente vinculados a su userId.
    // Administradores ('admin' / 'superadmin'): pueden ver todos los servidores (salvo que pidan ?scope=mine).
    const allBotGuilds = Array.from(client.guilds.cache.values());
    const targetGuilds =
      !isAdmin || scope === 'mine'
        ? allBotGuilds.filter((g) => registeredMap.has(g.id))
        : allBotGuilds;

    const guildsData = await Promise.all(
      targetGuilds.map(async (guild) => {
        const queue = this.queueManager.getQueue(guild.id);
        const config = await this.guildService.getGuildConfig(guild.id);
        const userSession = registeredMap.get(guild.id) || null;

        const fetchedChannels =
          guild.channels.cache.size === 0 &&
          typeof guild.channels.fetch === 'function'
            ? await guild.channels.fetch().catch(() => null)
            : guild.channels.cache;

        const voiceChannels = (
          fetchedChannels ? Array.from(fetchedChannels.values()) : []
        )
          .filter(
            (c) =>
              Boolean(c) &&
              (c!.type === ChannelType.GuildVoice ||
                c!.type === ChannelType.GuildStageVoice),
          )
          .map((c) => ({ id: c!.id, name: c!.name }));

        const textChannels = (
          fetchedChannels ? Array.from(fetchedChannels.values()) : []
        )
          .filter(
            (c) =>
              Boolean(c) &&
              (c!.type === ChannelType.GuildText ||
                c!.type === ChannelType.GuildAnnouncement),
          )
          .map((c) => ({ id: c!.id, name: c!.name }));

        return {
          id: guild.id,
          name: guild.name,
          icon:
            typeof guild.iconURL === 'function' ? guild.iconURL() : null,
          memberCount: guild.memberCount,
          isRegistered: Boolean(userSession),
          userSession,
          hasActiveQueue: Boolean(queue?.currentTrack),
          currentTrack: queue?.currentTrack?.info || null,
          voiceChannels,
          textChannels,
          config,
        };
      }),
    );

    guildsData.sort(
      (a, b) => Number(b.isRegistered) - Number(a.isRegistered),
    );

    return guildsData;
  }

  @Post('lavalink/register')
  @ApiOperation({
    summary:
      'Registra al usuario actual en un servidor de Discord comprobando que sea ownerId o Administrador en la guild',
  })
  @ApiResponse({
    status: 201,
    description:
      'Usuario registrado exitosamente en Lavalink tras verificar propiedad/administración del servidor',
  })
  async registerInLavalink(
    @Body() dto: RegisterLavalinkDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    const userId = req?.user?.id || 'anonymous-user';
    const isAdmin = this.isAdminUser(req);

    let nodeName = 'lavalink-node-1';
    let customNodeStatus:
      | {
          registered: boolean;
          nodeName: string;
          isConnected: boolean;
          message: string;
        }
      | undefined;

    if (dto.customNode) {
      if (!isAdmin) {
        throw new ForbiddenException(
          'Solo los administradores pueden registrar nodos Lavalink externos personalizados. Tu cuenta usará el cluster Lavalink principal automáticamente.',
        );
      }
      customNodeStatus = this.lavalink.registerNode(dto.customNode);
      nodeName = dto.customNode.name;
    }

    const client = this.gateway.getClient();
    const guild = client?.isReady()
      ? client.guilds.cache.get(dto.guildId)
      : undefined;

    const storedDiscordUserId =
      this.guildService.getUserDiscordId
        ? await this.guildService.getUserDiscordId(userId)
        : null;
    const resolvedDiscordUserId =
      dto.discordUserId || storedDiscordUserId || null;

    let verifiedRole: UserGuildRole = isAdmin ? 'ADMINISTRATOR' : 'MANUAL_VERIFIED';

    // Si el usuario NO es administrador global, debe verificarse activamente en la guild
    // que su discordUserId sea el ownerId o tenga permisos de ADMINISTRATOR / MANAGE_GUILD
    // (o que ya tenga el servidor vinculado previamente vía OAuth2).
    if (!isAdmin) {
      const existingRegistration =
        await this.guildService.getUserGuildRegistration(userId, dto.guildId);

      if (!existingRegistration) {
        if (!guild) {
          throw new ForbiddenException(
            'El bot aún no está presente en ese servidor de Discord. Primero invita al bot a tu servidor y luego sincroniza con Discord OAuth2 o verifica tu propiedad.',
          );
        }

        if (!resolvedDiscordUserId) {
          throw new ForbiddenException(
            'Para vincular un servidor sin Discord OAuth2 debes proporcionar tu discordUserId o haber vinculado tu cuenta de Discord previamente.',
          );
        }

        let isOwnerOrGuildAdmin = false;

        if (guild.ownerId && guild.ownerId === resolvedDiscordUserId) {
          isOwnerOrGuildAdmin = true;
          verifiedRole = 'OWNER';
        } else {
          const member =
            guild.members?.cache?.get(resolvedDiscordUserId) ||
            (typeof guild.members?.fetch === 'function'
              ? await guild.members
                  .fetch(resolvedDiscordUserId)
                  .catch(() => null)
              : null);

          if (
            member?.permissions?.has?.(PermissionFlagsBits.Administrator)
          ) {
            isOwnerOrGuildAdmin = true;
            verifiedRole = 'ADMINISTRATOR';
          } else if (
            member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)
          ) {
            isOwnerOrGuildAdmin = true;
            verifiedRole = 'MANAGE_GUILD';
          }
        }

        if (!isOwnerOrGuildAdmin) {
          throw new ForbiddenException(
            'No tienes permiso sobre este servidor de Discord. El bot verificó que tu usuario de Discord no es el propietario (ownerId) ni tiene rol de Administrador en ese servidor.',
          );
        }
      } else {
        verifiedRole =
          (existingRegistration.role as UserGuildRole) || 'OWNER';
      }
    }

    let resolvedVoiceChannelId = dto.voiceChannelId || null;

    if (guild) {
      // Si el usuario tiene discordUserId y no especificó canal de voz, autodetectar su canal de voz actual
      if (!resolvedVoiceChannelId && resolvedDiscordUserId) {
        const voiceState = guild.voiceStates?.cache?.get(
          resolvedDiscordUserId,
        );
        if (voiceState?.channelId) {
          resolvedVoiceChannelId = voiceState.channelId;
        }
      }

      // Validar que el canal de voz exista en el servidor si fue proporcionado
      if (resolvedVoiceChannelId) {
        const fetched =
          guild.channels.cache.size === 0 &&
          typeof guild.channels.fetch === 'function'
            ? await guild.channels.fetch().catch(() => null)
            : guild.channels.cache;
        const channel = fetched?.get(resolvedVoiceChannelId);
        if (
          channel &&
          channel.type !== ChannelType.GuildVoice &&
          channel.type !== ChannelType.GuildStageVoice
        ) {
          throw new BadRequestException(
            'El canal indicado no es un canal de voz o escenario válido en este servidor.',
          );
        }
      }
    }

    const registration = await this.guildService.registerUserLavalinkSession(
      userId,
      {
        guildId: dto.guildId,
        guildName: guild?.name,
        role: verifiedRole,
        voiceChannelId: resolvedVoiceChannelId,
        discordUserId: resolvedDiscordUserId,
        nodeName,
      },
    );

    const queue = this.queueManager.getQueue(dto.guildId);

    return {
      success: true,
      message: guild
        ? `Registrado en Lavalink exitosamente para el servidor "${guild.name}".`
        : `Servidor ${dto.guildId} pre-registrado en Lavalink. Invita al bot a tu servidor usando inviteUrl para iniciar la reproducción.`,
      registration,
      isLavalinkConnected: this.lavalink.isConnected,
      isBotInGuild: Boolean(guild),
      inviteUrl: this.buildBotInviteUrl(client?.user?.id),
      customNodeStatus,
      activeQueue: queue ? queue.toJSON() : null,
    };
  }

  @Get('lavalink/me')
  @ApiOperation({
    summary:
      'Obtiene las sesiones y servidores registrados por el usuario autenticado en Lavalink',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesiones de Lavalink del usuario y estado de sus colas',
  })
  async getMyLavalinkSessions(@Req() req?: AuthenticatedRequest) {
    await this.checkBotEnabled();
    const userId = req?.user?.id || 'anonymous-user';
    const registrations =
      await this.guildService.getUserRegistrations(userId);
    const client = this.gateway.getClient();

    const sessions = registrations.map((reg) => {
      const guild = client?.guilds.cache.get(reg.guildId);
      const queue = this.queueManager.getQueue(reg.guildId);
      const player = this.lavalink.getPlayer(reg.guildId);

      return {
        ...reg,
        guildName: guild?.name || reg.guildName || null,
        guildIcon:
          guild && typeof guild.iconURL === 'function'
            ? guild.iconURL()
            : null,
        isBotPresent: Boolean(guild),
        hasActivePlayback: Boolean(queue?.currentTrack),
        currentTrack: queue?.currentTrack || null,
        position: player?.position || queue?.lastPlaybackPosition || 0,
        isPaused: queue?.isPaused ?? false,
        volume: queue?.volume ?? 100,
      };
    });

    return {
      userId,
      isLavalinkConnected: this.lavalink.isConnected,
      nodes: this.lavalink.getNodesStatus?.() ?? [],
      sessions,
    };
  }

  @Delete('lavalink/unregister/:guildId')
  @ApiOperation({
    summary: 'Desvincula un servidor de Discord del registro Lavalink del usuario',
  })
  @ApiParam({ name: 'guildId', description: 'ID del servidor Discord' })
  @ApiResponse({
    status: 200,
    description: 'Servidor desvinculado de la cuenta del usuario',
  })
  async unregisterFromLavalink(
    @Param('guildId') guildId: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    const userId = req?.user?.id || 'anonymous-user';
    const removed = await this.guildService.unregisterUserGuild(
      userId,
      guildId,
    );

    return {
      success: true,
      removed,
      guildId,
      message: removed
        ? `Servidor ${guildId} desvinculado de tu sesión Lavalink.`
        : `El servidor ${guildId} no estaba vinculado a tu cuenta.`,
    };
  }

  @Post('lavalink/resolve')
  @ApiOperation({
    summary:
      'Busca y resuelve pistas o playlists directamente en Lavalink (YouTube Music, Spotify, SoundCloud)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de pistas resueltas por Lavalink listas para reproducir',
  })
  async resolveTracks(
    @Body() dto: ResolveTrackDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    const requester = {
      id: req?.user?.id || 'web-user',
      username: req?.user?.email || 'Usuario Web',
    };

    const result = await this.lavalink.resolveTracks(dto.query, requester);
    return result;
  }

  @Get('queue/:guildId')
  @UseGuards(GuildAccessGuard)
  @ApiOperation({
    summary: 'Obtiene la cola de reproducción musical activa de un servidor autorizado',
  })
  @ApiParam({
    name: 'guildId',
    type: String,
    description: 'Identificador único del servidor Discord (Snowflake)',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de la cola, canción actual, posición y volumen',
  })
  async getQueue(
    @Param('guildId') guildId: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    await this.assertGuildAccess(req, guildId);

    const queue = this.queueManager.getQueue(guildId);

    if (!queue) {
      return {
        guildId,
        currentTrack: null,
        tracks: [],
        history: [],
        volume: 100,
        isPaused: false,
        repeatMode: 'off',
        position: 0,
      };
    }

    const player = this.lavalink.getPlayer(guildId);

    return {
      ...queue.toJSON(),
      position: player?.position || queue.lastPlaybackPosition,
    };
  }

  @Post('playback/:guildId')
  @UseGuards(GuildAccessGuard)
  @ApiOperation({
    summary:
      'Ejecuta una acción de control de reproducción de audio (play, pause, skip, seek, volume, etc.) validando acceso al servidor',
  })
  @ApiParam({
    name: 'guildId',
    type: String,
    description: 'Identificador del servidor Discord',
  })
  @ApiResponse({
    status: 200,
    description: 'Acción de reproducción ejecutada exitosamente',
  })
  async handlePlayback(
    @Param('guildId') guildId: string,
    @Body() dto: PlaybackActionDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    await this.assertGuildAccess(req, guildId);

    switch (dto.action) {
      case 'play': {
        if (!dto.query) {
          throw new BadRequestException(
            'Se requiere el campo query para reproducir.',
          );
        }

        const userId = req?.user?.id;
        const userSession =
          userId && this.guildService.getUserGuildRegistration
            ? await this.guildService.getUserGuildRegistration(userId, guildId)
            : null;

        let voiceChannelId = dto.voiceChannelId;
        const client = this.gateway.getClient();
        const guild = client?.guilds.cache.get(guildId);

        // 1. Si no envió voiceChannelId, revisar si tiene sesión registrada en Lavalink
        if (!voiceChannelId && userSession) {
          if (userSession.discordUserId && guild?.voiceStates?.cache) {
            const memberVoice = guild.voiceStates.cache.get(
              userSession.discordUserId,
            );
            if (memberVoice?.channelId) {
              voiceChannelId = memberVoice.channelId;
            }
          }
          if (!voiceChannelId && userSession.voiceChannelId) {
            voiceChannelId = userSession.voiceChannelId;
          }
        }

        // 2. Fallback: usar el canal de voz de la cola activa o el primer canal de voz del servidor
        if (!voiceChannelId) {
          const activeQueue = this.queueManager.getQueue(guildId);
          if (activeQueue?.voiceChannelId) {
            voiceChannelId = activeQueue.voiceChannelId;
          } else if (guild) {
            const fetched =
              guild.channels.cache.size === 0 &&
              typeof guild.channels.fetch === 'function'
                ? await guild.channels.fetch().catch(() => null)
                : guild.channels.cache;
            const channelsList = fetched ? Array.from(fetched.values()) : [];
            const firstVoice = channelsList.find(
              (c) =>
                Boolean(c) &&
                (c!.type === ChannelType.GuildVoice ||
                  c!.type === ChannelType.GuildStageVoice),
            );
            if (firstVoice) {
              voiceChannelId = firstVoice.id;
            }
          }
        }

        if (!voiceChannelId) {
          throw new BadRequestException(
            'Se requiere voiceChannelId, estar registrado en un canal de voz con /discord/lavalink/register, o que exista un canal de voz disponible en el servidor.',
          );
        }

        const requester = {
          id: req?.user?.id || 'dashboard-user',
          username: req?.user?.email || 'Web User',
        };

        const resolveRes = await this.lavalink.resolveTracks(
          dto.query,
          requester,
        );

        if (resolveRes.tracks.length === 0) {
          throw new NotFoundException(
            'No se encontraron canciones con esa búsqueda.',
          );
        }

        const tracksToPlay =
          resolveRes.loadType === 'playlist'
            ? resolveRes.tracks
            : resolveRes.tracks.slice(0, 1);

        const res = await this.playback.playTracks(
          guildId,
          voiceChannelId,
          '',
          tracksToPlay,
        );

        return {
          success: true,
          message:
            resolveRes.loadType === 'playlist'
              ? `Playlist "${resolveRes.playlistName || 'Playlist'}" (${tracksToPlay.length} pistas) enviada a la cola.`
              : `Pista "${tracksToPlay[0]?.info.title || 'Canción'}" enviada a reproducción.`,
          nowPlaying: res.nowPlaying,
          enqueued: res.enqueued,
        };
      }

      case 'pause':
        await this.playback.pause(guildId);
        return { success: true, message: 'Reproducción pausada.' };

      case 'resume':
        await this.playback.resume(guildId);
        return { success: true, message: 'Reproducción reanudada.' };

      case 'skip': {
        const next = await this.playback.playNext(guildId);
        return {
          success: true,
          message: next ? `Saltado a ${next.info.title}` : 'Fin de la cola.',
          nextTrack: next,
        };
      }

      case 'back': {
        const prev = await this.playback.playPrevious(guildId);
        return {
          success: true,
          message: prev
            ? `Regresando a ${prev.info.title}`
            : 'No hay tracks previos.',
          previousTrack: prev,
        };
      }

      case 'seek': {
        if (typeof dto.value !== 'number') {
          throw new BadRequestException(
            'Se requiere valor numérico en segundos para seek.',
          );
        }
        await this.playback.seek(guildId, dto.value);
        return { success: true, message: `Posición ajustada a ${dto.value}s.` };
      }

      case 'volume': {
        if (typeof dto.value !== 'number') {
          throw new BadRequestException(
            'Se requiere valor numérico para volumen (0-200).',
          );
        }
        await this.playback.setVolume(guildId, dto.value);
        return { success: true, message: `Volumen ajustado a ${dto.value}%.` };
      }

      case 'stop':
        await this.playback.stop(guildId);
        return { success: true, message: 'Reproducción detenida.' };

      case 'leave':
        await this.playback.leave(guildId);
        return { success: true, message: 'Bot desconectado del canal de voz.' };

      default:
        throw new BadRequestException(
          `Acción no soportada: ${(dto as { action: string }).action}`,
        );
    }
  }

  @Delete('queue/:guildId/tracks/:index')
  @UseGuards(GuildAccessGuard)
  @ApiOperation({
    summary:
      'Elimina una pista específica de la cola de reproducción por su posición',
  })
  @ApiParam({ name: 'guildId', description: 'ID del servidor Discord' })
  @ApiParam({ name: 'index', description: 'Índice de la canción en la cola' })
  @ApiResponse({
    status: 200,
    description: 'Pista eliminada de la cola',
  })
  async removeTrack(
    @Param('guildId') guildId: string,
    @Param('index') indexStr: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    await this.assertGuildAccess(req, guildId);

    const queue = this.queueManager.getQueue(guildId);
    if (!queue) {
      throw new NotFoundException(
        'No existe una cola activa para este servidor.',
      );
    }

    const index = parseInt(indexStr, 10);
    const removed = this.playback.removeTrack(guildId, index);
    if (!removed) {
      throw new NotFoundException(
        `No se encontró canción en el índice ${index}.`,
      );
    }

    return {
      success: true,
      message: `Canción "${removed.info.title}" eliminada de la cola.`,
      removed,
    };
  }

  @Delete('queue/:guildId')
  @UseGuards(GuildAccessGuard)
  @ApiOperation({
    summary: 'Vacía todas las canciones pendientes de la cola musical',
  })
  @ApiParam({ name: 'guildId', description: 'ID del servidor Discord' })
  @ApiResponse({
    status: 200,
    description: 'Cola vaciada exitosamente',
  })
  async clearQueue(
    @Param('guildId') guildId: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    await this.assertGuildAccess(req, guildId);

    const queue = this.queueManager.getQueue(guildId);
    if (!queue) {
      return { success: true, count: 0 };
    }
    const count = queue.tracks.length;
    this.playback.clearQueue(guildId);
    return {
      success: true,
      count,
      message: `Se vaciaron ${count} pistas de la cola.`,
    };
  }

  @Post('messages/send')
  @Roles('admin', 'superadmin')
  @ApiOperation({
    summary:
      'Envía un mensaje de texto a un canal de Discord a través del bot (Solo Admin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Mensaje enviado a Discord',
  })
  async sendMessage(@Body() dto: SendMessageDto) {
    await this.checkBotEnabled();
    const client = this.gateway.getClient();
    if (!client || !client.isReady()) {
      throw new ServiceUnavailableException(
        'El bot de Discord no está conectado actualmente.',
      );
    }

    const guild = client.guilds.cache.get(dto.guildId);
    if (!guild) {
      throw new NotFoundException(
        `El servidor con ID ${dto.guildId} no fue encontrado.`,
      );
    }

    const channel = await guild.channels.fetch(dto.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      throw new BadRequestException(
        'El canal indicado no existe o no es un canal de texto válido.',
      );
    }

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      throw new ServiceUnavailableException(
        'No se pudo verificar la identidad del bot en el servidor.',
      );
    }

    const permissions = channel.permissionsFor(botMember);
    if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages)) {
      throw new BadRequestException(
        'El bot no tiene permisos suficientes para enviar mensajes en ese canal.',
      );
    }

    try {
      const sent = await channel.send({
        content: dto.content,
        allowedMentions: { parse: ['users', 'roles'] },
      });

      return {
        success: true,
        messageId: sent.id,
        channelId: channel.id,
        message: 'Mensaje enviado exitosamente a Discord.',
      };
    } catch (err: unknown) {
      throw new BadRequestException(
        `No se pudo enviar el mensaje: ${(err as Error).message}`,
      );
    }
  }

  @Patch('guilds/:guildId/config')
  @UseGuards(GuildAccessGuard)
  @ApiOperation({
    summary:
      'Actualiza la configuración personalizada del bot en un servidor autorizado (canal dedicado)',
  })
  @ApiParam({ name: 'guildId', description: 'ID del servidor Discord' })
  @ApiResponse({
    status: 200,
    description: 'Configuración actualizada',
  })
  async updateGuildConfig(
    @Param('guildId') guildId: string,
    @Body() dto: UpdateGuildConfigDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    await this.checkBotEnabled();
    await this.assertGuildAccess(req, guildId);

    const config = await this.guildService.updateGuildConfig(guildId, {
      dedicatedChannelId: dto.dedicatedChannelId ?? null,
    });

    return {
      success: true,
      message: 'Configuración de servidor actualizada exitosamente.',
      config,
    };
  }
}
