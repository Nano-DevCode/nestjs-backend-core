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
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: (
      _origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, true);
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

  afterInit(server: Server) {
    this.logger.log(
      '[DiscordBotWsGateway] Gateway inicializado en namespace "/realtime/discord-bot"',
    );

    // Compatibilidad adicional con namespace anidado en el servidor Socket.IO
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
    this.logger.log(`[DiscordBotWsGateway] Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[DiscordBotWsGateway] Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('join-guild-room')
  handleJoinGuildRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { guildId: string } | string,
  ) {
    const guildId = typeof payload === 'string' ? payload : payload?.guildId;
    if (guildId) {
      void client.join(guildId);
      this.logger.log(
        `[DiscordBotWsGateway] Cliente ${client.id} suscrito a sala de guild [${guildId}]`,
      );
      return { event: 'joined', guildId };
    }
    return { event: 'error', message: 'guildId requerido' };
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
