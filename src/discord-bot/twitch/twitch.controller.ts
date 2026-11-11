import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { GuildAccessGuard } from '../guards/guild-access.guard';
import { TwitchChatService } from './twitch-chat.service';
import { DiscordGuildService } from '../persistence/discord-guild.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '../../common/scalar/scalar.decorators';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles?: string[];
  };
}

export class LinkTwitchChannelDto {
  @IsString({ message: 'El canal de Twitch debe ser un string' })
  @IsNotEmpty({ message: 'El nombre del canal de Twitch es requerido' })
  twitchChannel!: string;

  @IsString({ message: 'El guildId de Discord debe ser un string' })
  @IsNotEmpty({ message: 'El guildId de Discord es requerido' })
  guildId!: string;

  @IsOptional()
  @IsString({ message: 'El voiceChannelId debe ser un string' })
  voiceChannelId?: string;

  @IsOptional()
  @IsString({
    message: 'El código o accessToken OAuth de Twitch debe ser un string',
  })
  accessToken?: string;

  @IsOptional()
  @IsString({ message: 'El refreshToken OAuth de Twitch debe ser un string' })
  refreshToken?: string;
}

@ApiTags('Twitch Music Bot & OBS Overlay')
@ApiBearerAuth('bearer-jwt')
@Controller('discord/twitch')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TwitchController {
  constructor(
    private readonly twitchChatService: TwitchChatService,
    private readonly guildService: DiscordGuildService,
  ) {}

  private async assertGuildAccess(
    req: AuthenticatedRequest | undefined,
    guildId: string,
  ): Promise<void> {
    if (!req?.user) {
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

  @Get('oauth/url')
  @UseGuards(GuildAccessGuard)
  @ApiOperation({
    summary:
      'Genera la URL de autorización OAuth2 de Twitch para vincular el canal del streamer',
  })
  @ApiQuery({
    name: 'guildId',
    required: true,
    description: 'ID del servidor de Discord donde sonará la música de Twitch',
  })
  @ApiResponse({
    status: 200,
    description:
      'URL de autorización OAuth2 de Twitch con scopes chat:read y chat:edit',
  })
  async getTwitchOAuthUrl(
    @Query('guildId') guildId: string,
    @Query('voiceChannelId') voiceChannelId?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    if (!guildId) {
      throw new BadRequestException(
        'Debes proporcionar el guildId de Discord al que se vinculará tu canal de Twitch.',
      );
    }

    await this.assertGuildAccess(req, guildId);

    const clientId = process.env.TWITCH_CLIENT_ID || 'YOUR_TWITCH_CLIENT_ID';
    const redirectUri =
      process.env.TWITCH_REDIRECT_URI ||
      'http://localhost:3000/api/v1/discord/twitch/oauth/callback';

    const statePayload = Buffer.from(
      JSON.stringify({
        userId: req?.user?.id || 'anonymous',
        guildId,
        voiceChannelId: voiceChannelId || null,
      }),
    ).toString('base64url');

    const scopes = encodeURIComponent('chat:read chat:edit');
    const authorizeUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${statePayload}`;

    return {
      authorizeUrl,
      scopes: ['chat:read', 'chat:edit'],
      state: statePayload,
    };
  }

  @Post('link')
  @UseGuards(GuildAccessGuard)
  @ApiOperation({
    summary:
      'Vincula el canal de Twitch del usuario autenticado con su servidor/canal de voz en Lavalink',
  })
  @ApiResponse({
    status: 201,
    description:
      'Canal de Twitch vinculado y escuchando comandos !pl, !song, !queue, !skip',
  })
  async linkChannel(
    @Body() dto: LinkTwitchChannelDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    const userId = req?.user?.id || 'anonymous-user';

    await this.assertGuildAccess(req, dto.guildId);

    let voiceChannelId = dto.voiceChannelId;
    if (!voiceChannelId) {
      const userSession = await this.guildService.getUserGuildRegistration(
        userId,
        dto.guildId,
      );
      if (userSession?.voiceChannelId) {
        voiceChannelId = userSession.voiceChannelId;
      }
    }

    if (!voiceChannelId) {
      throw new BadRequestException(
        'Debes indicar un voiceChannelId o haber registrado previamente tu canal de voz en /api/v1/discord/lavalink/register.',
      );
    }

    const link = await this.twitchChatService.linkTwitchChannel({
      userId,
      twitchChannel: dto.twitchChannel,
      guildId: dto.guildId,
      voiceChannelId,
      accessToken: dto.accessToken,
      refreshToken: dto.refreshToken,
    });

    return {
      success: true,
      message: `Canal de Twitch #${link.twitchChannel} vinculado exitosamente al servidor ${link.guildId}. Tus viewers ya pueden usar !pl <canción o URL>.`,
      link,
      obsOverlayConfig: {
        wsNamespace: '/realtime/discord-bot',
        roomEvent: 'join-guild-room',
        guildId: link.guildId,
        events: [
          'discord:track-start',
          'discord:queue-updated',
          'discord:playback-state',
          'discord:track-progress',
        ],
      },
    };
  }

  @Get('me')
  @ApiOperation({
    summary: 'Obtiene los canales de Twitch vinculados por el usuario actual',
  })
  @ApiResponse({
    status: 200,
    description:
      'Listado de canales de Twitch vinculados y configuración de OBS WebSocket',
  })
  getMyTwitchLinks(@Req() req?: AuthenticatedRequest) {
    const userId = req?.user?.id || 'anonymous-user';
    const links = this.twitchChatService.getUserLinks(userId);
    return {
      userId,
      links,
    };
  }

  @Delete('unlink/:channel')
  @ApiOperation({
    summary: 'Desvincula un canal de Twitch del bot de música',
  })
  @ApiParam({ name: 'channel', description: 'Nombre del canal de Twitch' })
  async unlinkChannel(
    @Param('channel') channel: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const userId = req?.user?.id || 'anonymous-user';
    const removed = await this.twitchChatService.unlinkTwitchChannel(
      userId,
      channel,
    );

    return {
      success: true,
      removed,
      channel,
    };
  }
}
