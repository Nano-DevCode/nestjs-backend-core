import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../websockets/interfaces/authenticated-socket.interface';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/realtime/notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: AuthenticatedSocket) {
    const user = client.user || client.data?.user;
    if (user?.id) {
      const room = `user:${user.id}`;
      await client.join(room);
      this.logger.log(
        `[NotificationsGateway] Cliente ${client.id} (Usuario: ${user.email}) conectado a ${room}`,
      );
    } else {
      this.logger.log(`[NotificationsGateway] Conexión entrante: ${client.id}`);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`[NotificationsGateway] Desconexión: ${client.id}`);
  }

  sendToUser(userId: string, notification: unknown): void {
    if (!this.server) return;
    const room = `user:${userId}`;
    this.server.to(room).emit('notification', notification);
    this.logger.log(
      `[NotificationsGateway] Notificación despachada en tiempo real a ${room}`,
    );
  }
}
