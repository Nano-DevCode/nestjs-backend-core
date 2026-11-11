import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { DiscordGuildService } from '../persistence/discord-guild.service';

interface WsAuthenticatedUser {
  id: string;
  email?: string;
  roles?: string[];
}

function isAllowedWsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const isProd = process.env.NODE_ENV === 'production';
  const allowedList = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((u) => u.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const normalized = origin.replace(/\/$/, '');
  if (allowedList.includes(normalized)) return true;
  if (/^https:\/\/([a-zA-Z0-9-]+\.)*nano-service\.com$/.test(normalized)) {
    return true;
  }
  if (!isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
    return true;
  }
  return false;
}

@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isAllowedWsOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origen WebSocket no permitido por CORS'));
      }
    },
    credentials: true,
  },
  namespace: '/realtime/discord-bot',
})
export class DiscordBotWsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DiscordBotWsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @Optional() private readonly guildService?: DiscordGuildService,
  ) {}

  private extractAndVerifyJwt(client: Socket): WsAuthenticatedUser | null {
    try {
      const handshake = client.handshake;
      if (!handshake) return null;

      let rawToken: string | undefined;

      const authToken = (handshake.auth as Record<string, unknown> | undefined)
        ?.token;
      if (typeof authToken === 'string' && authToken.trim()) {
        rawToken = authToken.startsWith('Bearer ')
          ? authToken.slice(7).trim()
          : authToken.trim();
      }

      if (!rawToken) {
        const authHeader = handshake.headers?.authorization;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          rawToken = authHeader.slice(7).trim();
        }
      }

      if (!rawToken) {
        const cookieHeader = handshake.headers?.cookie;
        if (typeof cookieHeader === 'string') {
          const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
          if (match?.[1]) {
            rawToken = decodeURIComponent(match[1]);
          }
        }
      }

      if (!rawToken) return null;

      const parts = rawToken.split('.');
      if (parts.length !== 3) return null;

      const [headerB64, payloadB64, signatureB64] = parts;
      const secret =
        process.env.JWT_SECRET ||
        (process.env.NODE_ENV === 'production' ? '' : 'super_secret_jwt_key');
      if (!secret) return null;
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      const sigBuf = Buffer.from(signatureB64);
      const expBuf = Buffer.from(expectedSig);
      if (
        sigBuf.length !== expBuf.length ||
        !crypto.timingSafeEqual(sigBuf, expBuf)
      ) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as {
        sub?: string;
        email?: string;
        roles?: string[];
        exp?: number;
      };

      if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
        return null;
      }

      if (!payload.sub) return null;

      return {
        id: payload.sub,
        email: payload.email,
        roles: Array.isArray(payload.roles) ? payload.roles : [],
      };
    } catch {
      return null;
    }
  }

  afterInit(server: Server) {
    this.logger.log(
      '[DiscordBotWsGateway] Gateway inicializado en namespace "/realtime/discord-bot"',
    );

    try {
      const ns = server.of('/realtime/discord-bot');
      ns.on('connection', (socket: Socket) => {
        this.logger.log(
          `[DiscordBotWsGateway] Cliente conectado directamente al sub-namespace: ${socket.id}`,
        );
      });
    } catch {
      // Namespace ya enlazado por decorador
    }
  }

  handleConnection(client: Socket) {
    const user = this.extractAndVerifyJwt(client);
    if (user) {
      client.data = { ...(client.data || {}), user };
    }
    this.logger.log(
      `[DiscordBotWsGateway] Cliente conectado: ${client.id}${user ? ` (userId=${user.id})` : ''}`,
    );
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[DiscordBotWsGateway] Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('join-guild-room')
  async handleJoinGuildRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { guildId: string } | string,
  ) {
    const guildId = typeof payload === 'string' ? payload : payload?.guildId;
    if (!guildId) {
      return { event: 'error', message: 'guildId requerido' };
    }

    const wsUser =
      (client.data as { user?: WsAuthenticatedUser } | undefined)?.user ||
      this.extractAndVerifyJwt(client);

    if (this.guildService) {
      if (!wsUser) {
        this.logger.warn(
          `[DiscordBotWsGateway] Acceso denegado (401) a sala guild [${guildId}] para socket no autenticado [${client.id}]`,
        );
        client.emit?.('discord:error', {
          statusCode: 401,
          message: 'Autenticación requerida para suscribirse al servidor de Discord',
        });
        return {
          event: 'error',
          statusCode: 401,
          message: 'Autenticación requerida para suscribirse al servidor de Discord',
        };
      }

      const hasAccess = await this.guildService.hasGuildAccess(
        wsUser.id,
        guildId,
        wsUser.roles,
      );
      if (!hasAccess) {
        this.logger.warn(
          `[DiscordBotWsGateway] Acceso denegado (403) a sala guild [${guildId}] para usuario [${wsUser.id}]`,
        );
        client.emit?.('discord:error', {
          statusCode: 403,
          message: 'No tienes permiso sobre este servidor de Discord',
        });
        return {
          event: 'error',
          statusCode: 403,
          message: 'No tienes permiso sobre este servidor de Discord',
        };
      }
    }

    void client.join(guildId);
    this.logger.log(
      `[DiscordBotWsGateway] Cliente ${client.id} suscrito a sala de guild [${guildId}]`,
    );
    return { event: 'joined', guildId };
  }

  @SubscribeMessage('leave-guild-room')
  handleLeaveGuildRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { guildId: string } | string,
  ) {
    const guildId = typeof payload === 'string' ? payload : payload?.guildId;
    if (guildId) {
      void client.leave(guildId);
      this.logger.log(
        `[DiscordBotWsGateway] Cliente ${client.id} salió de sala de guild [${guildId}]`,
      );
      return { event: 'left', guildId };
    }
    return { event: 'error', message: 'guildId requerido' };
  }

  emitQueueUpdated(guildId: string, queue: unknown): void {
    if (!this.server) return;
    this.server.to(guildId).emit('discord:queue-updated', queue);
    try {
      this.server
        .of('/realtime/discord-bot')
        .to(guildId)
        .emit('discord:queue-updated', queue);
    } catch {
      // Ignorar si el sub-namespace no está inicializado independientemente
    }
  }

  emitTrackStart(guildId: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(guildId).emit('discord:track-start', payload);
    try {
      this.server
        .of('/realtime/discord-bot')
        .to(guildId)
        .emit('discord:track-start', payload);
    } catch {
      // Ignorar
    }
  }

  emitPlaybackState(
    guildId: string,
    state: {
      guildId?: string;
      isPaused: boolean;
      volume: number;
      status: string;
    },
  ): void {
    if (!this.server) return;
    this.server.to(guildId).emit('discord:playback-state', state);
    try {
      this.server
        .of('/realtime/discord-bot')
        .to(guildId)
        .emit('discord:playback-state', state);
    } catch {
      // Ignorar
    }
  }

  emitTrackProgress(
    guildId: string,
    progress: {
      guildId: string;
      position: number;
      duration: number;
      isPaused: boolean;
    },
  ): void {
    if (!this.server) return;
    this.server.to(guildId).emit('discord:track-progress', progress);
    try {
      this.server
        .of('/realtime/discord-bot')
        .to(guildId)
        .emit('discord:track-progress', progress);
    } catch {
      // Ignorar
    }
  }
}
